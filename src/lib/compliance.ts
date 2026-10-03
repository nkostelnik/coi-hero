import { coverageStatus, formatDate } from "./dates";
import type {
  CertificateWithRelations,
  ComplianceIssue,
  ContractCompliance,
  Coverage,
  CoverageType,
  LimitLine,
  Requirement,
  VendorCompliance,
} from "./types";

export function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  if (n >= 1_000_000 && n % 1_000_000 === 0) return `$${n / 1_000_000}M`;
  if (n >= 1_000 && n % 1_000 === 0) return `$${(n / 1_000).toLocaleString()}K`;
  return `$${n.toLocaleString()}`;
}

/** Best guess at a single headline number for a coverage line. */
export function headlineLimit(limits: LimitLine[]): LimitLine | null {
  if (!limits.length) return null;
  const byLabel =
    matchLimit(limits, "each_occurrence") ??
    matchLimit(limits, "csl") ??
    matchLimit(limits, "aggregate");
  if (byLabel) return byLabel;
  const withAmounts = limits.filter((l) => typeof l.amount === "number");
  if (!withAmounts.length) return limits[0];
  return withAmounts.reduce((a, b) => ((b.amount ?? 0) > (a.amount ?? 0) ? b : a));
}

type LimitKind = "each_occurrence" | "aggregate" | "csl";

export function matchLimit(
  limits: LimitLine[],
  kind: LimitKind,
): LimitLine | null {
  const patterns: Record<LimitKind, RegExp[]> = {
    each_occurrence: [
      /each occurrence/i,
      /per occurrence/i,
      /\bel each accident\b/i,
      /bodily injury.*accident/i,
    ],
    aggregate: [/aggregate/i],
    csl: [/combined single limit/i, /\bcsl\b/i],
  };
  for (const re of patterns[kind]) {
    const hit = limits.find((l) => re.test(l.label ?? ""));
    if (hit && typeof hit.amount === "number") return hit;
  }
  return null;
}

/** For a vendor, the strongest current coverage on file for each coverage type. */
export function currentCoverages(
  certs: CertificateWithRelations[],
): Map<CoverageType, { coverage: Coverage; certificate: CertificateWithRelations }> {
  const out = new Map<
    CoverageType,
    { coverage: Coverage; certificate: CertificateWithRelations }
  >();
  for (const cert of certs) {
    for (const cov of cert.coverages) {
      const existing = out.get(cov.coverage_type);
      if (!existing) {
        out.set(cov.coverage_type, { coverage: cov, certificate: cert });
        continue;
      }
      const a = existing.coverage.expiration_date ?? "";
      const b = cov.expiration_date ?? "";
      if (b > a) out.set(cov.coverage_type, { coverage: cov, certificate: cert });
    }
  }
  return out;
}

/** Merge global + vendor-scoped requirements. Vendor rows win per coverage type. */
export function applicableRequirements(
  allRequirements: Requirement[],
  vendorId: number | null,
): Requirement[] {
  const global = allRequirements.filter((r) => r.scope === "global");
  const vendor = vendorId
    ? allRequirements.filter(
        (r) => r.scope === "vendor" && r.vendor_id === vendorId,
      )
    : [];
  const byType = new Map<CoverageType, Requirement>();
  for (const r of global) byType.set(r.coverage_type, r);
  for (const r of vendor) byType.set(r.coverage_type, r);
  return [...byType.values()];
}

export function evaluateVendorCompliance(params: {
  vendorId: number | null;
  certs: CertificateWithRelations[];
  requirements: Requirement[];
  soonDays: number;
  today?: string;
}): VendorCompliance {
  const { vendorId, certs, requirements, soonDays, today } = params;
  const reqs = applicableRequirements(requirements, vendorId).filter(
    (r) => r.required,
  );
  const hasVendorRules =
    !!vendorId &&
    requirements.some((r) => r.scope === "vendor" && r.vendor_id === vendorId);
  const evaluatedAgainst: VendorCompliance["evaluated_against"] = hasVendorRules
    ? "vendor"
    : reqs.length
      ? "global"
      : "none";

  if (certs.length === 0) {
    return {
      vendor_id: vendorId ?? 0,
      status: "no_coi",
      issues: [
        {
          coverage_type: "Other",
          kind: "no_coi",
          severity: "error",
          message: "No certificate of insurance on file.",
        },
      ],
      evaluated_against: evaluatedAgainst,
    };
  }

  if (reqs.length === 0) {
    return {
      vendor_id: vendorId ?? 0,
      status: "unknown",
      issues: [],
      evaluated_against: "none",
    };
  }

  const issues = requirementIssues(currentCoverages(certs), reqs, soonDays, today);
  const status = issues.some((i) => i.severity === "error")
    ? "non_compliant"
    : "compliant";

  return {
    vendor_id: vendorId ?? 0,
    status,
    issues,
    evaluated_against: evaluatedAgainst,
  };
}

/** Contract-scoped requirements, optionally merged with the global set. */
export function contractRequirements(
  allRequirements: Requirement[],
  contractId: number,
  inheritGlobal: boolean,
): Requirement[] {
  const own = allRequirements.filter(
    (r) => r.scope === "contract" && r.contract_id === contractId,
  );
  const byType = new Map<CoverageType, Requirement>();
  if (inheritGlobal) {
    for (const r of allRequirements.filter((r) => r.scope === "global")) {
      byType.set(r.coverage_type, r);
    }
  }
  for (const r of own) byType.set(r.coverage_type, r);
  return [...byType.values()];
}

