import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', () => ({
  checkToxicity: vi.fn(),
  checkImageToxicity: vi.fn(),
  rewriteText: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const passthrough = ({ children, ...props }) => React.createElement('div', props, children);
  return {
    motion: { div: passthrough },
    AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});

import AIInterventionModal from '../components/AIInterventionModal';
import { checkImageToxicity, checkToxicity, rewriteText } from '../services/api';

const SAFE_RESULT = {
  isToxic: false,
  score: 0.1,
  highlightedWords: [],
  severity: 'Low',
  verified: true,
  categoryScores: { insult: 0, harassment: 0, threat: 0 },
};

const TOXIC_RESULT = {
  isToxic: true,
  score: 0.95,
  highlightedWords: ['stupid'],
  severity: 'High',
  verified: true,
  categoryScores: { insult: 100, harassment: 0, threat: 0 },
};

async function finishDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('AIInterventionModal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    checkToxicity.mockResolvedValue({ data: SAFE_RESULT });
    checkImageToxicity.mockResolvedValue({ data: { detectedText: '', isToxic: false, score: 0, verified: true } });
    rewriteText.mockResolvedValue({ data: { suggestion: 'Please share your concern respectfully.' } });
  });

  it('blocks blank submits, checks typed text, and sends clean content directly', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<AIInterventionModal isOpen onConfirm={onConfirm} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Share Post' }).disabled).toBe(true);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A useful update' } });
    await finishDebounce();
    expect(checkToxicity).toHaveBeenCalledWith('A useful update');
    fireEvent.click(screen.getByRole('button', { name: 'Share Post' }));
    expect(onConfirm).toHaveBeenCalledWith('A useful update', { warningAccepted: false });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows severity, category signals, and matched wording with edit and post options', async () => {
    checkToxicity.mockResolvedValue({ data: TOXIC_RESULT });
    const onConfirm = vi.fn();
    const onEdit = vi.fn();
    render(<AIInterventionModal isOpen text="You are stupid" onConfirm={onConfirm} onEdit={onEdit} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'You are stupid' } });
    await finishDebounce();

    expect(screen.getByText('This content may hurt others')).toBeTruthy();
    expect(screen.getByText('Overall toxicity score: 95%')).toBeTruthy();
    expect(screen.getByText('100%', { selector: 'strong' })).toBeTruthy();
    expect(screen.getAllByText('stupid').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Post' }));
    expect(onEdit).toHaveBeenCalledWith('You are stupid');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('lets a user accept a rewrite and rechecks the replacement wording', async () => {
    checkToxicity.mockResolvedValue({ data: TOXIC_RESULT });
    render(<AIInterventionModal isOpen text="You are stupid" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'You are stupid' } });
    await finishDebounce();
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a kinder rewrite' }));
    await flushPromises();
    expect(screen.getByText('Please share your concern respectfully.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    await flushPromises();
    expect(screen.getByRole('textbox').value).toBe('Please share your concern respectfully.');
    expect(checkToxicity).toHaveBeenLastCalledWith('Please share your concern respectfully.');
  });

  it('includes image OCR results in the warning decision', async () => {
    checkImageToxicity.mockResolvedValue({ data: {
      detectedText: 'you are stupid',
      isToxic: true,
      score: 0.95,
      highlightedWords: ['stupid'],
      categoryScores: { insult: 100, harassment: 0, threat: 0 },
      verified: true,
    } });
    const onConfirm = vi.fn();
    render(<AIInterventionModal isOpen images={['data:image/png;base64,YQ==']} onConfirm={onConfirm} />);
    await flushPromises();
    expect(screen.getByText('Text detected in image 1')).toBeTruthy();
    expect(screen.getByText('This content may hurt others')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Post Anyway' }));
    expect(onConfirm).toHaveBeenCalledWith('', { warningAccepted: true });
  });

  it('shows service failures, still lets the user edit, and closes on cancel', async () => {
    checkToxicity.mockRejectedValue({ response: { status: 503, data: { detail: 'Moderation is offline.' } } });
    const onClose = vi.fn();
    const onEdit = vi.fn();
    render(<AIInterventionModal isOpen onClose={onClose} onEdit={onEdit} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A message to review' } });
    await finishDebounce();
    expect(screen.getByRole('status').textContent).toContain('Moderation is offline.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onEdit).not.toHaveBeenCalled();
  });
});
