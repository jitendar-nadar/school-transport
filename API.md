# School transport API

Base URL: `http://localhost:3000/api/v1`

The admin console and the future driver and parent apps use this API. The operational walkthrough is in [FLOW.md](FLOW.md).

## Response shape

Success:

```json
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 } }
```

`meta` is present on list endpoints.

Error:

```json
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "Email or password is incorrect.", "details": null } }
```

Ids are 24-character hex strings. The student class field is `className`. Coordinates in request bodies are `latitude` and `longitude`. Stored GeoJSON is `[longitude, latitude]`.

## Authentication

`POST /auth/login` sets httpOnly cookies `st_access` and `st_refresh` for the admin console. Mobile clients send `Authorization: Bearer <accessToken>` and keep the JSON `refreshToken`.

```json
{ "email": "schooladmin@abc.school", "password": "ChangeMe123!" }
```

The email is trimmed and lowercased. A wrong email or password returns `401`. A suspended school returns `403`.

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/login` | Public | Issue access and refresh tokens |
| POST | `/auth/refresh` | Cookie or `{ "refreshToken" }` | Rotate the refresh token and issue a new access token |
| POST | `/auth/logout` | Signed in | Revoke the current refresh session |
| GET | `/auth/me` | Signed in | Current user and school summary |

Access tokens are short-lived. Refresh tokens last 7 days, are stored only as a hash, and reuse of an old refresh token revokes the user’s sessions.

## Tenancy

School-scoped calls use the signed-in user’s `schoolId`. A platform admin must pass `schoolId` in the query string or JSON body. Any other role that sends a different `schoolId` receives `403 TENANT_MISMATCH`.

List queries accept `page`, `limit` (max 100), `search`, `status`, and, for a platform admin, `schoolId`. Some lists also accept `role`, `direction`, or `vehicleType`.

## Schools

Platform admin only for create. School admin can read and update their own school. Status, subscription, and school code changes are limited to the platform admin.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/schools` | List schools. A school admin receives only their school. |
| POST | `/schools` | Create a school |
| GET | `/schools/:id` | One school, including `latitude` and `longitude` |
| PATCH | `/schools/:id` | Update details or status |

Create body:

```json
{
  "name": "ABC Public School",
  "schoolCode": "ABC",
  "address": "Gokul Nagar, Mumbai",
  "contactEmail": "office@abc.school",
  "contactPhone": "9000000002",
  "latitude": 19.076,
  "longitude": 72.877,
  "status": "TRIAL"
}
```

`status` is `TRIAL`, `ACTIVE`, or `SUSPENDED`. The admin console places the pin on a map and sends these coordinates after confirmation.

## People

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/users` | List people. Filter with `role`. |
| POST | `/users` | Create a person |
| GET | `/users/:id` | One person |
| PATCH | `/users/:id` | Update name, phone, role, status, or password |

```json
{
  "name": "Ravi Driver",
  "email": "driver@abc.school",
  "phone": "9000000004",
  "password": "ChangeMe123!",
  "role": "DRIVER"
}
```

Roles: `PLATFORM_ADMIN`, `SCHOOL_ADMIN`, `DRIVER`, `ATTENDANT`, `PARENT`. Passwords need at least 8 characters, one letter, and one number. Only a platform admin can create a platform admin.

## Students

Every student is stored with `schoolId`. A school admin’s calls use their account school. A platform admin sends `schoolId`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/students` | List students. Each row includes `schoolId`, `schoolName`, and `schoolCode`. |
| POST | `/students` | Create a student |
| GET | `/students/:id` | One student, with guardians |
| PATCH | `/students/:id` | Update the student |

```json
{
  "schoolId": "SCHOOL_ID",
  "name": "Aarav Sharma",
  "studentCode": "STU-1025",
  "className": "4",
  "division": "A",
  "parentIds": ["PARENT_USER_ID"],
  "parentConsent": { "granted": true }
}
```

Guardians must be active parents in the same school. Consent gates alerts. The student still appears on rosters when consent is missing.

## BLE cards

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/ble-tags` | List cards |
| POST | `/ble-tags` | Register a card |
| PATCH | `/ble-tags/:id` | Update aliases, battery, or status |
| POST | `/ble-tags/:id/assign` | Body `{ "studentId" }` |
| POST | `/ble-tags/:id/unassign` | Clear the student |

```json
{ "tagIdentifier": "BLE_CARD_1025", "tagType": "CARD" }
```

## Vehicles, stops, routes, assignments

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/vehicles` | List or create |
| PATCH | `/vehicles/:id` | Update |
| GET, POST | `/stops` | List or create |
| PATCH | `/stops/:id` | Update |
| GET, POST | `/routes` | List or create |
| PATCH | `/routes/:id` | Update |
| GET, POST | `/transport-assignments` | List or create |
| PATCH | `/transport-assignments/:id` | Update |

Vehicle:

```json
{
  "vehicleNumber": "BUS-4",
  "vehicleType": "BUS",
  "capacity": 32,
  "driverIds": ["DRIVER_USER_ID"],
  "attendantIds": ["ATTENDANT_USER_ID"]
}
```

`vehicleType` is `BUS` or `VAN`. Status is `ACTIVE`, `MAINTENANCE`, or `INACTIVE`.

