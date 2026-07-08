# FlowGuard — Role-Based Access Control (RBAC)

## Request flow

```mermaid
flowchart TB
  R[Incoming request] --> T{Has valid JWT}
  T -->|No| E401[401 Unauthorized<br/>redirect to login]
  T -->|Yes| Role{Role allowed for route}
  Role -->|No| E403[403 Forbidden]
  Role -->|Yes| OK[Handler runs]
```

## Role capability map

```mermaid
flowchart LR
  subgraph FM[FM]
    FM1[All monitoring: Cameras / V-Patrol / Object Detection / Gate Scanner]
    FM2[User Management + manual add Tenant]
    FM3[Security Review + Tenant Onboarding]
    FM4[Logistics: create / status / gate scan / cancel]
    FM5[Attendance: all records]
    FM6[Settings: admin sections]
  end
  subgraph TEN[Tenant]
    T1[Dashboard]
    T2[My Staff + add Staff + own staff logs]
    T3[Logistics: create / cancel own]
    T4[Attendance: own unit staff]
    T5[Settings: own Face ID]
  end
  subgraph STF[Staff]
    S1[Dashboard]
    S2[Logistics: create for unit]
    S3[Attendance: own records only]
    S4[Settings: own Face ID]
  end
  subgraph PUB[Public]
    P1[Landing / Login / Register]
    P2[Driver Pass QR]
  end
```

## Access matrix

| Page / action | FM | Tenant | Staff | Public |
|---------------|:--:|:--:|:--:|:--:|
| Landing / Login / Register | ✅ | ✅ | ✅ | ✅ |
| Driver Pass QR `/driver-pass/:ref` | ✅ | ✅ | ✅ | ✅ |
| Dashboard | ✅ | ✅ | ✅ | ❌ |
| Cameras / V-Patrol / Object Detection / Gate Scanner | ✅ | ❌ | ❌ | ❌ |
| Daily Attendance | all | own staff | own only | ❌ |
| Logistics — view | all | own unit | own unit | ❌ |
| Logistics — create booking | ✅ | ✅ | ✅ | ❌ |
| Logistics — cancel | ✅ | own | ❌ | ❌ |
| Logistics — Mark Arrived/Completed | ✅ | ❌ | ❌ | ❌ |
| Gate Scan (entry/exit) | ✅ | ❌ | ❌ | ❌ |
| My Staff (add Staff, own staff logs) | ❌ | ✅ | ❌ | ❌ |
| User Management (add Tenant, suspend/delete) | ✅ | ❌ | ❌ | ❌ |
| Security Review | ✅ | ❌ | ❌ | ❌ |
| Tenant Onboarding (invites) | ✅ | ❌ | ❌ | ❌ |
| Settings — own Face ID re-enrol | ✅ | ✅ | ✅ | ❌ |
| Settings — admin (AI / network / danger) | ✅ | ❌ | ❌ | ❌ |

## Notes

- Enforced on **both** layers: React `ProtectedRoute` (with role allow-lists) and Express
  `verifyToken` + `requireRole` middleware. The frontend also hides controls a role cannot use so
  users never click into a 403.
- **401** = not logged in (redirect to login). **403** = logged in but insufficient role.
- "Staff" means a tenant/factory worker (not a security officer), so Staff are kept out of AI/security
  monitoring pages and facility-level gate control.
- FM accounts are provisioned via the seed/setup script only — they cannot be created from the UI.
