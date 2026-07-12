# FlowGuard - Facial Recognition & Access Management Flow

## Recognition flow

```mermaid
flowchart TB
  A[Camera source selected] --> B[Browser or Pi provides current frame]
  B --> C[POST /api/facial-recognition/track]
  C --> D[Face presence, face box, face count, head-turn ratio]
  D --> E{One face present}
  E -->|No| X[Fail closed: unknown, multiple-face or timeout]
  E -->|Yes| F[POST /api/facial-recognition/recognize]
  F --> G{Authoritative candidate found}
  G -->|Unknown or suspended| X
  G -->|Active enrolled user| H[Collect baseline tracking ratios]
  H --> I[User turns head and holds]
  I --> J[Require movement delta for consecutive samples]
  J --> K[Final /recognize]
  K --> L{Final user ID equals original candidate ID}
  L -->|No| X
  L -->|Yes| M{Scanner mode}
  M -->|Gate Scanner| N[POST /api/attendance/scan]
  N --> O[Attendance IN/OUT and turnstile outcome]
  M -->|V-Patrol| P[POST /api/facial-recognition/access-event]
  P --> Q[SecurityLog access event; Attendance unchanged]
  X --> R[No false Attendance]
```

Motion liveness uses head-turn verification. This is not documented as a complete anti-spoofing model.

## Enrolment flow

```mermaid
flowchart TB
  A[User or FM opens Face Enrollment] --> B[Capture/upload three face orientations]
  B --> C[POST /user/enroll-face]
  C --> D[FastAPI /api/encode-faces]
  D --> E[InsightFace 512-dimensional vector]
  E --> F[Save users.faceVector and users.isEnrolled = true]
  F --> G[Assign stable EvaluationParticipant label]
  G --> H[Refresh AI known-face cache]
```

## Off-boarding flow

```mermaid
flowchart TB
  A[FM deletes user] --> B[Transactional PDPA workflow]
  B --> C[Wipe faceVector and set isEnrolled false]
  C --> D[Delete Attendance]
  D --> E[Anonymise SecurityLogs and clear matched user references]
  E --> F[Unlink Booking user references]
  F --> G[Retire EvaluationParticipant]
  G --> H[Delete User]
  H --> I[Refresh AI cache]
```

## Notes

- Tracking (`/api/facial-recognition/track`) is detector-only and has no identity, DB, Attendance or SecurityLog side effects.
- Recognition (`/api/facial-recognition/recognize`) identifies a candidate using the authoritative user ID/status from PostgreSQL.
- Gate Scanner performs tracking, initial recognition, baseline head-turn verification, final same-ID recognition and then `/api/attendance/scan`.
- V-Patrol performs the same scanner policy but writes `/api/facial-recognition/access-event`; Attendance is unchanged.
- Unknown, suspended, multiple-face and timeout cases fail closed. Unknown/suspended recognition creates SecurityLog access/intrusion events according to the current routes, not IncidentLog records.
