import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateProject } from "@/lib/projectGenerator";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const framework = req.nextUrl.searchParams.get("framework") || workflow.framework;

  const files = generateProject({
    workflowTitle: workflow.title,
    framework,
    structure: "simple",
    steps: workflow.steps as any,
  });

  const code = files.find(f =>
    f.path.includes("spec") || f.path.includes("test")
  )?.content || "";

  return NextResponse.json({ code, framework });
}
