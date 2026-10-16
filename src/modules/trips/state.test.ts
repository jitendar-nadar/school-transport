import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assistedBoardingAllowed,
  boardTransition,
  boardingNotificationType,
  dropNotificationType,
  dropTransition,
  unresolvedOnboard,
} from "./state";

describe("trip state", () => {
  it("allows boarding only before a student is boarded", () => {
    assert.equal(boardTransition("NOT_BOARDED"), "ok");
    assert.equal(boardTransition("DETECTED"), "ok");
    assert.equal(boardTransition("BOARDED"), "duplicate");
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
  });

  it("rejects assisted boarding without a recent detection", () => {
    assert.equal(assistedBoardingAllowed({ occurredAt: new Date(), lastDetectedAt: null, rssi: -60 }), false);
  });
});
