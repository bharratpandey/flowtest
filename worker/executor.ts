import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ─── Prisma client for worker ─────────────────────────────────────────────────

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL!,
});
const prisma = new PrismaClient({ adapter });

// ─── Screenshot upload (placeholder — saves URL) ──────────────────────────────

async function saveScreenshot(
  page: any,
  runId: string,
  sequence: number,
): Promise<string | null> {
  try {
    const buffer = await page.screenshot({ type: "png", fullPage: false });
    // TODO: Upload to Supabase Storage in production
    // For now return null — add storage upload here
    return null;
  } catch {
    return null;
  }
}

// ─── Self-healing selector ────────────────────────────────────────────────────

async function findElement(page: any, target: any) {
  if (!target) return null;

  const selectors = [
    target.data_testid ? `[data-testid="${target.data_testid}"]` : null,
    target.aria_label ? `[aria-label="${target.aria_label}"]` : null,
    target.id ? `#${target.id}` : null,
    target.xpath_robust ? `xpath=${target.xpath_robust}` : null,
    target.css_selector || null,
  ].filter(Boolean);

  for (const selector of selectors) {
    try {
      const el = page.locator(selector!).first();
      await el.waitFor({ timeout: 3000 });
      return {
        element: el,
        usedSelector: selector,
        healed: selector !== selectors[0],
      };
    } catch {
      continue;
    }
  }

  return null;
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeWorkflow({
  runId,
  workflowId,
  userId,
}: {
  runId: string;
  workflowId: string;
  userId: string;
}) {
  const startTime = Date.now();

  // Update run to running
  await prisma.run.update({
    where: { id: runId },
    data: { status: "running" },
  });

  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });

  if (!workflow) throw new Error("Workflow not found");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  // Enable Playwright tracing
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
  });

  const pages: Map<number, any> = new Map();
  let currentPage = await context.newPage();
  pages.set(0, currentPage);

  let passedSteps = 0;
  let failedSteps = 0;

  try {
    for (const step of workflow.steps) {
      const stepStart = Date.now();
      let status = "passed";
      let errorMessage = null;
      let healedFrom = null;
      let healedTo = null;

      try {
        switch (step.type) {
          case "navigate":
            await currentPage.goto(step.url!, {
              waitUntil: "domcontentloaded",
              timeout: 15000,
            });
            break;

          case "click": {
            const found = await findElement(currentPage, step.target);
            if (!found) throw new Error(`Element not found for click`);
            if (found.healed) {
              healedFrom = (step.target as any)?.css_selector;
              healedTo = found.usedSelector;
            }
            await found.element.click({ timeout: 8000 });
            break;
          }

          case "type": {
            const found = await findElement(currentPage, step.target);
            if (!found) throw new Error(`Element not found for type`);
            const value =
              step.value === "__SECRET__"
                ? process.env.TEST_SECRET || "test_secret"
                : step.value || "";
            await found.element.fill(value, { timeout: 8000 });
            break;
          }

          case "select": {
            const found = await findElement(currentPage, step.target);
            if (!found) throw new Error(`Element not found for select`);
            await found.element.selectOption(step.value || "", {
              timeout: 8000,
            });
            break;
          }

          case "keypress":
            await currentPage.keyboard.press(step.key || "Enter");
            break;

          case "scroll":
            await currentPage.evaluate(
              ({ x, y }: { x: number; y: number }) => window.scrollTo(x, y),
              { x: step.scrollX || 0, y: step.scrollY || 0 },
            );
            break;

          case "new_tab":
            currentPage = await context.newPage();
            pages.set(pages.size, currentPage);
            if (step.url) await currentPage.goto(step.url, { timeout: 15000 });
            break;

          default:
            console.log(`Skipping unsupported step type: ${step.type}`);
        }

        passedSteps++;
      } catch (err: any) {
        status = "failed";
        errorMessage = err.message;
        failedSteps++;

        await prisma.log.create({
          data: {
            workflowId,
            runId,
            type: "step_failed",
            actor: "system",
            stepSequence: step.sequence,
            detail: { error: err.message, stepType: step.type },
          },
        });
      }

      // Take screenshot
      const screenshotUrl = await saveScreenshot(
        currentPage,
        runId,
        step.sequence,
      );

      // Save step result
      await prisma.runStepResult.create({
        data: {
          runId,
          stepId: step.id,
          sequence: step.sequence,
          status,
          durationMs: Date.now() - stepStart,
          screenshotUrl,
          errorMessage,
          healedFrom,
          healedTo,
        },
      });

      // If step failed stop execution
      if (status === "failed") break;
    }

    // Save trace
    const traceBuffer = await context.tracing.stop({
      path: `/tmp/trace-${runId}.zip`,
    });

    // Update run as completed
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: failedSteps > 0 ? "failed" : "completed",
        passedSteps,
        failedSteps,
        durationMs: Date.now() - startTime,
        completedAt: new Date(),
      },
    });

    await prisma.log.create({
      data: {
        workflowId,
        runId,
        type: failedSteps > 0 ? "run_failed" : "run_completed",
        actor: "system",
        detail: {
          passedSteps,
          failedSteps,
          durationMs: Date.now() - startTime,
        },
      },
    });
  } catch (err: any) {
    await context.tracing.stop({}).catch(() => {});
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "failed",
        errorMessage: err.message,
        durationMs: Date.now() - startTime,
        completedAt: new Date(),
      },
    });
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}
