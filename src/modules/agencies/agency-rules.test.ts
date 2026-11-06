import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardPlace, checkCardRows, clientKey, diffIds, parseCardList, parseClientKey, readAgencyCardCsv, splitClientKeys } from "./agency-rules";

const school = "64b7f0c2a1b2c3d4e5f60718";
const company = "64b7f0c2a1b2c3d4e5f60719";

describe("agency clients", () => {
  it("round-trips a client key", () => {
    assert.deepEqual(parseClientKey(clientKey("SCHOOL", school)), { type: "SCHOOL", id: school });
  });

  it("rejects unknown types, bad ids, and extra parts", () => {
    assert.equal(parseClientKey(`FLEET:${school}`), null);
    assert.equal(parseClientKey("SCHOOL:abc"), null);
    assert.equal(parseClientKey(`SCHOOL:${school}:x`), null);
  });

  it("splits keys into school and company ids without duplicates", () => {
    assert.deepEqual(splitClientKeys([`SCHOOL:${school}`, `COMPANY:${company}`, `SCHOOL:${school}`, "nope"]), {
      schoolIds: [school],
      companyIds: [company],
      invalid: ["nope"],
    });
  });

  it("finds added and removed ids", () => {
    assert.deepEqual(diffIds(["a", "b"], ["b", "c"]), { added: ["c"], removed: ["a"] });
  });
});

describe("agency card list", () => {
  it("reads one card per line or comma, skipping blanks", () => {
    const result = parseCardList("CARD-1\n\n CARD-2 , CARD-3\r\n");
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.rows.map((row) => [row.row, row.tagIdentifier]), [[1, "CARD-1"], [3, "CARD-2"], [3, "CARD-3"]]);
  });

  it("flags an empty list, short ids, and repeats", () => {
    assert.equal(parseCardList(" \n ").problems[0]?.message, "Enter at least one card id.");
    const result = parseCardList("AB\nCARD-1\ncard-1");
    assert.deepEqual(result.problems.map((problem) => problem.row), [1, 3]);
  });
});

describe("agency card file", () => {
  it("reads the tagIdentifier column and ignores student codes", () => {
    const result = readAgencyCardCsv("tagIdentifier,studentCode\r\nCARD-1,STU-1\r\n\r\nCARD-2,\r\n");
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.rows, [
      { row: 2, tagIdentifier: "CARD-1", studentCode: "" },
      { row: 4, tagIdentifier: "CARD-2", studentCode: "" },
    ]);
  });

  it("takes the first column when there is no header", () => {
    assert.deepEqual(readAgencyCardCsv("CARD-1,extra\nCARD-2").rows.map((row) => row.tagIdentifier), ["CARD-1", "CARD-2"]);
  });

  it("keeps file problems and flags repeats by file row", () => {
    assert.equal(readAgencyCardCsv("tagIdentifier\n").problems[0]?.message, "The file has a header row but no cards.");
    const result = readAgencyCardCsv("tagIdentifier\nCARD-1\nAB\ncard-1");
    assert.deepEqual(result.problems.map((problem) => problem.row), [3, 4]);
  });

  it("checks rows sent by the upload", () => {
    const result = checkCardRows([{ row: 2, tagIdentifier: " CARD-1 " }, { row: 3, tagIdentifier: "" }]);
    assert.equal(result.rows[0].tagIdentifier, "CARD-1");
    assert.deepEqual(result.problems.map((problem) => [problem.row, problem.message]), [[3, "Card identifier is missing."]]);
  });
});

describe("agency card place", () => {
  it("describes stock, handed-over, and issued cards", () => {
    assert.deepEqual(cardPlace({}), { client: "In stock", holder: "" });
    assert.deepEqual(cardPlace({ schoolName: "ABC" }), { client: "ABC", holder: "Not mapped yet" });
    assert.deepEqual(cardPlace({ companyName: "Northwind", employeeName: "Meera" }), { client: "Northwind", holder: "Meera" });
  });
});
