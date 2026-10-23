import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', () => ({
  analyzeCyberSafety: vi.fn(),
  checkAudioToxicity: vi.fn(),
  checkImageToxicity: vi.fn(),
}));

import CyberSafetyScanner from '../components/CyberSafetyScanner';
import { analyzeCyberSafety, checkAudioToxicity, checkImageToxicity } from '../services/api';

const SCAN_RESULT = {
  risk_level: 'high_concern',
  risk_label: 'High concern signals found',
  category: 'Possible malicious app or fake update',
  signal_count: 1,
  signals: [{
    code: 'e_challan_theme',
    title: 'Government e-Challan theme',
    explanation: 'Verify through the official portal.',
    matched_terms: ['e-Challan'],
  }],
  guidance: ['Open the official portal directly.'],
  official_links: [{ label: 'Open official portal', url: 'https://example.gov.in' }],
  assessment_note: 'Pattern signals are warnings, not proof.',
};

describe('CyberSafetyScanner', () => {
  beforeEach(() => {
    analyzeCyberSafety.mockReset().mockResolvedValue({ data: SCAN_RESULT });
    checkAudioToxicity.mockReset().mockResolvedValue({ data: { transcription: 'Your e-Challan is overdue.' } });
    checkImageToxicity.mockReset().mockResolvedValue({ data: { detectedText: 'Your e-Challan is overdue.' } });
  });

  it('scans pasted text, shows matched signals, guidance, and official links', async () => {
    render(<CyberSafetyScanner />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Your e-Challan is overdue. Install this APK.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check for scam signals' }));

    expect(await screen.findByText('High concern signals found')).toBeTruthy();
    expect(screen.getByText('e-Challan')).toBeTruthy();
    expect(screen.getByText('Open the official portal directly.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open official portal/ }).getAttribute('href')).toBe('https://example.gov.in');
    expect(analyzeCyberSafety).toHaveBeenCalledWith('Your e-Challan is overdue. Install this APK.', false, false);
  });

  it('extracts screenshot text with OCR before scam analysis', async () => {
    render(<CyberSafetyScanner />);
    fireEvent.click(screen.getByRole('tab', { name: 'Screenshot' }));
    const file = new File(['fake screenshot bytes'], 'message.png', { type: 'image/png' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Check for scam signals' }));

    expect(await screen.findByText('High concern signals found')).toBeTruthy();
    expect(checkImageToxicity).toHaveBeenCalledOnce();
    expect(analyzeCyberSafety).toHaveBeenCalledWith('Your e-Challan is overdue.', false, false);
  });

  it('requires voice consent before uploading, then analyzes the transcript', async () => {
    render(<CyberSafetyScanner />);
    fireEvent.click(screen.getByRole('tab', { name: 'Voice note' }));
    const file = new File(['voice bytes'], 'message.wav', { type: 'audio/wav' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Check for scam signals' }));

    expect(screen.getByRole('alert').textContent).toContain('Confirm voice processing');
    expect(checkAudioToxicity).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: /I agree to send this recording/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check for scam signals' }));

    expect(await screen.findByText('High concern signals found')).toBeTruthy();
    await waitFor(() => expect(checkAudioToxicity).toHaveBeenCalledWith(file));
    expect(analyzeCyberSafety).toHaveBeenCalledWith('Your e-Challan is overdue.', false, false);
  });
});
