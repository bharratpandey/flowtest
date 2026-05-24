import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const workflow = await prisma.workflow.findFirst({
    where: { id, userId: session.user.id! },
    include: { runs: { select: { id: true } } },
  });

  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete trace files from Supabase Storage
  for (const run of workflow.runs) {
    try {
      await supabase.storage.from("screenshots").remove([`traces/${run.id}.zip`]);
    } catch (e) {}
  }

  // Delete workflow (cascades to steps, runs, secrets, logs)
  await prisma.workflow.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
