import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;

  const workflow = await prisma.workflow.findFirst({
    where: { id, userId: session.user.id! },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });

  if (!workflow) notFound();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center gap-4">
        <a
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          Back
        </a>
        <span className="font-semibold">{workflow.title}</span>
        <span className="text-xs bg-muted px-2 py-1 rounded-md">
          {workflow.framework}
        </span>
        <span className="text-xs bg-muted px-2 py-1 rounded-md">
          {workflow.sessionType}
        </span>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">{workflow.title}</h1>
            {workflow.description && (
              <p className="text-muted-foreground mt-1">
                {workflow.description}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button className="border px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors">
              Run workflow
            </button>
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              Start recording
            </button>
          </div>
        </div>

        {workflow.steps.length === 0 ? (
          <div className="border-2 border-dashed rounded-xl p-12 text-center">
            <h3 className="font-semibold mb-2">No steps recorded yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Install the Chrome extension and click Start recording to capture
              your workflow
            </p>
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              Start recording
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="font-semibold text-lg mb-4">
              Steps ({workflow.steps.length})
            </h2>
            {workflow.steps.map((step) => (
              <div
                key={step.id}
                className="border rounded-xl p-4 flex items-start gap-4"
              >
                <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center text-sm font-medium flex-shrink-0">
                  {step.sequence}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">
                      {step.type}
                    </span>
                    {step.pageTitle && (
                      <span className="text-xs text-muted-foreground">
                        {step.pageTitle}
                      </span>
                    )}
                  </div>
                  {step.url && (
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {step.url}
                    </p>
                  )}
                  {step.value && (
                    <p className="text-sm mt-1">
                      <span className="text-muted-foreground">Value: </span>
                      {step.type === "type" && step.value === "__SECRET__"
                        ? "••••••••"
                        : step.value}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
