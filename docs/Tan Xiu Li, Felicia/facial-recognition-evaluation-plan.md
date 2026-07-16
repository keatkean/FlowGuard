# FlowGuard — Facial Recognition Evaluation Plan (Felicia)

## Purpose
Provide a structured, privacy-safe way to measure how well FlowGuard's facial-recognition
pipeline identifies people and makes access decisions, and to demonstrate the decision
workflow (active / suspended / unknown / no-face / hardware-fallback / service-outage)
without touching production data. The FM-only **Facial Evaluation Lab**
(`/facial-evaluation`, `client/src/pages/FacialEvaluation.jsx`) implements this plan.

## Anonymised dataset
Evaluation identities are **labels, never names**:

| Label | Meaning |
|-------|---------|
| P01–P05 | Up to five enrolled test participants (mapping to real people is kept OFFLINE, on paper, by the FM) |
| Unknown | A person who is NOT enrolled |
| No Face | A frame with no detectable face — a detection-quality outcome, **not** an identity class |

No raw images, snapshots, face vectors or biometric templates are ever stored in evaluation
records — only labels, confidence numbers, condition tags, latency, source and notes.
Records live in browser localStorage under `flowguard_facial_evaluation_records`, so they
cannot contaminate the production `users`, `attendances` or `security_logs` tables.

## Recommended test set — 60 identity tests
For each of 5 enrolled participants (P01–P05), run **10 live tests**:

| Condition | Tests per person |
|-----------|------------------|
| front, normal light | 2 |
| left turn, normal light | 2 |
| right turn, normal light | 2 |
| front, low light | 2 |
| left/right, low light | 2 |

= 50 enrolled-person tests. Add **10 Unknown tests** (2 unknown visitors × 5 conditions)
= **60 identity tests**. Also note (separately) how many frames returned *No Face* under
each condition as the detection-quality statistic.

## How to run a live test
1. Open **V-Patrol** or **Gate Scanner** (links on the evaluation page) and let the person scan.
2. Note the decision shown on screen (identity, confidence, granted/denied) and the
   `inference_ms`/latency telemetry.
3. In the Evaluation Lab → **Records** tab, enter: actual label, predicted label, confidence,
   condition, latency, source **Live**. Never type the person's real name anywhere.

Simulated scenarios (Simulations tab) replay the same decision logic locally and are
recorded with source **Simulated** so they can be filtered out of live-accuracy claims.

## Confusion matrix
Rows = **actual** label, columns = **predicted** label, over classes P01–P05 + Unknown.
Diagonal cells are correct decisions; off-diagonal cells are errors. *No Face* outcomes are
excluded from the matrix and reported separately.

Reported metrics (all divisions are zero-safe — a metric is 0 when its denominator is 0):
- **Accuracy** = diagonal sum ÷ total identity samples
- **Macro precision / recall / F1** = per-class precision `TP/(TP+FP)`, recall `TP/(TP+FN)`,
  `F1 = 2PR/(P+R)`, averaged over classes present in the data
- **FAR (False Accept Rate)** = Unknown samples predicted as any enrolled P01–P05 ÷ all Unknown samples
  — the security-critical error: a stranger being accepted as staff
- **FRR (False Reject Rate)** = enrolled P01–P05 samples predicted as Unknown ÷ all enrolled samples
  — the convenience error: real staff being rejected
- **Average latency** (ms) over records that carry a latency value
- **Detection quality**: count and share of *No Face* outcomes

### Interpretation
- High accuracy with a **non-zero FAR** is still a security problem — FAR matters more than
  raw accuracy at a gate.
- A high **FRR** in low-light rows usually indicates a camera/lighting problem, not a model
  problem — compare conditions with the condition filter.
- Off-diagonal cells between two enrolled labels (e.g. P02 predicted as P04) indicate the
  similarity threshold (currently 0.45 cosine similarity in `ai-service/main.py`) may be too
  permissive for visually similar participants.

## Live versus simulated evidence
- **Simulated** records validate the *workflow logic*: the decision table (active → granted +
  attendance; suspended → denied + security log; unknown → denied + intrusion log; no-face →
  no log; Pi offline → webcam fallback; service offline → backoff) and the metrics pipeline.
- **Live** records validate *actual model performance* on real faces, cameras and lighting.
- The source filter (Live / Simulated / All) keeps the two kinds of evidence separate;
  accuracy/FAR/FRR claims in the report must cite **Live** records only.

## Privacy note
The mapping between P-labels and real participants exists only offline with the FM.
Evaluation data contains no names, images, vectors or templates; production biometric
templates remain protected in the `users` table and are never read by the evaluation page.
Simulations never call `/api/attendance/scan`, `/api/facial-recognition/access-event`,
SecurityLog creation, or any user suspension/deletion endpoint.

## Limitations
- Simulation validates workflow logic only — it says nothing about real model accuracy.
- localStorage records are per-browser and per-device; export CSV to keep durable evidence.
- The 60-test plan measures identification, not anti-spoofing; the liveness (head-turn)
  check is demonstrated separately on the live pages.
- FAR/FRR here are decision-level rates from small samples (n=60), not biometric-industry
  benchmark rates; treat them as PoC indicators, not certified figures.
