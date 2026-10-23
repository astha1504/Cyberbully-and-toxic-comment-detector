import { describe, expect, it } from 'vitest';
import { getApiErrorMessage } from '../utils/errorMessages';

describe('getApiErrorMessage', () => {
  it.each([
    [400, 'That request could not be completed. Check the information and try again.'],
    [401, 'Your session has expired. Please sign in again.'],
    [403, 'You do not have permission to do that.'],
    [404, 'That item could not be found. Refresh and try again.'],
    [413, 'That file or request is too large. Reduce it and try again.'],
    [423, 'Your account is temporarily muted. Check your Behaviour Profile for details.'],
    [502, 'A connected service could not complete the request. Please try again shortly.'],
    [504, 'The request took too long to complete. Please try again.'],
  ])('maps HTTP %i when the API has no detail', (status, expected) => {
    expect(getApiErrorMessage({ response: { status, data: {} } })).toBe(expected);
  });

  it('uses short API detail text when available', () => {
    expect(getApiErrorMessage({
      response: { status: 502, data: { detail: 'The rewrite model was not found.' } },
    })).toBe('The rewrite model was not found.');
  });

  it('joins unique validation messages and ignores malformed detail items', () => {
    expect(getApiErrorMessage({
      response: {
        status: 422,
        data: { detail: [{ msg: 'Invalid email' }, { msg: 'Invalid email' }, null, { msg: 'Missing name' }] },
      },
    })).toBe('Invalid email Missing name');
  });

  it('hides raw provider errors and framework internals', () => {
    expect(getApiErrorMessage({
      response: { status: 502, data: { detail: 'LLM request failed: token=secret' } },
    })).toBe('A connected service could not complete the request. Please try again shortly.');
    expect(getApiErrorMessage({
      response: { status: 500, data: { detail: 'Internal Server Error' } },
    })).toBe('The server ran into a problem. Please try again.');
  });

  it('handles timeout, cancellation, network, and generic client errors', () => {
    expect(getApiErrorMessage({ code: 'ETIMEDOUT' })).toBe('The request timed out. Please try again.');
    expect(getApiErrorMessage({ code: 'ERR_CANCELED' })).toBe('The request was cancelled.');
    expect(getApiErrorMessage({ isAxiosError: true })).toContain('Check that the backend is running');
    expect(getApiErrorMessage(new Error('unknown'), 'Fallback text')).toBe('Fallback text');
  });
});
