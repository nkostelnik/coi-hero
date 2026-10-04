import { currentCoverages, evaluateVendorCompliance } from "./compliance";
import { coverageStatus, daysBetween, todayIso } from "./dates";
import type {
  CertificateWithRelations,
  ComplianceIssue,
  Coverage,
  CoverageStatus,
  Requirement,
  Vendor,
} from "./types";

/** Issue kinds that describe a requirement gap rather than a date problem. */
const GAP_KINDS = new Set<ComplianceIssue["kind"]>([
  "no_coi",
  "missing",
  "limit",
  "additional_insured",
  "waiver_of_subrogation",
]);

export interface DigestLine {
  certificate: CertificateWithRelations;
  coverage: Coverage;
  status: Extract<CoverageStatus, "expired" | "expiring_soon">;
  /** Negative once expired. */
  days: number;
}

export interface DigestGap {
  issue: ComplianceIssue;
  /** Certificate holding the coverage the gap refers to, if one is on file. */
  certificate: CertificateWithRelations | null;
}

export interface DigestGroup {
  /** null for certificates not yet matched to a vendor. */
  vendor: Vendor | null;
  name: string;
  lines: DigestLine[];
  gaps: DigestGap[];
  earliestExpiration: string | null;
}

/**
 * Per vendor: every coverage line that is expired or inside the "expiring
 * soon" window, plus the requirement gaps from the vendor compliance check.
 * Groups and lines are sorted by earliest expiration first.
 */
export function buildDigest(params: {
  certs: CertificateWithRelations[];
  vendors: Vendor[];
  requirements: Requirement[];
  soonDays: number;
  today?: string;
}): DigestGroup[] {
  const { certs, vendors, requirements, soonDays } = params;
  const today = params.today ?? todayIso();

  const certsByVendor = new Map<number | null, CertificateWithRelations[]>();
  for (const c of certs) {
    const list = certsByVendor.get(c.vendor_id) ?? [];
    list.push(c);
    certsByVendor.set(c.vendor_id, list);
  }

  const groups: DigestGroup[] = [];
  const owners: Array<Vendor | null> = [...vendors];
  if (certsByVendor.has(null)) owners.push(null);

  for (const vendor of owners) {
    const vendorCerts = certsByVendor.get(vendor?.id ?? null) ?? [];

    const lines: DigestLine[] = [];
    for (const certificate of vendorCerts) {
      for (const coverage of certificate.coverages) {
        const status = coverageStatus(coverage.expiration_date, soonDays, today);
        if (status !== "expired" && status !== "expiring_soon") continue;
        lines.push({
          certificate,
          coverage,
          status,
          days: daysBetween(today, coverage.expiration_date!),
        });
      }
    }
    lines.sort((a, b) => a.days - b.days);

    // Compliance is evaluated per vendor, so unmatched certificates have none.
    let gaps: DigestGap[] = [];
    if (vendor) {
      const current = currentCoverages(vendorCerts);
      gaps = evaluateVendorCompliance({
        vendorId: vendor.id,
        certs: vendorCerts,
        requirements,
        soonDays,
        today,
      })
        .issues.filter((issue) => GAP_KINDS.has(issue.kind))
        .map((issue) => ({
          issue,
          certificate:
            issue.kind === "no_coi" || issue.kind === "missing"
              ? null
              : (current.get(issue.coverage_type)?.certificate ?? null),
        }));
    }

    if (!lines.length && !gaps.length) continue;
    groups.push({
      vendor,
      name: vendor?.name ?? "Unassigned certificates",
      lines,
      gaps,
      earliestExpiration: lines[0]?.coverage.expiration_date ?? null,
    });
  }

  // Earliest expiration first; groups with only gaps follow, by name.
  return groups.sort((a, b) => {
    if (a.earliestExpiration && b.earliestExpiration) {
      return (
        a.earliestExpiration.localeCompare(b.earliestExpiration) ||
        a.name.localeCompare(b.name)
      );
    }
    if (a.earliestExpiration) return -1;
    if (b.earliestExpiration) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** "12 days left", "Expires today", "5 days ago". */
export function describeDays(days: number): string {
  if (days === 0) return "Expires today";
  const n = Math.abs(days);
  const unit = n === 1 ? "day" : "days";
  return days > 0 ? `${n} ${unit} left` : `${n} ${unit} ago`;
}

const CSV_HEADERS = [
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

/**
 * The digest as CSV, one row per coverage line or gap. `certUrl` turns a
 * certificate id into a link; leave it out where there is nowhere to link.
 */
export function digestCsv(
  digest: DigestGroup[],
  certUrl: (id: number) => string = () => "",
): string {
  const rows: string[] = [CSV_HEADERS.join(",")];
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

  return rows.join("\r\n");
}
