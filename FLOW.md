# Operations flow

Three paths in one console. School, company, and transport each keep their own records. A student is never an employee, and a school-bus trip is never a truck trip.

Seed data covers the school path. Company and fleet accounts are created in the console. Password for every demo account, and the password you should use when creating a company or fleet admin: `ChangeMe123!`

| Who | Email | What they do |
| --- | --- | --- |
| School admin | `schooladmin@abc.school` | Runs one school. Students are saved to that school with no school dropdown. |
| Platform admin | `admin@schooltransport.local` | Adds schools, companies, and fleets, then works inside the one they select. |
| Driver | `driver@abc.school` | Starts the school-bus trip and sends GPS through the mobile API. |
| Attendant | `attendant@abc.school` | Confirms boarding and drop-off through the mobile API. |
| Parent | `parent@abc.school` | Sees their child, alerts, and live location through the mobile API. |
| Company admin | Created with the company | Runs one company: departments, employees, and out-of-office gaps. |
| Fleet admin | Created with the fleet | Runs one fleet: trucks and trackers, places, trips, the live map, and daily reports. |

The admin console is in this app. Driver and parent screens are not. They call the same `/api/v1` API. Request and response details are in [API.md](API.md).

Atlas website login is separate from this console. If sign-in says the database cannot be reached, open Atlas **Network Access** and allow this computer’s current IP.

---

## 1. Sign in

1. Open `http://localhost:3000/login`.
2. Click **School admin**, then **Sign in**.
3. You land on **Operations** for ABC Public School: 1 student, 1 vehicle, 0 active trips.

A platform admin uses **Platform admin**, then picks **ABC Public School** in the header. Later screens use that school. A school admin has no school selector. Their account is already mapped to ABC Public School.

## 2. Add a school

Only a platform admin can add a school. Open **Schools**.

1. Enter the name, school code, address, contact email, and phone.
2. Drag the map pin to the school, or click the map.
3. Click **Confirm location**. **Create school** stays off until the pin is confirmed.
4. The new school appears in the list. Change its status there between `TRIAL`, `ACTIVE`, and `SUSPENDED`.

A school admin can open **Schools** and see their own school. They cannot create another one.

## 3. Set up one school

Walk the sidebar in this order. Each step depends on the one before it. A platform admin must have a school selected in the header first.

1. **People** — parents, drivers, attendants, and school admins for that school.
2. **Classes** — class and division for the student form. This list belongs to the school. It is not a company department.
3. **Students** — each student is stored with that school’s `schoolId`.
   - School admin: there is no school dropdown. The student is saved to their school.
   - Platform admin: choose the school in the student form. **Add student** stays off until a school is selected. The list and guardians switch to that school.
4. **BLE cards** — assign a card to a student. Change the student or the status on any card, including an inactive one. A card read later identifies that student only while the card is active. Gate and tour checks use this same card.
5. **Gates** — name each entrance, such as Main gate. A later gate read uses two nodes: outside, then inside, means entry. The console stores the gate. It does not decide direction yet.
6. **Vehicles** — bus or van, with the driver and attendant who may run it.
7. **Student mapping** — choose that vehicle and the students who ride it. A student is listed on one vehicle.
8. **Stops** — place the stop with the map pin, then confirm it. Do not type latitude and longitude.
9. **Routes** — direction `PICKUP` or `DROP`, vehicle, ordered stops, and `HH:mm` times.
10. **Assignments** — which student rides which route and stop. This is what puts them on a trip roster.
11. **Trips** — empty until a driver starts one. These are daily school-bus trips.
12. **Tours** — a picnic or outing on a date, then a headcount. A tour is not a daily bus trip.
13. **Alerts** — empty until a trip event creates a notification.

Seeded records for ABC Public School:

| Record | Value |
| --- | --- |
| Student | Aarav Sharma, `STU-1025`, class 4-A, consent granted |
| Card | `BLE_CARD_1025` |
| Vehicle | `BUS-4`, driver Ravi, attendant Meera |
| Stop | Gokul Nagar, pickup, 120 m |
| Route | Morning North, `AM-01`, pickup, 07:10–08:00 |

## 4. Morning trip

Only the driver or attendant assigned to `BUS-4` can run this. The admin watches it. The admin does not start it.

1. Driver signs in as `driver@abc.school` and loads today’s assignment: Morning North / `BUS-4`.
2. Driver starts the trip. The API snapshots Aarav onto the roster at Gokul Nagar. Later route edits do not change this trip. `BUS-4` cannot start a second trip while this one is active.
3. Driver sends GPS. The latest point is kept for the live location. A point is skipped when the bus has barely moved, and a point faster than 180 km/h is rejected. MongoDB history is sampled, not every ping.
4. Near Gokul Nagar, the parent can get **bus approaching pickup**.
5. The bus reads `BLE_CARD_1025`. The roster becomes **detected**. A card read never means boarded.
6. Attendant confirms boarding as `MANUAL`, `ASSISTED`, or `OVERRIDE`.
   - Assisted is allowed only when that card was seen recently, with a strong enough signal, near Gokul Nagar.
   - Override needs a written reason and is audited.
