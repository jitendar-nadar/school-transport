# Test case execution

Automated checks call the rules directly. They do not open the browser, sign in, or write to MongoDB. The console checks at the end are done by hand in the admin screens.

## 1. Prepare

1. Open a terminal in the project folder.
2. Run `npm install` once, so `tsx` and the app dependencies are present.
3. For the automated suite, leave the database and the dev server alone. Those tests do not use them.
4. For the console checks, copy `.env.example` to `.env.local`, set `MONGODB_URI`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET`, then run `npm run seed` and `npm run dev`.
5. Open `http://localhost:3000`. The seeded password is `ChangeMe123!`.

| Account | Email | Use |
| --- | --- | --- |
| Platform admin | `admin@schooltransport.local` | Schools, companies, fleets, and the screens below |
| School admin | `schooladmin@abc.school` | One school, with no school dropdown |

Stop as soon as an error message appears. Do not save a company, employee, truck, place, trip, or student created only to see an error.

## 2. Run the automated suite

1. In the project folder, run `npm test`.
2. Wait until the run finishes. A passing run reports 33 tests, 0 failed.
3. If a test fails, the report names the file and the sentence under that test. Fix the rule or the test, then run `npm test` again.
4. Optional checks, separate from this suite: `npm run typecheck` and `npm run lint`.

`npm test` runs these files:

- `src/utils/geo.test.ts`
- `src/lib/validation/messages.test.ts`
- `src/modules/trips/state.test.ts`
- `src/modules/companies/attendance-rules.test.ts`
- `src/modules/transport/tracking-rules.test.ts`

## 3. Automated cases

Each case is one `it` block. Execute it by running `npm test`. The expected result is that the block passes.

### Form errors and passwords

File: `src/lib/validation/messages.test.ts`

| Case | What is submitted | Expected result |
| --- | --- | --- |
| Zod field sentences | An invalid email, a name shorter than 2 characters, a missing phone, a bad school id, a bad role, a route code in the wrong shape, and “Enter the tracker IMEI.” | The sentences name the field: “Email must be a valid email address.”, “Name must be at least 2 characters.”, “Phone is required.”, “School is not valid.”, “Role is not a valid choice.”, “Route code is not in the expected format.”, “Enter the tracker IMEI.” |
| Nested field error | No details, a repeated “Choose a class.”, and a nested “Confirm the pin before saving the place.” | Empty details produce no fields. The class and pin messages stay as those sentences. |
| Form-level message | “A student with this code already exists” plus a student code longer than 40 characters | Both sentences appear, and the duplicate stays separate from the field. |
| Acceptable password | `ChangeMe123!` | The password is accepted. |
| Rejected password | `short`, `longpassword`, and `12345678` | Each is rejected with “Password must be at least 8 characters and include a letter and a number.” |

### Map distance

File: `src/utils/geo.test.ts`

| Case | Input | Expected result |
| --- | --- | --- |
| Same point | One latitude and longitude, twice | Distance is 0. |
| Short move north | About 0.001 degrees of latitude | Distance is between 100 and 120 meters. |
| Speed | 1000 meters in 10 seconds, and any move in 0 seconds | 360 km/h, and an infinite speed when no time has passed. |
| Stored point | Latitude 19.076, longitude 72.877 | Stored as longitude first. A latitude above 90 or a longitude above 180 is rejected. A missing point reads back as empty. |

### School trip rules

File: `src/modules/trips/state.test.ts`

| Case | Input | Expected result |
| --- | --- | --- |
| Boarding | Not boarded, detected, already boarded, or dropped | The first two can board. Already boarded is a duplicate. Dropped is not a boarding state. |
| Drop-off | Detected but not boarded, boarded, or already dropped | Drop-off requires boarding. A second drop-off is a duplicate. |
| Still on the bus | One boarded student and one dropped student | Only the boarded student remains. |
| Parent messages | Morning pickup and afternoon drop | Boarding, drop-off, and bus-approaching messages differ for the two directions. |
| Duplicate key | Trip id, a blank part, and a student id | The key is `trip:student`. |
| Assisted boarding | No reading, a reading one minute ago at the stop, a reading ten minutes ago, a weak signal, or a point far from the stop | Only the recent, strong, nearby reading is allowed. |

### Office attendance

File: `src/modules/companies/attendance-rules.test.ts`

The sample shift is 09:30 to 18:30, lunch is 13:00 to 14:00, grace is 15 minutes, and the review window is 48 hours. Lunch does not count as personal time.

