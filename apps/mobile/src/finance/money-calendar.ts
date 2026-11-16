import type { AllowancePeriod, PayoutCadence } from "./types";

export function cents(value: number, allowZero = true): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new Error("Use a non-negative safe integer amount in cents.");
  return value;
}
export function sum(values: number[]): number { return values.reduce((a, b) => cents(a + cents(b)), 0); }
export function percentage(value: number, percent: number): number {
  cents(value); if (!Number.isSafeInteger(percent) || percent < 0 || percent > 10000) throw new Error("Percentage must be a whole number from 0 to 10000.");
  const result = BigInt(value) * BigInt(percent) / 100n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount is too large.");
  return Number(result);
}
export function parseMoney(text: string): number {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text.trim())) throw new Error("Enter dollars with at most two decimal places.");
  const [dollars, fraction = ""] = text.trim().split(".");
  const result = BigInt(dollars) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount is too large.");
  return Number(result);
}
export function formatMoney(value: number): string {
  cents(value); const amount = BigInt(value);
  // Hermes Intl accepts numbers; the whole-dollar quotient is safely below MAX_SAFE_INTEGER.
  const dollars = Number(amount / 100n);
  return "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(dollars) + "." + (amount % 100n).toString().padStart(2, "0");
}
export function moneyInput(value: number): string { cents(value); const amount = BigInt(value); return (amount / 100n).toString() + "." + (amount % 100n).toString().padStart(2, "0"); }
export function validInstant(value: string): string {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Use a UTC timestamp.");
  const normalized = value.includes(".") ? value.replace(/\.(\d{1,3})Z$/, (_, fraction: string) => "." + fraction.padEnd(3, "0") + "Z") : value.replace("Z", ".000Z");
  if (new Date(value).toISOString() !== normalized) throw new Error("Use a valid UTC calendar timestamp.");
  return value;
}
export function validDate(value: string): string {
  if (!/^\d{4}-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(value + "T12:00:00Z")) || new Date(value + "T12:00:00Z").toISOString().slice(0, 10) !== value) throw new Error("Use a valid calendar date.");
  return value;
}
export function localDate(at: string, timezone: string): string {
  validInstant(at);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function periodKey(date: string, period: AllowancePeriod | "daily", anchorDate: string): string {
  validDate(date); validDate(anchorDate);
  if (period === "monthly") return date.slice(0, 7);
  if (period === "daily") return date;
  const days = Math.floor((Date.parse(date + "T12:00:00Z") - Date.parse(anchorDate + "T12:00:00Z")) / 86400000);
  const length = period === "weekly" ? 7 : 14;
  return `${anchorDate}/${length}/${Math.floor(days / length)}`;
}
export function payoutPeriod(at: string, timezone: string, cadence: PayoutCadence, anchorDate: string): string {
  return cadence === "per_task" ? "per_task" : periodKey(localDate(at, timezone), cadence, anchorDate);
}
export function recurrenceDates(start: string, end: string, recurrence: "once" | "daily" | "weekly", weekdays: number[] = []): string[] {
  validDate(start); validDate(end);
  if (!["once", "daily", "weekly"].includes(recurrence)) throw new Error("Choose a valid recurrence.");
  const days = (Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000;
  if (days < 0 || days > 366) throw new Error("Choose a recurrence window up to 366 days.");
  if (weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("Choose valid weekdays.");
  const dates: string[] = [];
  for (let day = 0; day <= days; day++) {
    const date = new Date(Date.parse(start + "T12:00:00Z") + day * 86400000);
    if (recurrence === "daily" || (recurrence === "once" && day === 0) || (recurrence === "weekly" && (weekdays.length ? weekdays.includes(date.getUTCDay()) : day % 7 === 0))) dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}
