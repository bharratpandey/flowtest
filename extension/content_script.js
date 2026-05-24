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
  if (
    el.name &&
    ["input", "select", "textarea"].includes(el.tagName.toLowerCase())
  )
    return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
  const parts = [];
  let node = el;
  while (node && node !== document.body) {
    let selector = node.tagName.toLowerCase();
    if (node.id) {
      selector = "#" + CSS.escape(node.id);
      parts.unshift(selector);
      break;
    }
    const siblings = [...(node.parentElement?.children || [])].filter(
      (c) => c.tagName === node.tagName,
    );
    if (siblings.length > 1)
      selector += ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
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
    while (sib) {
      if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === node.tagName)
        idx++;
      sib = sib.previousSibling;
    }
    parts.unshift(node.tagName.toLowerCase() + "[" + idx + "]");
    node = node.parentNode;
  }
  return "/" + parts.join("/");
}

function buildRobustXPath(el) {
  const tag = el.tagName.toLowerCase();
  if (el.getAttribute("aria-label"))
    return "//" + tag + '[@aria-label="' + el.getAttribute("aria-label") + '"]';
  if (el.type && el.name)
    return "//" + tag + '[@type="' + el.type + '" and @name="' + el.name + '"]';
  if (el.textContent?.trim() && ["button", "a", "label"].includes(tag))
    return (
      "//" +
      tag +
      '[contains(text(),"' +
      el.textContent.trim().slice(0, 50) +
      '")]'
    );
  if (el.placeholder)
    return "//" + tag + '[@placeholder="' + el.placeholder + '"]';
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
  if (
    ["INPUT", "TEXTAREA"].includes(el.tagName) &&
    el.type !== "submit" &&
    el.type !== "button"
  )
    return;
  recordStep(e.detail === 2 ? "dblclick" : "click", el);
}

function handleInput(e) {
  const el = e.target;
  clearTimeout(el._debounceTimer);
  el._debounceTimer = setTimeout(() => {
    const isPassword = el.type === "password";
    if (isPassword && el.value.length > 0) {
      recordStep("type", el, { value: "__SECRET__" });
      showSecretPrompt(el, el.value);
    } else {
      recordStep("type", el, { value: el.value });
    }
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

document.addEventListener(
  "dragstart",
  (e) => {
    dragState.isDragging = true;
    dragState.sourceSelector = buildTarget(e.target);
  },
  true,
);

document.addEventListener(
  "drop",
  (e) => {
    if (!dragState.isDragging) return;
    recordStep("drag_and_drop", null, {
      source: dragState.sourceSelector,
      target: buildTarget(e.target),
    });
    dragState.isDragging = false;
  },
  true,
);

document.addEventListener(
  "mousedown",
  (e) => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
    potentialDragEl = e.target;
  },
  true,
);

document.addEventListener(
  "mousemove",
  (e) => {
    if (!potentialDragEl) return;
    const dx = Math.abs(e.clientX - mouseDownPos.x);
    const dy = Math.abs(e.clientY - mouseDownPos.y);
    if ((dx > 8 || dy > 8) && !dragState.isDragging) {
      dragState.isDragging = true;
      dragState.sourceSelector = buildTarget(potentialDragEl);
    }
  },
  true,
);

document.addEventListener(
  "mouseup",
  (e) => {
    if (dragState.isDragging) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target && target !== potentialDragEl) {
        recordStep("drag_and_drop", null, {
          source: dragState.sourceSelector,
          target: buildTarget(target),
        });
      }
    }
    dragState.isDragging = false;
    potentialDragEl = null;
  },
  true,
);

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
    sendResponse({
      isRecording: SESSION.isRecording,
      stepCount: SESSION.steps.length,
    });
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

// ─── Password Secret Prompt ───────────────────────────────────────────────────

function showSecretPrompt(el, value) {
  // Remove any existing prompt
  const existing = document.getElementById("tracedeck-secret-prompt");
  if (existing) existing.remove();

  const rect = el.getBoundingClientRect();

  const overlay = document.createElement("div");
  overlay.id = "tracedeck-secret-prompt";
  overlay.style.cssText = `
    position: fixed;
    top: ${Math.min(rect.bottom + 8, window.innerHeight - 160)}px;
    left: ${Math.max(rect.left, 8)}px;
    z-index: 2147483647;
    background: #1a1a2e;
    border: 1px solid #4a4a8a;
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    font-family: system-ui, sans-serif;
    min-width: 280px;
    max-width: 320px;
  `;

  overlay.innerHTML = `
    <div style="color:#a0a0d0;font-size:11px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
      <span>🔒</span>
      <span>TraceDeck detected a password</span>
    </div>
    <div style="color:#e0e0ff;font-size:12px;margin-bottom:8px;">Save as secret?</div>
    <input
      id="tracedeck-secret-name"
      type="text"
      placeholder="e.g. EMB_PASSWORD"
      style="
        width: 100%;
        background: #0d0d1a;
        border: 1px solid #4a4a8a;
        border-radius: 6px;
        color: #e0e0ff;
        font-size: 12px;
        font-family: monospace;
        padding: 6px 8px;
        box-sizing: border-box;
        margin-bottom: 8px;
        outline: none;
      "
    />
    <div style="display:flex;gap:6px;">
      <button id="tracedeck-secret-skip" style="
        flex:1;background:transparent;border:1px solid #4a4a8a;
        color:#a0a0d0;border-radius:6px;padding:5px;
        font-size:11px;cursor:pointer;
      ">Skip</button>
      <button id="tracedeck-secret-save" style="
        flex:2;background:#5050c0;border:none;
        color:#fff;border-radius:6px;padding:5px;
        font-size:11px;cursor:pointer;font-weight:600;
      ">Save & Continue</button>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector("#tracedeck-secret-name");
  input.focus();

  // Auto-suggest name based on field
  const fieldName = el.name || el.id || el.placeholder || "";
  if (fieldName) {
    const suggested =
      fieldName.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_PASSWORD";
    input.value = suggested;
  }

  function saveSecret() {
    const secretName = input.value.trim().toUpperCase().replace(/\s+/g, "_");
    if (secretName) {
      // Update the last recorded step to use named secret
      chrome.runtime.sendMessage({
        type: "UPDATE_LAST_SECRET",
        secretName,
        secretValue: value,
      });
    }
    overlay.remove();
  }

  function skipSecret() {
    overlay.remove();
  }

  overlay
    .querySelector("#tracedeck-secret-save")
    .addEventListener("click", saveSecret);
  overlay
    .querySelector("#tracedeck-secret-skip")
    .addEventListener("click", skipSecret);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveSecret();
    if (e.key === "Escape") skipSecret();
    e.stopPropagation();
  });

  // Auto-dismiss after 15 seconds
  setTimeout(() => {
    if (overlay.parentNode) overlay.remove();
  }, 15000);
}
