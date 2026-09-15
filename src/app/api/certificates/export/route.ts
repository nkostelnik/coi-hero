import { getSoonDays, listCertificates } from "@/lib/db";
import { coverageStatus } from "@/lib/dates";
import { matchLimit } from "@/lib/compliance";

export const dynamic = "force-dynamic";

const HEADERS = [
  "vendor",
  "insured",
  "certificate_holder",
  "certificate_date",
  "date_received",
  "contract_reference",
  "internal_owner",
  "coverage_type",
  "coverage_type_raw",
  "carrier",
  "naic",
  "policy_number",
  "effective_date",
  "expiration_date",
  "status",
  "each_occurrence",
  "aggregate",
  "combined_single_limit",
  "all_limits",
  "additional_insured",
  "waiver_of_subrogation",
  "primary_noncontributory",
  "per_project_aggregate",
  "notice_of_cancellation_days",
  "reviewed",
  "source",
  "original_file",
];

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const tri = (v: 0 | 1 | null) => (v === 1 ? "yes" : v === 0 ? "no" : "");

export async function GET() {
  const soonDays = getSoonDays();
  const rows: string[] = [HEADERS.join(",")];

  for (const cert of listCertificates()) {
    const base = [
      cert.vendor?.name ?? "",
      cert.insured_name ?? "",
      cert.certificate_holder_name ?? "",
      cert.certificate_date ?? "",
      cert.date_received ?? "",
      cert.contract_reference ?? "",
      cert.internal_owner ?? "",
    ];
    const tail = [cert.reviewed ? "yes" : "no", cert.source, cert.original_file_name];

    if (cert.coverages.length === 0) {
      rows.push(
        [...base, ...Array(HEADERS.length - base.length - tail.length).fill(""), ...tail]
          .map(csvCell)
          .join(","),
      );
      continue;
    }

    for (const c of cert.coverages) {
      const eachOcc = matchLimit(c.limits, "each_occurrence")?.amount ?? "";
      const agg = matchLimit(c.limits, "aggregate")?.amount ?? "";
      const csl = matchLimit(c.limits, "csl")?.amount ?? "";
      const all = c.limits
        .map((l) => `${l.label}=${l.amount ?? l.amount_raw ?? ""}`)
        .join("; ");
      rows.push(
        [
          ...base,
          c.coverage_type,
          c.coverage_type_raw ?? "",
          c.insurer_name ?? "",
          c.naic ?? "",
          c.policy_number ?? "",
          c.effective_date ?? "",
          c.expiration_date ?? "",
          coverageStatus(c.expiration_date, soonDays),
          eachOcc,
          agg,
          csl,
          all,
          tri(c.additional_insured),
          tri(c.subrogation_waived),
          tri(c.primary_noncontributory),
          tri(c.per_project_aggregate),
          c.notice_of_cancellation_days ?? "",
          ...tail,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }

  const body = rows.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="coi-hero-export-${stamp}.csv"`,
    },
  });
}
