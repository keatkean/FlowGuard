# Frontend Test Cases — Facial Recognition & Access Management (Felicia)

## Create — Face Enrollment

| # | What is tested | Expected outcome |
|---|----------------|------------------|
| FE-1 | FaceEnrollment renders the capture UI | Webcam container + "Capture Front" button appear |
| FE-2 | Capturing the front angle advances the stage | Stage changes front → left; "Front" badge marked done |
| FE-3 | All three angles captured | Stage becomes 'ready'; preview grid shows 3 thumbnails |
| FE-4 | Manual upload fallback sets a photo | Selecting an image file populates the matching angle's photo |
| FE-5 | Non-image file rejected on upload | Error banner shown; photo state unchanged |
| FE-6 | Submit calls the enrol API | POST /user/enroll-face fired with the captured images |
| FE-7 | Backend error surfaces to the user | Error banner displays the returned message |

## Read — Auth & Protected Routes

| # | What is tested | Expected outcome |
|---|----------------|------------------|
| FE-8 | ProtectedRoute blocks unauthenticated access | Redirects to /login when no token present |

## Update — Re-enrolment & access status

| # | What is tested | Expected outcome |
|---|----------------|------------------|
| FE-9 | Re-enrolment is available via Settings (own Face ID) | Settings shows "Re-enroll My Face ID", opening the enrolment flow |
| FE-10 | User Management has NO per-row Face ID button | No "Face ID" action on user rows; re-enrol lives in Settings (FM-targeted enrol uses targetUserId where supported) |
| FE-11 | Manual upload mode works during re-enrolment | Selecting an image file populates the matching angle photo |
| FE-12 | Auto webcam mode advances stages | Webcam capture advances front → left → right |
| FE-13 | New face vector overwrites old vector | POST /user/enroll-face called (overwrites the existing vector); success surfaces to the user |
| FE-14 | Security review status update (FM) | Choosing a status + saving calls PATCH /api/security/logs/:id/review |

## Delete — User Removal

| # | What is tested | Expected outcome |
|---|----------------|------------------|
| FE-15 | Delete User button visible to Facility Manager only | Button shown when logged-in role is FM; hidden for regular users |
| FE-16 | Delete confirmation dialog shown | Clicking Delete opens a confirmation modal before proceeding |
| FE-17 | User removed from table after delete | On confirm, DELETE /user/:id called; row disappears from the user table |
| FE-18 | Deleted user cannot login | Attempting login with deleted credentials returns an error; redirected to /login |
