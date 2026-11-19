import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  directionFromPair,
  duringSchoolHours,
  isDebounced,
  isEarlyExit,
  pastCutOff,
  policyFrom,
  presenceAfter,
  readingTime,
  schoolDay,
  withinPairWindow,
} from "@/modules/gates/gate-rules";

describe("gate-rules", () => {
  it("detects entry and exit from node order", () => {
    const outsideFirst = { side: "OUTSIDE" as const, heardAt: new Date("2026-11-16T02:20:00.000Z"), rssi: -70 };
    const insideLater = { side: "INSIDE" as const, heardAt: new Date("2026-11-16T02:20:02.000Z"), rssi: -65 };
    assert.equal(directionFromPair(outsideFirst, insideLater), "ENTRY");
    const insideFirst = { side: "INSIDE" as const, heardAt: new Date("2026-11-16T02:20:00.000Z"), rssi: -65 };
    const outsideLater = { side: "OUTSIDE" as const, heardAt: new Date("2026-11-16T02:20:02.000Z"), rssi: -70 };
    assert.equal(directionFromPair(insideFirst, outsideLater), "EXIT");
  });

  it("uses stronger inside RSSI when times match", () => {
    const at = new Date("2026-11-16T02:20:00.000Z");
    assert.equal(
      directionFromPair(
        { side: "OUTSIDE", heardAt: at, rssi: -80 },
        { side: "INSIDE", heardAt: at, rssi: -60 },
      ),
      "ENTRY",
    );
  });

  it("checks pair window, debounce, and cut-off", () => {
    const a = new Date("2026-11-16T02:20:00.000Z");
    const b = new Date("2026-11-16T02:20:40.000Z");
    assert.equal(withinPairWindow(a, b, 45), true);
    assert.equal(withinPairWindow(a, b, 30), false);
    assert.equal(isDebounced(a, new Date(a.getTime() + 60_000), 3), true);
    assert.equal(isDebounced(a, new Date(a.getTime() + 4 * 60_000), 3), false);
    // 08:30 IST = 03:00 UTC
    assert.equal(pastCutOff(new Date("2026-11-16T03:00:00.000Z"), "08:30"), true);
    assert.equal(pastCutOff(new Date("2026-11-16T02:59:00.000Z"), "08:30"), false);
  });

  it("flags early exits during school hours after an entry", () => {
    const enteredAt = new Date("2026-11-16T02:20:00.000Z");
    const midMorning = new Date("2026-11-16T05:00:00.000Z"); // 10:30 IST
    assert.equal(
      isEarlyExit({
        direction: "EXIT",
        occurredAt: midMorning,
        enteredAt,
        cutOffTime: "08:30",
        schoolEndTime: "14:30",
      }),
      true,
    );
    assert.equal(duringSchoolHours(midMorning, "08:30", "14:30"), true);
    assert.equal(presenceAfter("ENTRY", true), "IN_CAMPUS");
    assert.equal(presenceAfter("EXIT", true), "OUT");
    assert.equal(presenceAfter(null, false), "NOT_ARRIVED");
  });

  it("normalises policy and rejects far-future readings", () => {
    const policy = policyFrom({ debounceMinutes: 99, pairWindowSeconds: 1 });
    assert.equal(policy.debounceMinutes, 60);
    assert.equal(policy.pairWindowSeconds, 5);
    assert.equal(schoolDay(new Date("2026-11-16T02:00:00.000Z")), "2026-11-16");
    assert.equal(readingTime(new Date(Date.now() + 5 * 60_000)), null);
    assert.ok(readingTime(new Date()));
  });
});
