import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  addMonths,
  amountInWords,
  buildLines,
  calendarDate,
  financialYear,
  formatPeriod,
  gstinMatchesState,
  gstinPattern,
  invoiceNumber,
  invoiceState,
  invoiceTotals,
  nextPeriod,
  periodDates,
  periodEnded,
  rupeesToPaise,
} from "./billing-rules";

describe("billing periods", () => {
  it("adds months across a year end", () => {
    assert.equal(addMonths("2026-11", 1), "2026-12");
    assert.equal(addMonths("2026-12", 1), "2027-01");
    assert.equal(addMonths("2026-10", 11), "2027-09");
  });

  it("starts at the subscription month, then follows the last billed period", () => {
    assert.deepEqual(nextPeriod("2026-10", "MONTHLY", null), { start: "2026-10", end: "2026-10" });
    assert.deepEqual(nextPeriod("2026-10", "QUARTERLY", "2026-10"), { start: "2026-11", end: "2027-01" });
    assert.deepEqual(nextPeriod("2026-04", "YEARLY", null), { start: "2026-04", end: "2027-03" });
  });

  it("only treats a period as ended once its last month is over", () => {
    const quarter = { start: "2026-10", end: "2026-12" };
    assert.equal(periodEnded(quarter, "2026-12-31"), false);
    assert.equal(periodEnded(quarter, "2027-01-01"), true);
  });

  it("gives the first and last calendar day, including leap years", () => {
    assert.deepEqual(periodDates({ start: "2028-01", end: "2028-02" }), { from: "2028-01-01", to: "2028-02-29" });
    assert.deepEqual(periodDates({ start: "2026-11", end: "2026-11" }), { from: "2026-11-01", to: "2026-11-30" });
  });

  it("reads today in India time and adds payment days", () => {
    assert.equal(calendarDate(new Date("2026-10-31T20:00:00Z")), "2026-11-01");
    assert.equal(addDays("2026-12-25", 15), "2027-01-09");
  });

  it("labels a period compactly", () => {
    assert.equal(formatPeriod({ start: "2026-10", end: "2026-10" }), "Oct 2026");
    assert.equal(formatPeriod({ start: "2026-10", end: "2026-12" }), "Oct – Dec 2026");
    assert.equal(formatPeriod({ start: "2026-11", end: "2027-01" }), "Nov 2026 – Jan 2027");
  });
});

describe("invoice amounts", () => {
  const rates = [
    { metric: "STUDENTS" as const, ratePaise: rupeesToPaise(25) },
    { metric: "SCHOOL_VEHICLES" as const, ratePaise: rupeesToPaise(300) },
    { metric: "BLE_CARDS" as const, ratePaise: 0 },
  ];

  it("charges the base fee and each priced count for every month in the cycle", () => {
    const lines = buildLines({ baseFeePaise: rupeesToPaise(1000), rates, cycle: "QUARTERLY", counts: { STUDENTS: 120, SCHOOL_VEHICLES: 4, BLE_CARDS: 90 } });
    assert.deepEqual(lines.map((line) => [line.code, line.quantity, line.amountPaise]), [
      ["BASE", 1, 300_000],
      ["STUDENTS", 120, 900_000],
      ["SCHOOL_VEHICLES", 4, 360_000],
    ]);
  });

  it("splits GST into CGST and SGST inside the same state, and IGST across states", () => {
    const lines = buildLines({ baseFeePaise: 0, rates, cycle: "MONTHLY", counts: { STUDENTS: 3 } });
    const same = invoiceTotals(lines, "27", "27");
    assert.equal(same.subtotalPaise, 7500);
    assert.equal(same.cgstPaise, 675);
    assert.equal(same.sgstPaise, 675);
    assert.equal(same.totalPaise, 8850);
    const other = invoiceTotals(lines, "27", "29");
    assert.equal(other.igstPaise, 1350);
    assert.equal(other.totalPaise, 8850);
  });

  it("numbers invoices by Indian financial year", () => {
    assert.equal(financialYear("2027-03-31"), "2026-27");
    assert.equal(financialYear("2027-04-01"), "2027-28");
    assert.equal(invoiceNumber("PT", "2026-27", 7), "PT/2026-27/0007");
  });

  it("writes the total in Indian words", () => {
    assert.equal(amountInWords(8850), "Rupees Eighty Eight and Fifty Paise Only");
    assert.equal(amountInWords(12_345_600), "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six Only");
    assert.equal(amountInWords(2_500_000_000), "Rupees Two Crore Fifty Lakh Only");
  });

  it("marks an unpaid invoice overdue only after its due date", () => {
    assert.equal(invoiceState({ status: "ISSUED", dueDate: "2026-11-15" }, "2026-11-15"), "DUE");
    assert.equal(invoiceState({ status: "ISSUED", dueDate: "2026-11-15" }, "2026-11-16"), "OVERDUE");
    assert.equal(invoiceState({ status: "PAID", dueDate: "2026-11-15" }, "2027-01-01"), "PAID");
  });

  it("checks a GSTIN and that it belongs to the chosen state", () => {
    assert.equal(gstinPattern.test("27AAPFU0939F1ZV"), true);
    assert.equal(gstinPattern.test("27AAPFU0939F1Z"), false);
    assert.equal(gstinMatchesState("27AAPFU0939F1ZV", "27"), true);
    assert.equal(gstinMatchesState("27AAPFU0939F1ZV", "29"), false);
  });
});
