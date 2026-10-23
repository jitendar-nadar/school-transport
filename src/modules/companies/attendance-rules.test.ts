import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeGap,
  exceedsGrace,
  gapOutcome,
  isDeducted,
  isEarlyExit,
  isLate,
  parseOfficeTime,
  personalMinutes,
  policyFrom,
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
});
