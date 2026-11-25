export type BillingEntityType = "SCHOOL" | "COMPANY" | "FLEET" | "AGENCY";
export type Metric = "STUDENTS" | "SCHOOL_VEHICLES" | "BLE_CARDS" | "EMPLOYEES" | "GATEWAYS" | "FLEET_VEHICLES" | "AGENCY_VEHICLES" | "AGENCY_CARDS";
export type Cycle = "MONTHLY" | "QUARTERLY" | "YEARLY";
export type MetricRate = { metric: Metric; ratePaise: number };
export type Counts = Partial<Record<Metric, number>>;
export type Period = { start: string; end: string };

export type InvoiceLine = {
  code: "BASE" | Metric;
  description: string;
  quantity: number;
  unitPricePaise: number;
  months: number;
  amountPaise: number;
};

export type Tax = {
  taxType: "INTRA" | "INTER";
  taxRate: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
};

export const billingEntityTypes: BillingEntityType[] = ["SCHOOL", "COMPANY", "FLEET", "AGENCY"];
export const cycles: Cycle[] = ["MONTHLY", "QUARTERLY", "YEARLY"];
export const allMetrics: Metric[] = ["STUDENTS", "SCHOOL_VEHICLES", "BLE_CARDS", "EMPLOYEES", "GATEWAYS", "FLEET_VEHICLES", "AGENCY_VEHICLES", "AGENCY_CARDS"];
export const GST_RATE_PERCENT = 18;
export const BILLING_TIME_ZONE = "Asia/Kolkata";

export const metricsFor: Record<BillingEntityType, Metric[]> = {
  SCHOOL: ["STUDENTS", "SCHOOL_VEHICLES", "BLE_CARDS"],
  COMPANY: ["EMPLOYEES", "GATEWAYS"],
  FLEET: ["FLEET_VEHICLES"],
  AGENCY: ["AGENCY_VEHICLES", "AGENCY_CARDS"],
};

export const metricLabels: Record<Metric, { label: string; unit: string }> = {
  STUDENTS: { label: "Active students", unit: "student" },
  SCHOOL_VEHICLES: { label: "Buses and vans", unit: "vehicle" },
  BLE_CARDS: { label: "Active BLE cards", unit: "card" },
  EMPLOYEES: { label: "Active employees", unit: "employee" },
  GATEWAYS: { label: "Gateways", unit: "gateway" },
  FLEET_VEHICLES: { label: "Trucks and vehicles", unit: "vehicle" },
  AGENCY_VEHICLES: { label: "Agency buses and vans", unit: "vehicle" },
  AGENCY_CARDS: { label: "Issued BLE cards", unit: "card" },
};

export const entityTypeLabels: Record<BillingEntityType, string> = {
  SCHOOL: "School",
  COMPANY: "Company",
  FLEET: "Fleet",
  AGENCY: "Transport agency",
};

export const entityTypePlurals: Record<BillingEntityType, string> = {
  SCHOOL: "Schools",
  COMPANY: "Companies",
  FLEET: "Fleets",
  AGENCY: "Transport agencies",
};

