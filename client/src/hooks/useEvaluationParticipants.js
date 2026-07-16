import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../constants/api';
import { sortEvaluationLabels, UNKNOWN_LABEL } from '../constants/evaluation';
export default function useEvaluationParticipants() {
  const [participants, setParticipants] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const reload = useCallback(async () => { setLoading(true); setError(''); try { const token = localStorage.getItem('accessToken'); const response = await axios.get(`${API_BASE_URL}/api/facial-recognition/evaluation-participants`, { headers: { Authorization: `Bearer ${token}` } }); setParticipants(Array.isArray(response.data?.participants) ? response.data.participants : []); } catch { setParticipants([]); setError('Could not load evaluation participants.'); } finally { setLoading(false); } }, []);
  useEffect(() => { reload(); }, [reload]);
  const labels = useMemo(() => [...sortEvaluationLabels(participants.map((p) => p.evaluationLabel)), UNKNOWN_LABEL], [participants]);
  const namesByLabel = useMemo(() => Object.fromEntries(participants.map((p) => [p.evaluationLabel, p.name])), [participants]);
  return { participants, labels, namesByLabel, loading, error, reload };
}