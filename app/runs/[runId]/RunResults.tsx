"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface StepResult {
  id: string;
  sequence: number;
  status: string;
  durationMs: number | null;
  errorMessage: string | null;
  healedFrom: string | null;
  healedTo: string | null;
}

interface Run {
  id: string;
  status: string;
  passedSteps: number;
  failedSteps: number;
  totalSteps: number;
  durationMs: number | null;
  errorMessage: string | null;
  traceUrl: string | null;
  stepResults: StepResult[];
}

export default function RunResults({ run: initialRun }: { run: Run }) {
  const [run, setRun] = useState(initialRun);
  const [activeTab, setActiveTab] = useState("steps");
  const router = useRouter();

  useEffect(() => {
    if (run.status === "queued" || run.status === "running") {
      const interval = setInterval(async () => {
        const res = await fetch("/api/runs/" + run.id);
        const data = await res.json();
        setRun(data);
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
          router.refresh();
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [run.status]);

  const isLive = run.status === "queued" || run.status === "running";
  const traceViewerUrl = run.traceUrl
    ? "https://trace.playwright.dev/?trace=" + encodeURIComponent(run.traceUrl)
    : null;

  return (
    <div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">{run.totalSteps}</div>
          <div className="text-xs text-muted-foreground mt-1">Total steps</div>
        </div>
        <div className="border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-600">
            {run.passedSteps}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Passed</div>
        </div>
        <div className="border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-600">
            {run.failedSteps}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Failed</div>
        </div>
        <div className="border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">
            {run.durationMs ? (run.durationMs / 1000).toFixed(1) + "s" : "-"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Duration</div>
        </div>
      </div>

      {isLive && (
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
          {run.status === "queued"
            ? "Waiting for worker..."
            : "Running steps..."}
        </div>
      )}

      <div className="flex gap-1 mb-6 border-b">
        <button
          onClick={() => setActiveTab("steps")}
          className={
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors " +
            (activeTab === "steps"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground")
          }
        >
          Step Results
        </button>
        <button
          onClick={() => setActiveTab("trace")}
          disabled={!traceViewerUrl}
          className={
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors " +
            (activeTab === "trace"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground") +
            (!traceViewerUrl ? " opacity-40 cursor-not-allowed" : "")
          }
        >
          Trace Viewer {!traceViewerUrl && isLive ? "(generating...)" : ""}
        </button>
      </div>

      {activeTab === "steps" && (
        <div className="space-y-3">
          {run.stepResults.length === 0 ? (
            <div className="border-2 border-dashed rounded-xl p-8 text-center text-muted-foreground">
              {isLive
                ? "Steps will appear as they complete..."
                : "No results yet"}
            </div>
          ) : (
            run.stepResults.map((step) => (
              <div
                key={step.id}
                className={
                  "border rounded-xl p-4 flex items-start gap-4 " +
                  (step.status === "passed"
                    ? "border-green-200 bg-green-50/30"
                    : step.status === "failed"
                      ? "border-red-200 bg-red-50/30"
                      : "border-yellow-200 bg-yellow-50/30")
                }
              >
                <div
                  className={
                    "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 " +
                    (step.status === "passed"
                      ? "bg-green-100 text-green-700"
                      : step.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700")
                  }
                >
                  {step.status === "passed"
                    ? "v"
                    : step.status === "failed"
                      ? "x"
                      : "~"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      Step {step.sequence}
                    </span>
                    {step.durationMs && (
                      <span className="text-xs text-muted-foreground">
                        {step.durationMs}ms
                      </span>
                    )}
                  </div>
                  {step.errorMessage && (
                    <p className="text-sm text-red-600 mt-1">
                      {step.errorMessage}
                    </p>
                  )}
                  {step.healedFrom && (
                    <p className="text-xs text-yellow-600 mt-1">
                      Auto-healed: {step.healedFrom} to {step.healedTo}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "trace" && traceViewerUrl && (
        <div className="border rounded-xl overflow-hidden">
          <div className="border-b px-4 py-3 flex items-center justify-between bg-muted/30">
            <span className="text-sm font-medium">Playwright Trace Viewer</span>
            <a
              href={traceViewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Open in new tab
            </a>
          </div>
          <iframe
            src={traceViewerUrl}
            className="w-full"
            style={{ height: "85vh", border: "none" }}
            title="Playwright Trace Viewer"
          />
        </div>
      )}
    </div>
  );
}