7. Roster becomes **boarded**. Parent gets **boarding confirmed**. Overview shows 1 on board.
8. Bus reaches school. Parent gets **bus arrived at school**.
9. Attendant confirms the school drop. Roster becomes **dropped**. Parent gets **dropped at school**.
10. Driver ends the trip. End is refused with `CHILD_STILL_ON_BUS` while Aarav is still boarded. A written override can end the trip, but it does not clear the onboard state, and it sends **child still on bus**.
11. Ending the trip removes the live location. **Trips** shows the finished trip. **Alerts** shows the notification history.

## 5. What the admin checks during the trip

1. **Overview** — active trips becomes 1, on board becomes 1 after boarding, then 0 after drop-off.
2. **Trips** — open the active trip. The page refreshes about every 8 seconds.
3. On the trip page, confirm Aarav’s state (assigned, then detected, boarded, and dropped), the event list, and that the bus location is updating.
4. **Alerts** — approaching, boarded, arrived, and dropped rows for Aarav. Push needs Firebase. The rows on this screen are stored either way.

## 6. What the parent sees

1. Parent signs in as `parent@abc.school` and sees only Aarav.
2. While the trip is active, status follows the roster.
3. Live location is granted only for this trip, and only for a parent linked to a child on that trip. Ending the trip removes that access.
4. Notification history matches **Alerts**, limited to Aarav. Consent must stay granted. Without it Aarav still rides, but those alerts are not sent.

## 7. Ride home

Repeat section 4 with an afternoon route (`DROP`) and an afternoon assignment. The states are the same. The alerts are boarding for home, approaching the home stop, and dropped at home.

The seed has the morning route only. Add the return route, its stops, and Aarav’s afternoon assignment before that second trip can start.

## 8. Safety checks

1. End the trip while Aarav is still boarded. Expect `CHILD_STILL_ON_BUS` and no ended trip.
2. Drop Aarav at a stop that is not Gokul Nagar without an override reason. Expect a rejection. With a reason, the drop is stored and audited as the wrong stop.
3. Send a card read and look at the roster before anyone confirms. The state stays **detected**, not boarded.

## 9. School gates, classes, and tours

Stay signed in as the school admin, or as the platform admin with **ABC Public School** selected. The header school selector stays on school screens and is hidden on company and fleet screens.

1. Open **Classes**. Add class `4` and division `A`. The row is stored on the school.
2. Open **Gates**. Add `Main gate`.
3. Open **Tours**. Add a tour name and date, for example `Science museum` on tomorrow’s date.
4. On the same page, choose that tour, enter how many students are present, and an optional note. Click **Record headcount**.
5. The headcount list shows the tour name, the count, and the note. A missing student on a tour is a later alert. This screen only stores the count you enter.

## 10. Company attendance

Company records never appear on **Students**, **Vehicles**, or **Trips**.

1. Sign in as the platform admin. Open **Companies**. The school selector is hidden on this screen.
2. Enter the company name, code, address, contact email, and phone.
3. Enter the company admin’s name, email, and password. The password needs at least 8 characters, a letter, and a number.
4. Click **Create company**. The company appears as `TRIAL`, and that admin can sign in. If the admin email or company code is already used, nothing is saved.
5. Change status in the list to `ACTIVE` or `SUSPENDED`. A suspended company cannot sign in.
6. Open **Employees** and select that company.
7. Add a department first. The employee form cannot be saved without one.
8. Add an employee: department, employee code, and name. Email and phone are optional. The employee is stored on the company, not as a student.
9. Open **Out of office**, select the company, and log a gap for that employee. The end time must be after the start time. The row stays `OPEN` until the review window passes. Lunch inside the company lunch hours is not personal time unless the rules say so.
10. Sign out and sign in with the company admin email. **Overview** shows department, employee, and open-gap counts for that company only. **Companies** lists only their company. **Employees** has no company dropdown.

## 11. Truck fleet

Fleet records never appear on school buses or company employees. A truck uses a GPS tracker with a SIM card. It does not use a BLE card. The school-bus GPS path is a different feed: a driver sends location for an active school trip. A truck tracker posts on its own, by IMEI, whether or not a trip is open.

### Set up the fleet

1. Sign in as the platform admin. Open **Fleets**.
2. Enter the fleet name, code, address, contact email, phone, and the fleet admin’s name, email, and password.
3. Click **Create fleet**. The fleet appears as `TRIAL`. A duplicate fleet code or admin email saves nothing.
4. Set status to `ACTIVE` or `SUSPENDED`. A suspended fleet cannot sign in.
5. Open **Trucks** and select that fleet. A fleet admin lands here with no fleet dropdown.
6. Add the vehicle number, the tracker IMEI, and the tracker standard.
   - **Standard GPS** is a normal tracker.
   - **AIS-140** records that this vehicle needs an AIS-140-certified device. The console stores that choice. It does not certify the hardware.
   - If the IMEI is already used, the truck is not kept.