export function evaluateContractCompliance(params: {
  contractId: number;
  inheritGlobal: boolean;
  certs: CertificateWithRelations[];
  requirements: Requirement[];
  soonDays: number;
  today?: string;
}): ContractCompliance {
  const { contractId, inheritGlobal, certs, requirements, soonDays, today } =
    params;
  const hasOwn = requirements.some(
    (r) => r.scope === "contract" && r.contract_id === contractId,
  );
  const reqs = contractRequirements(requirements, contractId, inheritGlobal).filter(
    (r) => r.required,
  );
  const evaluatedAgainst: ContractCompliance["evaluated_against"] =
    hasOwn && inheritGlobal && reqs.length
      ? "contract+global"
      : hasOwn
        ? "contract"
        : reqs.length
          ? "global"
          : "none";

  if (certs.length === 0) {
    return {
      contract_id: contractId,
      status: "no_coi",
      issues: [
        {
          coverage_type: "Other",
          kind: "no_coi",
          severity: "error",
          message: "No certificate of insurance linked to this contract.",
        },
      ],
      evaluated_against: evaluatedAgainst,
    };
  }
  if (reqs.length === 0) {
    return {
      contract_id: contractId,
      status: "unknown",
      issues: [],
      evaluated_against: "none",
    };
  }

  const issues = requirementIssues(currentCoverages(certs), reqs, soonDays, today);
  return {
    contract_id: contractId,
    status: issues.some((i) => i.severity === "error")
      ? "non_compliant"
      : "compliant",
    issues,
    evaluated_against: evaluatedAgainst,
  };
}

function requirementIssues(
  current: ReturnType<typeof currentCoverages>,
  reqs: Requirement[],
  soonDays: number,
  today?: string,
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  for (const req of reqs) {
    const found = current.get(req.coverage_type);
    if (!found) {
      issues.push({
        coverage_type: req.coverage_type,
        kind: "missing",
        severity: "error",
        message: `No ${req.coverage_type} coverage found on any certificate.`,
      });
      continue;
    }
    const cov = found.coverage;
    const status = coverageStatus(cov.expiration_date, soonDays, today);
    if (status === "expired") {
      issues.push({
        coverage_type: req.coverage_type,
        kind: "expired",
        severity: "error",
        message: `${req.coverage_type} expired ${formatDate(cov.expiration_date)}.`,
      });
    } else if (status === "expiring_soon") {
      issues.push({
        coverage_type: req.coverage_type,
        kind: "expiring_soon",
        severity: "warning",
        message: `${req.coverage_type} expires ${formatDate(cov.expiration_date)}.`,
      });
    } else if (status === "unknown") {
      issues.push({
        coverage_type: req.coverage_type,
        kind: "no_date",
        severity: "warning",
        message: `${req.coverage_type} expiration date not detected, verify manually.`,
      });
    }

    checkLimit(issues, req, cov, "each_occurrence", req.min_each_occurrence);
    checkLimit(issues, req, cov, "aggregate", req.min_aggregate);
    checkLimit(issues, req, cov, "csl", req.min_combined_single_limit);

    if (req.require_additional_insured) {
      if (cov.additional_insured === 0) {
        issues.push({
          coverage_type: req.coverage_type,
          kind: "additional_insured",
          severity: "error",
          message: `${req.coverage_type}: additional insured is required but not indicated.`,
        });
      } else if (cov.additional_insured == null) {
        issues.push({
          coverage_type: req.coverage_type,
          kind: "additional_insured",
          severity: "warning",
          message: `${req.coverage_type}: additional insured status not detected, verify.`,
        });
      }
    }
    if (req.require_waiver_of_subrogation) {
      if (cov.subrogation_waived === 0) {
        issues.push({
          coverage_type: req.coverage_type,
          kind: "waiver_of_subrogation",
          severity: "error",
          message: `${req.coverage_type}: waiver of subrogation is required but not indicated.`,
        });
      } else if (cov.subrogation_waived == null) {
        issues.push({
          coverage_type: req.coverage_type,
          kind: "waiver_of_subrogation",
          severity: "warning",
          message: `${req.coverage_type}: waiver of subrogation not detected, verify.`,
        });
      }
    }
  }
  return issues;
}

function checkLimit(
  issues: ComplianceIssue[],
  req: Requirement,
  cov: Coverage,
  kind: LimitKind,
  minimum: number | null,
) {
  if (minimum == null) return;
  const label =
    kind === "each_occurrence"
      ? "each-occurrence"
      : kind === "aggregate"
        ? "aggregate"
        : "combined single";
  const matched = matchLimit(cov.limits, kind);
  const value = matched?.amount ?? headlineLimit(cov.limits)?.amount ?? null;
  if (value == null) {
    issues.push({
      coverage_type: req.coverage_type,
      kind: "limit",
      severity: "warning",
      message: `${req.coverage_type}: could not read a ${label} limit to check against ${formatMoney(minimum)}.`,
    });
    return;
  }
  if (value < minimum) {
    issues.push({
      coverage_type: req.coverage_type,
      kind: "limit",
      severity: "error",
      message: `${req.coverage_type}: ${label} limit ${formatMoney(value)} is below the required ${formatMoney(minimum)}.`,
    });
  }
}
