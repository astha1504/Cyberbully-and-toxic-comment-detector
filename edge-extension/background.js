const DEFAULT_CONFIG = {
  apiBaseUrl: "http://localhost:8000",
  token: ""
};

async function getConfig() {
  const saved = await chrome.storage.local.get(DEFAULT_CONFIG);

  return {
    apiBaseUrl: String(saved.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl)
      .trim()
      .replace(/\/+$/, ""),
    token: String(saved.token || "").trim()
  };
}

async function checkText(text) {
  const config = await getConfig();

  if (!config.token) {
    throw new Error(
      "No access token configured. Sign in to Pehra and save your access token in the extension."
    );
  }

  const url = `${config.apiBaseUrl}/api/moderation/check-text`;

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.token}`
      },
      body: JSON.stringify({ text }),
      // The first check may load the local PyTorch model. Allow time for that
      // one-time initialization instead of reporting a misleading connection error.
      signal: AbortSignal.timeout(90000)
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error(
        "The moderation check timed out while the model was loading. Wait for backend model loading to finish, then try again."
      );
    }

    const origin = new URL(config.apiBaseUrl).origin;
    const detail = error?.message ? ` Browser detail: ${error.message}` : "";
    throw new Error(
      `Could not connect to ${origin}.${detail} Check the backend URL, FastAPI status, and Edge site access for this address.`
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(`The API returned an invalid response (${response.status}).`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "Authentication failed or the token expired. Sign in again and update the token."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.detail || `Moderation API error: ${response.status}`
    );
  }

  if (
    typeof data.isToxic !== "boolean" ||
    typeof data.score !== "number"
  ) {
    throw new Error("The API response does not match the expected schema.");
  }

  return {
    isToxic: data.isToxic,
    score: data.score,
    highlightedWords: Array.isArray(data.highlightedWords)
      ? data.highlightedWords
      : [],
    severity: data.severity || "Unknown",
    verified: data.verified === true,
    categoryScores: data.categoryScores || {},
    categoryScoreSource: data.categoryScoreSource || "unknown"
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_CONFIG") {
    getConfig()
      .then(config => sendResponse({
        ok: true,
        config
      }))
      .catch(error => sendResponse({
        ok: false,
        error: error.message
      }));

    return true;
  }

  if (message?.type === "SAVE_CONFIG") {
    const apiBaseUrl = String(message.apiBaseUrl || "")
      .trim()
      .replace(/\/+$/, "");

    const token = String(message.token || "").trim();

    let parsedUrl;

    try {
      parsedUrl = new URL(apiBaseUrl);
    } catch {
      sendResponse({
        ok: false,
        error: "Enter a valid backend URL."
      });
      return;
    }

    if (
      !["http:", "https:"].includes(parsedUrl.protocol) ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      sendResponse({
        ok: false,
        error: "Use a valid HTTP(S) base URL without credentials, query parameters, or a fragment."
      });
      return;
    }

    chrome.storage.local.set({ apiBaseUrl, token })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({
        ok: false,
        error: error.message
      }));

    return true;
  }

  if (message?.type === "CHECK_TEXT") {
    const text = String(message.text || "").trim();

    if (!text || text.length > 5000) {
      sendResponse({
        ok: false,
        error: "Enter between 1 and 5000 characters."
      });
      return;
    }

    checkText(text)
      .then(result => sendResponse({
        ok: true,
        result
      }))
      .catch(error => sendResponse({
        ok: false,
        error: error.message
      }));

    return true;
  }
});
