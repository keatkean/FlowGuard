const mockParticipant = { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() };
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const mockSequelize = { transaction: jest.fn((callback) => callback(transaction)) };
jest.mock('../../models', () => ({ sequelize: mockSequelize, User: { findAll: jest.fn() }, EvaluationParticipant: mockParticipant }));
const { formatEvaluationLabel, evaluationLabelSequence, assignStableEvaluationLabel } = require('../../services/evaluationParticipants');

describe('stable evaluation participant labels', () => {
  beforeEach(() => jest.clearAllMocks());
  test.each([[1,'P01'],[2,'P02'],[9,'P09'],[10,'P10'],[105,'P105']])('formats %s as %s', (number, label) => expect(formatEvaluationLabel(number)).toBe(label));
  test('sort sequence is numeric, not lexical', () => expect(['P10','P02','P105'].sort((a,b) => evaluationLabelSequence(a)-evaluationLabelSequence(b))).toEqual(['P02','P10','P105']));
  test('existing user mapping remains unchanged', async () => { const row = { userId: 7, evaluationLabel: 'P03' }; mockParticipant.findOne.mockResolvedValue(row); expect(await assignStableEvaluationLabel({ id: 7, isEnrolled: true, faceVector: [1] })).toBe(row); expect(mockParticipant.create).not.toHaveBeenCalled(); });
  test('next label uses maximum ever assigned and does not fill gaps or depend on user order/name', async () => { mockParticipant.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null); mockParticipant.findAll.mockResolvedValue([{ evaluationLabel: 'P01' }, { evaluationLabel: 'P02' }, { evaluationLabel: 'P04' }]); mockParticipant.create.mockImplementation((value) => Promise.resolve(value)); const row = await assignStableEvaluationLabel({ id: 99, name: 'AAA', isEnrolled: true, faceVector: [1] }); expect(row.evaluationLabel).toBe('P05'); });
  test('ineligible users are never assigned', async () => { expect(await assignStableEvaluationLabel({ id: 1, isEnrolled: false, faceVector: [1] })).toBeNull(); expect(await assignStableEvaluationLabel({ id: 2, isEnrolled: true, faceVector: null })).toBeNull(); });
});