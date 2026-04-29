const MENU_ID = "hr-generate-search-terms";
const REQUIRED_API_FIELDS = ["apiKey", "apiBaseUrl", "modelName"];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "生成招聘搜索词和对标公司",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) {
    return;
  }

  const selectedText = (info.selectionText || "").trim();

  try {
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, {
      type: "HR_ASSISTANT_OPEN",
      payload: {
        selectedText
      }
    });
  } catch (error) {
    console.error("Failed to open HR assistant overlay:", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "HR_ASSISTANT_GENERATE") {
    return false;
  }

  generateRecruitingData(message.payload)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));

  return true;
});

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "HR_ASSISTANT_PING" });
  } catch (_) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  }
}

async function generateRecruitingData(payload = {}) {
  const jobTitle = (payload.jobTitle || "").trim();

  if (!jobTitle) {
    throw createUserError("请先选中岗位名称", "NO_SELECTION");
  }

  const settings = await chrome.storage.local.get([
    "companyName",
    "industry",
    "targetRegion",
    "keywordLanguage",
    "apiKey",
    "apiBaseUrl",
    "modelName"
  ]);

  const missingApiConfig = REQUIRED_API_FIELDS.some((field) => !String(settings[field] || "").trim());
  if (missingApiConfig) {
    throw createUserError("请先在插件设置中配置 API 信息", "MISSING_API_CONFIG");
  }

  const responseText = await requestChatCompletion({
    settings,
    jobTitle
  });

  return parseAiJson(responseText);
}

async function requestChatCompletion({ settings, jobTitle }) {
  const endpoint = buildChatCompletionsUrl(settings.apiBaseUrl);
  const prompt = buildPrompt({ settings, jobTitle });

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.modelName,
        messages: [
          {
            role: "system",
            content: "你是专业招聘搜索顾问。只返回严格 JSON，不要返回 Markdown、解释、代码块或额外文字。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.4,
        response_format: {
          type: "json_object"
        }
      })
    });
  } catch (error) {
    throw createUserError("网络请求失败，请检查 API Base URL 或网络连接", "NETWORK_ERROR", error);
  }

  if (!response.ok) {
    const errorText = await safeReadText(response);
    throw createUserError(`AI 请求失败：${response.status} ${errorText || response.statusText}`, "API_ERROR");
  }

  const payload = await response.json().catch((error) => {
    throw createUserError("AI 请求失败：接口返回内容不是有效 JSON", "API_RESPONSE_ERROR", error);
  });

  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw createUserError("AI 返回格式异常，请重试", "INVALID_AI_FORMAT");
  }

  return content;
}

function buildChatCompletionsUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");

  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }

  return `${trimmed}/v1/chat/completions`;
}

