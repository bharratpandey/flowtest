// popup.js — Controls the extension popup UI

const TRACEDECK_URL = "http://localhost:3000";

// ─── State ────────────────────────────────────────────────────────────────────

let state = {
  isRecording: false,
  workflowId: null,
  workflowTitle: null,
  workflowFramework: null,
  stepCount: 0,
  lastStep: null,
};

// ─── UI helpers ───────────────────────────────────────────────────────────────

function showView(view) {
  document.getElementById("idle-view").style.display =
    view === "idle" ? "block" : "none";
  document.getElementById("recording-view").style.display =
    view === "recording" ? "block" : "none";
}

function updateRecordingUI() {
  document.getElementById("step-count").textContent = state.stepCount;
  if (state.lastStep) {
    document.getElementById("last-step-container").style.display = "block";
    document.getElementById("last-step-text").textContent = formatStep(
      state.lastStep,
    );
  }
}

function formatStep(step) {
  switch (step.type) {
    case "click":
      return (
        "Clicked: " +
        (step.target?.text_content || step.target?.tag || "element")
      );
    case "dblclick":
      return (
        "Double clicked: " +
        (step.target?.text_content || step.target?.tag || "element")
      );
    case "type":
      return (
        "Typed in: " +
        (step.target?.placeholder || step.target?.name || "field")
      );
    case "navigate":
      return "Navigated to: " + (step.url || "");
    case "select":
      return "Selected: " + (step.value || "");
    case "keypress":
      return "Pressed: " + (step.key || "");
    case "scroll":
      return "Scrolled page";
    case "drag_and_drop":
      return "Dragged element";
    case "new_tab":
      return "Opened new tab";
    case "switch_tab":
      return "Switched tab";
    default:
      return step.type;
  }
}

// ─── Load state from storage ──────────────────────────────────────────────────

async function loadState() {
  const data = await chrome.storage.local.get([
    "isRecording",
    "workflowId",
    "workflowTitle",
    "workflowFramework",
    "stepCount",
    "lastStep",
  ]);

  state.isRecording = data.isRecording || false;
  state.workflowId = data.workflowId || null;
  state.workflowTitle = data.workflowTitle || null;
  state.workflowFramework = data.workflowFramework || null;
  state.stepCount = data.stepCount || 0;
  state.lastStep = data.lastStep || null;

  if (state.isRecording) {
    showView("recording");
    updateRecordingUI();
  } else if (state.workflowId) {
    showView("idle");
    document.getElementById("no-workflow").style.display = "none";
    document.getElementById("workflow-ready").style.display = "block";
    document.getElementById("workflow-name").textContent = state.workflowTitle;
    document.getElementById("workflow-meta").textContent =
      state.workflowFramework;
  } else {
    showView("idle");
    document.getElementById("no-workflow").style.display = "block";
    document.getElementById("workflow-ready").style.display = "none";
  }
}

// ─── Start recording ──────────────────────────────────────────────────────────

async function startRecording() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.storage.local.set({
    isRecording: true,
    stepCount: 0,
    lastStep: null,
  });

  await chrome.tabs.sendMessage(tab.id, { type: "START_RECORDING" });

  await chrome.runtime.sendMessage({
    type: "START_WORKFLOW",
    workflowId: state.workflowId,
  });

  state.isRecording = true;
  state.stepCount = 0;
  showView("recording");
  updateRecordingUI();
}

// ─── Stop recording ───────────────────────────────────────────────────────────

async function stopRecording() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "STOP_RECORDING",
  });
  const steps = response?.steps || [];

  await chrome.runtime.sendMessage({
    type: "STOP_WORKFLOW",
    steps,
  });

  await chrome.storage.local.set({
    isRecording: false,
    stepCount: 0,
    lastStep: null,
  });

  state.isRecording = false;
  showView("idle");

  // Open the workflow page in a new tab
  chrome.tabs.create({
    url: TRACEDECK_URL + "/workflows/" + state.workflowId,
  });
}

// ─── Listen for step updates from background ──────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STEP_UPDATE") {
    state.stepCount = msg.stepCount;
    state.lastStep = msg.lastStep;
    chrome.storage.local.set({
      stepCount: msg.stepCount,
      lastStep: msg.lastStep,
    });
    updateRecordingUI();
  }
});

// ─── Button handlers ──────────────────────────────────────────────────────────

document.getElementById("start-btn").addEventListener("click", startRecording);
document.getElementById("stop-btn").addEventListener("click", stopRecording);
document.getElementById("open-dashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: TRACEDECK_URL + "/dashboard" });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

loadState();
