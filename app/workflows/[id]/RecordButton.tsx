"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Props {
  workflowId: string;
  workflowTitle: string;
  workflowFramework: string;
  sessionType: string;
}

type SessionMode = "fresh" | "profile";

export default function RecordButton({ workflowId, workflowTitle, workflowFramework, sessionType }: Props) {
  const router = useRouter();
  const [showPicker, setShowPicker] = useState(false);
  const [selectedMode, setSelectedMode] = useState<SessionMode>(
    sessionType === "profile" ? "profile" : "fresh"
  );
  const [started, setStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [lastStep, setLastStep] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: any) => {
      const { stepCount, lastStep } = e.detail;
      setStepCount(stepCount || 0);
      if (lastStep) setLastStep(formatStep(lastStep));
    };
    window.addEventListener("tracedeck_step_update", handler);
    return () => window.removeEventListener("tracedeck_step_update", handler);
  }, []);

  function formatStep(step: any): string {
    switch (step.type) {
      case "click": return "Clicked: " + (step.target?.text_content || step.target?.tag || "element");
      case "type": return "Typed in: " + (step.target?.placeholder || step.target?.name || "field");
      case "navigate": return "Navigated to: " + (step.url || "");
      case "scroll": return "Scrolled page";
      case "keypress": return "Pressed: " + (step.key || "");
      case "drag_and_drop": return "Dragged element";
      default: return step.type;
    }
  }

  function startRecording() {
    setShowPicker(false);
    localStorage.setItem("tracedeck_workflow", JSON.stringify({
      workflowId,
      workflowTitle,
      workflowFramework,
      sessionType: selectedMode,
    }));
    localStorage.setItem("tracedeck_steps", "[]");
    window.dispatchEvent(new Event("tracedeck_start"));
    setStarted(true);
    setStepCount(0);
    setLastStep(null);
  }

  async function stopRecording() {
    setSaving(true);
    window.dispatchEvent(new Event("tracedeck_stop"));
    await new Promise(r => setTimeout(r, 1200));

    const raw = localStorage.getItem("tracedeck_steps");
    const steps = raw ? JSON.parse(raw) : [];

    if (steps.length > 0) {
      await fetch("/api/workflows/" + workflowId + "/stop-recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
      });
    }

    localStorage.removeItem("tracedeck_steps");
    setSaving(false);
    setStarted(false);
    setStepCount(0);
    setLastStep(null);
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
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-red-600 font-medium">Recording</span>
            <span className="text-sm font-bold text-red-700">{stepCount} steps</span>
          </div>
          <button
            onClick={stopRecording}
            className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
          >
            Stop
          </button>
        </div>
        {lastStep && (
          <div className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg max-w-xs truncate">
            {lastStep}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowPicker(true)}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Start Recording
      </button>

      {showPicker && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPicker(false)}
          />

          {/* Modal */}
          <div className="absolute right-0 top-full mt-2 z-50 bg-background border rounded-xl shadow-xl w-80 p-4">
            <h3 className="font-semibold mb-1">Choose recording session</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Select how the browser opens for this recording
            </p>

            <div className="space-y-3 mb-4">
              {/* Fresh Session */}
              <button
                onClick={() => setSelectedMode("fresh")}
                className={"w-full text-left border rounded-lg p-3 transition-colors " +
                  (selectedMode === "fresh"
                    ? "border-primary bg-primary/5"
                    : "hover:border-muted-foreground")}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-lg">🧹</div>
                  <div>
                    <div className="font-medium text-sm">Fresh Session</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Opens a new incognito window. Clean slate — no cookies, no saved logins. Best for testing login flows and security checks.
                    </div>
                  </div>
                </div>
              </button>

              {/* My Profile */}
              <button
                onClick={() => setSelectedMode("profile")}
                className={"w-full text-left border rounded-lg p-3 transition-colors " +
                  (selectedMode === "profile"
                    ? "border-primary bg-primary/5"
                    : "hover:border-muted-foreground")}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-lg">👤</div>
                  <div>
                    <div className="font-medium text-sm">My Profile</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Records in your current Chrome session. Already logged in everywhere. Best for deep workflows and automation — skip 2FA every time.
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* Selected mode info */}
            <div className="bg-muted/50 rounded-lg px-3 py-2 mb-4 text-xs text-muted-foreground">
              {selectedMode === "fresh"
                ? "A new incognito Chrome window will open. Navigate to your app and start recording."
                : "Recording will start in your current browser. Switch to the tab you want to record."}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowPicker(false)}
                className="flex-1 border px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startRecording}
                className="flex-1 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Start Recording
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
