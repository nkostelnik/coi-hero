import {
  getSoonDays,
  listCertificates,
  listRequirements,
  listVendors,
} from "@/lib/db";
import { buildDigest, describeDays } from "@/lib/digest";

export const dynamic = "force-dynamic";

const HEADERS = [
  "vendor",
  "item",
  "coverage_type",
  "status",
  "expiration_date",
  "days_remaining",
  "when",
  "carrier",
  "policy_number",
  "detail",
  "certificate_id",
  "certificate_url",
];

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const certUrl = (id: number) => `${origin}/certificates/${id}`;

  const digest = buildDigest({
    certs: listCertificates(),
    vendors: listVendors(),
    requirements: listRequirements(),
    soonDays: getSoonDays(),
  });

  const rows: string[] = [HEADERS.join(",")];
  for (const group of digest) {
    for (const { certificate, coverage, status, days } of group.lines) {
      rows.push(
        [
          group.name,
          "coverage",
          coverage.coverage_type,
          status,
          coverage.expiration_date,
          days,
          describeDays(days),
          coverage.insurer_name,
          coverage.policy_number,
          "",
          certificate.id,
          certUrl(certificate.id),
        ]
          .map(csvCell)
          .join(","),
      );
    }
    for (const { issue, certificate } of group.gaps) {
      rows.push(
        [
          group.name,
          "compliance_gap",
          issue.kind === "no_coi" ? "" : issue.coverage_type,
          issue.severity === "error" ? issue.kind : `verify_${issue.kind}`,
          "",
          "",
          "",
          "",
          "",
          issue.message,
          certificate?.id ?? "",
          certificate ? certUrl(certificate.id) : "",
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
      "Content-Disposition": `attachment; filename="coi-hero-digest-${stamp}.csv"`,
    },
  });
}
