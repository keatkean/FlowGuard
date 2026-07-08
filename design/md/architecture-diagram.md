# FlowGuard — System Architecture Diagram (merged system)

```mermaid
---
id: 3914ca35-4d6f-465e-851d-4a9f1f605395
---
flowchart TB
  subgraph Users
    FM[FM]
    TEN[Tenant]
    STF[Staff]
    DRV[Driver / Public]
  end

  subgraph Frontend[React / Vite Frontend]
    PUB[Public Site<br/>Login / Register]
    DASH[Role Dashboard<br/>V-Patrol / Cameras / Support]
    QRP[Driver Pass QR<br/>public page]
    CHAT[AI Chat Popup]
  end

  subgraph Backend[Node.js / Express API]
    AUTH[Auth + RBAC<br/>middleware]
    UROUTE[user / face]
    BROUTE[booking / gate]
    SROUTE[security]
    AROUTE[attendance]
    IROUTE[incident]
    CZROUTE[cameras / zones]
    DROUTE[detection-alerts]
    SUPROUTE[support / helpdesk]
  end

  DB[(PostgreSQL<br/>Sequelize ORM)]

  subgraph AISvc[Python FastAPI AI Service]
    FACE[InsightFace<br/>face encode / match]
    YOLO[YOLO<br/>object detection]
  end

  WA[WhatsApp Cloud API]

  FM --> DASH
  TEN --> DASH
  STF --> DASH
  DRV --> QRP
  FM --> PUB
  TEN --> PUB
  STF --> PUB
  DASH --> CHAT

  PUB --> AUTH
  DASH --> AUTH
  CHAT --> AUTH
  QRP --> BROUTE

  AUTH --> UROUTE
  AUTH --> BROUTE
  AUTH --> SROUTE
  AUTH --> AROUTE
  AUTH --> IROUTE
  AUTH --> CZROUTE
  AUTH --> DROUTE
  AUTH --> SUPROUTE

  UROUTE --> DB
  BROUTE --> DB
  SROUTE --> DB
  AROUTE --> DB
  IROUTE --> DB
  CZROUTE --> DB
  DROUTE --> DB
  SUPROUTE --> DB

  UROUTE --> FACE
  YOLO --> DROUTE
  DROUTE -.seeds.-> IROUTE
  BROUTE --> WA
  FACE --> DB
```

## Planned deployment

```mermaid
---
id: 456dbd86-0071-43cc-8493-141114035884
---
flowchart LR
  UZ[Users] --> VC[Vercel<br/>React frontend]
  VC --> RN[Render<br/>Node / Express API]
  RN --> NE[(Neon / Supabase<br/>PostgreSQL)]
  RN --> AID[AI service<br/>local / demo or future cloud]
  RN --> WAC[WhatsApp Cloud API]
```

## Notes

- **Frontend (React/Vite):** public site, login/register, a role-aware dashboard (V-Patrol, Cameras,
  Object Detection, Support Dashboard, Logistics), a public Driver Pass QR page, and the AI Chat Popup.
- **Backend (Node/Express):** every request passes through JWT auth + RBAC before reaching the route
  groups — `user`/face, `booking`/gate, `security`, `attendance`, `incident`, `cameras`/`zones`,
  `detection-alerts`, and `support`/helpdesk.
- **AI service (Python FastAPI):** InsightFace encodes/matches faces; YOLO detects objects and POSTs
  alerts to the backend `detection-alerts` route (which can seed incident logs). Face embeddings are
  stored as a PostgreSQL `FLOAT[]` array (`faceVector`); **pgvector is not required**.
- **Helpdesk flow:** the AI Chat Popup talks to `support` routes — chatbot sessions are saved as
  **ChatTranscript**, an unresolved chat can auto-create a **SupportTicket**, and answers are matched
  against the **KnowledgeBase** FAQ table.
- **Object-detection flow:** **Camera** + **MonitoringZone** CRUD configure the zones; YOLO produces
  **DetectionAlert** records that can seed **IncidentLog** entries.
- **WhatsApp Cloud API:** driver notifications for logistics; simulated locally, real mode when valid
  env credentials are enabled. No secrets are committed.
- **Deployment intent:** Vercel (frontend), Render (backend), Neon/Supabase (PostgreSQL). The AI
  service (InsightFace/YOLO) is heavy, so it runs locally for the demo, with cloud hosting as a stretch
  goal. After deploying, `FRONTEND_URL` must be updated so WhatsApp driver-pass links point to the live site.
- **After editing these diagrams, regenerate** `design/png/architecture-diagram.png` (and optionally
  `design/png/planned-deployment.png`) from this Mermaid source.
