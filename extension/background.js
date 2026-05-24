// background.js - Service worker
// Manages workflow lifecycle and sends steps to TraceDeck API

const API_BASE = "http://localhost:3000/api";
let activeWorkflowId = null;
let stepBuffer = [];
let flushTimer = null;
let lastClickTime = {};      // tabId -> timestamp of last click
let lastClickStep = {};      // tabId -> last click step

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
    lastClickTime = {};
    lastClickStep = {};
    fetch(API_BASE + "/workflows/" + msg.workflowId + "/start-recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(console.error);
    sendResponse({ ok: true });
  }

  if (msg.type === "STEP_RECORDED") {
    if (!activeWorkflowId) return;
    const step = msg.step;
    const tabId = _sender?.tab?.id;

    // Track click time per tab
    if (step.type === "click" || step.type === "dblclick") {
      lastClickTime[tabId] = Date.now();
      lastClickStep[tabId] = step;
    }

    stepBuffer.push(step);

    // Forward to TraceDeck dashboard tabs
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
    }).then(() => {
      activeWorkflowId = null;
      stepBuffer = [];
    }).catch(console.error);
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_STATE") {
    sendResponse({ activeWorkflowId, stepCount: stepBuffer.length });
  }

});

// Track tab navigation - smart deduplication
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!activeWorkflowId) return;
  if (changeInfo.status !== "complete") return;
  if (!tab.url || tab.url.startsWith("chrome://")) return;
  if (tab.url.startsWith("http://localhost:3000")) return;

  const now = Date.now();
  const timeSinceClick = now - (lastClickTime[tabId] || 0);

  // If a click happened within 1500ms on this tab
  // the navigate was caused by the click — skip recording duplicate navigate
  if (timeSinceClick < 1500 && lastClickStep[tabId]) {
    console.log("Skipping duplicate navigate after click:", tab.url);
    // Update the click step's url to reflect where it navigated to
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

  // Pure navigation (typed URL, back/forward, redirect)
  stepBuffer.push({
    sequence: stepBuffer.length + 1,
    type: "navigate",
    url: tab.url,
    page_title: tab.title,
    timestamp_ms: now,
    target: null,
  });

  // Forward update
  chrome.tabs.query({ url: "http://localhost:3000/*" }, (tabs) => {
    tabs.forEach(t => {
      chrome.tabs.sendMessage(t.id, {
        type: "STEP_UPDATE",
        steps: [...stepBuffer],
        lastStep: stepBuffer[stepBuffer.length - 1],
        stepCount: stepBuffer.length,
      }).catch(() => {});
    });
  });
});
