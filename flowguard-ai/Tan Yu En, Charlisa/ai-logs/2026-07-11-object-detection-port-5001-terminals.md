# AI Log — Object Detection: Port 5001 Dependency & Terminal Setup
**Date:** 2026-07-11
**Branch:** feature/object-detection-space
**Tool:** Claude Code (Sonnet 5)

---

## Task 1 — Does Object Detection still need the Node server on port 5001?

**Prompt:** "with my current object detection, do i still need to run port 5001 in server node index.js cos the ai obj detection as of rn is working fine"

**Response summary:** Investigated (via a background research agent plus direct `Grep`/`Read` follow-up) `server/index.js`, `server/config/serverConfig.js`, `client/vite.config.js`, and `client/src/pages/ObjectDetection.jsx`. Found that port 5001 is the Node/Express backend (auth, zones, cameras, detection-alerts CRUD, facial recognition, attendance, bookings, etc.) and is proxied via Vite's `/api` and `/user` targets. The actual YOLO inference (people-count, bounding boxes, analyze-frame) is served by a separate Python FastAPI service (`ai-service/main.py`, port 8501) via the Vite `/ai` proxy — this explains why detection itself already works without the Node server running. However, `ObjectDetection.jsx` also calls Node's `/api/zones`, `/api/cameras`, and `/api/detection-alerts` for the camera/zone picker and the alerts workflow panel, falling back to a "Node.js server offline" banner (line ~385) if those calls fail. Concluded: live detection keeps working without port 5001, but zone/camera selection and the alerts/incident panel do not.

**Outcome:** Accepted — no correction or follow-up pushback on the explanation.

---

## Task 2 — What terminals do I need to run?

**Prompt:** "so what are the terminals i need to run"

**Response summary:** Read the root `README.md` setup section and `client/package.json` / `server/package.json` scripts to confirm exact run commands. Answered that three terminals are needed for the full feature: (1) `ai-service` — activate the venv and run `uvicorn main:app --host 0.0.0.0 --port 8501`; (2) `server` — `node index.js` (port 5001); (3) `client` — `npm run dev` (Vite, proxying `/api`→5001 and `/ai`→8501). Reiterated that since detection was already working, ai-service + client were evidently already running, and that server is only needed for the zones/cameras dropdown and alerts panel.

**Outcome:** Accepted — no correction or follow-up pushback.

---

## Task 3 — Save this session log

**Prompt:** Summarize the entire session as a markdown log, per-task prompt/response-summary/outcome, saved as `<yyyy-mm-dd>-<task>.md` in `ai-logs/<name>/`.

**Response summary:** Followed the existing repo convention (`flowguard-ai/<Full Name>/ai-logs/`) already used for this git identity (`251787T` → "Tan Yu En, Charlisa"), matching the format of the prior same-day log (`2026-07-11-securepi-camera-feed-fix.md`). Created this new, distinctly-named file since it covers a separate topic (port 5001 / terminal setup Q&A) from the SecurePi camera-feed fix logged earlier the same day.

**Outcome:** In progress (this file).
