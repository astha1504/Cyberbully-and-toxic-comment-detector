const commentInput = document.getElementById("comment");
const checkBtn = document.getElementById("checkBtn");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const apiInput = document.getElementById("apiBaseUrl");
const tokenInput = document.getElementById("token");
const settingsEl = document.getElementById("settings");

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

function addText(parent, tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;

  if (className) {
    element.className = className;
  }

  parent.appendChild(element);
  return element;
}

function createStatusIcon(isToxic) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");

  const paths = isToxic
    ? ["M12 3 2.8 20h18.4L12 3Z", "M12 9v4", "M12 17h.01"]
    : ["M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z", "m9 12 2 2 4-4"];

  for (const pathData of paths) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
  }

  return svg;
}

function renderResult(data, parent = resultEl) {
  parent.replaceChildren();

  const card = document.createElement("div");
  card.className =
    "result-card " + (data.isToxic ? "toxic" : "safe");

  const heading = document.createElement("div");
  heading.className = "result-heading";
  const icon = document.createElement("span");
  icon.className = "result-icon";
  icon.appendChild(createStatusIcon(data.isToxic));
  heading.appendChild(icon);
  addText(
    heading,
    "div",
    data.isToxic ? "Potentially harmful language" : "No clear toxicity signal",
    "result-title"
  );
  card.appendChild(heading);

  addText(
    card,
    "div",
    `Severity: ${data.severity} · Score: ${(data.score * 100).toFixed(1)}%`,
    "result-meta"
  );

  addText(
    card,
    "div",
    data.verified
      ? "Verified moderation result"
      : "Unverified result. Fallback moderation was used.",
    "result-meta"
  );

  if (data.highlightedWords?.length) {
    addText(card, "div", "Matched wording:", "result-meta");

    const chips = document.createElement("div");
    chips.className = "chips";

    for (const word of data.highlightedWords) {
      addText(chips, "span", word, "chip");
    }

    card.appendChild(chips);
  }

  if (data.categoryScores) {
    const categories = Object.entries(data.categoryScores)
      .filter(([, score]) => typeof score === "number")
      .map(([name, score]) => `${name}: ${score}%`);

    if (categories.length) {
      addText(
        card,
        "div",
        categories.join(" · "),
        "result-meta"
      );
    }
  }

  parent.appendChild(card);
}

checkBtn.addEventListener("click", async () => {
  const text = commentInput.value.trim();

  if (!text) {
    statusEl.textContent = "Enter a comment first.";
    resultEl.replaceChildren();
    return;
  }

  checkBtn.disabled = true;
  statusEl.textContent = "Analyzing comment...";
  resultEl.replaceChildren();

  try {
    const response = await sendMessage({
      type: "CHECK_TEXT",
      text
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Analysis failed.");
    }

    renderResult(response.result);
    statusEl.textContent = "Analysis complete.";
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    checkBtn.disabled = false;
  }
});

saveBtn.addEventListener("click", async () => {
  saveBtn.disabled = true;

  try {
    const response = await sendMessage({
      type: "SAVE_CONFIG",
      apiBaseUrl: apiInput.value,
      token: tokenInput.value
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not save settings.");
    }

    tokenInput.value = "";
    statusEl.textContent = "Settings saved.";
    settingsEl.open = false;
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    saveBtn.disabled = false;
  }
});

async function loadSettings() {
  try {
    const response = await sendMessage({ type: "GET_CONFIG" });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not load settings.");
    }

    apiInput.value = response.config.apiBaseUrl;
    tokenInput.value = "";
  } catch (error) {
    statusEl.textContent = error.message;
  }
}

loadSettings();
