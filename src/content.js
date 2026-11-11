(() => {
  const TOOLBAR_ID = "avr-selection-toolbar";
  const PANEL_ID = "avr-reader-panel";
  const MAX_SPEAK_CHARS = 18000;
  const DEFAULT_RATE = 1.25;
  const DEFAULT_PITCH = 1.08;

  let selectedText = "";
  let latestTranslation = "";
  let speechQueue = [];
  let isPaused = false;
  let activeVoice = null;

  document.addEventListener("selectionchange", debounce(() => showSelectionToolbar(), 120));
  document.addEventListener("mouseup", (event) => {
    window.setTimeout(() => showSelectionToolbar(event), 20);
  });
  document.addEventListener("keyup", (event) => {
    if (event.key === "Shift" || event.key.startsWith("Arrow") || event.key === "Meta") {
      showSelectionToolbar(event);
    }
  });
  document.addEventListener("touchend", (event) => {
    window.setTimeout(() => showSelectionToolbar(event), 80);
  });
  document.addEventListener("mousedown", handleOutsideClick, true);
  window.addEventListener("scroll", () => showSelectionToolbar(), { passive: true });

  function showSelectionToolbar(event) {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || "";

    if (!text || text.length < 2 || !selection.rangeCount) {
      hideToolbar();
      return;
    }

    selectedText = text;
    const rect = getSelectionRect(selection);
    const fallbackPoint = getEventPoint(event);

    if (!rect && !fallbackPoint) {
      return;
    }

    showToolbar(rect, fallbackPoint);
  }

  function getSelectionRect(selection) {
    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0
    );

    if (rects.length) {
      return rects[rects.length - 1];
    }

    const rect = range.getBoundingClientRect();
    return rect.width || rect.height ? rect : null;
  }

  function getEventPoint(event) {
    if (!event) {
      return null;
    }

    const touch = event.changedTouches?.[0];
    if (touch) {
      return { x: touch.clientX, y: touch.clientY };
    }

    if (typeof event.clientX === "number" && typeof event.clientY === "number") {
      return { x: event.clientX, y: event.clientY };
    }

    return null;
  }

  function showToolbar(rect, fallbackPoint) {
    const toolbar = ensureToolbar();
    const left = rect ? rect.left : fallbackPoint.x;
    const bottom = rect ? rect.bottom : fallbackPoint.y;

    toolbar.style.left = `${Math.min(
      Math.max(12, window.innerWidth - 230),
      Math.max(12, left)
    )}px`;
    toolbar.style.top = `${Math.min(
      Math.max(12, window.innerHeight - 56),
      Math.max(12, bottom + 40)
    )}px`;
    toolbar.hidden = false;
  }

  function ensureToolbar() {
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) {
      return toolbar;
    }

    toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    toolbar.className = "avr-toolbar";
    toolbar.innerHTML = `
      <span class="avr-badge" title="Article Voice Reader">AVR</span>
      <button type="button" data-action="speak" title="朗读选中文字">朗读</button>
      <button type="button" data-action="translate" title="翻译成中文">译中</button>
      <button type="button" data-action="translate-speak" title="翻译后朗读中文">译读</button>
    `;
    toolbar.addEventListener("mousedown", (event) => event.preventDefault());
    toolbar.addEventListener("click", handleToolbarClick);
    document.documentElement.appendChild(toolbar);
    return toolbar;
  }

  async function handleToolbarClick(event) {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    if (action === "speak") {
      openPanel(selectedText);
      speak(selectedText);
    }

    if (action === "translate") {
      openPanel("正在翻译...");
      latestTranslation = await translateSelectedText();
      openPanel(latestTranslation);
    }

    if (action === "translate-speak") {
      openPanel("正在翻译...");
      latestTranslation = await translateSelectedText();
      openPanel(latestTranslation);
      speak(latestTranslation, "zh-CN");
    }
  }

  function openPanel(text) {
    const panel = ensurePanel();
    const preview = panel.querySelector("[data-role='preview']");
    preview.textContent = text || selectedText;
    panel.hidden = false;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) {
      return panel;
    }

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "avr-panel";
    panel.innerHTML = `
      <div class="avr-panel-head">
        <strong>有声阅读</strong>
        <button type="button" data-panel-action="close" title="关闭">x</button>
      </div>
      <div class="avr-preview" data-role="preview"></div>
      <div class="avr-controls">
        <button type="button" data-panel-action="play">播放</button>
        <button type="button" data-panel-action="pause">暂停</button>
        <button type="button" data-panel-action="stop">停止</button>
      </div>
      <label class="avr-field">
        <span>语速</span>
        <input data-role="rate" type="range" min="0.8" max="1.8" step="0.05" value="${DEFAULT_RATE}">
      </label>
      <div class="avr-voice" data-role="voice">正在选择更自然的声音...</div>
      <div class="avr-status" data-role="status"></div>
    `;
    panel.addEventListener("mousedown", (event) => event.stopPropagation());
    panel.addEventListener("click", handlePanelClick);
    panel.addEventListener("input", handlePanelInput);
    document.documentElement.appendChild(panel);
    return panel;
  }

  function handlePanelClick(event) {
    const action = event.target.closest("button")?.dataset.panelAction;
    if (!action) {
      return;
    }

    if (action === "close") {
      stopSpeaking();
      hidePanel();
    }

    if (action === "play") {
      const panelText = document.querySelector(`#${PANEL_ID} [data-role='preview']`)?.textContent;
      speak(panelText || latestTranslation || selectedText);
    }

    if (action === "pause") {
      togglePause();
    }

    if (action === "stop") {
      stopSpeaking();
    }
  }

  function handlePanelInput(event) {
    if (event.target.matches("[data-role='rate']")) {
      setStatus(`语速 ${Number(event.target.value).toFixed(2)}x`);
    }
  }

  async function translateSelectedText() {
    try {
      setStatus("正在连接翻译接口...");
      const response = await chrome.runtime.sendMessage({
        type: "TRANSLATE_TO_CHINESE",
        text: selectedText
      });

      if (!response?.ok) {
        throw new Error(response?.error || "翻译失败。");
      }

      setStatus("翻译完成");
      return response.translatedText;
    } catch (error) {
      const message = error?.message || "翻译失败。";
      setStatus(message);
      return message;
    }
  }

  function speak(text, langHint) {
    const content = String(text || "").trim().slice(0, MAX_SPEAK_CHARS);
    if (!content) {
      setStatus("没有可朗读的文字。");
      return;
    }

    stopSpeaking();
    isPaused = false;
    speechQueue = splitForSpeech(content);
    setStatus(`准备朗读 ${speechQueue.length} 段`);
    speakNext(langHint || detectLanguage(content));
  }

  function speakNext(lang) {
    const text = speechQueue.shift();
    if (!text) {
      setStatus("朗读完成");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = Number(
      document.querySelector(`#${PANEL_ID} [data-role='rate']`)?.value || DEFAULT_RATE
    );
    utterance.pitch = DEFAULT_PITCH;
    activeVoice = pickPreferredVoice(lang);
    if (activeVoice) {
      utterance.voice = activeVoice;
      setVoiceLabel(activeVoice);
    } else {
      setVoiceLabel(null);
    }
    utterance.onend = () => speakNext(lang);
    utterance.onerror = () => setStatus("朗读被中断。");
    speechSynthesis.speak(utterance);
    setStatus(`正在朗读，还剩 ${speechQueue.length} 段`);
  }

  function pickPreferredVoice(lang) {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) {
      speechSynthesis.onvoiceschanged = () => {
        const refreshed = pickPreferredVoice(lang);
        if (refreshed) {
          activeVoice = refreshed;
          setVoiceLabel(refreshed);
        }
      };
      return activeVoice;
    }

    const normalizedLang = lang.toLowerCase();
    const candidates = voices.filter((voice) =>
      voice.lang?.toLowerCase().startsWith(normalizedLang.split("-")[0])
    );
    const pool = candidates.length ? candidates : voices;
    const preferredNames = normalizedLang.startsWith("zh")
      ? [
          "ting-ting",
          "tingting",
          "mei-jia",
          "meijia",
          "sin-ji",
          "sinji",
          "xiaoxiao",
          "xiaoyi",
          "xiaobei",
          "female",
          "premium"
        ]
      : ["samantha", "victoria", "karen", "zira", "jenny", "aria", "female", "premium"];

    return (
      preferredNames
        .map((name) =>
          pool.find((voice) => voice.name.toLowerCase().includes(name))
        )
        .find(Boolean) ||
      pool.find((voice) => voice.localService) ||
      pool[0] ||
      null
    );
  }

  function setVoiceLabel(voice) {
    const label = document.querySelector(`#${PANEL_ID} [data-role='voice']`);
    if (!label) {
      return;
    }

    label.textContent = voice
      ? `声音：${voice.name} · ${voice.lang}`
      : "声音：使用浏览器默认声音";
  }

  function togglePause() {
    if (!speechSynthesis.speaking) {
      return;
    }

    if (isPaused) {
      speechSynthesis.resume();
      setStatus("继续朗读");
    } else {
      speechSynthesis.pause();
      setStatus("已暂停");
    }
    isPaused = !isPaused;
  }

  function stopSpeaking() {
    speechQueue = [];
    isPaused = false;
    speechSynthesis.cancel();
    setStatus("已停止");
  }

  function splitForSpeech(text) {
    const parts = text
      .replace(/\s+/g, " ")
      .match(/[^。！？.!?]+[。！？.!?]?/g) || [text];

    const chunks = [];
    let current = "";
    for (const part of parts) {
      if ((current + part).length > 220) {
        if (current) {
          chunks.push(current.trim());
        }
        current = part;
      } else {
        current += part;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }
    return chunks;
  }

  function detectLanguage(text) {
    return /[\u4e00-\u9fff]/.test(text) ? "zh-CN" : "en-US";
  }

  function setStatus(message) {
    const status = document.querySelector(`#${PANEL_ID} [data-role='status']`);
    if (status) {
      status.textContent = message;
    }
  }

  function hideToolbar() {
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) {
      toolbar.hidden = true;
    }
  }

  function hidePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.hidden = true;
    }
  }

  function handleOutsideClick(event) {
    if (
      event.target.closest?.(`#${TOOLBAR_ID}`) ||
      event.target.closest?.(`#${PANEL_ID}`)
    ) {
      return;
    }
    hideToolbar();
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }
})();
