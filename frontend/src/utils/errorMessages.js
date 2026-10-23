const statusMessages = {
  400: 'That request could not be completed. Check the information and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do that.',
  404: 'That item could not be found. Refresh and try again.',
  409: 'This item has changed. Refresh the page and try again.',
  413: 'That file or request is too large. Reduce it and try again.',
  422: 'Some information is invalid. Check the form and try again.',
  423: 'Your account is temporarily muted. Check your Behaviour Profile for details.',
  429: 'Too many requests. Wait a moment and try again.',
  500: 'The server ran into a problem. Please try again.',
  502: 'A connected service could not complete the request. Please try again shortly.',
  503: 'This service is temporarily unavailable. Please try again shortly.',
  504: 'The request took too long to complete. Please try again.',
};

const messageFromDetail = (detail) => {
  if (typeof detail === 'string') return detail.trim();
  if (!Array.isArray(detail)) return '';

  return [...new Set(detail
    .map((item) => (typeof item === 'string' ? item : item?.msg))
    .filter((message) => typeof message === 'string' && message.trim())
    .map((message) => message.trim()))]
    .join(' ');
};

export const getApiErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const response = error?.response;
  if (!response) {
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
      return 'The request timed out. Please try again.';
    }
    if (error?.code === 'ERR_CANCELED') return 'The request was cancelled.';
    if (error?.isAxiosError || error?.code === 'ERR_NETWORK') {
      return 'Could not reach the server. Check that the backend is running and try again.';
    }
    return fallback;
  }

  const status = response.status;
  const detail = messageFromDetail(
    response.data?.detail ?? response.data?.message ?? response.data?.error
  );

  if (status === 401 && detail === 'Could not validate credentials') {
    return 'Your session has expired. Please sign in again.';
  }

  // Avoid exposing generic framework errors while preserving intentional API messages.
  const containsRawRewriteError = /^(LLM request failed|Failed to parse LLM response):/i.test(detail);
  if (detail && detail.length <= 280 && detail !== 'Internal Server Error' && !containsRawRewriteError) {
    return detail;
  }
  return statusMessages[status] || fallback;
};
