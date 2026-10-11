// Calendar calculations match the database, including month-end due dates.
export function addCalendarMonths(iso: string, count: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + count, 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(d, last));
  return date.toISOString().slice(0, 10);
}
export function dueCycles(due: string | null, day: string) {
  if (!due || due > day) return 0;
  const [y, m] = day.split("-").map(Number);
  const [dy, dm] = due.split("-").map(Number);
  const n = (y - dy) * 12 + m - dm;
  return Math.max(0, n + (addCalendarMonths(due, n) <= day ? 1 : 0));
}
export function currentBalance(balance: any, rent: number, day = new Date().toISOString().slice(0, 10)) {
  const stored = Number(balance?.current_balance || 0);
  const due = balance?.next_due_date || null;
  const credit = Number(balance?.partial_credit || 0);
  return Math.max(0, balance?.balance_as_of
    ? stored + Math.max(0, dueCycles(due, day) - dueCycles(due, balance.balance_as_of)) * rent
    : Math.max(stored, dueCycles(due, day) * rent - credit));
}
