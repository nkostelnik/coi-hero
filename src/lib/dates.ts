import type { CoverageStatus } from "./types";

/** Parse a loose date string into an ISO yyyy-mm-dd, or null. */
export function toIsoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // Already ISO-ish.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // mm/dd/yyyy or mm-dd-yyyy or m/d/yy
  const us = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (us) {
    let [, mm, dd, yy] = us;
    let year = Number(yy);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const m = String(Number(mm)).padStart(2, "0");
    const d = String(Number(dd)).padStart(2, "0");
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${year}-${m}-${d}`;
    }
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIsoStr: string): number {
  const a = Date.parse(fromIso + "T00:00:00Z");
  const b = Date.parse(toIsoStr + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

export function coverageStatus(
  expirationDate: string | null,
  soonDays: number,
  today: string = todayIso(),
): CoverageStatus {
  if (!expirationDate) return "unknown";
  const diff = daysBetween(today, expirationDate);
  if (diff < 0) return "expired";
  if (diff <= soonDays) return "expiring_soon";
  return "active";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}
