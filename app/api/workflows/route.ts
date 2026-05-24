import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workflows = await prisma.workflow.findMany({
    where: { userId: session.user.id! },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(workflows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { title, description, framework, sessionType } = await req.json();
  if (!title)
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const workflow = await prisma.workflow.create({
    data: {
      userId: session.user.id!,
      title,
      description,
      framework: framework || "playwright-js",
      sessionType: sessionType || "fresh",
    },
  });
  return NextResponse.json(workflow, { status: 201 });
}
