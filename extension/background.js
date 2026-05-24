// background.js - Service worker

const API_BASE = "http://localhost:3000/api";
let activeWorkflowId = null;
let stepBuffer = [];
let flushTimer = null;

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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "START_WORKFLOW") {
    activeWorkflowId = msg.workflowId;
    stepBuffer = [];
    fetch(API_BASE + "/workflows/" + msg.workflowId + "/start-recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(console.error);
    sendResponse({ ok: true });
  }

  if (msg.type === "STEP_RECORDED") {
    if (!activeWorkflowId) return;
    stepBuffer.push(msg.step);
    chrome.tabs.query({ url: "http://localhost:3000/*" }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs
          .sendMessage(tab.id, {
            type: "STEP_UPDATE",
            steps: [...stepBuffer],
            lastStep: msg.step,
            stepCount: stepBuffer.length,
          })
          .catch(() => {});
      });
    });
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushSteps, 2000);
  }

  if (msg.type === "STOP_WORKFLOW") {
    clearTimeout(flushTimer);
    const finalSteps = msg.steps?.length > 0 ? msg.steps : stepBuffer;
    fetch(API_BASE + "/workflows/" + activeWorkflowId + "/stop-recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: finalSteps }),
    })
      .then(() => {
        activeWorkflowId = null;
        stepBuffer = [];
      })
      .catch(console.error);
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_STATE") {
    sendResponse({ activeWorkflowId, stepCount: stepBuffer.length });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!activeWorkflowId) return;
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    !tab.url.startsWith("chrome://")
  ) {
    stepBuffer.push({
      sequence: stepBuffer.length + 1,
      type: "navigate",
      url: tab.url,
      page_title: tab.title,
      timestamp_ms: Date.now(),
      target: null,
    });
  }
});
