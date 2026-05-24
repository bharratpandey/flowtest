"use client";

import { useState } from "react";

interface Workflow {
  id: string;
  title: string;
  framework: string;
  sessionType: string;
  createdAt: string;
  steps: { id: string }[];
  runs: { id: string; status: string; createdAt: string }[];
  secrets: { id: string }[];
}

export default function DashboardClient({
  workflows: initial,
}: {
  workflows: Workflow[];
}) {
  const [workflows, setWorkflows] = useState(initial);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  async function handleDelete(id: string, title: string) {
    if (
      !confirm(
        "Delete " +
          title +
          "?\n\nThis will permanently delete all steps, runs, traces and secrets.",
      )
    )
      return;
    setDeleting(id);
    setMenuOpen(null);
    await fetch("/api/workflows/" + id + "/delete", { method: "DELETE" });
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    setDeleting(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <span className="font-bold text-lg">TraceDeck</span>
        <div className="flex items-center gap-4">
          <a
            href="/secrets"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            🔒 Secrets
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Workflows</h1>
          <a
            href="/workflows/new"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
          >
            New Workflow
          </a>
        </div>

        {workflows.length === 0 ? (
          <div className="border-2 border-dashed rounded-xl p-12 text-center">
            <h3 className="font-semibold mb-2">No workflows yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Create your first workflow to get started
            </p>
            <a
              href="/workflows/new"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
            >
              New Workflow
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {workflows.map((workflow) => {
              const lastRun = workflow.runs[0];
              const statusColor =
                lastRun?.status === "completed"
                  ? "text-green-600"
                  : lastRun?.status === "failed"
                    ? "text-red-600"
                    : "text-muted-foreground";
              return (
                <div
                  key={workflow.id}
                  className="border rounded-xl p-4 hover:border-muted-foreground transition-colors relative"
                >
                  <div className="flex items-center justify-between">
                    <a href={"/workflows/" + workflow.id} className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{workflow.title}</span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">
                          {workflow.framework}
                        </span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">
                          {workflow.sessionType}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-muted-foreground">
                          {workflow.steps.length} steps
                        </span>
                        {workflow.secrets.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            🔒 {workflow.secrets.length} secrets
                          </span>
                        )}
                        {lastRun && (
                          <span className={"text-xs " + statusColor}>
                            Last run: {lastRun.status}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {workflow.createdAt.slice(0, 10)}
                        </span>
                      </div>
                    </a>

                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(
                            menuOpen === workflow.id ? null : workflow.id,
                          );
                        }}
                        className="p-2 hover:bg-muted rounded-lg text-muted-foreground font-bold"
                      >
                        ...
                      </button>

                      {menuOpen === workflow.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setMenuOpen(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg z-50 min-w-44 py-1">
                            <a
                              href={"/workflows/" + workflow.id}
                              className="block px-4 py-2 text-sm hover:bg-muted"
                            >
                              Open
                            </a>
                            <a
                              href={"/secrets?workflowId=" + workflow.id}
                              className="block px-4 py-2 text-sm hover:bg-muted"
                            >
                              🔒 Manage Secrets
                            </a>
                            <div className="border-t my-1" />
                            <button
                              onClick={() =>
                                handleDelete(workflow.id, workflow.title)
                              }
                              disabled={deleting === workflow.id}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {deleting === workflow.id
                                ? "Deleting..."
                                : "Delete workflow"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
