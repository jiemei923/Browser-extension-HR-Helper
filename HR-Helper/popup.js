const SETTINGS_KEYS = [
  "companyName",
  "industry",
  "targetRegion",
  "keywordLanguage",
  "apiKey",
  "apiBaseUrl",
  "modelName"
];

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("settingsForm");
  const statusMessage = document.getElementById("statusMessage");
  const apiKeyField = document.getElementById("apiKey");
  const toggleApiKey = document.getElementById("toggleApiKey");
  const savedSettings = await chrome.storage.local.get(SETTINGS_KEYS);

  SETTINGS_KEYS.forEach((key) => {
    const field = document.getElementById(key);
    if (field && savedSettings[key]) {
      field.value = savedSettings[key];
    }
  });

  if (!document.getElementById("keywordLanguage").value) {
    document.getElementById("keywordLanguage").value = "中文";
  }

  toggleApiKey.addEventListener("click", () => {
    const isHidden = apiKeyField.type === "password";
    apiKeyField.type = isHidden ? "text" : "password";
    toggleApiKey.textContent = isHidden ? "👁 隐藏" : "👁 显示";
    toggleApiKey.setAttribute("aria-label", isHidden ? "隐藏 API Key" : "显示 API Key");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const data = {};
    SETTINGS_KEYS.forEach((key) => {
      const field = document.getElementById(key);
      data[key] = field ? field.value.trim() : "";
    });

    if (!data.keywordLanguage) {
      data.keywordLanguage = "中文";
    }

    await chrome.storage.local.set(data);
    statusMessage.textContent = "✔ 已保存";
    statusMessage.className = "status is-success";

    window.setTimeout(() => {
      statusMessage.textContent = "";
      statusMessage.className = "status";
    }, 1800);
  });
});
