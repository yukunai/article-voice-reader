const apiKeyInput = document.querySelector("#api-key");
const modelInput = document.querySelector("#model");
const statusEl = document.querySelector("#status");
const keyStateEl = document.querySelector("#key-state");
const extensionStorage = globalThis.chrome?.storage?.sync;

init();

document.querySelector("#save").addEventListener("click", async () => {
  if (!extensionStorage) {
    setStatus("请从浏览器扩展图标打开设置页。");
    return;
  }

  const apiKey = apiKeyInput.value.trim();
  await extensionStorage.set({
    openaiApiKey: apiKey,
    openaiModel: modelInput.value.trim() || "gpt-5-nano"
  });
  updateKeyState(Boolean(apiKey));
  setStatus("已保存。");
});

document.querySelector("#clear").addEventListener("click", async () => {
  if (!extensionStorage) {
    setStatus("请从浏览器扩展图标打开设置页。");
    return;
  }

  await extensionStorage.remove(["openaiApiKey"]);
  apiKeyInput.value = "";
  updateKeyState(false);
  setStatus("API Key 已清除。");
});

async function init() {
  if (!extensionStorage) {
    keyStateEl.textContent = "请从浏览器扩展图标打开设置页。";
    return;
  }

  const { openaiApiKey, openaiModel } = await extensionStorage.get([
    "openaiApiKey",
    "openaiModel"
  ]);
  apiKeyInput.value = openaiApiKey || "";
  modelInput.value = openaiModel || "gpt-5-nano";
  updateKeyState(Boolean(openaiApiKey));
}

function updateKeyState(hasKey) {
  keyStateEl.classList.toggle("ready", hasKey);
  keyStateEl.textContent = hasKey
    ? "翻译已启用：插件内已保存 API Key。"
    : "翻译未启用：请先填写 API Key。朗读仍可直接使用。";
}

function setStatus(message) {
  statusEl.textContent = message;
  window.setTimeout(() => {
    statusEl.textContent = "";
  }, 2200);
}
