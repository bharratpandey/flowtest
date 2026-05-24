import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function encrypt(text: string): string {
  const CryptoJS = require("crypto-js");
  const key = process.env.ENCRYPTION_KEY || "tracedeck-default-key";
  return CryptoJS.AES.encrypt(text, key).toString();
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workflowId = req.nextUrl.searchParams.get("workflowId");

    const secrets = await prisma.secret.findMany({
      where: {
        userId: session.user.id!,
        ...(workflowId ? { workflowId } : {}),
      },
      select: { id: true, name: true, hint: true, workflowId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(secrets);
  } catch (err: any) {
    console.error("Secrets GET error:", err);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, value, hint, workflowId } = await req.json();
    if (!name || !value) return NextResponse.json({ error: "Name and value required" }, { status: 400 });

    const encrypted = encrypt(value);

    const secret = await prisma.secret.upsert({
      where: { userId_name: { userId: session.user.id!, name } },
      update: { value: encrypted, hint, workflowId: workflowId || null },
      create: { userId: session.user.id!, name, value: encrypted, hint, workflowId: workflowId || null },
    });

    return NextResponse.json({ id: secret.id, name: secret.name, hint: secret.hint });
  } catch (err: any) {
    console.error("Secrets POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name } = await req.json();
    await prisma.secret.deleteMany({ where: { userId: session.user.id!, name } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
