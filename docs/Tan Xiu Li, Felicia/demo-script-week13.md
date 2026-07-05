# FlowGuard — Week 13 Demo Script (Felicia)

A ~8–10 minute walkthrough. Have three terminals ready.

## 0. Start the services
```bash
# Terminal 1 — Frontend
cd client && npm run dev -- --host      # http://localhost:5173

# Terminal 2 — Backend
cd server && node index.js              # http://localhost:5001

# Terminal 3 — AI service (InsightFace faces + YOLO) — port 8501
cd ai-service && uvicorn main:app --host 0.0.0.0 --port 8501 --reload
```
- Seed the FM login once: `cd server && node seed.js` → `admin@harrison.com` / `Admin123!`.
- WhatsApp stays **disabled** (`WHATSAPP_ENABLED=false`) → notifications are **simulated** (safe for demo).

## 1. Open + log in as FM
- Visit `http://localhost:5173`, log in as the FM admin.
- Show the **role dashboard** (FM = "Master Command Center") and the full sidebar.

## 2. Facial Recognition & Access
- **Face Enrollment** — capture 3 angles (or upload) → confirm success (vector stored, AI cache refreshed).
- **V-Patrol / Gate Scanner** — show live recognition: a known face logs access; an unknown face logs an intrusion.
- **Security Review** — filter Pending Review, set a status + note (FM-only review workflow).
- **User Management → Logs** — show a user's access history; mention PDPA off-board (wipes face vector, anonymises logs).

## 3. Smart Logistics & Loading Bay
- **Logistics → + New Booking** — fill company/plate/phone/bay/slot → create (status Pending).
- Point out the **simulated WhatsApp** status in the toast/notice ("WhatsApp simulated — disabled").
- Open the **Driver Pass QR** at `/driver-pass/<booking_ref>` (mobile-friendly page + QR).
- **Gate Scan** (FM) — enter the ref → **Mark Arrived (Entry)**, then **Mark Completed (Exit)**.
- If another booking exists for that bay, show the **next-in-line** notification firing on exit.
- Show **Cancel** (soft-cancel) and the **filters** (search / status / bay / date).

## 4. Role views (RBAC)
- Log in as **Tenant**: sidebar = Dashboard, Daily Attendance, Logistics & Bays, My Staff, Settings.
  Create a booking; open "My Staff" → Logs (own staff only). No monitoring/admin pages.
- Log in as **Staff**: sidebar = Dashboard, Daily Attendance ("My Attendance"), Logistics & Bays, Settings.
  Can create a booking, but **no Gate Scan** and **no Mark Arrived/Completed**.
- Show a blocked route (e.g. Staff → `/vpatrol` or `/users` → **403 Clearance Denied**).

## 5. Wrap up
- Mention tests: **backend 79/79**, **frontend 70/70**, **build success**.
- Mention deployment plan (Vercel / Render / Neon) and that the AI service runs locally for the demo.
- Note: no real secrets committed; WhatsApp real-send is env-gated and off by default.

### Fallbacks if hardware misbehaves
- No webcam → use **manual upload** on Face Enrollment; V-Patrol shows a clear "camera unavailable" overlay.
- AI offline → enrolment returns a clean "service offline" message (no crash).
- Camera flaky at the gate → Gate Scan accepts the **booking reference** typed manually.
```
