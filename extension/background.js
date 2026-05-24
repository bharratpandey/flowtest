// background.js - Service worker
// Manages workflow lifecycle and sends steps to TraceDeck API

const API_BASE = "http://localhost:3000/api";
let activeWorkflowId = null;
let stepBuffer = [];
let flushTimer = null;

// ─── Flush steps to API ───────────────────────────────────────────────────────

async function flushSteps() {
  if (!activeWorkflowId || stepBuffer.length === 0) return;
  const steps = [...stepBuffer];
  stepBuffer = [];
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

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "START_WORKFLOW") {
    fetch(API_BASE + "/workflows/" + msg.workflowId + "/start-recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => r.json())
      .then((data) => {
        activeWorkflowId = msg.workflowId;
        sendResponse({ ok: true });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "STEP_RECORDED") {
    if (!activeWorkflowId) return;
    stepBuffer.push(msg.step);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushSteps, 1000);
  }

  if (msg.type === "STOP_WORKFLOW") {
    flushSteps().then(() => {
      fetch(API_BASE + "/workflows/" + activeWorkflowId + "/stop-recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: msg.steps }),
      })
        .then((r) => r.json())
        .then(() => {
          activeWorkflowId = null;
          sendResponse({ ok: true });
        })
        .catch((err) => sendResponse({ ok: false, error: err.message }));
    });
    return true;
  }

  if (msg.type === "GET_STATE") {
    sendResponse({ activeWorkflowId });
  }
});

// ─── Track tab navigation ─────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!activeWorkflowId) return;
  if (changeInfo.status === "complete" && tab.url) {
    const step = {
      sequence: Date.now(),
      type: "navigate",
      url: tab.url,
      page_title: tab.title,
      timestamp_ms: Date.now(),
      target: null,
    };
    stepBuffer.push(step);
  }
});
