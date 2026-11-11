const DEFAULT_MODEL = "gpt-5-nano";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TRANSLATE_TO_CHINESE") {
    return false;
  }

  translateToChinese(message.text)
    .then((translatedText) => sendResponse({ ok: true, translatedText }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function translateToChinese(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("没有可翻译的文字。");
  }

  const { openaiApiKey, openaiModel } = await chrome.storage.sync.get([
    "openaiApiKey",
    "openaiModel"
  ]);

  if (!openaiApiKey) {
    throw new Error("请先在插件设置里填写 OpenAI API Key。");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: openaiModel || DEFAULT_MODEL,
      input: [
        {
          role: "developer",
          content:
            "Translate the user's selected webpage text into natural Simplified Chinese. Preserve paragraph breaks. Return only the translation."
        },
        {
          role: "user",
          content: trimmed.slice(0, 12000)
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const apiMessage = payload?.error?.message || response.statusText;
    throw new Error(`翻译失败：${apiMessage}`);
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new Error("翻译接口没有返回可读文本。");
  }

  return outputText.trim();
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  return (payload?.output || [])
    .flatMap((item) => item?.content || [])
    .map((part) => part?.text || "")
    .filter(Boolean)
    .join("\n");
}
