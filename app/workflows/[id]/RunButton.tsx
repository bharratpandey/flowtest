"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  workflowId: string;
  hasSteps: boolean;
}

export default function RunButton({ workflowId, hasSteps }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  async function startRun(headed: boolean) {
    if (!hasSteps) {
      alert("Record some steps first before running.");
      return;
    }

    setShowOptions(false);
    setStatus("queuing");

    const res = await fetch("/api/workflows/" + workflowId + "/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headed }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to start run");
      setStatus("idle");
      return;
    }

    setRunId(data.runId);
    setStatus("running");

    const interval = setInterval(async () => {
      const statusRes = await fetch("/api/runs/" + data.runId);
      const statusData = await statusRes.json();

      if (statusData.status === "completed" || statusData.status === "failed") {
        clearInterval(interval);
        setStatus("done");
        router.push("/runs/" + data.runId);
      }
    }, 2000);

    setTimeout(() => clearInterval(interval), 300000);
  }

  if (status === "queuing") {
    return (
      <button disabled className="border px-4 py-2 rounded-lg text-sm font-medium opacity-50 cursor-not-allowed flex items-center gap-2">
        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
        Queuing...
      </button>
    );
  }

  if (status === "running") {
    return (
      <div className="flex items-center gap-2 border px-4 py-2 rounded-lg">
        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-medium">Running...</span>
        {runId && (
          <a href={"/runs/" + runId} className="text-xs text-primary underline">
            View results
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex border rounded-lg overflow-hidden">
        <button
          onClick={() => startRun(false)}
          className="px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Run workflow
        </button>
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="px-2 py-2 text-sm border-l hover:bg-muted transition-colors"
          title="More options"
        >
          ▾
        </button>
      </div>

      {showOptions && (
        <div className="absolute top-full mt-1 right-0 bg-background border rounded-lg shadow-lg z-10 min-w-48">
          <button
            onClick={() => startRun(false)}
            className="w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors"
          >
            <div className="font-medium">Run headless</div>
            <div className="text-xs text-muted-foreground mt-0.5">Background — faster</div>
          </button>
          <div className="border-t"></div>
          <button
            onClick={() => startRun(true)}
            className="w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors"
          >
            <div className="font-medium">Watch live</div>
            <div className="text-xs text-muted-foreground mt-0.5">Opens browser window — see every step</div>
          </button>
        </div>
      )}
    </div>
  );
}
