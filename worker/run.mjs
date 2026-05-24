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
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const redisUrl = process.env.UPSTASH_REDIS_REST_URL.replace("https://", "rediss://");

const redisConnection = new IORedis(redisUrl, {
  password: process.env.UPSTASH_REDIS_REST_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
});

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function uploadTrace(runId) {
  try {
    const tracePath = `/tmp/trace-${runId}.zip`;
    if (!fs.existsSync(tracePath)) return null;

    const buffer = fs.readFileSync(tracePath);
    const storagePath = `traces/${runId}.zip`;

    const { error } = await supabase.storage
      .from('screenshots')
      .upload(storagePath, buffer, {
        contentType: 'application/zip',
        upsert: true,
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from('screenshots')
      .getPublicUrl(storagePath);

    fs.unlinkSync(tracePath);
    console.log(`📦 Trace uploaded: ${storagePath}`);
    return data.publicUrl;
  } catch (err) {
    console.error('Trace upload failed:', err.message);
    return null;
  }
}

async function cleanupOldRuns(workflowId, keepCount = 3) {
  try {
    const runs = await prisma.run.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (runs.length <= keepCount) return;

    const toDelete = runs.slice(keepCount);
    for (const run of toDelete) {
      const { data: files } = await supabase.storage
        .from('screenshots')
        .list(`traces`);

      if (files) {
        const traceFile = files.find(f => f.name === `${run.id}.zip`);
        if (traceFile) {
          await supabase.storage
            .from('screenshots')
            .remove([`traces/${run.id}.zip`]);
        }
      }

      await prisma.run.delete({ where: { id: run.id } });
      console.log(`🗑️ Cleaned up old run: ${run.id}`);
    }
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

console.log("🚀 TraceDeck Worker starting...");

const worker = new Worker(
  "workflow-runs",
  async (job) => {
    const { runId, workflowId, headed } = job.data;
    console.log(`📋 Processing run: ${runId} (headed: ${headed})`);

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

      const { chromium } = require('playwright');
      const browser = await chromium.launch({ headless: !headed });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });

      // Enable Playwright tracing
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: false,
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

      // Stop tracing and save
      const tracePath = `/tmp/trace-${runId}.zip`;
      await context.tracing.stop({ path: tracePath });
      await browser.close();

      // Upload trace to Supabase
      const traceUrl = await uploadTrace(runId);

      const finalStatus = failedSteps > 0 ? "failed" : "completed";
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          passedSteps,
          failedSteps,
          durationMs: Date.now() - startTime,
          completedAt: new Date(),
          traceUrl,
        },
      });

      console.log(`✅ Run ${runId}: ${finalStatus} (${passedSteps}/${workflow.steps.length} steps)`);
      if (traceUrl) console.log(`🔗 Trace: ${traceUrl}`);

      await cleanupOldRuns(workflowId, 3);

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
