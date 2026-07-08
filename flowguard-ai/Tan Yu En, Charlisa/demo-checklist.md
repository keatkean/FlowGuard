# Demo Checklist — Camera Inventory, Detection Setup & Object Detection (Charlisa)

Run through in order. Each step names the actual route/button it exercises so it can be followed
without narration.

1. **Login as FM.** Use the seeded FM account. `localStorage.userRole` should be `FM`.
2. **Open Camera Inventory.** Sidebar → *Camera Inventory* (`/camera-inventory`). Confirm the
   summary tiles (Total / Online / Need Attention) render from real data, not placeholders.
3. **Add a camera.** Click *Add Camera*, fill Camera Code / Name / Location, pick a Zone and Video
   Source, submit. Confirm it appears in the Camera Register list immediately (`POST
   /api/cameras`).
4. **Edit the camera.** Click the edit icon on the row just created, change its Status to
   `Maintenance`, save. Confirm the row's status pill updates (`PUT /api/cameras/:id`).
5. **Deactivate a camera.** Click the delete icon once (button flips to a confirm state), click it
   again to confirm. Confirm the row disappears (`DELETE /api/cameras/:id` — soft delete).
6. **Show camera statuses.** Point out the four possible pills: Online (green), Maintenance
   (indigo), Offline (grey), Disabled (dark grey) — create/edit a couple more cameras if needed to
   show more than one status at once.
7. **Open Detection Setup.** Sidebar → *Detection Setup* (`/detection-settings`).
8. **Select camera and zone.** In the Zone Thresholds panel, use the "Map a camera to this zone"
   dropdown on an existing zone, pick the camera created in step 3, click *Map*. Confirm it now
   lists under that zone's "Cameras" line (`PUT /api/cameras/:id` with `zone_id`).
9. **Configure object classes and thresholds.** Create or edit a zone: set monitored classes
   (comma-separated, e.g. `person, backpack`), density threshold, unattended threshold (seconds),
   alert cooldown (seconds), severity, and assigned team. Save and confirm the values persist after
   a page refresh (`POST`/`PUT /api/zones`, backed by `MonitoringZone`).
10. **Open Object Detection dashboard.** Sidebar → *Object Detection* (`/object-detection`).
11. **Select a camera from inventory.** Use the camera dropdown next to the source controls.
    Confirm the "Currently Monitoring: `<code>` · `<zone>`" line updates.
12. **Show YOLO detection running.** Switch to Browser Camera (or upload a video) and confirm the
    "YOLO ACTIVE" badge lights up with live bounding boxes drawn from real inference.
13. **Show people/object count.** Point at the "People Detected" badge and the "Detections Today"
    command tile updating live.
14. **Trigger or show an alert.** Either let an unattended-object/person-density alert fire
    naturally, or open a second tab on `/cameras` and watch the *Smart Detection Events* panel —
    confirm the alert references a real zone/camera location.
15. **Acknowledge / dispatch / clear the alert.** On Object Detection's incident card: assign a
    responder, click *Acknowledge*, then *Dispatch Team*, then *Mark Cleared*. Confirm each step
    updates the alert's status via `PUT /api/detection-alerts/:id`.
16. **Show Staff's limited permissions.** Log out, log in as a Staff account. Revisit Camera
    Inventory and Detection Setup: confirm both render read-only (no Add/Edit/Delete/Save
    controls) and that a manually-issued `POST`/`PUT`/`DELETE` against `/api/cameras` or
    `/api/zones` returns `403` (open devtools Network tab if asked to prove it, not just the UI).
17. **Explain offline/error handling.** Stop the Node server; refresh Camera Inventory — confirm
    the "Node.js server offline" banner appears instead of a blank/broken page. Restart it. Stop
    the Python `ai-service`; refresh Object Detection — confirm the "AI Engine: Offline" banner and
    "Python AI service offline" warning appear instead of a silent failure.
18. **Explain the stock-YOLO limitation.** Point at the on-page note under Object Detection's
    "Console Focus" card: the AI engine analyzes one active source at a time and does not yet
    switch physical camera streams per inventory selection — a multi-stream, per-camera-routed,
    potentially custom-trained model is the natural next step beyond this stock YOLOv8n pipeline.
