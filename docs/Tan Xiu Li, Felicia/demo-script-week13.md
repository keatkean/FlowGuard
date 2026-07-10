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
- **Pi Gate Camera**: power on the Raspberry Pi Camera Module 3 node and confirm the stream
  is up (e.g. `http://<pi-address>:8081/video_feed` in a browser). Set
  `VITE_PI_CAMERA_STREAM_URL` / `VITE_PI_CAMERA_SNAPSHOT_URL` in `client/.env` if the Pi's
  IP changed on the demo network.
- **Service key**: set the SAME `AI_SERVICE_KEY` dev value (e.g. `dev-local-ai-key`) in
  `server/.env` and `ai-service/.env` — the face endpoints are now service-key protected
  and recognition goes browser → Node → FastAPI (never browser → FastAPI).

## 1. Open + log in as FM
- Visit `http://localhost:5173`, log in as the FM admin.
- Show the **role dashboard** (FM = "Master Command Center") and the full sidebar.

## 2. Facial Recognition & Access
- **Face Enrollment** — capture 3 angles (or upload) → confirm success (protected biometric template stored, AI cache refreshed).
- **V-Patrol / Gate Scanner** — the **Raspberry Pi Camera Module 3 is the primary physical gate-camera node**:
  the page shows "**Pi Gate Camera connected**" and the Pi live preview. Show live recognition:
  a known face logs access; an unknown face logs an intrusion.
- **Camera source switch** — click **Laptop Webcam** to demo the manual switch ("Laptop webcam active"),
  then back to **Raspberry Pi Gate Camera**. If the Pi drops off the network, the page automatically
  falls back to the laptop webcam ("Pi Camera unavailable — using laptop webcam fallback") — laptop
  webcam is the fallback for demo reliability.
- Privacy talking point: raw face frames are only processed temporarily; the app stores the
  **recognition result, confidence, and attendance/security log** — never exposed biometric vectors.
- Security talking point: recognition matches by **unique User ID**; PostgreSQL — not the AI
  cache — decides name, role and account status. Suspend a user (User Management), scan again →
  "**ACCESS DENIED — ACCOUNT SUSPENDED**" and an automatic `Suspended Access Attempt` security
  log (deduplicated, 30 s cooldown). An unknown face → automatic `Intrusion Alert` log.
  `/api/attendance/scan` is authenticated and takes the server-verified `userId` — a public
  `{ name }` POST no longer works.
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

## 4b. Facial Evaluation Lab (FM only, ~2 min)
- Sidebar → **Facial Evaluation** (`/facial-evaluation`). Point out the banner:
  *"SIMULATION MODE — Production users, attendance and security logs are not modified."*
- Run scenario 1 (active → Access Granted) and scenario 3 (unknown → Access Denied), click
  **Log to evaluation records**, then open the **Confusion Matrix** tab: sample count, accuracy,
  macro precision/recall/F1, FAR, FRR, average latency.
- Mention: labels are anonymised (P01–P05 / Unknown), records live only in localStorage, and real
  live-scan outcomes from V-Patrol / Gate Scanner are entered manually via the Records tab.

## 5. Wrap up
- Mention tests: **backend 214/214 (19 suites)**, **frontend 206/206 (25 files)**, **build success**.
- Mention deployment plan (Vercel / Render / Neon) and that the AI service runs locally for the demo.
- Note: no real secrets committed; WhatsApp real-send is env-gated and off by default.

### Fallbacks if hardware misbehaves
- Pi camera unreachable → Gate Scanner / V-Patrol **auto-fallback to the laptop webcam**
  ("Pi Camera unavailable — using laptop webcam fallback"); recognition keeps working.
- No webcam → use **manual upload** on Face Enrollment; V-Patrol shows a clear "camera unavailable" overlay.
- AI offline → enrolment returns a clean "service offline" message (no crash).
- Camera flaky at the gate → Gate Scan accepts the **booking reference** typed manually.
