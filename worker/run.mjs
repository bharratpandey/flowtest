import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });

const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const redisUrl = process.env.UPSTASH_REDIS_REST_URL.replace("https://", "rediss://");

const redisConnection = new IORedis(redisUrl, {
  password: process.env.UPSTASH_REDIS_REST_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
});

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

console.log("🚀 TraceDeck Worker starting...");

const worker = new Worker(
  "workflow-runs",
  async (job) => {
    const { runId, workflowId } = job.data;
    console.log(`📋 Processing run: ${runId}`);

    const startTime = Date.now();

    try {
      await prisma.run.update({
        where: { id: runId },
        data: { status: "running" },
      });

      const workflow = await prisma.workflow.findUnique({
        where: { id: workflowId },
        include: { steps: { orderBy: { sequence: "asc" } } },
      });

      if (!workflow) throw new Error("Workflow not found");

      // Import playwright
      const { chromium } = require('playwright');
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();

      let passedSteps = 0;
      let failedSteps = 0;

      for (const step of workflow.steps) {
        const stepStart = Date.now();
        let status = "passed";
        let errorMessage = null;

        try {
          console.log(`  Step ${step.sequence}: ${step.type} - ${step.url || ''}`);

          if (step.type === "navigate" && step.url) {
            await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 15000 });
          } else if (step.type === "click" && step.target) {
            const selectors = [
              step.target.data_testid ? `[data-testid="${step.target.data_testid}"]` : null,
              step.target.aria_label ? `[aria-label="${step.target.aria_label}"]` : null,
              step.target.id ? `#${step.target.id}` : null,
              step.target.css_selector || null,
            ].filter(Boolean);

            let clicked = false;
            for (const sel of selectors) {
              try {
                await page.locator(sel).first().click({ timeout: 5000 });
                clicked = true;
                break;
              } catch { continue; }
            }
            if (!clicked) throw new Error("Element not found");
          } else if (step.type === "type" && step.target) {
            const sel = step.target.id ? `#${step.target.id}` :
                        step.target.css_selector || "input";
            const val = step.value === "__SECRET__" ? "test_value" : (step.value || "");
            await page.locator(sel).first().fill(val, { timeout: 5000 });
          } else if (step.type === "scroll") {
            await page.evaluate(({ x, y }) => window.scrollTo(x, y),
              { x: step.scrollX || 0, y: step.scrollY || 0 });
          } else if (step.type === "keypress") {
            await page.keyboard.press(step.key || "Enter");
          }

          passedSteps++;
        } catch (err) {
          status = "failed";
          errorMessage = err.message;
          failedSteps++;
          console.log(`  ❌ Step ${step.sequence} failed: ${err.message}`);
        }

        await prisma.runStepResult.create({
          data: {
            runId,
            stepId: step.id,
            sequence: step.sequence,
            status,
            durationMs: Date.now() - stepStart,
            errorMessage,
          },
        });

        if (status === "failed") break;
      }

      await browser.close();

      const finalStatus = failedSteps > 0 ? "failed" : "completed";
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          passedSteps,
          failedSteps,
          durationMs: Date.now() - startTime,
          completedAt: new Date(),
        },
      });

      console.log(`✅ Run ${runId}: ${finalStatus} (${passedSteps}/${workflow.steps.length} steps)`);

    } catch (err) {
      console.error(`❌ Run ${runId} error:`, err.message);
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: "failed",
          errorMessage: err.message,
          durationMs: Date.now() - startTime,
          completedAt: new Date(),
        },
      });
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

worker.on("completed", (job) => console.log(`✅ Job ${job.id} done`));
worker.on("failed", (job, err) => console.error(`❌ Job failed:`, err.message));
worker.on("error", (err) => console.error("Worker error:", err));

console.log("Worker ready, waiting for jobs...");
