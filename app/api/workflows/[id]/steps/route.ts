import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { steps } = await req.json();

  if (!steps || !Array.isArray(steps)) {
    return NextResponse.json(
      { error: "Steps array required" },
      { status: 400 },
    );
  }

  await prisma.step.createMany({
    data: steps.map((step: any) => ({
      workflowId: id,
      sequence: step.sequence,
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

  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const steps = await prisma.step.findMany({
    where: { workflowId: id },
    orderBy: { sequence: "asc" },
  });

  return NextResponse.json(steps);
}