7. Add a place. Choose `Depot` or `Customer site`, enter the name and radius, and set the pin the same way as a school stop: search or type the address, then **Confirm location**. **Add place** stays off until the pin is confirmed. A place without a pin cannot raise a geofence alert.
8. Plan a trip: choose the truck, origin, and destination. The planned route is optional. Search each stop by address or landmark, in travel order, and choose the match. The console stores the map point for that address. A saved place can be added the same way. Two or more stops are the path the truck is expected to follow. The trip is stored as `PLANNED`. It does not start a school-bus trip, and it does not put students on a roster.
9. Click **Start** on that row when the truck should be on the job. Status becomes `ACTIVE`, and only one trip per truck can be active. Click **Complete** when it is done. Status becomes `COMPLETED` and the end time is stored.
10. Sign in as the fleet admin. **Overview** shows truck and active-trip counts for that fleet only.

### What the tracker sends

The tracker does not sign in. It posts to `POST /api/v1/trackers/ingest` with the header `x-tracker-key`. The value is `TRACKER_INGEST_SECRET` on the server. A missing or wrong key is rejected.

One request can carry up to 2000 points. Each point has latitude, longitude, speed in km/h, ignition on or off, the time the tracker recorded it, and whether the device was unplugged. Heading is optional.

Store and forward works like this:

1. When the truck has no network, the tracker keeps points on the device.
2. When the network returns, it uploads the whole buffer, including old timestamps.
3. The server sorts them by the time they were recorded and keeps them for playback.
4. A point already stored for that tracker and time is skipped, so a retry does not double the distance.
5. A point more than two minutes in the future is skipped. A point older than the retention window is skipped.
6. The truck’s latest fix moves forward only. An older buffered point is kept for the report, but it does not pull the live pin backwards.
7. Hearing from the tracker at all marks it online again, even when the batch is old.

Points are kept for 90 days unless `FLEET_POINT_RETENTION_DAYS` says otherwise. The same cleanup runs when a batch arrives and on the existing scheduled job.

### Live map

Open **Live map**. It refreshes every few seconds. Each truck is one of:

| Status | Meaning |
| --- | --- |
| Moving | Latest speed is 5 km/h or more, and a point arrived in the last 3 minutes. |
| Idle | Engine is on, speed is under 5 km/h, and a point arrived in the last 3 minutes. |
| Stopped | Engine is off, or ignition was not sent, and speed is under 5 km/h. |
| Offline | Nothing has been received for 3 minutes, or the truck has never reported. |

The pin shows the vehicle number, status, speed, and ignition. The table under the map is the same list.

### Alerts

Alerts are written as the points are applied, in recorded order. The list under the live map shows the latest ones. Each kind is raised once until the condition clears.

| Alert | When |
| --- | --- |
| Geofence entry | The truck crosses into a depot or customer site. |
| Geofence exit | The truck leaves that place. |
| Long stoppage | Stopped for 15 minutes outside a depot. A stop inside a depot does not alert. |
| Over-speed | Speed goes over 80 km/h. |
| Route deviation | An active trip has a planned route of at least two points, and the truck is more than 500 m off that line. It clears once the truck is back within 300 m. |
| Device unplugged | A point says tracker power was disconnected. |
| Offline | No upload for 3 minutes. The next upload clears it. |

### Reports

Open **Reports** and pick a date. The day is India time.

1. Each truck shows distance in km, idle minutes, and how many stoppages were recorded.
2. Idle time is the engine-on time below 5 km/h. A gap longer than 30 minutes is treated as offline and is not added to distance or idle.
3. A stoppage is a stopped stretch of at least 2 minutes.
4. Click **Play route**. The map draws that day’s points in order.

A tracker in the cab that reads a driver BLE card is not part of this flow. School cards stay on the school path.

## 12. Company attendance day

Stay signed in as the company admin. Open **Attendance**.

1. Set the grace period, shift, lunch, and review window. Write the monitoring policy. Save the rules. Attendance readings are refused until this policy is saved.
2. Add office gateways for the floor, meeting rooms, cafeteria, and corridors you have actually surveyed. A dead zone will look like personal time.
3. Open **Cards and consent**. Pick the employee (or click **Edit** in the list), assign a card id, mark office or field, and tick written consent. Optionally set a login email and password so the employee can open **My day**.
4. Back on **Attendance**, record a detection: gateway, card id, and time. The first reading of the day is check-in and the employee shows **In office**.
5. Record another reading more than the grace period later. The time from the last reading to this one is an out-of-office gap, status **In review**. It is not personal time yet.
6. The employee signs in, opens **My day**, and disputes that gap with a reason. It becomes **Disputed** and is still not deducted.
7. The company admin approves or rejects it. Approved time stays on duty. Rejected time becomes personal time. An open gap that nobody reviews becomes personal time only after the review window.
8. After the shift end plus the grace period, the last card reading is check-out. **Load report** shows working hours, personal hours, pending review, late arrivals, and early exits. **Download CSV** is the payroll export.
9. Field staff, when phone check-in is allowed and their work mode is Field, check in and out from **My day** with latitude and longitude. That path does not use a gateway.
