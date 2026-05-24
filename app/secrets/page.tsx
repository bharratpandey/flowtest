"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Secret {
  id: string;
  name: string;
  hint: string | null;
  workflowId: string | null;
  createdAt: string;
}

function SecretsContent() {
  const searchParams = useSearchParams();
  const workflowId = searchParams.get("workflowId");

  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [hint, setHint] = useState("");
  const [saving, setSaving] = useState(false);
  const [showValue, setShowValue] = useState(false);

  async function loadSecrets() {
    const url = workflowId ? `/api/secrets?workflowId=${workflowId}` : "/api/secrets";
    const res = await fetch(url);
    const data = await res.json();
    setSecrets(Array.isArray(data) ? data : []);
  }

  useEffect(() => { loadSecrets(); }, [workflowId]);

  async function handleSave() {
    if (!name || !value) return;
    setSaving(true);
    await fetch("/api/secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.toUpperCase().replace(/\s+/g, "_"),
        value,
        hint,
        workflowId: workflowId || null,
      }),
    });
    setName(""); setValue(""); setHint("");
    setShowAdd(false); setSaving(false);
    loadSecrets();
  }

  async function handleDelete(secretName: string) {
    if (!confirm("Delete secret " + secretName + "?")) return;
    await fetch("/api/secrets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: secretName }),
    });
    loadSecrets();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="text-muted-foreground hover:text-foreground text-sm">Back</a>
          <span className="font-semibold">
            {workflowId ? "Workflow Secrets" : "Secret Vault"}
          </span>
        </div>
        <button onClick={() => setShowAdd(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
          + Add Secret
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{workflowId ? "Workflow Secrets" : "Secret Vault"}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {workflowId
              ? "Secrets used in this workflow. Referenced automatically when running."
              : "All your secrets across all workflows. AES-256 encrypted."}
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
          <strong>Secret types:</strong> passwords, emails, URLs, API keys, tokens, phone numbers — anything sensitive. When running workflows, secrets are fetched automatically. Generated code uses them as environment variables.
        </div>

        {showAdd && (
          <div className="border rounded-xl p-5 mb-6 bg-muted/10">
            <h3 className="font-semibold mb-4">Add New Secret</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Secret Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                  placeholder="EMB_PASSWORD"
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm font-mono bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">Use this name when prompted during recording</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Value</label>
                <div className="relative">
                  <input
                    type={showValue ? "text" : "password"}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder="actual_value_here"
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm bg-background pr-16"
                  />
                  <button onClick={() => setShowValue(!showValue)} className="absolute right-3 top-3 text-xs text-muted-foreground hover:text-foreground">
                    {showValue ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hint (optional)</label>
                <input
                  value={hint}
                  onChange={e => setHint(e.target.value)}
                  placeholder="e.g. EMB Admin portal password"
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm bg-background"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 border px-3 py-2 rounded-lg text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleSave} disabled={saving || !name || !value} className="flex-1 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving..." : "Save Secret"}
              </button>
            </div>
          </div>
        )}

        {secrets.length === 0 ? (
          <div className="border-2 border-dashed rounded-xl p-12 text-center">
            <div className="text-3xl mb-3">🔒</div>
            <h3 className="font-semibold mb-2">No secrets yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Add passwords, emails, API keys — anything sensitive</p>
            <button onClick={() => setShowAdd(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
              + Add First Secret
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {secrets.map(secret => (
              <div key={secret.id} className="border rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="font-mono font-medium text-sm">{secret.name}</div>
                  {secret.hint && <div className="text-xs text-muted-foreground mt-0.5">{secret.hint}</div>}
                  <div className="text-xs text-muted-foreground mt-1">
                    Value: •••••••• · Added {new Date(secret.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={() => handleDelete(secret.name)} className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50">
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function SecretsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <SecretsContent />
    </Suspense>
  );
}
