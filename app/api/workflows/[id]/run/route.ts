import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { workflowRunQueue } from "@/lib/queue";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workflow = await prisma.workflow.findFirst({
    where: { id, userId: session.user.id! },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  if (workflow.steps.length === 0) {
    return NextResponse.json(
      { error: "Workflow has no steps to run" },
      { status: 400 },
    );
  }

  // Create a run record
  const run = await prisma.run.create({
    data: {
      workflowId: id,
      status: "queued",
      triggeredBy: "manual",
      totalSteps: workflow.steps.length,
    },
  });

  // Add job to queue
  await workflowRunQueue.add(
    "run-workflow",
    {
      runId: run.id,
      workflowId: id,
      userId: session.user.id!,
    },
    { jobId: run.id },
  );

  // Log it
  await prisma.log.create({
    data: {
      workflowId: id,
      runId: run.id,
      type: "run_started",
      actor: "user",
      detail: { message: "Run queued", totalSteps: workflow.steps.length },
    },
  });

  return NextResponse.json({ runId: run.id, status: "queued" });
}
