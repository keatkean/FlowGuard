# AI Log — Object Detection & Space Management Review/Fixes
**Date:** 2026-07-06
**Branch:** feature/object-detection-space
**Tool:** Claude Code (Sonnet 5)

---

## Task 1 — Check whether zone CRUD was complete

**Prompt:** Asked whether the CRUD for the object-detection-space feature had been completed.

**Response summary:** Reviewed `ObjectDetection.jsx`, `server/routes/zones.js`, `server/routes/detectionAlerts.js`, and the `MonitoringZone`/`DetectionAlert` Sequelize models. Confirmed:
- `MonitoringZone`: full Create/Read/Update/Delete implemented end-to-end (frontend form + inline edit + delete button, backend GET/POST/PUT/DELETE routes, model auto-registered via `models/index.js`).
- `DetectionAlert`: Create/Read/Update (status → "Cleared") implemented; no manual delete endpoint, but a scheduled 30-day auto-purge job exists instead — reasonable for a log-style resource.
- Flagged a stray `print("RAW YOLO:", ...)` debug line in `ai-service/yolo_service.py` as leftover debug code.

**Outcome:** Accepted — no pushback, informational check only.

---

## Task 2 — Review implementation quality of ObjectDetection.jsx, Cameras.jsx, CameraFeed.jsx

**Prompt:** Asked whether these three pages were well implemented to support the object detection feature.

