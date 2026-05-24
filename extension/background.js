// background.js - Service worker

const API_BASE = "http://localhost:3000/api";
let activeWorkflowId = null;
let stepBuffer = [];
let flushTimer = null;
let lastClickTime = {};
let lastClickStep = {};
let recordingWindowId = null;

async function flushSteps() {
  if (!activeWorkflowId || stepBuffer.length === 0) return;
  const steps = [...stepBuffer];
  try {
    await fetch(API_BASE + "/workflows/" + activeWorkflowId + "/steps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps }),
    });
  } catch (e) {
    console.error("Failed to flush steps:", e);
  }
}

function forwardStepUpdate(step) {
  chrome.tabs.query({ url: "http://localhost:3000/*" }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: "STEP_UPDATE",
        steps: [...stepBuffer],
        lastStep: step,
        stepCount: stepBuffer.length,
      }).catch(() => {});
    });
  });
}

async function openRecordingSession(workflowId, sessionMode) {
  activeWorkflowId = workflowId;
  stepBuffer = [];
  lastClickTime = {};
  lastClickStep = {};

  // Notify API that recording started
  fetch(API_BASE + "/workflows/" + workflowId + "/start-recording", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }).catch(console.error);

  await chrome.storage.local.set({
    isRecording: true,
    workflowId,
    stepCount: 0,
  });

  if (sessionMode === "fresh") {
    // Open new incognito window — clean slate
    const newWindow = await chrome.windows.create({
      incognito: true,
      url: "about:blank",
      state: "maximized",
      focused: true,
    });
    recordingWindowId = newWindow.id;
    return { ok: true, mode: "fresh", windowId: newWindow.id };
  } else {
    // Profile mode — record in existing browser
    // Just activate the current window and start recording
    recordingWindowId = null;
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (currentTab?.windowId) {
      await chrome.windows.update(currentTab.windowId, { focused: true });
    }
    return { ok: true, mode: "profile" };
  }
}

async function stopRecordingSession(steps) {
  clearTimeout(flushTimer);

  const finalSteps = steps?.length > 0 ? steps : stepBuffer;

  if (activeWorkflowId) {
    await fetch(API_BASE + "/workflows/" + activeWorkflowId + "/stop-recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: finalSteps }),
    }).catch(console.error);
  }

  // Close recording window if it was a fresh session
  if (recordingWindowId) {
    try {
      await chrome.windows.remove(recordingWindowId);
    } catch (e) {}
    recordingWindowId = null;
  }

  activeWorkflowId = null;
  stepBuffer = [];

  await chrome.storage.local.set({
    isRecording: false,
    stepCount: 0,
    lastStep: null,
  });
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === "OPEN_RECORDING_SESSION") {
    openRecordingSession(msg.workflowId, msg.sessionMode)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "STOP_RECORDING_SESSION") {
    stopRecordingSession(msg.steps)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "STEP_RECORDED") {
    if (!activeWorkflowId) return;
    const step = msg.step;
    const tabId = _sender?.tab?.id;

    if (step.type === "click" || step.type === "dblclick") {
      lastClickTime[tabId] = Date.now();
      lastClickStep[tabId] = step;
    }

    stepBuffer.push(step);
    forwardStepUpdate(step);

    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushSteps, 2000);
  }

  if (msg.type === "START_WORKFLOW") {
    activeWorkflowId = msg.workflowId;
    stepBuffer = [];
    fetch(API_BASE + "/workflows/" + msg.workflowId + "/start-recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(console.error);
    sendResponse({ ok: true });
  }

  if (msg.type === "STOP_WORKFLOW") {
    clearTimeout(flushTimer);
    const finalSteps = msg.steps?.length > 0 ? msg.steps : stepBuffer;
    fetch(API_BASE + "/workflows/" + activeWorkflowId + "/stop-recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: finalSteps }),
    }).then(() => {
      activeWorkflowId = null;
      stepBuffer = [];
    }).catch(console.error);
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_STATE") {
    sendResponse({
      activeWorkflowId,
      stepCount: stepBuffer.length,
      recordingWindowId,
    });
  }

});

// ─── Tab navigation tracking ──────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!activeWorkflowId) return;
  if (changeInfo.status !== "complete") return;
  if (!tab.url || tab.url.startsWith("chrome://") || tab.url === "about:blank") return;
  if (tab.url.startsWith("http://localhost:3000")) return;

  // For fresh session — only track the recording window
  if (recordingWindowId && tab.windowId !== recordingWindowId) return;

  const now = Date.now();
  const timeSinceClick = now - (lastClickTime[tabId] || 0);

  if (timeSinceClick < 1500 && lastClickStep[tabId]) {
    const clickStep = lastClickStep[tabId];
    const idx = stepBuffer.findIndex(s => s === clickStep);
    if (idx !== -1) {
      stepBuffer[idx] = {
        ...clickStep,
        navigated_to: tab.url,
        page_title_after: tab.title,
      };
    }
    lastClickTime[tabId] = 0;
    return;
  }

  // Pure navigation
  const navStep = {
    sequence: stepBuffer.length + 1,
    type: "navigate",
    url: tab.url,
    page_title: tab.title,
    timestamp_ms: now,
    target: null,
  };

  stepBuffer.push(navStep);
  forwardStepUpdate(navStep);
});

// Handle recording window closed manually
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === recordingWindowId) {
    recordingWindowId = null;
    stopRecordingSession([]);
  }
});
