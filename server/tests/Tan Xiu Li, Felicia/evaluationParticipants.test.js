const mockParticipant = { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() };
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const mockSequelize = { transaction: jest.fn((callback) => callback(transaction)) };
jest.mock('../../models', () => ({ sequelize: mockSequelize, User: { findAll: jest.fn() }, EvaluationParticipant: mockParticipant }));
const { formatEvaluationLabel, evaluationLabelSequence, assignStableEvaluationLabel, retireEvaluationParticipant } = require('../../services/evaluationParticipants');

describe('stable evaluation participant labels', () => {
  beforeEach(() => jest.clearAllMocks());
  test.each([[1,'P01'],[2,'P02'],[9,'P09'],[10,'P10'],[105,'P105']])('formats %s as %s', (number, label) => expect(formatEvaluationLabel(number)).toBe(label));
  test('sort sequence is numeric, not lexical', () => expect(['P10','P02','P105'].sort((a,b) => evaluationLabelSequence(a)-evaluationLabelSequence(b))).toEqual(['P02','P10','P105']));
  test('existing user mapping remains unchanged', async () => { const row = { userId: 7, evaluationLabel: 'P03' }; mockParticipant.findOne.mockResolvedValue(row); expect(await assignStableEvaluationLabel({ id: 7, isEnrolled: true, faceVector: [1] })).toBe(row); expect(mockParticipant.create).not.toHaveBeenCalled(); });
  test('next label uses maximum ever assigned and does not fill gaps or depend on user order/name', async () => { mockParticipant.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null); mockParticipant.findAll.mockResolvedValue([{ evaluationLabel: 'P01' }, { evaluationLabel: 'P02' }, { evaluationLabel: 'P04' }]); mockParticipant.create.mockImplementation((value) => Promise.resolve(value)); const row = await assignStableEvaluationLabel({ id: 99, name: 'AAA', isEnrolled: true, faceVector: [1] }); expect(row.evaluationLabel).toBe('P05'); });
  test('ineligible users are never assigned', async () => { expect(await assignStableEvaluationLabel({ id: 1, isEnrolled: false, faceVector: [1] })).toBeNull(); expect(await assignStableEvaluationLabel({ id: 2, isEnrolled: true, faceVector: null })).toBeNull(); });
});

describe('evaluation participant retirement (PDPA off-boarding)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('mapped participant is retired in place: active=false, retiredAt stamped, label and row preserved', async () => {
    const update = jest.fn().mockResolvedValue(true);
    const row = { userId: 7, evaluationLabel: 'P02', active: true, retiredAt: null, update };
    mockParticipant.findOne.mockResolvedValue(row);
    const tx = { LOCK: { UPDATE: 'UPDATE' } };

    const result = await retireEvaluationParticipant(7, tx);

    expect(mockParticipant.findOne).toHaveBeenCalledWith({ where: { userId: 7 }, transaction: tx });
    expect(update).toHaveBeenCalledWith({ active: false, retiredAt: expect.any(Date) }, { transaction: tx });
    // Only lifecycle fields change — the evaluationLabel is never rewritten
    // and the row is never destroyed (no destroy call exists on the helper path).
    expect(Object.keys(update.mock.calls[0][0]).sort()).toEqual(['active', 'retiredAt']);
    expect(result).toBe(row);
    expect(result.evaluationLabel).toBe('P02');
  });

  test('users without a mapping (or null userId) are a safe no-op', async () => {
    mockParticipant.findOne.mockResolvedValue(null);
    expect(await retireEvaluationParticipant(123, {})).toBeNull();
    expect(await retireEvaluationParticipant(null, {})).toBeNull();
    expect(await retireEvaluationParticipant(undefined, {})).toBeNull();
    // null/undefined userId never queries the table at all.
    expect(mockParticipant.findOne).toHaveBeenCalledTimes(1);
  });

  test('retired labels are still reserved: P01-P03 existing/retired means the next user receives P04', async () => {
    mockParticipant.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    // P01 active, P02 and P03 retired (userId already nulled by off-boarding).
    mockParticipant.findAll.mockResolvedValue([
      { evaluationLabel: 'P01', active: true, userId: 4 },
      { evaluationLabel: 'P02', active: false, userId: null, retiredAt: new Date() },
      { evaluationLabel: 'P03', active: false, userId: null, retiredAt: new Date() },
    ]);
    mockParticipant.create.mockImplementation((value) => Promise.resolve(value));

    const row = await assignStableEvaluationLabel({ id: 42, isEnrolled: true, faceVector: [1] });
    expect(row.evaluationLabel).toBe('P04');
  });
});