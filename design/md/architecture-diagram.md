# FlowGuard — System Architecture Diagram

```mermaid
---
id: 67b5301b-fe20-49b2-8842-b69a85537cce
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
    DASH[Role Dashboard]
    QRP[Driver Pass QR<br/>public page]
  end

  subgraph Backend[Node.js / Express API]
    AUTH[Auth + RBAC<br/>middleware]
    UROUTE[User / Face routes]
    BROUTE[Booking / Gate routes]
    SROUTE[Security / Incident routes]
    AROUTE[Attendance routes]
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

  PUB --> AUTH
  DASH --> AUTH
  QRP --> BROUTE

  AUTH --> UROUTE
  AUTH --> BROUTE
  AUTH --> SROUTE
  AUTH --> AROUTE

  UROUTE --> DB
  BROUTE --> DB
  SROUTE --> DB
  AROUTE --> DB

  UROUTE --> FACE
  SROUTE --> YOLO
  BROUTE --> WA
  FACE --> DB
```

## Planned deployment

```mermaid
flowchart LR
  UZ[Users] --> VC[Vercel<br/>React frontend]
  VC --> RN[Render<br/>Node / Express API]
  RN --> NE[(Neon / Supabase<br/>PostgreSQL)]
  RN --> AID[AI service<br/>local / demo or future cloud]
  RN --> WAC[WhatsApp Cloud API]
```

## Notes

- **Frontend (React/Vite):** public marketing site, login/register, a role-aware dashboard, and a
  public Driver Pass QR page that needs no login.
- **Backend (Node/Express):** every request passes through JWT auth + role-based access control
  before reaching user/face, booking/gate, security/incident, or attendance routes.
- **Database (PostgreSQL + Sequelize):** one shared instance for users, bookings, attendance,
  security logs, detection alerts, incident logs, monitoring zones, and invites.
- **AI service (Python FastAPI):** InsightFace encodes/matches faces; YOLO detects objects. It
  reads/refreshes enrolled face vectors from the same database. Face embeddings are stored as a
  PostgreSQL `FLOAT[]` array (`faceVector`); pgvector is not required.
- **WhatsApp Cloud API:** external side-effect for driver notifications; can run in simulated mode locally or real mode when valid WhatsApp Cloud API environment variables are enabled.
- **Deployment intent:** Vercel (frontend), Render (backend), Neon/Supabase (PostgreSQL). The AI
  service (InsightFace/YOLO) is heavy, so it runs locally for the demo, with cloud hosting as a
  stretch goal. After deploying, `FRONTEND_URL` must be updated so WhatsApp driver-pass links point
  to the live site.
- PNG export `design/png/architecture-diagram.png` must be regenerated manually from this Mermaid source.
