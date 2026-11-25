import { MAX_IMPORT_ROWS, readCardCsv, validateCardRows, type CardImportProblem, type CardImportRow } from "../ble/ble-import";

export const AGENCY_CARD_CSV_TEMPLATE = "tagIdentifier\r\nBLE_CARD_3001\r\nBLE_CARD_3002\r\n";

export type ClientType = "SCHOOL" | "COMPANY";

const idPattern = /^[a-f\d]{24}$/i;

export function clientKey(type: ClientType, id: string) {
  return `${type}:${id}`;
}

export function parseClientKey(key: string): { type: ClientType; id: string } | null {
  const [type, id, extra] = key.split(":");
  if (extra !== undefined || (type !== "SCHOOL" && type !== "COMPANY") || !idPattern.test(id || "")) return null;
  return { type, id };
}

export function splitClientKeys(keys: string[]) {
  const schoolIds: string[] = [];
  const companyIds: string[] = [];
  const invalid: string[] = [];
  for (const key of keys) {
    const parsed = parseClientKey(key);
    if (!parsed) {
      invalid.push(key);
      continue;
    }
    const list = parsed.type === "SCHOOL" ? schoolIds : companyIds;
    if (!list.includes(parsed.id)) list.push(parsed.id);
  }
  return { schoolIds, companyIds, invalid };
}

export function diffIds(before: string[], after: string[]) {
  const was = new Set(before);
  const now = new Set(after);
  return {
    added: [...now].filter((id) => !was.has(id)),
    removed: [...was].filter((id) => !now.has(id)),
  };
}

export function parseCardList(text: string): { rows: CardImportRow[]; problems: CardImportProblem[] } {
  const rows = text
    .split(/\r?\n/)
    .flatMap((line, index) => line.split(",").map((cell) => ({ row: index + 1, tagIdentifier: cell.trim(), studentCode: "" })))
    .filter((row) => row.tagIdentifier);
  if (!rows.length) return { rows, problems: [{ row: 0, tagIdentifier: "", message: "Enter at least one card id." }] };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { rows: [], problems: [{ row: 0, tagIdentifier: "", message: `That is ${rows.length} cards. Add ${MAX_IMPORT_ROWS} or fewer at a time.` }] };
  }
  return { rows, problems: validateCardRows(rows) };
}

export function checkCardRows(rows: { row: number; tagIdentifier: string }[]): { rows: CardImportRow[]; problems: CardImportProblem[] } {
  const cards = rows.map(({ row, tagIdentifier }) => ({ row, tagIdentifier: tagIdentifier.trim(), studentCode: "" }));
  return { rows: cards, problems: validateCardRows(cards) };
}

export function readAgencyCardCsv(text: string): { rows: CardImportRow[]; problems: CardImportProblem[] } {
  const result = readCardCsv(text);
  return result.rows.length ? checkCardRows(result.rows) : result;
}

export type CardHolder = { client: string; holder: string };

export function cardPlace(card: {
  schoolName?: string;
  companyName?: string;
  studentName?: string;
  employeeName?: string;
}): CardHolder {
  const client = card.schoolName || card.companyName || "";
  const holder = card.studentName || card.employeeName || "";
  return { client: client || "In stock", holder: holder || (client ? "Not mapped yet" : "") };
}
