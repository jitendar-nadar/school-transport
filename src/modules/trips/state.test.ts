import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approachNotificationType,
  assistedBoardingAllowed,
  boardTransition,
  boardingNotificationType,
  deduplicationKey,
  dropNotificationType,
  dropTransition,
  unresolvedOnboard,
} from "./state";

describe("trip state", () => {
  it("allows boarding only before a student is boarded", () => {
    assert.equal(boardTransition("NOT_BOARDED"), "ok");
    assert.equal(boardTransition("DETECTED"), "ok");
    assert.equal(boardTransition("BOARDED"), "duplicate");
    assert.equal(boardTransition("DROPPED"), "invalid");
  });

  it("requires boarding before drop-off", () => {
    assert.equal(dropTransition("DETECTED", "NOT_DROPPED"), "not_boarded");
    assert.equal(dropTransition("BOARDED", "NOT_DROPPED"), "ok");
    assert.equal(dropTransition("BOARDED", "DROPPED"), "duplicate");
  });

  it("keeps unresolved onboard students visible", () => {
    const unresolved = unresolvedOnboard([
      { boardingStatus: "BOARDED", dropStatus: "NOT_DROPPED" },
      { boardingStatus: "BOARDED", dropStatus: "DROPPED" },
    ]);
    assert.equal(unresolved.length, 1);
  });

  it("uses different parent messages for morning and afternoon", () => {
    assert.equal(boardingNotificationType("PICKUP"), "STUDENT_BOARDING_CONFIRMED");
    assert.equal(boardingNotificationType("DROP"), "STUDENT_BOARDING_FOR_HOME");
    assert.equal(dropNotificationType("PICKUP"), "STUDENT_DROPPED_AT_SCHOOL");
    assert.equal(dropNotificationType("DROP"), "STUDENT_DROPPED_AT_HOME");
    assert.equal(approachNotificationType("PICKUP"), "BUS_APPROACHING_PICKUP");
    assert.equal(approachNotificationType("DROP"), "BUS_APPROACHING_HOME_STOP");
  });

  it("builds one key from the parts that are present", () => {
    assert.equal(deduplicationKey(["trip", "", null, "student"]), "trip:student");
  });

  it("allows assisted boarding only for a recent, strong, nearby detection", () => {
    const occurredAt = new Date("2026-10-16T04:00:00.000Z");
    const recent = new Date("2026-10-16T03:59:00.000Z");
    assert.equal(assistedBoardingAllowed({ occurredAt, lastDetectedAt: null, rssi: -60 }), false);
    assert.equal(assistedBoardingAllowed({
      occurredAt,
      lastDetectedAt: recent,
      rssi: -70,
      distanceToStopMeters: 40,
      stopRadiusMeters: 30,
    }), true);
    assert.equal(assistedBoardingAllowed({
      occurredAt,
      lastDetectedAt: new Date("2026-10-16T03:50:00.000Z"),
      rssi: -70,
    }), false);
    assert.equal(assistedBoardingAllowed({ occurredAt, lastDetectedAt: recent, rssi: -90 }), false);
    assert.equal(assistedBoardingAllowed({
      occurredAt,
      lastDetectedAt: recent,
      distanceToStopMeters: 200,
      stopRadiusMeters: 30,
    }), false);
  });
});
