// content_script.js
// Injected into every tab — captures all user actions

const SESSION = {
  isRecording: false,
  startTime: null,
  steps: [],
};

// ─── Selector Engine ──────────────────────────────────────────────────────────

function buildTarget(el) {
  if (!el || el === document.body) return null;
  const tag = el.tagName.toLowerCase();
  const rect = el.getBoundingClientRect();
  return {
    tag,
    id: el.id || null,
    name: el.name || null,
    type: el.type || null,
    placeholder: el.placeholder || null,
    aria_label: el.getAttribute("aria-label") || null,
    text_content: el.textContent?.trim().slice(0, 80) || null,
    data_testid: el.dataset.testid || el.dataset.cy || el.dataset.qa || null,
    css_selector: buildCssSelector(el),
    xpath: buildXPath(el),
    xpath_robust: buildRobustXPath(el),
    bounding_box: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    selector_confidence: rateSelectorConfidence(el),
  };
}

function buildCssSelector(el) {
  if (el.id) return "#" + CSS.escape(el.id);
  if (el.dataset.testid) return '[data-testid="' + el.dataset.testid + '"]';
  if (el.dataset.cy) return '[data-cy="' + el.dataset.cy + '"]';
  if (el.name && ["input", "select", "textarea"].includes(el.tagName.toLowerCase()))
    return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
  const parts = [];
  let node = el;
  while (node && node !== document.body) {
    let selector = node.tagName.toLowerCase();
    if (node.id) { selector = "#" + CSS.escape(node.id); parts.unshift(selector); break; }
    const siblings = [...(node.parentElement?.children || [])].filter(c => c.tagName === node.tagName);
    if (siblings.length > 1) selector += ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
    parts.unshift(selector);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function buildXPath(el) {
  if (el.id) return '//*[@id="' + el.id + '"]';
  const parts = [];
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    let idx = 1;
    let sib = node.previousSibling;
    while (sib) { if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === node.tagName) idx++; sib = sib.previousSibling; }
    parts.unshift(node.tagName.toLowerCase() + "[" + idx + "]");
    node = node.parentNode;
  }
  return "/" + parts.join("/");
}

function buildRobustXPath(el) {
  const tag = el.tagName.toLowerCase();
  if (el.getAttribute("aria-label")) return "//" + tag + '[@aria-label="' + el.getAttribute("aria-label") + '"]';
  if (el.type && el.name) return "//" + tag + '[@type="' + el.type + '" and @name="' + el.name + '"]';
  if (el.textContent?.trim() && ["button", "a", "label"].includes(tag))
    return "//" + tag + '[contains(text(),"' + el.textContent.trim().slice(0, 50) + '")]';
  if (el.placeholder) return "//" + tag + '[@placeholder="' + el.placeholder + '"]';
  return buildXPath(el);
}

function rateSelectorConfidence(el) {
  if (el.id || el.dataset.testid || el.dataset.cy) return "high";
  if (el.name || el.getAttribute("aria-label")) return "medium";
  return "low";
}

// ─── Step Recording ───────────────────────────────────────────────────────────