| Case | Input | Expected result |
| --- | --- | --- |
| Grace period | 15 minutes of silence, then 16 minutes | 15 minutes is not a gap. 16 minutes is. |
| Lunch | 12:50 to 14:10, and a gap that sits entirely inside lunch | Personal time is 20 minutes. The same gap is 80 minutes when lunch counts as personal. A lunch-only gap is not personal. |
| Review | Open, disputed, approved, and rejected gaps | An open gap is deducted only after the deadline. Disputed and approved gaps are not deducted. Rejected is “Personal time”. Approved is “On duty”. |
| Late, early, and working time | Arrival at 09:41 and 09:30, exit at 18:10, and 30 deducted minutes | 09:41 is late. 09:30 is on time. 18:10 is an early exit. 09:30 to 18:30 minus 30 minutes is 510 working minutes. |
| Presence | No check-in, a fresh reading, silence past grace, and a check-out | Not arrived, in office, away, then checked out. |
| Close the day | 18:20, 18:45, the previous day, the next day, and `25:00` | Today stays open at 18:20 and closes at 18:45. Yesterday is already closed. Tomorrow is not. `25:00` is not a time. |

### Truck tracking

File: `src/modules/transport/tracking-rules.test.ts`

| Case | Input | Expected result |
| --- | --- | --- |
| Moving | 42 km/h and a fresh point | Moving. |
| Idle | 0 km/h with the engine on | Idle. |
| Stopped | 0 km/h with the engine off | Stopped. |
| Offline | A fast truck with no point for 4 minutes | Offline. An alert is due only when the tracker has been silent for 3 minutes and has not already been marked offline. |
| Geofence | Enter a depot, stay inside, then leave | Enter once, no repeat while inside, then exit once. |
| Depot stop | Stopped inside a depot for 15 minutes | No long-stop alert. |
| Long stop | Stopped outside a depot for 15 minutes, then longer | One long-stop alert, and no second alert while it remains stopped. |
| Other alerts | 96 km/h, unplugged, and far from a two-point route | Overspeed, unplugged, and route deviation, each once. |
| Route distance | A point on the first stop of a northbound route | Distance to the route is under 30 meters. |
| Trip summary | Idle, then moving, then stopped for more than 2 minutes | Distance is over 2000 meters, idle time is 10 minutes, and there is one stoppage. |
| Retention | No setting, `0`, and `30` | 90 days, 90 days, then 30 days. |
| Report day | `2026-10-16` and a value that is not a date | The day starts at 16 Oct 2026 00:00 India time and lasts 24 hours. A bad date is rejected. |

## 4. Console checks

Run these only after section 1 has the app open. Sign in as the platform admin. Each check fails the save and shows the sentence on the form and under the field.

| Case | Steps | Expected result |
| --- | --- | --- |
| Sign-in | Open `/login`. Leave both fields empty and choose Sign in. Then enter `not-an-email` and any password, and choose Sign in again. | “Email is required.” and “Password is required.” Then “Enter a valid email address.” A wrong password for a real account stays a notice at the top, not a field error. |
| Class | Open Classes, select ABC Public School, leave Class empty, and choose Add class. | “Class is required.” No class is added. |
| Student | Open Students, select ABC Public School, enter a name and a student code, leave Class empty, and choose Add student. | “Choose a class.” No student is added. |
| Company | Open Companies. Choose Create company with every required field empty. Then enter `not-an-email`, a phone shorter than 8 digits, and the password `short`. | Each empty required field says it is required. Then the email, phone, and password each explain what is wrong. The password sentence asks for 8 characters, a letter, and a number. No company is created. |
| Truck | Open Trucks, select a fleet, enter one character as the vehicle number and `12345` as the IMEI, and choose Add truck. | “Vehicle number must be at least 2 characters.” and “Tracker IMEI must be at least 8 characters.” |
| Place | On the same page, enter a place name of at least 2 characters and choose Add place without confirming the pin. | “Confirm the pin before saving the place.” under the map. |
| Trip | Leave Truck, Origin, and Destination empty and choose Plan trip. | “Choose a truck.”, “Origin is required.”, and “Destination is required.” |
| Department | Open Employees, select a company, leave Department empty, and save. | “Department is required.” |
| Shift time | Open Attendance, select a company, set Shift starts to `99:99`, and choose Save rules. | “Use a time like 09:30.” Change the time back before leaving the page. |

## 5. Record the result

1. Copy the last lines of `npm test`. A good run ends with 33 passed and 0 failed.
2. For each console case, record Pass or Fail and the sentence that appeared.
3. Confirm the lists did not gain a company, student, truck, place, or trip from these checks.
