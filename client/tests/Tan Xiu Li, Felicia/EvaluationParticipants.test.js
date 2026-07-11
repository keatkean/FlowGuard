import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildEvaluationDraftFromRecognition, computeConfusionMatrix, matrixLabelsForRecords, sortEvaluationLabels } from '../../src/constants/evaluation';

describe('database-backed dynamic evaluation labels', () => {
  test('sorts P-labels numerically with no five-participant ceiling', () => expect(sortEvaluationLabels(['P105','P10','P02','P01','P11'])).toEqual(['P01','P02','P10','P11','P105']));
  test('matrix includes active and historical labels plus Unknown, while No Face stays outside', () => {
    const records = [{ actualLabel: 'P12', predictedLabel: 'P10' }, { actualLabel: null, predictedLabel: null, detectionOutcome: 'NO_FACE' }];
    expect(matrixLabelsForRecords(records, ['P01','P10'])).toEqual(['P01','P10','P12','Unknown']);
    const stats = computeConfusionMatrix(records, ['P01','P10']);
    expect(stats.labels).toEqual(['P01','P10','P12','Unknown']); expect(stats.sampleCount).toBe(1); expect(stats.noFaceCount).toBe(1);
  });
  test('matched prediction comes only from predictedEvaluationLabel and never actual ground truth', () => {
    const draft = buildEvaluationDraftFromRecognition({ result: { matchedUserId: 9, predictedEvaluationLabel: 'P10', confidence: .8, outcome: 'MATCHED' } });
    expect(draft).toMatchObject({ predictedLabel: 'P10', matchedUserId: 9, needsMapping: false }); expect(draft.actualLabel).toBe('Unknown');
  });
  test('explicit Unknown and No Face remain distinct', () => {
    expect(buildEvaluationDraftFromRecognition({ result: { outcome: 'UNKNOWN', predictedEvaluationLabel: 'Unknown' } }).predictedLabel).toBe('Unknown');
    expect(buildEvaluationDraftFromRecognition({ result: { outcome: 'NO_FACE', predictedEvaluationLabel: null } }).predictedLabel).toBeNull();
  });
  test('Home import casing matches the real filename', () => { const source = fs.readFileSync(path.resolve(__dirname, '../../src/App.jsx'), 'utf8'); expect(source).toContain("import Home from './pages/Home'"); expect(fs.existsSync(path.resolve(__dirname, '../../src/pages/Home.jsx'))).toBe(true); });
});