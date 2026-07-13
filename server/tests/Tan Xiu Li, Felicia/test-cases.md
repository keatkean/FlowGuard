# Backend Test Cases — Facial Recognition & Access Management (Felicia)

## Create — Registration & Face Enrollment

| # | What is tested | Expected outcome |
|---|----------------|------------------|
| BE-1 | POST /user/register without reCAPTCHA token | Responds 400 with "Security token missing" |
| BE-2 | POST /user/enroll-face stores returned vector | User.update called with faceVector + isEnrolled=true |

## Read — Auth, Login & Logs

| # | What is tested | Expected outcome |
|---|----------------|------------------|
| BE-3 | verifyToken rejects a request with no token | Responds 401 Unauthorized |
| BE-4 | verifyToken rejects an invalid/expired token | Responds 401/403 |
| BE-5 | verifyToken attaches req.user for a valid token | next() called; req.user populated |
| BE-6 | POST /user/login with wrong password | Responds 401; no token issued |
| BE-7 | /user/recognize returns DENIED for unknown face | status = DENIED, no personnel name |
| BE-8 | GET /api/security/logs returns events list | 200 with an array of log entries |

## Update — Re-enrolment, access status & review

| # | What is tested | Expected outcome |
|---|----------------|------------------|
| BE-9 | POST /user/enroll-face re-enrols (self, or FM via targetUserId) | 200; User.update called with new faceVector; old vector overwritten |
| BE-10 | PUT /user/suspend/:id toggles active status (FM) | 200; user isActive flipped (suspend / reactivate) |
| BE-11 | PATCH /api/security/logs/:id/review updates status + notes (FM) | 200; reviewStatus/reviewNotes updated; non-FM responds 403 |

## Delete — PDPA off-boarding

| # | What is tested | Expected outcome |
|---|----------------|------------------|
| BE-12 | DELETE /user/:id removes the user record (FM, or Tenant for own staff) | 200; user row removed |
| BE-13 | DELETE /user/:id wipes the biometric vector | faceVector set to null before the row is removed |
| BE-14 | DELETE /user/:id deletes attendance + anonymises security logs | attendance rows deleted (cascade); security-log personnelName set to null (kept for audit) |
| BE-15 | After delete, user auth fails | POST /user/login with the removed credentials responds 400/401 |