Stop. The console sends latitude and longitude from a confirmed map pin.

```json
{
  "name": "Gokul Nagar",
  "address": "Gokul Nagar",
  "latitude": 19.082,
  "longitude": 72.87,
  "geofenceRadiusMeters": 120,
  "stopType": "PICKUP"
}
```

`stopType` is `PICKUP`, `DROP`, or `SCHOOL`.

Route:

```json
{
  "name": "Morning North",
  "routeCode": "AM-01",
  "direction": "PICKUP",
  "vehicleId": "VEHICLE_ID",
  "stops": ["STOP_ID"],
  "scheduledStartTime": "07:10",
  "scheduledEndTime": "08:00"
}
```

`direction` is `PICKUP` or `DROP`. Times are `HH:mm`.

Assignment. A morning route uses `morningRouteId` and `morningStopId`. The ride home uses `afternoonRouteId` and `afternoonStopId`.

```json
{
  "studentId": "STUDENT_ID",
  "morningRouteId": "ROUTE_ID",
  "morningStopId": "STOP_ID",
  "status": "ACTIVE"
}
```

## Driver and trips

Driver and attendant only, and only for a vehicle they are assigned to.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/driver/assignments/today` | Routes this crew can run today |
| GET | `/driver/trips/active` | The caller’s active trip |
| GET | `/trips` | School trip history for the admin console |
| POST | `/trips/start` | Snapshot the roster and start the trip |
| GET | `/trips/:id/roster` | Students on that trip |
| POST | `/trips/:id/location` | GPS ping |
| POST | `/trips/:id/detections/batch` | BLE card reads. Marks `DETECTED` only. |
| POST | `/trips/:id/board` | Confirm boarding |
| POST | `/trips/:id/drop` | Confirm drop-off |
| POST | `/trips/:id/sync` | Replay offline events in `occurredAt` order |
| POST | `/trips/:id/end` | End the trip |

Start:

```json
{ "routeId": "ROUTE_ID", "vehicleId": "VEHICLE_ID" }
```

One active trip per vehicle. A second start returns `409 TRIP_ALREADY_ACTIVE`.

Location:

```json
{
  "latitude": 19.08,
  "longitude": 72.875,
  "accuracyMeters": 12,
  "speedKmh": 28,
  "recordedAt": "2026-10-14T02:00:00.000Z"
}
```

Detection batch:

```json
{
  "detections": [
    {
      "eventId": "evt-1025-1",
      "tagIdentifier": "BLE_CARD_1025",
      "rssi": -70,
      "detectedAt": "2026-10-14T02:05:00.000Z"
    }
  ]
}
```

`eventId` makes the call safe to retry.

Board or drop:

```json
{
  "studentId": "STUDENT_ID",
  "verificationMethod": "MANUAL",
  "latitude": 19.082,
  "longitude": 72.87
}
```

`verificationMethod` is `MANUAL`, `ASSISTED`, or `OVERRIDE`. Override requires `reason` of at least 8 characters. A drop at the wrong stop also requires that reason.

End:

```json
{
  "safetyChecklist": { "inspectedVehicle": true, "confirmedHeadcount": true },
  "unresolvedOverride": { "reason": "Child collected by parent at school gate" }
}
```

`unresolvedOverride` is required only when a student is still boarded. The override does not mark them dropped.

Offline sync body:

```json
{
  "events": [
    {
      "eventId": "evt-offline-1",
      "type": "DETECTION",
      "occurredAt": "2026-10-14T02:05:00.000Z",
      "payload": {}
    }
  ]
}
```

`type` is `DETECTION`, `BOARD`, `DROP`, or `LOCATION`. Events are applied in time order. A repeated `eventId` is ignored.

## Parent

Parent role only. Results are limited to children linked on the student record.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/parent/children` | Own children |
| GET | `/parent/children/:id/status` | Latest transport status |
| GET | `/parent/trips/active` | Active trips carrying their children |
| GET | `/parent/trips/:id` | One of those trips |
| GET | `/parent/notifications` | Alert history |
| POST | `/parent/live-access` | Grant live GPS for one active trip |

```json
{ "tripId": "TRIP_ID", "studentId": "STUDENT_ID" }
```

The response includes a Firebase custom token when Firebase is configured. Ending the trip removes live access.

## Dashboard

Platform admin and school admin.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/dashboard/overview` | Counts for the school |
| GET | `/dashboard/trips/active` | Active trips |
| GET | `/dashboard/trips/:id` | One trip |
| GET | `/dashboard/trips/:id/students` | Roster snapshot |
| GET | `/dashboard/trips/:id/events` | Trip events |
| GET | `/dashboard/vehicles` | Fleet summary |
| GET | `/notifications` | School alert log |
| GET | `/audit-logs` | Audit rows for the school |
| GET | `/health` | Process health |

## Devices and jobs

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/push-devices/register` | Register an FCM token. `platform` is `ANDROID`, `IOS`, or `WEB`. |
| DELETE | `/push-devices/:id` | Remove a device |
| POST | `/internal/notification-jobs/process` | Retry pending pushes and scan stale GPS. Header `x-cron-secret`. |

Push is best effort. Notification rows in MongoDB remain the record of what happened. Without Firebase credentials, trips and alerts are still stored. Live subscribe and push stay unavailable.
