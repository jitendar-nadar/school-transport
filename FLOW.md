# School transport flow

One path, in order. Seed data is already in place, so you can follow it on `http://localhost:3000`.

Password for every demo account: `ChangeMe123!`

| Who | Email | What they do |
| --- | --- | --- |
| School admin | `schooladmin@abc.school` | Runs one school. Students are saved to that school with no school dropdown. |
| Platform admin | `admin@schooltransport.local` | Adds schools, then picks a school before working on its people and students. |
| Driver | `driver@abc.school` | Starts the trip and sends GPS through the mobile API. |
| Attendant | `attendant@abc.school` | Confirms boarding and drop-off through the mobile API. |
| Parent | `parent@abc.school` | Sees their child, alerts, and live location through the mobile API. |

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
2. **Students** — each student is stored with that school’s `schoolId`.
   - School admin: there is no school dropdown. The student is saved to their school.
   - Platform admin: choose the school in the student form. **Add student** stays off until a school is selected. The list and guardians switch to that school.
3. **BLE cards** — assign a card to a student. A card read later identifies that student.
4. **Vehicles** — bus or van, with the driver and attendant who may run it.
5. **Stops** — place the stop with the map pin, then confirm it. Do not type latitude and longitude.
6. **Routes** — direction `PICKUP` or `DROP`, vehicle, ordered stops, and `HH:mm` times.
7. **Assignments** — which student rides which route and stop. This is what puts them on a trip roster.
8. **Trips** — empty until a driver starts one.
9. **Alerts** — empty until a trip event creates a notification.

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
