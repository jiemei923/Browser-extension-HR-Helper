(() => {
if (window.__hrAssistantContentLoaded) {
  return;
}
window.__hrAssistantContentLoaded = true;

const OVERLAY_ID = "hr-assistant-overlay-root";
const KEYWORD_SECTIONS = [
  {
    key: "core_skills",
    title: "🔍 核心技能",
    tone: "core"
  },
  {
    key: "tech_stack",
    title: "⚙ 技术栈",
    tone: "tech"
  },
  {
    key: "job_aliases",
    title: "🏷 岗位别名",
    tone: "alias"
  },
  {
    key: "industry_keywords",
    title: "✈ 行业相关",
    tone: "industry"
  }
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "HR_ASSISTANT_PING") {
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "HR_ASSISTANT_OPEN") {
    openOverlay(message.payload?.selectedText || "");
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

function openOverlay(selectedText) {
  const jobTitle = String(selectedText || getCurrentSelection()).trim();
  const overlay = ensureOverlay();
  overlay.state.jobTitle = jobTitle;
  overlay.render();

  chrome.storage.local.get(["industry"], (settings) => {
    overlay.state.industry = String(settings.industry || "").trim();
    overlay.render();
  });

  if (!jobTitle) {
    overlay.setError("请先选中岗位名称");
    return;
  }

  overlay.generate();
}

function getCurrentSelection() {
  return window.getSelection ? window.getSelection().toString() : "";
}

function ensureOverlay() {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing?.hrAssistantOverlay) {
    return existing.hrAssistantOverlay;
  }

  const host = document.createElement("div");
  host.id = OVERLAY_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = chrome.runtime.getURL("styles.css");

  const app = document.createElement("section");
  app.className = "hra-panel";
  app.setAttribute("role", "dialog");
  app.setAttribute("aria-label", "招聘搜索词助手");

  shadow.append(stylesheet, app);
  document.documentElement.appendChild(host);

  const overlay = createOverlayController(host, app);
  host.hrAssistantOverlay = overlay;
  return overlay;
}

function createOverlayController(host, app) {
  const state = {
    jobTitle: "",
    industry: "",
    loading: false,
    error: "",
    copiedText: "",
    result: null,
    closeTimer: null
  };

  const controller = {
    state,
    render,
    generate,
    close,
    setError(message) {
      state.loading = false;
      state.error = message;
      state.result = null;
      render();
    }
  };

  const outsideClickHandler = (event) => {
    if (!host.contains(event.target)) {
      close();
    }
  };

  const keydownHandler = (event) => {
    if (event.key === "Escape") {
      close();
    }
  };

  window.setTimeout(() => {
    document.addEventListener("mousedown", outsideClickHandler);
    document.addEventListener("keydown", keydownHandler);
  }, 0);

  async function generate() {
    if (!state.jobTitle) {
      controller.setError("请先选中岗位名称");
      return;
    }

    state.loading = true;
    state.error = "";
    state.copiedText = "";
    render();

    chrome.runtime.sendMessage(
      {
        type: "HR_ASSISTANT_GENERATE",
        payload: {
          jobTitle: state.jobTitle
        }
      },
      (response) => {
        state.loading = false;

        if (chrome.runtime.lastError) {
          state.error = chrome.runtime.lastError.message || "AI 请求失败";
          state.result = null;
        } else if (!response?.ok) {
          state.error = response?.error?.message || "AI 请求失败";
          state.result = null;
        } else {
          state.result = response.data;
          state.error = "";
        }

        render();
      }
    );
  }

  function render() {
    app.innerHTML = "";

    const header = createElement("header", "hra-header");
    const titleWrap = createElement("div", "hra-title-wrap");
    const eyebrow = createElement("div", "hra-eyebrow", "招聘效率工具");
    const title = createElement("h2", "hra-title", state.jobTitle || "未选择岗位");
    const closeButton = createElement("button", "hra-close-button", "×");
    closeButton.type = "button";
    closeButton.title = "关闭";
    closeButton.setAttribute("aria-label", "关闭");
    closeButton.addEventListener("click", close);

    titleWrap.append(eyebrow, title);
    header.append(titleWrap, closeButton);

    const body = createElement("div", "hra-body");

    if (state.copiedText) {
      body.append(createElement("div", "hra-toast", `✔ 已复制：${state.copiedText}`));
    }

    if (state.industry) {
      body.append(createIndustryLock(state.industry));
    }

    if (state.loading) {
      body.append(createLoading());
    } else if (state.error) {
      body.append(createElement("div", "hra-error", state.error));
    } else if (state.result) {
      const keywordGroups = normalizeKeywordGroups(state.result.keywords);
      KEYWORD_SECTIONS.forEach((section) => {
        const items = keywordGroups[section.key] || [];
        if (items.length > 0) {
          body.append(createTagSection(section.title, items, section.tone));
        }
      });

      if ((state.result.benchmark_companies || []).length > 0) {
        body.append(createTagSection("🏢 对标公司", state.result.benchmark_companies || [], "company"));
      }
    }

    const footer = createElement("footer", "hra-footer");
    const regenerateButton = createElement("button", "hra-secondary-button", "🔄 重新生成");
    regenerateButton.type = "button";
    regenerateButton.disabled = state.loading;
    regenerateButton.addEventListener("click", generate);

    footer.append(regenerateButton);
    app.append(header, body, footer);
  }

  function createIndustryLock(industry) {
    const notice = createElement("div", "hra-industry-lock");
    const icon = createElement("span", "hra-industry-icon", "ℹ");
    const textWrap = createElement("div", "hra-industry-text");
    textWrap.append(
      createElement("strong", "", `已锁定行业：${industry}`),
      createElement("span", "", "已优先匹配该行业公司")
    );
    notice.append(icon, textWrap);
    return notice;
  }

  function createLoading() {
    const loading = createElement("div", "hra-loading");
    const spinner = createElement("span", "hra-spinner");
    const text = createElement("span", "", "正在生成关键词...");
    loading.append(spinner, text);
    return loading;
  }

  function createTagSection(title, items, tone) {
    const section = createElement("section", `hra-section is-${tone}`);
    section.append(createElement("h3", "hra-section-title", title));

    const list = createElement("div", "hra-chip-list");
    items.forEach((item) => {
      const chip = createElement("button", `hra-chip is-${tone}`, item);
      chip.type = "button";
      chip.title = `复制 ${item}`;
      chip.addEventListener("click", async () => {
        await copyText(item);
        state.copiedText = item;
        render();
        window.setTimeout(() => {
          if (state.copiedText === item) {
            state.copiedText = "";
            render();
          }
        }, 1800);
      });
      list.append(chip);
    });

    section.append(list);
    return section;
  }

  function close() {
    if (state.closeTimer) {
      return;
    }

    document.removeEventListener("mousedown", outsideClickHandler);
    document.removeEventListener("keydown", keydownHandler);
    host.classList.add("is-closing");
    state.closeTimer = window.setTimeout(() => host.remove(), 180);
  }

  return controller;
}

function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (textContent !== undefined) {
    element.textContent = textContent;
  }
  return element;
}

function normalizeKeywordGroups(value) {
  const emptyGroups = {
    core_skills: [],
    tech_stack: [],
    job_aliases: [],
    industry_keywords: []
  };

  if (Array.isArray(value)) {
    return {
      ...emptyGroups,
      core_skills: normalizeStringList(value)
    };
  }

  if (!value || typeof value !== "object") {
    return emptyGroups;
  }

  return {
    core_skills: normalizeStringList(value.core_skills),
    tech_stack: normalizeStringList(value.tech_stack),
    job_aliases: normalizeStringList(value.job_aliases),
    industry_keywords: normalizeStringList(value.industry_keywords)
  };
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_) {
      // Fall through to the compatibility path below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
})();
