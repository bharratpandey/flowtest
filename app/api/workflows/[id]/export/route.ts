import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateProject } from "@/lib/projectGenerator";
import JSZip from "jszip";

export async function POST(
  req: NextRequest,
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

  const { framework, structure } = await req.json();

  const files = generateProject({
    workflowTitle: workflow.title,
    framework: framework || workflow.framework,
    structure: structure || "pom",
    steps: workflow.steps as any,
  });

  // Create zip
  const zip = new JSZip();
  const folderName = workflow.title.toLowerCase().replace(/\s+/g, "-");
  const folder = zip.folder(folderName)!;

  for (const file of files) {
    folder.file(file.path, file.content);
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folderName}.zip"`,
    },
  });
}
