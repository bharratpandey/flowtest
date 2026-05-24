import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { steps } = await req.json();

  // Delete existing steps and replace with new ones
  await prisma.step.deleteMany({ where: { workflowId: id } });

  if (steps && steps.length > 0) {
    await prisma.step.createMany({
      data: steps.map((step: any, index: number) => ({
        workflowId: id,
        sequence: index + 1,
        type: step.type,
        url: step.url || null,
        pageTitle: step.page_title || null,
        tabId: step.tabId || null,
        tabIndex: step.tabIndex || null,
        target: step.target || null,
        value: step.value || null,
        key: step.key || null,
        scrollX: step.scroll_x || null,
        scrollY: step.scroll_y || null,
      })),
    });
  }

  await prisma.log.create({
    data: {
      workflowId: id,
      type: "run_started",
      actor: "user",
      detail: {
        message: "Recording stopped",
        stepCount: steps?.length || 0,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    stepCount: steps?.length || 0,
  });
}
