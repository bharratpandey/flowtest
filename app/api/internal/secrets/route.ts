import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export async function POST(req: NextRequest) {
  const workerSecret = req.headers.get("x-worker-secret");
  if (workerSecret !== process.env.WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, name } = await req.json();

  const secret = await prisma.secret.findUnique({
    where: { userId_name: { userId, name } },
  });

  if (!secret) return NextResponse.json({ error: "Secret not found" }, { status: 404 });

  const value = decrypt(secret.value);
  return NextResponse.json({ value });
}
