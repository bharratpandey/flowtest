"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

const FRAMEWORKS = [
  { id: "playwright-js", label: "Playwright", lang: "JS" },
  { id: "playwright-ts", label: "Playwright", lang: "TS" },
  { id: "playwright-py", label: "Playwright", lang: "Python" },
  { id: "selenium-py", label: "Selenium", lang: "Python" },
  { id: "selenium-java", label: "Selenium", lang: "Java" },
  { id: "cypress-js", label: "Cypress", lang: "JS" },
];

const STRUCTURES = [
  {
    id: "simple",
    label: "Simple",
    description: "Single file, quick start",
  },
  {
    id: "pom",
    label: "Page Object Model",
    description: "Production grade, like EMB automation",
  },
];

function getLanguage(framework: string) {
  if (framework.includes("py")) return "python";
  if (framework.includes("java") && !framework.includes("javascript"))
    return "java";
  return "typescript";
}

interface Props {
  workflowId: string;
  defaultFramework: string;
}

export default function CodeViewer({ workflowId, defaultFramework }: Props) {
  const [framework, setFramework] = useState(defaultFramework);
  const [structure, setStructure] = useState<"simple" | "pom">("simple");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function fetchCode(fw: string) {
    setLoading(true);
    const res = await fetch(
      `/api/workflows/${workflowId}/code?framework=${fw}`,
    );
    const data = await res.json();
    setCode(data.code || "");
    setLoading(false);
  }

  useEffect(() => {
    fetchCode(framework);
  }, [framework]);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ framework, structure }),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workflow-${framework}-${structure}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed. Please try again.");
    }
    setExporting(false);
  }

  return (
    <div className="mt-8 border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="border-b px-5 py-4 flex items-center justify-between bg-muted/30">
        <h2 className="font-semibold">Generated Code</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="border px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "⬇ Export Project"}
          </button>
        </div>
      </div>

      {/* Options panel */}
      <div className="border-b px-5 py-4 space-y-4 bg-muted/10">
        {/* Framework selector */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Framework
          </p>
          <div className="flex flex-wrap gap-2">
            {FRAMEWORKS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFramework(f.id)}
                className={
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors " +
                  (framework === f.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:border-muted-foreground bg-background")
                }
              >
                {f.label} <span className="opacity-70">{f.lang}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Structure selector */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Project Structure
          </p>
          <div className="grid grid-cols-2 gap-3">
            {STRUCTURES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStructure(s.id as "simple" | "pom")}
                className={
                  "border rounded-lg p-3 text-left transition-colors " +
                  (structure === s.id
                    ? "border-primary bg-primary/5"
                    : "hover:border-muted-foreground bg-background")
                }
              >
                <div className="font-medium text-sm">{s.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {s.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* What you get */}
        <div className="bg-muted/30 rounded-lg px-4 py-3 text-xs text-muted-foreground">
          {structure === "simple" ? (
            <span>
              📄 Single test file + config + package.json + README — unzip and
              run
            </span>
          ) : (
            <span>
              📁 Full project with <strong>pages/</strong> +{" "}
              <strong>tests/</strong> + <strong>utils/</strong> folders + all
              configs — production ready
            </span>
          )}
        </div>
      </div>

      {/* Code editor */}
      {loading ? (
        <div className="h-96 flex items-center justify-center bg-muted/30">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <MonacoEditor
          height="400px"
          language={getLanguage(framework)}
          value={code}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 16, bottom: 16 },
          }}
        />
      )}

      {/* Footer */}
      <div className="border-t px-5 py-3 bg-muted/10 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Export as zip → unzip → open in VS Code / IntelliJ → run immediately
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {exporting ? "Generating..." : "Export Project ZIP"}
        </button>
      </div>
    </div>
  );
}