function buildPrompt({ settings, jobTitle }) {
  const companyName = settings.companyName || "未填写";
  const industry = settings.industry || "未填写";
  const targetRegion = settings.targetRegion || "未填写";
  const keywordLanguage = settings.keywordLanguage || "中文";

  return [
    "你是一个专业的招聘搜索策略助手，服务对象是公司 HR。",
    "",
    "你的任务：",
    "根据用户选中的岗位名称，以及 HR 配置的公司信息，生成招聘网站搜索用的关键词和对标公司。",
    "",
    "输入信息：",
    `- 岗位名称：${jobTitle}`,
    `- HR 公司名称：${companyName}`,
    `- HR 公司所在行业：${industry}`,
    `- 目标招聘地区：${targetRegion}`,
    `- 关键词语言：${keywordLanguage}`,
    "",
    "生成要求：",
    "",
    "一、关键词 keywords",
    "请按结构化分类生成关键词，每个分类至少生成 3 个关键词。",
    "如果某个分类确实无法生成，也必须返回空数组，不要省略字段。",
    "",
    "1. core_skills 核心技能：",
    "围绕岗位本身必须具备的能力，例如：嵌入式开发、驱动开发、控制算法、系统设计。",
    "",
    "2. tech_stack 技术栈：",
    "围绕工具、语言、平台、协议、框架，例如：STM32、C语言、RTOS、CAN通信、Linux。",
    "",
    "3. job_aliases 岗位别名：",
    "围绕招聘网站和简历中可能出现的岗位表达，例如：嵌入式工程师、固件工程师、底层软件工程师。",
    "",
    "4. industry_keywords 行业关键词：",
    "围绕 HR 公司所在行业和岗位结合后的行业词，例如：航电系统、飞控、航空电子、无人机系统。",
    "",
    "关键词不要过于宽泛。",
    "避免生成“工程师”“开发”“管理”“技术”等单独无意义词。",
    "",
    "二、对标公司 benchmark_companies",
    "请生成至少 8 个对标公司。",
    "",
    "对标公司必须严格遵守以下规则：",
    "1. 优先选择与 HR 公司所在行业高度相关的公司。",
    "2. 对标公司应是可能拥有类似岗位人才的公司。",
    "3. 不要只根据岗位技能选择公司，必须结合行业。",
    "4. 如果公司行业是“飞行器、飞机、航空航天、航空制造、无人机、航电系统”等，对标公司应优先来自：",
    "   - 航空航天企业",
    "   - 飞机制造企业",
    "   - 无人机企业",
    "   - 航电系统企业",
    "   - 航空零部件企业",
    "   - 航空发动机企业",
    "   - 卫星或飞行器相关企业",
    "5. 不要把汽车公司、新能源汽车公司、普通互联网公司作为主要对标公司，除非岗位名称或行业信息明确要求。",
    "6. 如果岗位是通用岗位，例如 HR、财务、法务、行政，也仍然优先选择同一行业内的公司，而不是随机选择其他行业公司。",
    "7. 如果行业信息不足，请根据 HR 公司名称和岗位名称推断行业，但必须降低不确定性，不要跨行业乱扩展。",
    "8. 如果无法确定足够多的真实公司，请宁可少量生成，也不要编造不存在的公司。",
    "",
    "三、输出格式",
    "你必须只返回严格 JSON。",
    "不要返回 Markdown。",
    "不要返回解释。",
    "不要返回代码块。",
    "不要返回多余文字。",
    "",
    "JSON 格式如下：",
    "",
    "{",
    "  \"keywords\": {",
    "    \"core_skills\": [],",
    "    \"tech_stack\": [],",
    "    \"job_aliases\": [],",
    "    \"industry_keywords\": []",
    "  },",
    "  \"benchmark_companies\": [",
    "    \"对标公司1\",",
    "    \"对标公司2\",",
    "    \"对标公司3\",",
    "    \"对标公司4\",",
    "    \"对标公司5\",",
    "    \"对标公司6\",",
    "    \"对标公司7\",",
    "    \"对标公司8\"",
    "  ]",
    "}",
    "",
    "质量要求：",
    "1. 所有内容必须适合 HR 在招聘网站中搜索人才。",
    "2. 关键词要短，通常 2 到 12 个字或常见英文技术词。",
    "3. 公司名称要使用常见简称或官方常用名称。",
    "4. 不要生成重复项。",
    "5. 不要生成明显无关行业公司。",
    "6. 对标公司必须比关键词更重视行业匹配。",
    "7. 只返回 JSON，不要 Markdown，不要解释，不要代码块。"
  ].join("\n");
}

function parseAiJson(content) {
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch (error) {
    throw createUserError("AI 返回格式异常，请重试", "JSON_PARSE_ERROR", error);
  }

  const keywords = normalizeKeywords(parsed.keywords);
  const benchmarkCompanies = normalizeStringList(parsed.benchmark_companies);

  const keywordCount = Object.values(keywords).reduce((total, items) => total + items.length, 0);

  if (keywordCount === 0 || benchmarkCompanies.length < 1) {
    throw createUserError("AI 返回格式异常，请重试", "INVALID_JSON_SHAPE");
  }

  return {
    keywords,
    benchmark_companies: benchmarkCompanies
  };
}

function normalizeKeywords(value) {
  const emptyKeywords = {
    core_skills: [],
    tech_stack: [],
    job_aliases: [],
    industry_keywords: []
  };

  if (Array.isArray(value)) {
    return {
      ...emptyKeywords,
      core_skills: normalizeStringList(value)
    };
  }

  if (!value || typeof value !== "object") {
    return emptyKeywords;
  }

  return {
    core_skills: normalizeStringList(value.core_skills),
    tech_stack: normalizeStringList(value.tech_stack),
    job_aliases: normalizeStringList(value.job_aliases),
    industry_keywords: normalizeStringList(value.industry_keywords)
  };
}

function stripJsonFence(content) {
  return String(content)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch (_) {
    return "";
  }
}

function createUserError(message, code, cause) {
  const error = new Error(message);
  error.code = code;
  error.cause = cause;
  return error;
}

function normalizeError(error) {
  return {
    message: error?.message || "发生未知错误",
    code: error?.code || "UNKNOWN_ERROR"
  };
}
