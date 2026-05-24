import { Worker } from "bullmq";
import IORedis from "ioredis";
import { executeWorkflow } from "./executor.js";

const redisConnection = new IORedis(
  process.env.UPSTASH_REDIS_REST_URL!.replace("https://", "rediss://"),
  {
    password: process.env.UPSTASH_REDIS_REST_TOKEN,
    tls: {},
    maxRetriesPerRequest: null,
  },
);

console.log("🚀 TraceDeck Worker starting...");

const worker = new Worker(
  "workflow-runs",
  async (job) => {
    console.log(`📋 Processing job: ${job.id}`);
    const { runId, workflowId, userId } = job.data;

    await executeWorkflow({ runId, workflowId, userId });

    console.log(`✅ Job complete: ${job.id}`);
  },
  {
    connection: redisConnection,
    concurrency: 2,
  },
);

worker.on("completed", (job) => {
  console.log(`✅ Run ${job.data.runId} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Run ${job?.data?.runId} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("Worker error:", err);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down worker...");
  await worker.close();
  process.exit(0);
});