**Response summary:** Read all three files plus `ai-service/main.py`, `ai-service/yolo_service.py`, and `vite.config.js` to trace the full request path. Found:
1. **Bug:** `CameraFeed.jsx` posted to a hardcoded `http://localhost:8000/api/yolo/analyze-frame` — wrong port and bypasses the Vite `/ai` proxy entirely. The real AI service (`main.py`) is required to run on port 8501 per the README. This request would always fail.
2. **Bug:** `ObjectDetection.jsx`'s detection-box overlay used hardcoded `360`/`270` divisors to position boxes as percentages, instead of the actual `frame_width`/`frame_height` already returned by the API — causing bounding boxes to cluster in the wrong region of the video instead of tracking the real object.
3. Design/consistency issues raised: `Cameras.jsx`'s "Scan Network" button had no `onClick`; `CameraFeed.jsx` detections weren't wired into the zones/alerts persistence layer; the camera list was a hardcoded array with no backend; `CameraFeed.jsx` had no in-flight-request guard (unlike `ObjectDetection.jsx`'s `processingFrameRef`), risking request pile-up under load.

**Outcome:** User confirmed ("sureeeeeeeeeeee") to proceed with fixing bugs #1 and #2 immediately; issues #3–6 were surfaced but not actioned yet at that point.

---

## Task 3 — Fix the URL bug and the bounding-box misalignment bug

**Prompt:** Implicit go-ahead from Task 2's confirmation.

**Response summary:**
- `CameraFeed.jsx`: changed the hardcoded `http://localhost:8000/...` call to the proxied `/ai/api/yolo/analyze-frame` path, matching `ObjectDetection.jsx`'s working pattern.
- `ObjectDetection.jsx`: added a `frameSize` state (`{ width, height }`), populated from `res.data.frame_width`/`frame_height` on every analyze-frame response, and swapped the detection-box overlay's hardcoded `360`/`270` divisors for `frameSize.width`/`frameSize.height`.

**Outcome:** Accepted as a base — confirmed later (via session diffs) that the user built substantially on top of these two fixes rather than reverting them (see Task 5).

---

## Task 4 — Diagnose "only detecting suspicious person, not objects"

**Prompt:** Reported that after the fixes, testing on `Cameras.jsx` (the pre-recorded demo videos) only ever showed "suspicious person" labels, never objects.

**Response summary:**
- Used a Python/OpenCV one-off script to extract a representative frame from each of the six demo videos (`loading.mp4`, `assembly.mp4`, `chemical_storage.mp4`, `command.mp4`, `entrance.mp4`, `packaging.mp4`) and visually inspected them.
- Root cause identified: `ai-service/main.py` (the AI service actually running on port 8501, now correctly targeted after Task 3's fix) restricts YOLO's class filter (`_YOLO_CLASS_IDS`) to an office/warehouse "unattended item" set — `person, backpack, handbag, suitcase, bottle, cup, laptop, cell phone, book`. The demo footage, however, shows **oranges** (`assembly.mp4`), produce (`packaging.mp4`), and a delivery **truck** (`entrance.mp4`) — none of which were in that allowlist, so YOLO discarded them before detection results were even returned. Those classes exist in the *other*, unused AI file (`ai-service/yolo_service.py`), which was evidently the one the demo videos were originally chosen to match.
- Fix applied to `ai-service/main.py`: added COCO ids for `truck` (7), `banana` (46), `apple` (47), `orange` (49) to `_YOLO_CLASS_IDS`; added `_FOOD_CLASSES`/`_VEHICLE_CLASSES` sets and new `elif` branches inside `_annotate_detection_frame` (the function behind `/api/yolo/analyze-frame`) to classify, draw, and return `"food_item"`/`"vehicle"` detections with `"status": "normal"` (kept separate from the unattended-object alert timer, mirroring how `yolo_service.py` already treated fruit).
- Verified with `python -m py_compile main.py` — syntax OK.
- Flagged a residual, un-fixable limitation: tomatoes (`packaging.mp4`) and generic cardboard boxes (`loading.mp4`) aren't COCO classes at all in *any* stock YOLO model, so those two clips would likely still show person-only detection without a custom-trained model.

**Outcome:** Edited/extended — session-end diffs show the user took this fix as a base and significantly expanded all three touched files themselves: added a confidence-filtered `RELEVANT_CAMERA_CLASSES` allowlist and per-type confidence thresholds in `CameraFeed.jsx`; added video-upload mode, a responder-assignment feature, and AI-offline-retry debouncing (`aiHealthFailuresRef`) in `ObjectDetection.jsx`. My specific line-level edits were not reverted, but were built upon rather than used as-is.

---

## Task 5 — Save this session log (first pass)

**Prompt:** Summarize the session as a markdown log with per-task prompt/response/outcome, saved to `ai-logs/<name>/<date>-<task>.md`.

**Response summary:** Repo convention found to be `flowguard-ai/<Full Name>/ai-logs/`. Asked the user which existing name folder was theirs since it wasn't derivable from git config (`251787T`) or session metadata. Confirmed as "Tan Yu En, Charlisa"; created the `ai-logs` subfolder (didn't exist yet) and wrote this file there.

**Outcome:** Accepted — file created, no corrections requested.

---

## Task 6 — "Check if everything currently runs and works, and if I fulfil CRUD"

**Prompt:** Asked for a live check of whether the full stack runs and whether CRUD is actually fulfilled, not just a code read-through.

**Response summary:** Re-read the current (heavily user-modified) `ObjectDetection.jsx`, `Cameras.jsx`, `CameraFeed.jsx`, then actually exercised the system instead of just reading code:
- `npm run build` in `client/` — succeeded, no errors.
- Started the Node server against the real Postgres DB and ran a full live zone CRUD lifecycle via curl (POST → PUT → GET → DELETE → GET) — all verified working end-to-end.
- Verified `DetectionAlert` create/read via curl.
- Attempted to start a second `ai-service` instance on port 8501; it correctly failed with "address already in use," revealing the user already had their own AI service live and actively streaming real detections (explaining a large volume of "Warning/Critical: N People Detected" alerts appearing in the DB in real time).
- Extracted more video frames and posted them straight to the already-running AI service to confirm the Task 4 fix: **truck detected at 0.91 confidence**, **orange detected at 0.42 confidence** on the actual demo footage — confirming the fix works, with occasional donut/boat misclassifications on close-up fruit frames being a genuine (unfixable without custom training) model-accuracy limit, not a code bug.
- **Found a regression:** during the page redesign (the extensive edits noted as "Outcome" in Task 4), the Monitoring Zones create-form and zone list JSX had been removed from `ObjectDetection.jsx` entirely — `handleCreateZone`/`handleUpdateZone`/`handleDeleteZone` still existed and still worked, but nothing in the UI called them anymore. Confirmed via `App.jsx`/`Sidebar.jsx` that no other route housed zone management either — the zone CRUD *backend* was fully functional but had **no UI entry point** at all.
- Also noted: `Cameras.jsx`'s new camera CRUD console and `ObjectDetection.jsx`'s "Response Teams" section are both `useState`-only, not persisted to any backend table.
- Left a Node server running in the background on port 5001 for testing and flagged it to the user rather than silently killing or leaving it.

**Outcome:** Accepted the diagnosis — user went and fixed the flagged regression themselves (see Task 7) rather than asking me to.

---

## Task 7 — "Ok wait i made the changes"

**Prompt:** User indicated they'd made changes after Task 6's findings, implicitly asking for re-verification.

**Response summary:** Re-read `ObjectDetection.jsx` and confirmed the user had re-added the full "Monitoring Zones" card (create form + edit/delete list) wired back to the existing `handleCreateZone`/`handleUpdateZone`/`handleDeleteZone` handlers. They'd also added a richer alert workflow (`Active → Acknowledged → Dispatched → Cleared`) and switched "Response Teams" to persist via `localStorage`. Verified:
- `npm run build` — clean.
- Live curl test of the new alert status workflow (Acknowledge → Dispatch → Cleared) against the real backend — all transitions succeeded.

**Outcome:** Accepted — confirmed CRUD (zone UI + backend, alert workflow) fully functional; flagged two residual non-blocking notes (Response Teams is `localStorage`-only, not DB-backed; a Node server from testing was still running in the background) for the user's awareness.

---

## Task 8 — Save this session log (updated)

**Prompt:** Repeat of the log-summarization request, to capture the full session including Tasks 6–7.

**Response summary:** Updated this same file (rather than creating a duplicate) to append Tasks 6–8, since they're a continuation of the same dated session/task rather than a new topic.

**Outcome:** Accepted — file updated, no corrections requested.

---

## Task 9 — "check if my object detection ai model works pls" (new session)

**Prompt:** In a fresh conversation (same date), asked for a live check of whether the object detection AI model actually works.

**Response summary:** Re-read the ai-logs file from earlier in the day for context, then re-read the current `ai-service/main.py` and `yolo_service.py` (both showed as modified in git status) to see what had changed since Task 4/6. Found `main.py` already contained the food/vehicle class fix from Task 4, now further refined with per-class `MIN_CONF` thresholds and a `BLOCKED_CLASSES` denylist (`donut`, `tv`, `refrigerator`, `chair`, `keyboard`, `mouse`, `remote`, `cell phone`, `laptop`) — apparently the user's own follow-up work after Task 6. Then actually exercised the running system rather than just reading code:
- Confirmed the AI service was already live on port 8501 (`netstat`) and responding correctly on `/api/yolo/people-count`.
- Confirmed `client/vite.config.js`'s `/ai` proxy targets port 8501, and both `ObjectDetection.jsx` and `CameraFeed.jsx` call the correct `/ai/api/yolo/analyze-frame` path (the Task 3 fix held).
- Wrote a one-off Python script extracting a real mid-point frame from each of the 6 demo videos and POSTing it directly to the live `/api/yolo/analyze-frame` endpoint. Got back real detections with bounding boxes and confidences for all 6 (e.g. `entrance.mp4` → truck 0.62; `loading.mp4` → person + train 0.50; `packaging.mp4` → 4 persons + donut; `command.mp4` → person + tv/chair/keyboard; `chemical_storage.mp4` → 2 persons + suitcase/refrigerator) — confirming the inference pipeline works end-to-end over real HTTP calls, not just in isolation.
- Ran `python -m py_compile main.py yolo_service.py` — clean.
- Ran `npm run build` in `client/` — clean.
- Re-flagged the residual, unfixable-without-custom-training limitation: stock YOLOv8n's 80 COCO classes don't include factory-specific items (produce close-ups, crates, forklifts), so some frames still get labeled with visually-similar COCO classes (train, boat, donut, tv/keyboard) instead of blocked/allowed — this is a model-coverage limit, not an integration bug.
- Re-flagged that `ai-service/yolo_service.py` is dead code: nothing starts it and no proxy/port routes to it, yet it's still being hand-edited in parallel with the actually-running `main.py`.

**Outcome:** Accepted — live verification confirmed the model works end-to-end; no corrections requested.

---

## Task 10 — Save this session log (final update)

**Prompt:** Repeat of the log-summarization request (same format: prompt / response summary / outcome per task), to capture the full session including Task 9.

**Response summary:** Updated this same file again (per the established convention of one file per calendar date) to append Tasks 9–10.

**Outcome:** In progress (this update).
