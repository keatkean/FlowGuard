// Presentation helper for recognition results returned by the Node backend
// (POST /api/facial-recognition/recognize). Works only with safe fields —
// id, name, role, status, confidence — never biometric template data.

export const RECOGNITION_STATUS = {
  AUTHORIZED: 'AUTHORIZED',
  SUSPENDED: 'SUSPENDED',
  DENIED: 'DENIED',
};

// Returns UI strings for a recognition subject: who they are (name, role,
// confidence) and the access outcome (granted / suspended / unknown).
export const describeRecognitionSubject = (user) => {
  if (!user || user.id == null) {
    return {
      identityLabel: 'Unknown Person',
      accessLabel: 'ACCESS DENIED — SUSPICIOUS PERSON',
      granted: false,
    };
  }

  const confidencePct = Math.round((user.confidence || 0) * 100);
  const identityLabel = `${user.name} • ${user.role} • ${confidencePct}% match`;

  if (user.status === RECOGNITION_STATUS.SUSPENDED) {
    return {
      identityLabel,
      accessLabel: 'ACCESS DENIED — ACCOUNT SUSPENDED',
      granted: false,
    };
  }

  return {
    identityLabel,
    accessLabel: 'ACCESS GRANTED',
    granted: user.status === RECOGNITION_STATUS.AUTHORIZED,
  };
};
