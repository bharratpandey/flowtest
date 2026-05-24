import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workflow = await prisma.workflow.findUnique({
    where: { id },
  });

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  await prisma.log.create({
    data: {
      workflowId: id,
      type: "run_started",
      actor: "user",
      detail: { message: "Recording started" },
    },
  });

  return NextResponse.json({ ok: true, workflow });
}
