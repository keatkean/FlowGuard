# Felicia Database Schema Notes

## Users

Important facial-recognition fields: `id`, `name`, `email`, `role`, `managerId`, `companyCode`, `codeCreatedAt`, `codeMaxUsage`, `codeCurrentUsage`, `isEnrolled`, `faceVector`, `isActive`, `tokenVersion`, `passwordResetTokenHash`, `passwordResetExpiresAt`, `createdAt`, `updatedAt`.

`faceVector` is Sequelize `ARRAY(FLOAT)` / PostgreSQL `FLOAT[]`, not pgvector. InsightFace generates 512-dimensional facial embeddings and the Python AI service performs similarity matching.

## EvaluationParticipant

`evaluation_participants` contains `id`, nullable unique `userId`, unique `evaluationLabel`, `active`, `assignedAt`, `retiredAt`, `createdAt`, `updatedAt`. `userId` is `ON DELETE SET NULL`. Labels remain reserved after off-boarding.

## SecurityLog

Security logs include `matchedUserId` as a soft reference, `confidence`, `cameraLocation`, `reviewStatus`, `reviewNotes`, `reviewedBy`, `reviewedAt`, `createdAt` and `updatedAt`. Off-boarding anonymises person-facing references and clears matched user references.

## Attendance

Attendance stores IN/OUT transactions with `userId` and `timestamp`. Gate Scanner writes Attendance only after final same-ID motion-liveness confirmation. V-Patrol does not write Attendance.

## Booking

Bookings include `notes`, `arrived_at`, `completed_at` and `deletedAt` as model support. The Sequelize model supports paranoid soft deletion, but the current manual Cancel workflow does not call destroy/delete. Cancellation is documented as status-based logical cancellation with `status = Cancelled`.
