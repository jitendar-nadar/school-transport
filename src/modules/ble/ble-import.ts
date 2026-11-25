export const MAX_IMPORT_ROWS = 1000;
export const TAG_MIN_LENGTH = 3;
export const TAG_MAX_LENGTH = 80;
export const STUDENT_CODE_MAX_LENGTH = 40;

export type CardImportRow = { row: number; tagIdentifier: string; studentCode: string };
export type CardImportProblem = { row: number; tagIdentifier: string; message: string };

export const CARD_CSV_TEMPLATE = "tagIdentifier,studentCode\r\nBLE_CARD_2001,STU-1001\r\nBLE_CARD_2002,\r\n";

const tagHeaders = new Set(["tagidentifier", "tag identifier", "tag_identifier", "tag id", "tagid", "card", "card id", "cardid", "card identifier", "identifier"]);
const studentHeaders = new Set(["studentcode", "student code", "student_code", "student id", "student"]);

export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && !cell.trim()) {
      cell = "";
      quoted = true;
    } else if (char === ",") {
      record.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || record.length) {
    record.push(cell);
    records.push(record);
  }
  return records;
}

function headerKey(cell: string) {
  return cell.trim().toLowerCase().replace(/\s+/g, " ");
}

export function validateCardRows(rows: CardImportRow[]): CardImportProblem[] {
  const problems: CardImportProblem[] = [];
  const firstRowForCard = new Map<string, number>();
  const firstRowForStudent = new Map<string, number>();
  for (const { row, tagIdentifier, studentCode } of rows) {
    const problem = (message: string) => problems.push({ row, tagIdentifier, message });
    if (!tagIdentifier) {
      problem("Card identifier is missing.");
    } else if (tagIdentifier.length < TAG_MIN_LENGTH) {
      problem(`Card identifier must be at least ${TAG_MIN_LENGTH} characters.`);
    } else if (tagIdentifier.length > TAG_MAX_LENGTH) {
      problem(`Card identifier must be ${TAG_MAX_LENGTH} characters or fewer.`);
    } else {
      const key = tagIdentifier.toLowerCase();
      const earlier = firstRowForCard.get(key);
      if (earlier) problem(`This card is already on row ${earlier} of the file.`);
      else firstRowForCard.set(key, row);
    }
    if (studentCode.length > STUDENT_CODE_MAX_LENGTH) {
      problem(`Student code must be ${STUDENT_CODE_MAX_LENGTH} characters or fewer.`);
    } else if (studentCode) {
      const earlier = firstRowForStudent.get(studentCode);
      if (earlier) problem(`Student ${studentCode} already gets a card on row ${earlier}. A student can have one active card.`);
      else firstRowForStudent.set(studentCode, row);
    }
  }
  return problems;
}

export function readCardCsv(text: string): { rows: CardImportRow[]; problems: CardImportProblem[] } {
  const records = parseCsv(text)
    .map((cells, index) => ({ line: index + 1, cells: cells.map((cell) => cell.trim()) }))
    .filter((record) => record.cells.some(Boolean));
  if (!records.length) {
    return { rows: [], problems: [{ row: 0, tagIdentifier: "", message: "The file has no cards." }] };
  }
  const header = records[0].cells.map(headerKey);
  let tagColumn = header.findIndex((cell) => tagHeaders.has(cell));
  let studentColumn = header.findIndex((cell) => studentHeaders.has(cell));
  let body = records.slice(1);
  if (tagColumn < 0) {
    if (studentColumn >= 0) {
      return { rows: [], problems: [{ row: 1, tagIdentifier: "", message: "Add a tagIdentifier column to the header row." }] };
    }
    tagColumn = 0;
    studentColumn = 1;
    body = records;
  }
  if (!body.length) {
    return { rows: [], problems: [{ row: 0, tagIdentifier: "", message: "The file has a header row but no cards." }] };
  }
  if (body.length > MAX_IMPORT_ROWS) {
    return { rows: [], problems: [{ row: 0, tagIdentifier: "", message: `The file has ${body.length} cards. Upload ${MAX_IMPORT_ROWS} or fewer at a time.` }] };
  }
  const rows = body.map(({ line, cells }) => ({
    row: line,
    tagIdentifier: cells[tagColumn] || "",
    studentCode: studentColumn >= 0 ? cells[studentColumn] || "" : "",
  }));
  return { rows, problems: validateCardRows(rows) };
}
