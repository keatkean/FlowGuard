# FlowGuard — Smart Logistics & Loading Bay Flow

## Booking to gate to next-in-line

```mermaid
flowchart TB
  A[FM / Tenant / Staff<br/>opens Logistics] --> B[+ New Booking]
  B --> C[POST /api/bookings/create]
  C --> D{Valid fields + slot}
  D -->|Missing / bad| E[400 error]
  D -->|Slot clash| F[409 conflict]
  D -->|OK| G[Generate booking_ref<br/>status = Pending]
  G --> H[WhatsApp driver pass link<br/>simulated if disabled]
  H --> I[Driver opens<br/>/driver-pass/:ref QR]

  I --> J[FM Gate Scan at bay]
  J --> K{Action}
  K -->|entry| L[Optional plate check<br/>status = Arrived]
  K -->|exit| M[status = Completed]
  M --> N[Find next non-cancelled<br/>booking same bay]
  N --> O[WhatsApp next-in-line]

  P[FM / owner Tenant] --> Q[Cancel booking]
  Q --> R[status = Cancelled<br/>soft delete]
```

## Role gate on Gate Scan

```mermaid
flowchart LR
  FM2[FM] -->|allowed| GS[PATCH /:ref/gate-scan]
  TEN2[Tenant] -->|403| GS
  STF2[Staff] -->|403| GS
```

## Notes

- **Create:** FM, Tenant, and Staff can create bookings. Staff book on behalf of their unit — the
  booking's `tenantId` is set from the Staff member's `managerId`. Validation returns 400 for
  missing/invalid fields and 409 for an overlapping slot in the same bay.
- **WhatsApp:** a driver-pass link is sent on create (and on status changes). In local/demo mode
  it is simulated; the API response reports the send status.
- **Driver Pass:** the public `/driver-pass/:ref` page shows booking details + a QR encoding the
  booking reference; it needs no login.
- **Gate Scan (FM only):** entry moves Pending/Confirmed → Arrived; exit moves → Completed. An
  optional observed plate is compared to the booking plate and flagged on mismatch (warn, not block).
- **Next-in-line:** completing a booking notifies the next waiting booking for the same bay,
  supporting the "previous driver left early, notify the next driver" requirement.
- **Cancel:** FM or the owning Tenant soft-cancels (status = Cancelled, `paranoid` soft delete).
- **Restrictions:** Tenant and Staff cannot Gate Scan or Mark Arrived/Completed (facility-level, FM only).
