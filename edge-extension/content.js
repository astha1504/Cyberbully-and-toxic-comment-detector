(() => {
  if (window.__pehraExtensionLoaded) return;
  window.__pehraExtensionLoaded = true;

  const MAX_CHECKS_PER_PAGE = Infinity;
  const MIN_TEXT_LENGTH = 8;
  const MAX_TEXT_LENGTH = 500;
  const checkedText = new Set();
  let checksStarted = 0;
  let scanTimer;

  const ignoredTexts = new Set([
    "reply",
    "view replies",
    "see translation",
    "more",
    "less",
    "like",
    "liked",
    "follow",
    "following",
    "share",
    "report"
  ]);

  function injectStyles() {
    if (document.getElementById("pehra-styles")) return;

    const style = document.createElement("style");
    style.id = "pehra-styles";
    style.textContent = `
      .pehra-toxic-blur {
        filter: blur(5px) !important;
        transition: filter 160ms ease;
      }

      .pehra-toxic-blur:hover {
        filter: blur(0) !important;
      }

      .pehra-warning {
        display: inline-block !important;
        margin: 5px 0 !important;
        padding: 4px 8px !important;
        border: 1px solid #e5bd64 !important;
        border-radius: 7px !important;
        background: #183e3a !important;
        color: #fff !important;
        font: 600 11px/1.4 Arial, sans-serif !important;
        cursor: pointer !important;
      }

      .pehra-warning:focus-visible {
        outline: 2px solid #fff !important;
        outline-offset: 2px !important;
      }
    `;

    document.documentElement.appendChild(style);
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function getCommentText(listItem) {
    const spans = [...listItem.querySelectorAll("span")];

    const candidates = spans
      .filter(span => {
        if (!isVisible(span)) return false;

        // Avoid selecting a wrapper that duplicates nested text.
        if ([...span.children].some(child =>
          child.tagName === "SPAN"
        )) {
          return false;
        }

        const text = (span.innerText || span.textContent || "")
          .replace(/\s+/g, " ")
          .trim();

        if (
          text.length < MIN_TEXT_LENGTH ||
          text.length > MAX_TEXT_LENGTH
        ) {
          return false;
        }

        if (ignoredTexts.has(text.toLowerCase())) return false;
        if (/^@[\w.]+$/.test(text)) return false;
        if (/^\d+\s*(s|m|h|d|w)$/i.test(text)) return false;

        return true;
      })
      .map(span => ({
        element: span,
        text: (span.innerText || span.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
      }))
      .sort((a, b) => b.text.length - a.text.length);

    return candidates[0] || null;
  }

  function addWarning(listItem, textElement, result) {
    if (listItem.querySelector(".pehra-warning")) return;

    const warning = document.createElement("button");
    warning.type = "button";
    warning.className = "pehra-warning";

    // Apply blur immediately (earlier feature)
    textElement.classList.add("pehra-toxic-blur");

    // Initial warning text reflects blurred state
    warning.textContent = "Comment hidden · Select to reveal";

    warning.title = result.verified
      ? "Select to toggle the text blur"
      : "Unverified result. Select to toggle the text blur";

    warning.setAttribute("aria-label", warning.title);

    warning.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      textElement.classList.toggle("pehra-toxic-blur");

      warning.textContent = textElement.classList.contains(
        "pehra-toxic-blur"
      )
        ? "Comment hidden · Select to reveal"
        : `Potentially harmful · ${(result.score * 100).toFixed(0)}%`;
    });

    listItem.appendChild(warning);
  }

  async function analyzeListItem(listItem) {
    if (
      !listItem.isConnected ||
      listItem.dataset.pehraStatus === "checking" ||
      listItem.dataset.pehraStatus === "checked"
    ) {
      return;
    }

    const candidate = getCommentText(listItem);
    if (!candidate) return;

    const { element, text } = candidate;

    if (checkedText.has(text)) {
      listItem.dataset.pehraStatus = "checked";
      return;
    }

    if (checksStarted >= MAX_CHECKS_PER_PAGE) return;

    checkedText.add(text);
    checksStarted++;
    listItem.dataset.pehraStatus = "checking";

    try {
      const response = await chrome.runtime.sendMessage({
        type: "CHECK_TEXT",
        text
      });

      if (!response?.ok) {
        // Permit retry after transient failures.
        listItem.dataset.pehraStatus = "error";
        return;
      }

      listItem.dataset.pehraStatus = "checked";

      const result = response.result;

      if (result.isToxic && listItem.isConnected) {
        addWarning(listItem, element, result);
      }
    } catch (error) {
      listItem.dataset.pehraStatus = "error";
      console.warn("[Pehra] Moderation request failed.");
    }
  }

  function scanPage() {
    injectStyles();

    // Instagram's markup changes periodically. These selectors
    // are a starting point and may need adjustment.
    const items = document.querySelectorAll("article ul li");

    for (const item of items) {
      if (checksStarted >= MAX_CHECKS_PER_PAGE) break;
      void analyzeListItem(item);
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanPage, 700);
  }

  injectStyles();
  scanPage();

  const observer = new MutationObserver(scheduleScan);

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Avoid scanning indefinitely in a background tab.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleScan();
  });

  console.info("[Pehra] Instagram moderation initialized.");
})();