function recordStep(type, el, extra = {}) {
  if (!SESSION.isRecording) return;
  const step = {
    sequence: SESSION.steps.length + 1,
    type,
    timestamp_ms: Date.now() - SESSION.startTime,
    url: location.href,
    page_title: document.title,
    target: buildTarget(el),
    ...extra,
  };
  SESSION.steps.push(step);
  chrome.runtime.sendMessage({ type: "STEP_RECORDED", step });
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

function handleClick(e) {
  const el = e.target;
  if (["INPUT", "TEXTAREA"].includes(el.tagName) && el.type !== "submit" && el.type !== "button") return;
  recordStep(e.detail === 2 ? "dblclick" : "click", el);
}

function handleInput(e) {
  const el = e.target;
  clearTimeout(el._debounceTimer);
  el._debounceTimer = setTimeout(() => {
    const isPassword = el.type === "password";
    recordStep("type", el, { value: isPassword ? "__SECRET__" : el.value });
  }, 600);
}

function handleChange(e) {
  const el = e.target;
  if (el.tagName === "SELECT") recordStep("select", el, { value: el.value });
  else if (el.type === "checkbox" || el.type === "radio")
    recordStep("click", el, { value: el.checked ? "checked" : "unchecked" });
}

function handleKeypress(e) {
  const NOTABLE = ["Enter", "Tab", "Escape", "ArrowDown", "ArrowUp"];
  if (NOTABLE.includes(e.key)) recordStep("keypress", e.target, { key: e.key });
}

function handleScroll() {
  clearTimeout(window._scrollTimer);
  window._scrollTimer = setTimeout(() => {
    recordStep("scroll", null, {
      target: null,
      scroll_x: Math.round(window.scrollX),
      scroll_y: Math.round(window.scrollY),
    });
  }, 800);
}

// ─── Drag and Drop ────────────────────────────────────────────────────────────

let dragState = { isDragging: false, sourceSelector: null };
let mouseDownPos = { x: 0, y: 0 };
let potentialDragEl = null;

document.addEventListener("dragstart", (e) => {
  dragState.isDragging = true;
  dragState.sourceSelector = buildTarget(e.target);
}, true);

document.addEventListener("drop", (e) => {
  if (!dragState.isDragging) return;
  recordStep("drag_and_drop", null, { source: dragState.sourceSelector, target: buildTarget(e.target) });
  dragState.isDragging = false;
}, true);

document.addEventListener("mousedown", (e) => {
  mouseDownPos = { x: e.clientX, y: e.clientY };
  potentialDragEl = e.target;
}, true);

document.addEventListener("mousemove", (e) => {
  if (!potentialDragEl) return;
  const dx = Math.abs(e.clientX - mouseDownPos.x);
  const dy = Math.abs(e.clientY - mouseDownPos.y);
  if ((dx > 8 || dy > 8) && !dragState.isDragging) {
    dragState.isDragging = true;
    dragState.sourceSelector = buildTarget(potentialDragEl);
  }
}, true);

document.addEventListener("mouseup", (e) => {
  if (dragState.isDragging) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && target !== potentialDragEl) {
      recordStep("drag_and_drop", null, { source: dragState.sourceSelector, target: buildTarget(target) });
    }
  }
  dragState.isDragging = false;
  potentialDragEl = null;
}, true);

// ─── Attach / Detach ──────────────────────────────────────────────────────────

function attachListeners() {
  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);
  document.addEventListener("change", handleChange, true);
  document.addEventListener("keydown", handleKeypress, true);
  window.addEventListener("scroll", handleScroll, { passive: true });
}

function detachListeners() {
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("input", handleInput, true);
  document.removeEventListener("change", handleChange, true);
  document.removeEventListener("keydown", handleKeypress, true);
  window.removeEventListener("scroll", handleScroll);
}

// ─── Message Bridge ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "START_RECORDING") {
    SESSION.isRecording = true;
    SESSION.startTime = Date.now();
    SESSION.steps = [];
    attachListeners();
    sendResponse({ ok: true });
  }
  if (msg.type === "STOP_RECORDING") {
    SESSION.isRecording = false;
    detachListeners();
    sendResponse({ ok: true, steps: SESSION.steps });
  }
  if (msg.type === "GET_STATUS") {
    sendResponse({ isRecording: SESSION.isRecording, stepCount: SESSION.steps.length });
  }
  return true;
});

// ─── Auto-start on new tabs ───────────────────────────────────────────────────
// When a new tab opens inside a recording session (fresh or profile)
// the content script loads fresh and needs to auto-attach listeners

chrome.storage.local.get(["isRecording", "workflowId"], (data) => {
  if (data.isRecording && data.workflowId) {
    SESSION.isRecording = true;
    SESSION.startTime = Date.now();
    SESSION.steps = [];
    attachListeners();
    console.log("TraceDeck: Auto-started recording on tab:", location.href);
  }
});
