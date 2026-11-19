import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  belowSignal,
  dayCounts,
  gatewayHealth,
  matchSite,
  splitGapAt,
  describeGap,
  exceedsGrace,
  gapOutcome,
  isDeducted,
  isEarlyExit,
  isLate,
  livePresence,
  parseClock,
  parseOfficeTime,
  personalMinutes,
  policyFrom,
  shouldCloseDay,
  workingMinutes,
} from "./attendance-rules";

const policy = policyFrom({
  gracePeriodMinutes: 15,
  shiftStart: "09:30",
  shiftEnd: "18:30",
  lunchStart: "13:00",
  lunchEnd: "14:00",
  lunchCountsAsPersonal: false,
  reviewWindowHours: 48,
});

describe("office attendance rules", () => {
  it("treats a silence longer than the grace period as a gap", () => {
    const lastSeen = new Date("2026-10-16T04:00:00.000Z");
    const nextSeen = new Date("2026-10-16T04:16:00.000Z");
    assert.equal(exceedsGrace(lastSeen, nextSeen, 15), true);
    assert.equal(exceedsGrace(lastSeen, new Date("2026-10-16T04:15:00.000Z"), 15), false);
  });

  it("keeps lunch out of personal time unless the company says otherwise", () => {
    const started = parseOfficeTime("2026-10-16T12:50");
    const ended = parseOfficeTime("2026-10-16T14:10");
    assert.ok(started && ended);
    assert.equal(personalMinutes(started, ended, policy), 20);
    assert.equal(personalMinutes(started, ended, { ...policy, lunchCountsAsPersonal: true }), 80);
    assert.equal(personalMinutes(started, ended, { ...policy, silenceCountsAsPersonal: false, lunchCountsAsPersonal: true }), 60);
    assert.equal(personalMinutes(started, ended, { ...policy, silenceCountsAsPersonal: false, lunchCountsAsPersonal: false }), 0);
    const lunchOnlyStart = parseOfficeTime("2026-10-16T13:10");
    const lunchOnlyEnd = parseOfficeTime("2026-10-16T13:40");
    assert.ok(lunchOnlyStart && lunchOnlyEnd);
    assert.equal(describeGap(policy, lunchOnlyStart, lunchOnlyEnd).countsAsPersonal, false);
  });

  it("does not deduct a gap until the review window passes or HR rejects it", () => {
    const deadline = new Date("2026-10-18T10:00:00.000Z");
    const open = { status: "OPEN", countsAsPersonal: true, reviewDeadline: deadline };
    assert.equal(isDeducted(open, new Date("2026-10-18T09:00:00.000Z")), false);
    assert.equal(isDeducted(open, new Date("2026-10-18T11:00:00.000Z")), true);
    assert.equal(isDeducted({ ...open, status: "DISPUTED" }, new Date("2026-10-19T11:00:00.000Z")), false);
    assert.equal(isDeducted({ ...open, status: "APPROVED" }, new Date("2026-10-19T11:00:00.000Z")), false);
    assert.equal(gapOutcome({ ...open, status: "REJECTED" }, deadline), "Personal time");
    assert.equal(gapOutcome({ ...open, status: "APPROVED" }, deadline), "On duty");
  });

  it("counts late arrivals, early exits, and working time after approved gaps", () => {
    const arrived = parseOfficeTime("2026-10-16T09:41");
    const onTime = parseOfficeTime("2026-10-16T09:30");
    const left = parseOfficeTime("2026-10-16T18:10");
    const end = parseOfficeTime("2026-10-16T18:30");
    assert.ok(arrived && onTime && left && end);
    assert.equal(isLate(arrived, policy.shiftStart), true);
    assert.equal(isLate(onTime, policy.shiftStart), false);
    assert.equal(isEarlyExit(left, policy.shiftEnd), true);
    assert.equal(workingMinutes(onTime, end, 30), 510);
  });

  it("reports presence from check-in, silence, and check-out", () => {
    const now = new Date("2026-10-16T05:00:00.000Z");
    const checkedIn = new Date("2026-10-16T04:00:00.000Z");
    const quiet = new Date("2026-10-16T04:40:00.000Z");
    assert.equal(livePresence({ checkedInAt: null, lastSeenAt: null, checkedOutAt: null, now, graceMinutes: 15 }), "NOT_ARRIVED");
    assert.equal(livePresence({ checkedInAt: checkedIn, lastSeenAt: now, checkedOutAt: null, now, graceMinutes: 15 }), "IN_OFFICE");
    assert.equal(livePresence({ checkedInAt: checkedIn, lastSeenAt: quiet, checkedOutAt: null, now, graceMinutes: 15 }), "AWAY");
    assert.equal(livePresence({ checkedInAt: checkedIn, lastSeenAt: quiet, checkedOutAt: now, now, graceMinutes: 15 }), "CHECKED_OUT");
  });

  it("closes yesterday immediately and today only after shift end plus grace", () => {
    const during = parseOfficeTime("2026-10-16T18:20");
    const after = parseOfficeTime("2026-10-16T18:45");
    assert.ok(during && after);
    assert.equal(shouldCloseDay("2026-10-16", during, "18:30", 15), false);
    assert.equal(shouldCloseDay("2026-10-16", after, "18:30", 15), true);
    assert.equal(shouldCloseDay("2026-10-15", after, "18:30", 15), true);
    assert.equal(shouldCloseDay("2026-10-17", after, "18:30", 15), false);
    assert.equal(parseClock("25:00"), null);
  });
});

