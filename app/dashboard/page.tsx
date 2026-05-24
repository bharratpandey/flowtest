import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const workflows = await prisma.workflow.findMany({
    where: { userId: session.user.id! },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <span className="font-semibold text-lg">TraceDeck</span>
        <span className="text-sm text-muted-foreground">
          {session.user.name || session.user.email}
        </span>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Workflows</h1>
          <a href="/workflows/new" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium">
            New Workflow
          </a>
        </div>
        {workflows.length === 0 && (
          <div className="border-2 border-dashed rounded-xl p-12 text-center">
            <h3 className="font-semibold mb-2">No workflows yet</h3>
            <p className="text-muted-foreground text-sm">Create your first workflow to get started</p>
          </div>
        )}
        <div className="grid gap-4">
          {workflows.map((wf) => (
            <a key={wf.id} href={"/workflows/" + wf.id} className="border rounded-xl p-5 hover:border-primary transition-colors block">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{wf.title}</h3>
                  <span className="text-xs bg-muted px-2 py-1 rounded-md mr-2">{wf.framework}</span>
                </div>
                <span className="text-muted-foreground text-sm">{new Date(wf.createdAt).toLocaleDateString()}</span>
              </div>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
