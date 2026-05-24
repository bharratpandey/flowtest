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

  async function startRun() {
    if (!hasSteps) {
      alert("Record some steps first before running.");
      return;
    }

    setStatus("queuing");

    const res = await fetch("/api/workflows/" + workflowId + "/run", {
      method: "POST",
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
            View live
          </a>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={startRun}
      className="border px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
    >
      Run workflow
    </button>
  );
}
