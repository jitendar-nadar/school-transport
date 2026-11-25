import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CARD_CSV_TEMPLATE, MAX_IMPORT_ROWS, parseCsv, readCardCsv, validateCardRows } from "./ble-import";

describe("BLE card CSV", () => {
  it("parses quoted cells, escaped quotes, CRLF, and a byte-order mark", () => {
    assert.deepEqual(parseCsv('\uFEFFa,"b,c"\r\n"say ""hi""",d\n'), [["a", "b,c"], ['say "hi"', "d"]]);
  });

  it("reads the template with its header and an optional student code", () => {
    const result = readCardCsv(CARD_CSV_TEMPLATE);
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.rows, [
      { row: 2, tagIdentifier: "BLE_CARD_2001", studentCode: "STU-1001" },
      { row: 3, tagIdentifier: "BLE_CARD_2002", studentCode: "" },
    ]);
  });

  it("accepts friendly header names in any column order and skips blank lines", () => {
    const result = readCardCsv("Student Code,Card ID\nSTU-1,CARD-9\n\n,CARD-10\n");
    assert.deepEqual(result.rows, [
      { row: 2, tagIdentifier: "CARD-9", studentCode: "STU-1" },
      { row: 4, tagIdentifier: "CARD-10", studentCode: "" },
    ]);
  });

  it("treats a file without a header as card identifiers first", () => {
    const result = readCardCsv("CARD-1\nCARD-2,STU-2\n");
    assert.deepEqual(result.rows.map((row) => [row.row, row.tagIdentifier, row.studentCode]), [[1, "CARD-1", ""], [2, "CARD-2", "STU-2"]]);
  });

  it("asks for a card column when only a student column is present", () => {
    assert.match(readCardCsv("studentCode\nSTU-1\n").problems[0].message, /tagIdentifier column/);
  });

  it("flags missing, short, and repeated cards, and a student given two cards", () => {
    const problems = validateCardRows([
      { row: 2, tagIdentifier: "", studentCode: "" },
      { row: 3, tagIdentifier: "AB", studentCode: "" },
      { row: 4, tagIdentifier: "CARD-1", studentCode: "STU-1" },
      { row: 5, tagIdentifier: "card-1", studentCode: "STU-1" },
    ]);
    assert.deepEqual(problems.map((problem) => problem.row), [2, 3, 5, 5]);
    assert.match(problems[2].message, /row 4/);
    assert.match(problems[3].message, /one active card/);
  });

  it("refuses an empty file and a file over the row limit", () => {
    assert.match(readCardCsv(" \n").problems[0].message, /no cards/);
    assert.match(readCardCsv("tagIdentifier\n").problems[0].message, /no cards/);
    const many = ["tagIdentifier", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => `CARD-${index}`)].join("\n");
    assert.match(readCardCsv(many).problems[0].message, /or fewer at a time/);
  });
});
