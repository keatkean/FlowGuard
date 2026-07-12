# FlowGuard - Smart Logistics & Loading Bay Flow

## Booking to gate to next-in-line

```mermaid
flowchart TB
  A[FM / Tenant / Staff opens Logistics] --> B[Create booking]
  B --> C[POST /api/bookings/create]
  C --> D{Valid required fields and bay slot}
  D -->|Missing or invalid| E[400 validation error]
  D -->|Same-bay slot clash| F[409 conflict]
  D -->|OK| G[Generate booking_ref]
  G --> H[Create Driver Pass link]
  H --> I[Send WhatsApp notification; simulated or real mode]
  I --> J[Driver opens /driver-pass/:ref]
  J --> K[FM gate scan]
  K --> L{Entry or exit}
  L -->|entry| M[Optional plate comparison]
  M --> N[status = Arrived; arrived_at set]
  N --> O[Arrival notification]
  L -->|exit| P[status = Completed; completed_at set]
  P --> Q[Find next eligible booking in same bay]
  Q --> R[Notify next driver]
  S[FM or owning Tenant cancels] --> T[PATCH /api/bookings/:id/cancel]
  T --> U[status = Cancelled]
  U --> V[Cancellation notification]
```

## Role gate on Gate Scan

```mermaid
flowchart LR
  FM[FM] -->|allowed| GS[PATCH /api/bookings/:ref/gate-scan]
  TEN[Tenant] -->|403| GS
  STF[Staff] -->|403| GS
```

## Notes

- Booking creation validates required fields, enforces role/ownership rules, detects same-bay slot conflicts, generates `booking_ref`, creates a public Driver Pass link and sends a mock-safe WhatsApp notification.
- Gate entry sets `status = Arrived` and `arrived_at` after optional plate comparison.
- Gate exit sets `status = Completed` and `completed_at`, then locates the next eligible booking in the same bay for notification.
- Cancellation is logical cancellation through status: `PATCH /api/bookings/:id/cancel` sets `status = Cancelled` and sends a cancellation notification. It is not the manual UI path for Sequelize paranoid soft delete.
