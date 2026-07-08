# FlowGuard — Facial Recognition & Access Management Flow

## Enrolment + recognition + review

```mermaid
flowchart TB
  subgraph Enrol[Enrolment]
    A[User opens Face Enrollment] --> B{Camera or Upload}
    B -->|Camera| C[Capture front / left / right]
    B -->|Manual upload| D[Select image files]
    C --> E[POST /user/enroll-face]
    D --> E
    E --> F[AI: InsightFace encodes faces]
    F --> G{Face detected}
    G -->|No| H[400 error<br/>retry or upload]
    G -->|Yes| I[Save faceVector<br/>isEnrolled = true]
    I --> J[AI refresh known-face cache]
  end

  subgraph Recognise[Live recognition]
    K[Gate Scanner or V-Patrol<br/>sends frame] --> L[AI matches embedding]
    L --> M{Match above threshold}
    M -->|Yes| N[Access Granted<br/>attendance IN or OUT + security log]
    M -->|No| O[Unauthorized<br/>security log / incident]
  end

  subgraph Review[FM oversight]
    N --> P[V-Patrol timeline]
    O --> P
    P --> Q[FM Security Review<br/>Pending / Escalated / Resolved]
  end
```

## Re-enrolment + off-boarding

```mermaid
flowchart TB
  R1[Recognition unreliable] --> R2[FM or user re-enrol]
  R2 --> R3[POST /user/enroll-face<br/>overwrites faceVector]
  R3 --> R4[AI refresh cache]

  D1[Lease ends / off-board] --> D2[DELETE /user/:id]
  D2 --> D3[Wipe faceVector<br/>isEnrolled = false]
  D3 --> D4[Delete attendance trail]
  D4 --> D5[Anonymise security logs<br/>personnelName = null]
  D5 --> D6[Remove user record]
```

## Notes

- Enrolment sends captured/uploaded images to the Python AI service, which encodes them with
  InsightFace and returns a 512-d vector stored as `faceVector` (`FLOAT[]`).
- After a successful enrolment the backend calls the AI `/refresh` endpoint so a new face is
  recognised immediately without restarting the service (non-fatal if it fails).
- Recognised users generate an IN/OUT attendance record plus an access security log; unknown faces
  generate an intrusion security log (and can seed the incident dashboard).
- Off-boarding is PDPA-aware: biometric vector wiped, attendance removed, security logs anonymised.
- All camera pages degrade gracefully if the webcam is denied or the AI service is offline.
