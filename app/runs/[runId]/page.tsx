import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import RunResults from "./RunResults";

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { runId } = await params;

  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      workflow: true,
      stepResults: { orderBy: { sequence: "asc" } },
    },
  });

  if (!run) notFound();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center gap-4">
        <a
          href={`/workflows/${run.workflowId}`}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          Back
        </a>
        <span className="font-semibold">{run.workflow.title}</span>
        <span
          className={
            "text-xs px-2 py-1 rounded-md font-medium " +
            (run.status === "completed"
              ? "bg-green-100 text-green-700"
              : run.status === "failed"
                ? "bg-red-100 text-red-700"
                : "bg-yellow-100 text-yellow-700")
          }
        >
          {run.status}
        </span>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <RunResults run={run as any} />
      </main>
    </div>
  );
}
