# Security Specification: World Cup 2026 Predictions App

This specification document outlines the security invariants, access models, and potential threat scenarios designed to protect the system.

## 1. Data Invariants

1. **Prediction Deadlines**: No prediction can be created, updated, or deleted if the associated match's start date is in the past. Real-time relative transactions are validated against `request.time`.
2. **Identity Integrity**: Users can only read, write, or delete their own predictions (`/users/{uid}/predictions/{matchId}`).
3. **Admin Exclusivity**: Only authenticated system admins (specifically the owner's e-mail `ignaciozamorano@gmail.com` and authorized admin uids) can write, edit, or delete matches (`/matches/{matchId}`), global notifications, and change report statuses.
4. **Group Code Uniqueness**: User groups are private. Users must read specific groups and submit validation checking their invitation codes.
5. **No Blind Profiles Access**: Users can read public profiles but cannot view or write another user's email or internal configuration details.
6. **No Self-Assigned Admin Role**: When registering, users are created with `role: "user"`. Only the system can make someone an admin, and standard profiles cannot upgrade their own privileges.
7. **Score Validation Immutability**: Points and statistical scores can only be adjusted by administrative loops or derived arithmetic. Users cannot edit their own `points` or stats.

## 2. The "Dirty Dozen" Malicious Payloads

Here are 12 specific payloads intended to breach security boundaries that are blocked by our fortress rules:

1. **Payload 1: Identity Spoofing in Predictions**
   An authenticated user (`uid_A`) attempts to write a prediction in `uid_B`'s collection:
   `write /users/uid_B/predictions/match_1` -> `{"matchId": "match_1", "predictedA": 2, "predictedB": 1}`
   *Expected Outcome*: `PERMISSION_DENIED`

2. **Payload 2: Admin Privilege Self-Assignment**
   A standard user attempts to register or update their own user profile to set their role to "admin":
   `write /users/uid_A` -> `{"id": "uid_A", "displayName": "Attacker", "role": "admin", "email": "attacker@gmail.com"}`
   *Expected Outcome*: `PERMISSION_DENIED`

3. **Payload 3: Score Injection (Points Poisoning)**
   A user tries to set their lifetime points to 500 directly in their public profile document:
   `update /users/uid_A` -> `{"globalPoints": 500, "displayName": "Attacker"}`
   *Expected Outcome*: `PERMISSION_DENIED`

4. **Payload 4: Past-Deadline Prediction Submission**
   A user attempts to create a prediction for a match that started 2 hours ago:
   `write /users/uid_A/predictions/match_1` with `match_1` starting in the past relative to the server time.
   *Expected Outcome*: `PERMISSION_DENIED`

5. **Payload 5: Match Interference (Admin Spoofing)**
   A standard user attempts to create a match in `/matches/match_11` or alter the result of a game:
   `write /matches/match_2` -> `{"resultA": 3, "resultB": 0, "status": "finished"}`
   *Expected Outcome*: `PERMISSION_DENIED`

6. **Payload 6: Group Code Bypass (Shadow Membership)**
   A standard user writes directly to `/groups/group_1/members/uid_A` bypassing the invitation code checking:
   `write /groups/group_1/members/uid_A` -> `{"userId": "uid_A", "displayName": "Wannabe", "points": 1000}`
   *Expected Outcome*: `PERMISSION_DENIED`

7. **Payload 7: Giant String Value Poisoning (Denial of Wallet)**
   A user tries to crash indices or consume database storage by inserting a 2MB payload into a text field in their prediction or report:
   `write /reports/rep_1` -> `{"content": "A" * 1000000, "reporterId": "uid_A"}`
   *Expected Outcome*: `PERMISSION_DENIED`

8. **Payload 8: Prediction Overwriting of Another User's Points**
   A user tries to edit `/users/uid_A/predictions/match_1` to add arbitrary point values directly:
   `update /users/uid_A/predictions/match_1` -> `{"predictedA": 2, "predictedB": 1, "pointsEarned": 100}`
   *Expected Outcome*: `PERMISSION_DENIED`

9. **Payload 9: Email Spoofing Attack**
   An attacker claims the admin email (`ignaciozamorano@gmail.com`) but sets user auth credentials `email_verified: false`:
   `request.auth.token.email = "ignaciozamorano@gmail.com", email_verified = false`
   *Expected Outcome*: `PERMISSION_DENIED`

10. **Payload 10: Deleting Global Notifications**
    A malicious user attempts to purge notifications sent by administrative channels:
    `delete /notifications/not_1`
    *Expected Outcome*: `PERMISSION_DENIED`

11. **Payload 11: Orphan Group Creation**
    A user tries to register a group with an invalid creator id (claims creator ID is `uid_B` instead of `uid_A`):
    `write /groups/group_1` -> `{"creatorId": "uid_B", "name": "Fake Group"}`
    *Expected Outcome*: `PERMISSION_DENIED`

12. **Payload 12: Terminal State Shortcutting**
    A hacker attempts to update their report status from `"resolved"` back to `"pending"` or edit a closed administrator-resolved log.
    *Expected Outcome*: `PERMISSION_DENIED`
