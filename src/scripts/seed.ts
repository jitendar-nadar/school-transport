import { existsSync, readFileSync } from "fs";
import { hashPassword } from "../lib/auth/tokens";
import { connectDb } from "../lib/mongodb/connection";
import { BleTag } from "../models/ble-tag";
import { Assignment, Route, Stop, Vehicle } from "../models/fleet";
import { School } from "../models/school";
import { Student } from "../models/student";
import { User } from "../models/user";

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function upsertUser(input: {
  email: string;
  name: string;
  phone: string;
  role: string;
  schoolId?: unknown;
  password: string;
}) {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    existing.passwordHash = await hashPassword(input.password);
    existing.status = "ACTIVE";
    existing.name = input.name;
    existing.role = input.role;
    if (input.schoolId) existing.schoolId = input.schoolId;
    await existing.save();
    return existing;
  }
  return User.create({
    ...input,
    schoolId: input.schoolId ?? null,
    passwordHash: await hashPassword(input.password),
    status: "ACTIVE",
    refreshTokenSessions: [],
  });
}

async function main() {
  loadEnv(".env.local");
  loadEnv(".env");
  const password = process.env.SEED_PASSWORD || "ChangeMe123!";
  await connectDb();

  const platform = await upsertUser({
    email: "admin@schooltransport.local",
    name: "Platform Admin",
    phone: "9000000001",
    role: "PLATFORM_ADMIN",
    password,
  });

  let school = await School.findOne({ schoolCode: "ABC" });
  if (!school) {
    school = await School.create({
      name: "ABC Public School",
      schoolCode: "ABC",
      address: "Gokul Nagar, Mumbai",
      location: { type: "Point", coordinates: [72.877, 19.076] },
      contactEmail: "office@abc.school",
      contactPhone: "9000000002",
      status: "ACTIVE",
    });
  }

  const schoolAdmin = await upsertUser({
    email: "schooladmin@abc.school",
    name: "School Admin",
    phone: "9000000003",
    role: "SCHOOL_ADMIN",
    schoolId: school._id,
    password,
  });
  const driver = await upsertUser({
    email: "driver@abc.school",
    name: "Ravi Driver",
    phone: "9000000004",
    role: "DRIVER",
    schoolId: school._id,
    password,
  });
  const attendant = await upsertUser({
    email: "attendant@abc.school",
    name: "Meera Attendant",
    phone: "9000000005",
    role: "ATTENDANT",
    schoolId: school._id,
    password,
  });
  const parent = await upsertUser({
    email: "parent@abc.school",
    name: "Aarav Parent",
    phone: "9000000006",
    role: "PARENT",
    schoolId: school._id,
    password,
  });

  let vehicle = await Vehicle.findOne({ schoolId: school._id, vehicleNumber: "BUS-4" });
  if (!vehicle) {
    vehicle = await Vehicle.create({
      schoolId: school._id,
      vehicleNumber: "BUS-4",
      vehicleType: "BUS",
      capacity: 32,
      driverIds: [driver._id],
      attendantIds: [attendant._id],
      status: "ACTIVE",
    });
  }

  let stop = await Stop.findOne({ schoolId: school._id, name: "Gokul Nagar" });
  if (!stop) {
    stop = await Stop.create({
      schoolId: school._id,
      name: "Gokul Nagar",
      address: "Gokul Nagar",
      location: { type: "Point", coordinates: [72.87, 19.082] },
      geofenceRadiusMeters: 120,
      stopType: "PICKUP",
    });
  }

  let route = await Route.findOne({ schoolId: school._id, routeCode: "AM-01" });
  if (!route) {
    route = await Route.create({
      schoolId: school._id,
      name: "Morning North",
      routeCode: "AM-01",
      direction: "PICKUP",
      vehicleId: vehicle._id,
      stops: [stop._id],
      scheduledStartTime: "07:10",
      scheduledEndTime: "08:00",
      status: "ACTIVE",
    });
  }

  let student = await Student.findOne({ schoolId: school._id, studentCode: "STU-1025" });
  if (!student) {
    student = await Student.create({
      schoolId: school._id,
      studentCode: "STU-1025",
      name: "Aarav Sharma",
      className: "4",
      division: "A",
      parentIds: [parent._id],
      parentConsent: { granted: true, grantedAt: new Date(), notes: "Seed consent" },
      status: "ACTIVE",
    });
  }

  let tag = await BleTag.findOne({ tagIdentifier: "BLE_CARD_1025" });
  if (!tag) {
    tag = await BleTag.create({
      schoolId: school._id,
      tagIdentifier: "BLE_CARD_1025",
      studentId: student._id,
      tagType: "CARD",
      status: "ACTIVE",
      assignedAt: new Date(),
    });
    student.bleTagId = tag._id;
    await student.save();
  }

  const assignment = await Assignment.findOne({ studentId: student._id, status: "ACTIVE" });
  if (!assignment) {
    await Assignment.create({
      schoolId: school._id,
      studentId: student._id,
      morningRouteId: route._id,
      morningStopId: stop._id,
      status: "ACTIVE",
    });
  }

  console.log("Seed complete. Password for every demo account:", password);
  console.log("Platform admin:", platform.email);
  console.log("School admin:", schoolAdmin.email);
  console.log("Driver:", driver.email);
  console.log("Attendant:", attendant.email);
  console.log("Parent:", parent.email);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
