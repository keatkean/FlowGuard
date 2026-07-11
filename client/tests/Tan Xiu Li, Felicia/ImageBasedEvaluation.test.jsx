import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import axios from 'axios';
import ImageBasedEvaluation from '../../src/components/ImageBasedEvaluation';
import {
  ACCESS_DECISIONS,
  ACTUAL_AUTHORIZATION,
  EVAL_LABEL_MAP_KEY,
  computeAccessDecisionMatrix,
  createAccessEvaluationRecord,
  loadAccessEvaluationRecords,
  loadRecords,
} from '../../src/constants/evaluation';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const apiResult = (overrides = {}) => ({
  matchedUserId: 2,
  subject: { id: 2, name: 'Participant', role: 'Staff', isActive: true, isEnrolled: true },
  outcome: 'MATCHED', predictedEvaluationLabel: 'P02', confidence: 0.91, policyDecision: 'GRANTED',
  timings: { totalRequestMs: 123 }, ...overrides,
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(EVAL_LABEL_MAP_KEY, JSON.stringify({ 2: 'P02' }));
  vi.clearAllMocks();
  axios.get.mockResolvedValue({ data: { participants: [{ userId: 2, evaluationLabel: 'P02', name: 'Participant', role: 'Staff', isActive: true, isEnrolled: true }] } });
  URL.createObjectURL = vi.fn(() => 'blob:test-preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); localStorage.clear(); });

const upload = async (card, label) => {
  const file = new File(['photo'], 'photo.png', { type: 'image/png' });
  fireEvent.change(within(card).getByLabelText(label), { target: { files: [file] } });
  await waitFor(() => expect(within(card).getByRole('button', { name: 'Run Evaluation' }).disabled).toBe(false));
};

describe('Image-Based Recognition & Access Evaluation', () => {
  test('actual identity starts empty and is required for the authorised test', () => {
    render(<ImageBasedEvaluation />);
    const select = screen.getByLabelText('Authorised actual participant');
    expect(select.value).toBe('');
    expect(screen.getAllByRole('button', { name: 'Run Evaluation' })[0].disabled).toBe(true);
  });

  test('authorised upload uses the real evaluate response and records a true grant without persisting image data', async () => {
    axios.post.mockResolvedValue({ data: apiResult() });
    render(<ImageBasedEvaluation />);
    const card = screen.getByRole('heading', { name: 'Authorised Person Test' }).closest('article');
    await screen.findByRole('option', { name: /P02/ });
    fireEvent.change(within(card).getByLabelText('Authorised actual participant'), { target: { value: 'P02' } });
    await upload(card, 'Authorised image upload');
    fireEvent.click(within(card).getByRole('button', { name: 'Run Evaluation' }));
    await within(card).findByText('Identity Correct');
    expect(within(card).getByText('Access Decision Correct')).toBeTruthy();
    expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/api/facial-recognition/evaluate'), expect.objectContaining({ image: expect.stringMatching(/^data:image/) }), expect.any(Object));
    expect(loadAccessEvaluationRecords()[0].predictedDecision).toBe(ACCESS_DECISIONS.GRANTED);
    expect(JSON.stringify(localStorage)).not.toMatch(/data:image|blob:test-preview|faceVector|embedding/);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-preview');
  });

  test('suspended P02 remains identity-correct and access-correctly-denied', async () => {
    axios.post.mockResolvedValue({ data: apiResult({ subject: { id: 2, name: 'Participant', role: 'Staff', isActive: false, isEnrolled: true }, policyDecision: 'DENIED' }) });
    render(<ImageBasedEvaluation />);
    const card = screen.getByRole('heading', { name: 'Unauthorised Person Test' }).closest('article');
    await screen.findByRole('option', { name: /P02/ });
    fireEvent.change(within(card).getByLabelText('Unauthorised reason'), { target: { value: 'Suspended Enrolled Participant' } });
    fireEvent.change(within(card).getByLabelText('Unauthorised actual participant'), { target: { value: 'P02' } });
    await upload(card, 'Unauthorised image upload');
    fireEvent.click(within(card).getByRole('button', { name: 'Run Evaluation' }));
    expect(await within(card).findByText('Identity Correct')).toBeTruthy();
    expect(within(card).getByText('Access Correctly Denied')).toBeTruthy();
    expect(loadRecords()[0]).toMatchObject({ actualLabel: 'P02', predictedLabel: 'P02', origin: 'Image-Based Evaluation' });
  });

  test('unmount revokes each independent preview URL', async () => {
    const view = render(<ImageBasedEvaluation />);
    const cards = screen.getAllByRole('article');
    const file = new File(['photo'], 'photo.png', { type: 'image/png' });
    fireEvent.change(within(cards[0]).getByLabelText('Authorised image upload'), { target: { files: [file] } });
    fireEvent.change(within(cards[1]).getByLabelText('Unauthorised image upload'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  test('access matrix independently classifies all four decision outcomes', () => {
    const records = [
      [ACTUAL_AUTHORIZATION.AUTHORIZED, ACCESS_DECISIONS.GRANTED],
      [ACTUAL_AUTHORIZATION.AUTHORIZED, ACCESS_DECISIONS.DENIED],
      [ACTUAL_AUTHORIZATION.UNAUTHORIZED, ACCESS_DECISIONS.GRANTED],
      [ACTUAL_AUTHORIZATION.UNAUTHORIZED, ACCESS_DECISIONS.DENIED],
    ].map(([actualAuthorization, predictedDecision]) => createAccessEvaluationRecord({ actualAuthorization, predictedDecision, actualLabel: 'Unknown', predictedLabel: 'Unknown' }));
    expect(computeAccessDecisionMatrix(records)).toMatchObject({ trueGrants: 1, falseDenials: 1, falseGrants: 1, trueDenials: 1, sampleCount: 4, accuracy: 0.5 });
  });
});