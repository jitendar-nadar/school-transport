# School Transport

Multi-tenant backend and administration console for BLE cards and GPS tracking. One application serves schools, companies, and truck fleets. Each group has its own tables.

The admin console and REST API live in this Next.js app. Driver and parent mobile apps are separate React Native clients that call the same `/api/v1` API.

## Stack

- Next.js App Router route handlers
- MongoDB and Mongoose for permanent records
- JWT access tokens and rotating refresh tokens
- bcrypt password hashes
- Zod request validation
- Firebase Realtime Database for the latest active-trip location only
- Firebase Cloud Messaging for push notifications

Redis, Socket.IO, Firestore, and a separate API server are intentionally not used.

## Run locally

1. Copy `.env.example` to `.env.local` and set `MONGODB_URI`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET`.
2. Install and start:

```bash
npm install
npm run seed
npm run dev
```

3. Open `http://localhost:3000` and sign in as `schooladmin@abc.school` or `admin@schooltransport.local`.

The seed password defaults to `ChangeMe123!`. Change it before any shared deployment.

## Roles

| Role | Access |
| --- | --- |
| Platform admin | Schools, companies, and fleets. School screens use the selected school. Company and fleet screens send their own id. |
| School admin | People, students, classes, BLE cards, gates, vehicles, routes, stops, assignments, trips, tours, alerts |
| Company admin | Their company, its departments, employees, and out-of-office gaps |
| Fleet admin | Their fleet, its trucks, tracker IMEIs, places, and planned truck trips |
| Driver / attendant | Assigned school vehicle, trip start, BLE batches, boarding, drop-off, GPS, offline sync |
| Parent | Own children, trip status, notification history, authorized live location |

School queries use `schoolId`. Company queries use `companyId`. Fleet queries use `fleetId`. A client-supplied tenant id is ignored unless the caller is a platform admin. Company and fleet admins are created with the company or fleet. They are not added on the school People screen.

## Trip safety

1. Starting a trip snapshots the student roster. Later route edits do not change that trip.
2. A BLE detection marks a roster student as `DETECTED`. It never marks them `BOARDED`.
3. Boarding and drop-off require an attendant or driver confirmation (`MANUAL`, `ASSISTED`, or `OVERRIDE`).
4. Assisted boarding needs a recent card detection near the assigned stop.
5. A drop-off at the wrong stop requires an override reason and is audited.
6. Ending a trip with a child still marked onboard returns `CHILD_STILL_ON_BUS` until each child is dropped or a written override is stored. The override does not silently clear the onboard state.
7. Live GPS is written to Firebase at `/activeTrips/{tripId}`. Parents can read it only after `POST /api/v1/parent/live-access` grants `/tripAccess/{tripId}/{uid}`. Ending the trip deletes both nodes.

Security rules are in `firebase/database.rules.json`. Client writes are denied.

## Notifications

Events: `BUS_APPROACHING_PICKUP`, `STUDENT_BOARDING_CONFIRMED`, `BUS_ARRIVED_AT_SCHOOL`, `STUDENT_DROPPED_AT_SCHOOL`, `STUDENT_BOARDING_FOR_HOME`, `BUS_APPROACHING_HOME_STOP`, `STUDENT_DROPPED_AT_HOME`, `STUDENT_NOT_BOARDED`, `STUDENT_WRONG_BUS`, `STUDENT_WRONG_STOP`, `CHILD_STILL_ON_BUS`, `BUS_TRACKING_OFFLINE`.

Repeated events use a deduplication key. Offline events keep the original time and say they were recorded after reconnect. Push is best effort; MongoDB notification history is authoritative.

Retry pending pushes and stale-GPS checks with:

```bash
curl -X POST http://localhost:3000/api/v1/internal/notification-jobs/process -H "x-cron-secret: YOUR_CRON_SECRET"
```

Without Firebase credentials the API still stores trips, detections, and notification records. Live subscribe and push delivery stay unavailable until Firebase is configured.

## Documents

- [FLOW.md](FLOW.md) — school setup and one morning trip, then company attendance and a truck fleet
- [API.md](API.md) — request and response reference for `/api/v1`

## API

Authenticated requests use `Authorization: Bearer <accessToken>` or the admin cookies set by login. The full reference is in [API.md](API.md).

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET|POST /api/v1/schools` and `GET|PATCH /api/v1/schools/:id`
- `GET|POST /api/v1/users` and `GET|PATCH /api/v1/users/:id`
- `GET|POST /api/v1/students` and `GET|PATCH /api/v1/students/:id`
- `GET|POST /api/v1/ble-tags`, `PATCH /api/v1/ble-tags/:id`, `POST /api/v1/ble-tags/:id/assign`, `POST /api/v1/ble-tags/:id/unassign`
- `GET|POST /api/v1/vehicles` and `PATCH /api/v1/vehicles/:id`
- `GET|POST /api/v1/routes` and `PATCH /api/v1/routes/:id`
- `GET|POST /api/v1/stops` and `PATCH /api/v1/stops/:id`
- `GET|POST /api/v1/transport-assignments` and `PATCH /api/v1/transport-assignments/:id`
- `GET /api/v1/driver/assignments/today`
- `GET /api/v1/driver/trips/active`
- `POST /api/v1/trips/start`
- `GET /api/v1/trips/:id/roster`
- `POST /api/v1/trips/:id/location`
- `POST /api/v1/trips/:id/detections/batch`
- `POST /api/v1/trips/:id/board`
- `POST /api/v1/trips/:id/drop`
- `POST /api/v1/trips/:id/sync`
- `POST /api/v1/trips/:id/end`
- `GET /api/v1/parent/children`
- `GET /api/v1/parent/children/:id/status`
- `GET /api/v1/parent/trips/active`
- `GET /api/v1/parent/trips/:id`
- `GET /api/v1/parent/notifications`
- `POST /api/v1/parent/live-access`
- `POST /api/v1/push-devices/register`
- `DELETE /api/v1/push-devices/:id`
- `GET|POST /api/v1/classes`
- `GET|POST /api/v1/gates`
- `GET|POST /api/v1/tours` and `PUT /api/v1/tours` for a headcount
- `GET|POST /api/v1/companies` and `PATCH /api/v1/companies/:id`
- `GET /api/v1/companies/summary`
- `GET|POST /api/v1/departments`
- `GET|POST /api/v1/employees`
- `GET|POST /api/v1/attendance-gaps`
- `GET /api/v1/attendance/board`, `PATCH /api/v1/attendance/policy`, `POST /api/v1/attendance/detections`
- `GET /api/v1/attendance/me`, `POST /api/v1/attendance/field`, `GET /api/v1/attendance/report`
- `GET|POST /api/v1/fleets` and `PATCH /api/v1/fleets/:id`
- `GET /api/v1/fleets/summary`
- `GET|POST /api/v1/trucks`
- `GET|POST /api/v1/fleet-geofences`
- `GET|POST /api/v1/fleet-trips`
- `GET /api/v1/dashboard/overview`
- `GET /api/v1/dashboard/trips/active`
- `GET /api/v1/dashboard/trips/:id`
- `GET /api/v1/dashboard/trips/:id/students`
- `GET /api/v1/dashboard/trips/:id/events`
- `GET /api/v1/dashboard/vehicles`

List responses use `{ success, data, meta }`. Errors use `{ success: false, error: { code, message, details } }`.

The student class is stored as `className` so it stays valid in TypeScript.

## Checks

```bash
npm test
npm run typecheck
npm run lint
```

Step-by-step execution for the automated suite and the console checks is in [TEST.md](TEST.md).
