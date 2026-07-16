# FlowGuard - System Architecture Diagram (merged system)

```mermaid
---
id: 04e3216c-fa0a-4ddc-bc32-58269018d5a1
---
flowchart TB
  subgraph Users
    FM[FM]
    TEN[Tenant]
    STF[Staff]
    DRV[Driver / Public]
  end

  subgraph Sources[Camera Sources]
    LAP[Laptop / browser camera]
    PI[Raspberry Pi Camera latest-frame cache]
  end

  subgraph Frontend[React / Vite Frontend]
    PUB[Public Site]
    DASH[Role Dashboards]
    GS[Gate Scanner]
    VP[V-Patrol]
    FE[Face Enrollment]
    QRP[Driver Pass public page]
    CHAT[AI Chat Popup]
  end

  subgraph Backend[Node.js / Express API]
    AUTH[Auth + RBAC]
    USER[user routes]
    FPROXY[Facial tracking / recognition proxy]
    ATT[Attendance]
    SEC[Security Review]
    BOOK[Smart Logistics]
    CAM[Camera + Zone CRUD]
    ALERT[Detection Alerts]
    INC[Incident Logs]
    SUP[Support / Helpdesk]
  end

  subgraph AI[Python FastAPI AI Service]
    TRACK[/user/track lightweight detector/]
    FACE[/user/recognize InsightFace/]
    ENCODE[/api/encode-faces/]
    REFRESH[/refresh known-face cache/]
    YOLO[YOLO endpoints]
  end

  DB[(PostgreSQL / Sequelize<br/>users, evaluation_participants,<br/>attendance, security_logs,<br/>bookings, cameras, monitoring_zones,<br/>detection_alerts, incident_logs,<br/>chat_transcripts, support_tickets,<br/>knowledge_base)]
  WA[WhatsApp Cloud API mock-safe locally]

  FM --> DASH
  TEN --> DASH
  STF --> DASH
  DRV --> QRP
  DASH --> GS
  DASH --> VP
  DASH --> FE
  PUB --> AUTH
  CHAT --> SUP
  QRP --> BOOK

  LAP --> GS
  LAP --> VP
  PI --> GS
  PI --> VP
  GS --> FPROXY
  VP --> FPROXY
  FE --> USER

  AUTH --> USER
  AUTH --> FPROXY
  AUTH --> ATT
  AUTH --> SEC
  AUTH --> BOOK
  AUTH --> CAM
  AUTH --> ALERT
  AUTH --> INC
  AUTH --> SUP

  FPROXY --> TRACK
  FPROXY --> FACE
  USER --> ENCODE
  USER --> REFRESH
  CAM --> YOLO
  YOLO --> ALERT

  USER --> DB
  FPROXY --> DB
  ATT --> DB
  SEC --> DB
  BOOK --> DB
  CAM --> DB
  ALERT --> DB
  INC --> DB
  SUP --> DB
  FACE --> DB
  REFRESH --> DB
  BOOK --> WA
```

## Notes

- Laptop and Raspberry Pi camera sources provide frames. The Pi serves latest-frame snapshot/stream data; heavy InsightFace recognition remains on the laptop AI service.
- `/user/track` is side-effect-free tracking telemetry. `/user/recognize` performs full identity matching. Attendance and SecurityLog writes happen through Node routes after frontend scanner policy checks.
- `evaluation_participants` stores stable evaluation labels for the FM validation workflow.
- DetectionAlert records are associated with Camera and MonitoringZone when resolvable. IncidentLog records are separate; alert-to-incident seeding is an application workflow, not a database relationship.
