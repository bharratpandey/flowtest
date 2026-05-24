import { Queue } from "bullmq";
import IORedis from "ioredis";

// ─── Redis connection ─────────────────────────────────────────────────────────

export const redisConnection = new IORedis(
  process.env.UPSTASH_REDIS_REST_URL!.replace("https://", "rediss://"),
  {
    password: process.env.UPSTASH_REDIS_REST_TOKEN,
    tls: {},
    maxRetriesPerRequest: null,
  },
);

// ─── Workflow run queue ───────────────────────────────────────────────────────

export const workflowRunQueue = new Queue("workflow-runs", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// ─── Job types ────────────────────────────────────────────────────────────────

export interface WorkflowRunJob {
  runId: string;
  workflowId: string;
  userId: string;
}
