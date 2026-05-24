// bridge.js — runs on TraceDeck pages

let isRecording = false;
let capturedSteps = [];

window.addEventListener("tracedeck_start", () => {
  const data = localStorage.getItem("tracedeck_workflow");
  if (!data) return;
  const workflow = JSON.parse(data);
  const sessionMode = workflow.sessionType || "fresh";

  isRecording = true;
  capturedSteps = [];

  chrome.runtime.sendMessage({
    type: "OPEN_RECORDING_SESSION",
    workflowId: workflow.workflowId,
    workflowTitle: workflow.workflowTitle,
    sessionMode: sessionMode,
  }, (response) => {
    if (response?.ok) {
      console.log("Recording session opened:", sessionMode);
    } else {
      console.error("Failed to open session:", response?.error);
    }
  });
});

window.addEventListener("tracedeck_stop", () => {
  isRecording = false;
  localStorage.setItem("tracedeck_steps", JSON.stringify(capturedSteps));

  chrome.runtime.sendMessage({
    type: "STOP_RECORDING_SESSION",
    steps: capturedSteps,
  });
});

// Receive step updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STEP_UPDATE") {
    capturedSteps = msg.steps || [];
    localStorage.setItem("tracedeck_steps", JSON.stringify(capturedSteps));
    window.dispatchEvent(new CustomEvent("tracedeck_step_update", {
      detail: {
        steps: msg.steps,
        lastStep: msg.lastStep,
        stepCount: msg.stepCount,
      }
    }));
  }
});
