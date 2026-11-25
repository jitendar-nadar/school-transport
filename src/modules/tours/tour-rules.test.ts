import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyTourScan,
  nextTourStatuses,
  parentUpdateType,
  watchTimedOut,
} from "@/modules/tours/tour-rules";

describe("tour-rules", () => {
  it("classifies present, missing, and wrong-bus students from scans", () => {
    const result = classifyTourScan({
      busId: "bus-a",
      roster: [
        { studentId: "s1", tourBusId: "bus-a" },
        { studentId: "s2", tourBusId: "bus-a" },
        { studentId: "s3", tourBusId: "bus-b" },
      ],
      detections: [
        { tagIdentifier: "T1", studentId: "s1", rssi: -60 },
        { tagIdentifier: "T3", studentId: "s3", rssi: -55 },
      ],
    });
    assert.deepEqual(result.presentStudentIds, ["s1"]);
    assert.deepEqual(result.missingStudentIds, ["s2"]);
    assert.deepEqual(result.wrongBusStudentIds, ["s3"]);
    assert.equal(result.expectedCount, 2);
    assert.equal(result.presentCount, 1);
  });

  it("flags watch timeouts only inside the watch window", () => {
    const now = new Date("2026-11-17T10:00:00.000Z");
    assert.equal(
      watchTimedOut({
        lastSeenAt: "2026-11-17T09:40:00.000Z",
        now,
        watchMinutes: 15,
        inWatchWindow: true,
      }),
      true,
    );
    assert.equal(
      watchTimedOut({
        lastSeenAt: "2026-11-17T09:50:00.000Z",
        now,
        watchMinutes: 15,
        inWatchWindow: true,
      }),
      false,
    );
    assert.equal(
      watchTimedOut({
        lastSeenAt: "2026-11-17T09:40:00.000Z",
        now,
        watchMinutes: 15,
        inWatchWindow: false,
      }),
      false,
    );
  });

  it("limits status transitions and parent update types", () => {
    assert.deepEqual(nextTourStatuses("PLANNED"), ["DEPARTED", "CANCELLED"]);
    assert.deepEqual(nextTourStatuses("RETURNING"), ["COMPLETED", "CANCELLED"]);
    assert.deepEqual(nextTourStatuses("COMPLETED"), []);
    assert.equal(parentUpdateType("DEPARTED"), "TOUR_DEPARTED");
    assert.equal(parentUpdateType("COMPLETED"), "TOUR_REACHED_SCHOOL");
    assert.equal(parentUpdateType("CANCELLED"), null);
  });
});
