"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface StepResult {
  id: string;
  sequence: number;
  status: string;
  durationMs: number | null;
  screenshotUrl: string | null;
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
  stepResults: StepResult[];
}

export default function RunResults({ run: initialRun }: { run: Run }) {
  const [run, setRun] = useState(initialRun);
  const router = useRouter();

  useEffect(() => {
    if (run.status === "queued" || run.status === "running") {
      const interval = setInterval(async () => {
        const res = await fetch(`/api/runs/${run.id}`);
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

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-8">
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
            {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Duration</div>
        </div>
      </div>

      {/* Live indicator */}
      {isLive && (
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
          {run.status === "queued"
            ? "Waiting for worker..."
            : "Running steps..."}
        </div>
      )}

      {/* Step results */}
      <h2 className="font-semibold text-lg mb-4">Step Results</h2>

      {run.stepResults.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-8 text-center text-muted-foreground">
          {isLive ? "Steps will appear as they complete..." : "No results yet"}
        </div>
      ) : (
        <div className="space-y-3">
          {run.stepResults.map((step) => (
            <div
              key={step.id}
              className={
                "border rounded-xl p-4 flex items-start gap-4 " +
                (step.status === "passed"
                  ? "border-green-200 bg-green-50/30"
                  : step.status === "failed"
                    ? "border-red-200 bg-red-50/30"
                    : step.status === "healed"
                      ? "border-yellow-200 bg-yellow-50/30"
                      : "")
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
                  ? "✓"
                  : step.status === "failed"
                    ? "✗"
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
                    Auto-healed: {step.healedFrom} → {step.healedTo}
                  </p>
                )}
                {step.screenshotUrl && (
                  <img
                    src={step.screenshotUrl}
                    alt={`Step ${step.sequence}`}
                    className="mt-2 rounded border max-w-sm"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