export const cycleMonths: Record<Cycle, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };
export const cycleLabels: Record<Cycle, string> = { MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly" };

const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isMonth(value: string) {
  return monthPattern.test(value);
}

export function addMonths(month: string, count: number) {
  const match = monthPattern.exec(month);
  if (!match) throw new Error(`Invalid month ${month}`);
  const index = Number(match[1]) * 12 + Number(match[2]) - 1 + count;
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function periodFrom(start: string, cycle: Cycle): Period {
  return { start, end: addMonths(start, cycleMonths[cycle] - 1) };
}

export function nextPeriod(startMonth: string, cycle: Cycle, lastBilledEnd: string | null): Period {
  return periodFrom(lastBilledEnd ? addMonths(lastBilledEnd, 1) : startMonth, cycle);
}

export function periodEnded(period: Period, today: string) {
  return today.slice(0, 7) > period.end;
}

export function lastDayOfMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}

export function periodDates(period: Period) {
  return { from: `${period.start}-01`, to: `${period.end}-${String(lastDayOfMonth(period.end)).padStart(2, "0")}` };
}

export function calendarDate(date: Date, timeZone = BILLING_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function addDays(date: string, days: number) {
  const match = datePattern.exec(date);
  if (!match) throw new Error(`Invalid date ${date}`);
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return value.toISOString().slice(0, 10);
}

export function financialYear(date: string) {
  const [year, month] = date.split("-").map(Number);
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function invoiceNumber(prefix: string, fy: string, sequence: number) {
  return `${prefix}/${fy}/${String(sequence).padStart(4, "0")}`;
}

export function rupeesToPaise(rupees: number) {
  return Math.round(rupees * 100);
}

export function buildLines(input: { baseFeePaise: number; rates: MetricRate[]; cycle: Cycle; counts: Counts }): InvoiceLine[] {
  const months = cycleMonths[input.cycle];
  const lines: InvoiceLine[] = [];
  if (input.baseFeePaise > 0) {
    lines.push({
      code: "BASE",
      description: "Platform fee",
      quantity: 1,
      unitPricePaise: input.baseFeePaise,
      months,
      amountPaise: input.baseFeePaise * months,
    });
  }
  for (const { metric, ratePaise } of input.rates) {
    if (ratePaise <= 0) continue;
    const quantity = Math.max(0, Math.floor(input.counts[metric] ?? 0));
    lines.push({
      code: metric,
      description: metricLabels[metric].label,
      quantity,
      unitPricePaise: ratePaise,
      months,
      amountPaise: quantity * ratePaise * months,
    });
  }
  return lines;
}

export function taxFor(subtotalPaise: number, sellerStateCode: string, buyerStateCode: string, rate = GST_RATE_PERCENT): Tax {
  if (sellerStateCode === buyerStateCode) {
    const half = Math.round((subtotalPaise * rate) / 200);
    return { taxType: "INTRA", taxRate: rate, cgstPaise: half, sgstPaise: half, igstPaise: 0 };
  }
  return { taxType: "INTER", taxRate: rate, cgstPaise: 0, sgstPaise: 0, igstPaise: Math.round((subtotalPaise * rate) / 100) };
}

export function invoiceTotals(lines: InvoiceLine[], sellerStateCode: string, buyerStateCode: string) {
  const subtotalPaise = lines.reduce((sum, line) => sum + line.amountPaise, 0);
  const tax = taxFor(subtotalPaise, sellerStateCode, buyerStateCode);
  return { subtotalPaise, ...tax, totalPaise: subtotalPaise + tax.cgstPaise + tax.sgstPaise + tax.igstPaise };
}

export type InvoiceState = "PAID" | "VOID" | "OVERDUE" | "DUE";

export function invoiceState(invoice: { status: string; dueDate: string }, today: string): InvoiceState {
  if (invoice.status === "PAID") return "PAID";
  if (invoice.status === "VOID") return "VOID";
  return today > invoice.dueDate ? "OVERDUE" : "DUE";
}

export const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function gstinMatchesState(gstin: string, stateCode: string) {
  return gstin.slice(0, 2) === stateCode;
}

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(value: number) {
  if (value < 20) return ones[value];
  return [tens[Math.floor(value / 10)], ones[value % 10]].filter(Boolean).join(" ");
}

function belowThousand(value: number) {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return [hundreds ? `${ones[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

export function numberInWords(value: number): string {
  if (value === 0) return "Zero";
  const crore = Math.floor(value / 10_000_000);
  const lakh = Math.floor(value / 100_000) % 100;
  const thousand = Math.floor(value / 1000) % 100;
  const rest = value % 1000;
  return [
    crore ? `${numberInWords(crore)} Crore` : "",
    lakh ? `${belowHundred(lakh)} Lakh` : "",
    thousand ? `${belowHundred(thousand)} Thousand` : "",
    rest ? belowThousand(rest) : "",
  ].filter(Boolean).join(" ");
}

export function amountInWords(paise: number) {
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  return `Rupees ${numberInWords(rupees)}${remainder ? ` and ${belowHundred(remainder)} Paise` : ""} Only`;
}

export function formatINR(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100);
}

export function formatMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return `${monthNames[value - 1]} ${year}`;
}

export function formatPeriod(period: Period) {
  if (period.start === period.end) return formatMonth(period.start);
  const [startYear] = period.start.split("-");
  const [endYear] = period.end.split("-");
  const start = startYear === endYear ? monthNames[Number(period.start.slice(5)) - 1] : formatMonth(period.start);
  return `${start} – ${formatMonth(period.end)}`;
}

export function formatDate(date: string) {
  const match = datePattern.exec(date);
  if (!match) return date;
  return `${Number(match[3])} ${monthNames[Number(match[2]) - 1]} ${match[1]}`;
}