describe("late gateway readings", () => {
  const at = (time: string) => parseOfficeTime(`2026-10-16T${time}`) as Date;
  const gap = { startedAt: at("10:00"), endedAt: at("11:00") };

  it("splits a gap when a late reading lands in the middle", () => {
    const pieces = splitGapAt(gap, at("10:30"), 15);
    assert.deepEqual(pieces.map((piece) => [piece.startedAt.getTime(), piece.endedAt.getTime()]), [
      [at("10:00").getTime(), at("10:30").getTime()],
      [at("10:30").getTime(), at("11:00").getTime()],
    ]);
  });

  it("drops a piece that is now within the grace period", () => {
    const pieces = splitGapAt(gap, at("10:50"), 15);
    assert.equal(pieces.length, 1);
    assert.equal(pieces[0].endedAt.getTime(), at("10:50").getTime());
    assert.equal(splitGapAt({ startedAt: at("10:00"), endedAt: at("10:25") }, at("10:12"), 15).length, 0);
  });

  it("leaves the gap alone when the reading is outside it", () => {
    assert.deepEqual(splitGapAt(gap, at("09:50"), 15), [gap]);
    assert.deepEqual(splitGapAt(gap, at("11:00"), 15), [gap]);
  });
});

describe("gateways and field check-in", () => {
  it("reports gateway health from the last contact", () => {
    const now = new Date("2026-10-16T06:00:00Z");
    assert.equal(gatewayHealth(null, now, 30), "NEVER");
    assert.equal(gatewayHealth(new Date("2026-10-16T05:45:00Z"), now, 30), "ONLINE");
    assert.equal(gatewayHealth(new Date("2026-10-16T05:20:00Z"), now, 30), "SILENT");
  });

  it("ignores only readings weaker than the gateway minimum", () => {
    assert.equal(belowSignal(-90, -80), true);
    assert.equal(belowSignal(-70, -80), false);
    assert.equal(belowSignal(null, -80), false);
    assert.equal(belowSignal(-90, null), false);
  });

  it("matches the nearest allowed site within its radius", () => {
    const sites = [
      { name: "Client A", latitude: 19.076, longitude: 72.8777, radiusMeters: 200 },
      { name: "Client B", latitude: 19.0765, longitude: 72.8777, radiusMeters: 200 },
    ];
    assert.equal(matchSite(sites, { latitude: 19.0764, longitude: 72.8777 })?.site.name, "Client B");
    assert.equal(matchSite(sites, { latitude: 19.2, longitude: 72.9 }), null);
  });

  it("counts a phone day only once it is approved or needs no approval", () => {
    assert.equal(dayCounts({ source: "GATEWAY" }), "WORKING");
    assert.equal(dayCounts({ source: "PHONE", fieldReview: "NOT_REQUIRED" }), "WORKING");
    assert.equal(dayCounts({ source: "PHONE", fieldReview: "PENDING" }), "PENDING");
    assert.equal(dayCounts({ source: "PHONE", fieldReview: "REJECTED" }), "EXCLUDED");
  });
});
