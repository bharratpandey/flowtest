// bridge.js — listens for recording triggers from TraceDeck dashboard

let isRecording = false;
let capturedSteps = [];

window.addEventListener("tracedeck_start", () => {
  const data = localStorage.getItem("tracedeck_workflow");
  if (!data) return;
  const workflow = JSON.parse(data);
  isRecording = true;
  capturedSteps = [];

  chrome.storage.local.set({
    workflowId: workflow.workflowId,
    workflowTitle: workflow.workflowTitle,
    workflowFramework: workflow.workflowFramework,
    isRecording: true,
  });

  chrome.runtime.sendMessage({
    type: "START_WORKFLOW",
    workflowId: workflow.workflowId,
  });
});

window.addEventListener("tracedeck_stop", () => {
  isRecording = false;
  localStorage.setItem("tracedeck_steps", JSON.stringify(capturedSteps));
  chrome.runtime.sendMessage({ type: "STOP_WORKFLOW", steps: capturedSteps });
});

// Listen for steps from content script via background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STEP_UPDATE" && isRecording) {
    capturedSteps = msg.steps || [];
  }
});
