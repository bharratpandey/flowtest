"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  workflowId: string;
  workflowTitle: string;
  workflowFramework: string;
}

export default function RecordButton({
  workflowId,
  workflowTitle,
  workflowFramework,
}: Props) {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [saving, setSaving] = useState(false);

  function startRecording() {
    localStorage.setItem(
      "tracedeck_workflow",
      JSON.stringify({
        workflowId,
        workflowTitle,
        workflowFramework,
      }),
    );
    localStorage.setItem("tracedeck_steps", "[]");
    window.dispatchEvent(new Event("tracedeck_start"));
    setStarted(true);
  }

  async function stopRecording() {
    setSaving(true);
    window.dispatchEvent(new Event("tracedeck_stop"));

    // Wait a moment for bridge to collect final steps
    await new Promise((r) => setTimeout(r, 800));

    const raw = localStorage.getItem("tracedeck_steps");
    const steps = raw ? JSON.parse(raw) : [];

    if (steps.length === 0) {
      setSaving(false);
      setStarted(false);
      router.refresh();
      return;
    }

    await fetch("/api/workflows/" + workflowId + "/stop-recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps }),
    });

    localStorage.removeItem("tracedeck_steps");
    setSaving(false);
    setStarted(false);
    router.refresh();
  }

  if (saving) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-medium">Saving steps...</span>
      </div>
    );
  }

  if (started) {
    return (
      <div className="flex gap-3">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-red-600 font-medium">Recording...</span>
        </div>
        <button
          onClick={stopRecording}
          className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Stop recording
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <button className="border px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors">
        Run workflow
      </button>
      <button
        onClick={startRecording}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Start recording
      </button>
    </div>
  );
}
