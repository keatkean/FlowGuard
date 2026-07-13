# Problem Statement

**Project:** FlowGuard – Asset & Manpower Monitoring
**SCCCI AI Challenge – Problem Statement 5B**
**Industry Sector:** Manufacturing (Food Factory)
**Client:** Harrison Food Factory (new facility, TOL 2027)
**Team:** IT2115-03, Group 11

---

## 1. Background

Harrison Food Factory is a new multi-tenant food manufacturing facility scheduled for
Temporary Occupation Licence (TOL) in 2027. Because it is a new build with no legacy
company data, the client's goal is to **showcase what AI can bring to the industry** —
using the facility as a demonstrator for how an integrated, AI-driven system can run a
modern factory with far less manual effort.

The facility has **40+ tenant units**, multiple entry points, and **only two loading bays**, all of
which are currently monitored and coordinated by hand. With many tenants sharing just two bays,
delivery coordination is complex and the bays congest at peak hours.

## 2. Who this is for (target users)

- **Facility Management (FM) staff** — responsible for security, parking, and tenant
  operations across the whole site.
- **Security personnel** — monitoring entry/exit and enforcing compliance.
- **Tenants** — who depend on smooth operations for deliveries, cold-chain handling,
  and logistics.

## 3. The problem

Today, monitoring entry points, parking bays, deliveries, and compliance is **manual,
time-consuming, and labour-intensive**:

- Staff must watch multiple entry points, loading bays, and zones in person across 40+ units.
- Tracking compliance and anomalies — unauthorised access, unattended objects, and incidents —
  relies on human observation and is hard to log or audit manually.
- Coordinating deliveries for 40+ tenants across only two loading bays is complex; the bays suffer
  peak-hour congestion, and drivers have no way to know when a bay will be free, so they arrive
  early and queue.

FlowGuard reduces this manual workload and improves both access visibility (who entered, when, and
whether authorised) and logistics visibility (bay bookings, driver passes, and gate entry/exit).

### Root cause

- There is **no AI system** to automate detection, tracking, and alerting.
- Reliance on human observation **increases errors and staffing needs**.
- Existing facility systems are **not integrated and not predictive** — each is watched
  separately, and nothing anticipates a problem before it happens.

## 4. Impact of the problem

- High labour costs from large teams doing routine monitoring.
- Increased risk of errors, security breaches, and environmental non-compliance.
- Tenant dissatisfaction caused by operational delays and congestion.
- Operational inefficiency that limits the facility's ability to scale.

For the people doing the job day to day, this shows up as **stress** from juggling many
operations at once, **frustration** over delays and congestion, and ongoing **concern**
about security incidents, compliance violations, and tenant complaints.

## 5. Future state — what success looks like

A system that handles routine monitoring **automatically**, reducing staff workload and
operational errors, so people can focus on higher-value work. The client's full vision
covers five capabilities:

1. **AI CCTV & facility monitoring** — detect unauthorised access, PPE compliance, and intrusion.
2. **Automated environmental monitoring** — temperature/humidity sensors with predictive alerts.
3. **Pest & anomaly detection** — detect rodents, insects, and hygiene issues.
4. **Smart loading bay & logistics tracking** — plate recognition, delivery logs, pallet tracking.
5. **AI dashboard & analytics** — centralised visibility for compliance, trends, and incidents.

### Measurable success targets

- Reduce manual monitoring workload by **50–70%** (manpower target: −40%, man-hours: −50%).
- Optimise parking and loading-bay usage by **20–30%**.
- Reduce the risk of security incidents and compliance breaches.
- Free staff to focus on higher-value operational tasks.
- Differentiate Harrison Food Factory from standard industrial buildings, making it more
  attractive to tenants.

## 6. Scope of the FlowGuard PoC

FlowGuard is a full-stack web application (React + Node.js + PostgreSQL) with a Python
AI service. For this proof of concept, the team focuses on the **AI-vision and operations
layer** of the client's vision, delivered as five integrated feature modules:

| Module | Owner | Maps to client capability |
|--------|-------|----------------------------|
| Facial Recognition & Access Management | Felicia | (1) AI CCTV & access control |
| Smart Logistics & Loading Bay Management | Felicia | (4) Smart loading bay & logistics tracking |
| Object Detection & Space Management | Charlisa | (1)(4) Density, unattended assets, zone rules |
| AI Helpdesk & Facility Support | Lucas | (5) Tenant support & escalation |
| Incident Tracking & Resolution | Gladwin | (5) Centralised incident dashboard |

**Out of scope for the PoC (acknowledged as part of the client's wider vision):**
environmental sensors (temperature/humidity) and pest detection rely on IoT sensor
hardware beyond a full-stack web application, so they are noted as future scope rather
than built in this PoC.

## 7. Systems & data

- **Company data required:** None. Harrison Food Factory is a new facility (TOL 2027)
  with no existing data; the PoC uses demo/test data.
- **Systems the PoC would integrate with:** Wi-Fi and AI-capable CCTV equipment.

---

*This problem statement is the reference point for all design decisions in FlowGuard.
Every feature, API, and schema choice should trace back to a need described here.*