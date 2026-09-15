"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { coverageStatus, formatDate } from "@/lib/dates";
import { formatMoney, headlineLimit } from "@/lib/compliance";
import { COVERAGE_TYPES } from "@/lib/types";
import type {
  CertificateWithRelations,
  Coverage,
  CoverageStatus,
  Vendor,
} from "@/lib/types";
import { StatusBadge, Pill } from "./ui";

type View = "coverage" | "certificate";
type StatusFilter = "all" | CoverageStatus;
type EndorsementFilter = "all" | "AI" | "WoS" | "PNC" | "PPA" | "NOC";

const ENDORSEMENT_LABEL: Record<Exclude<EndorsementFilter, "all">, string> = {
  AI: "Additional insured",
  WoS: "Waiver of subrogation",
  PNC: "Primary & non-contributory",
  PPA: "Per-project aggregate",
  NOC: "Notice of cancellation",
};

function endorsementMatch(c: Coverage, e: EndorsementFilter): boolean {
  switch (e) {
    case "AI":
      return c.additional_insured === 1;
    case "WoS":
      return c.subrogation_waived === 1;
    case "PNC":
      return c.primary_noncontributory === 1;
    case "PPA":
      return c.per_project_aggregate === 1;
    case "NOC":
      return c.notice_of_cancellation_days != null;
    default:
      return true;
  }
}

function endorsementItems(
  c: Coverage,
): Array<{ key: Exclude<EndorsementFilter, "all">; label: string }> {
  const items: Array<{ key: Exclude<EndorsementFilter, "all">; label: string }> =
    [];
  if (c.additional_insured === 1) items.push({ key: "AI", label: "AI" });
  if (c.subrogation_waived === 1) items.push({ key: "WoS", label: "WoS" });
  if (c.primary_noncontributory === 1)
    items.push({ key: "PNC", label: "P&NC" });
  if (c.per_project_aggregate === 1)
    items.push({ key: "PPA", label: "Per-project" });
  if (c.notice_of_cancellation_days)
    items.push({
      key: "NOC",
      label: `${c.notice_of_cancellation_days}d notice`,
    });
  return items;
}

interface Props {
  certificates: CertificateWithRelations[];
  vendors: Vendor[];
  soonDays: number;
  initialStatus?: string;
  initialVendorId?: string;
}

interface CoverageRow {
  cert: CertificateWithRelations;
  coverage: Coverage;
  status: CoverageStatus;
}

export default function CertificatesTable({
  certificates,
  vendors,
  soonDays,
  initialStatus,
  initialVendorId,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>("coverage");
  const [q, setQ] = useState("");
  const [vendorId, setVendorId] = useState<string>(initialVendorId ?? "all");
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>(
    (initialStatus as StatusFilter) ?? "all",
  );
  const [endorsement, setEndorsement] = useState<EndorsementFilter>("all");
  const [sortKey, setSortKey] = useState<string>("expiration");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkVendor, setBulkVendor] = useState("");

  const coverageRows = useMemo<CoverageRow[]>(() => {
    const rows: CoverageRow[] = [];
    for (const cert of certificates) {
      for (const coverage of cert.coverages) {
        rows.push({
          cert,
          coverage,
          status: coverageStatus(coverage.expiration_date, soonDays),
        });
      }
    }
    return rows;
  }, [certificates, soonDays]);

  const needle = q.trim().toLowerCase();
  const matchesText = (cert: CertificateWithRelations, cov?: Coverage) => {
    if (!needle) return true;
    const hay = [
      cert.vendor?.name,
      cert.insured_name,
      cert.certificate_holder_name,
      cert.producer_name,
      cert.original_file_name,
      cert.contract_reference,
      cert.internal_owner,
      cov?.policy_number,
      cov?.insurer_name,
      cov?.coverage_type,
      cov?.coverage_type_raw,
      ...cert.coverages.flatMap((c) => [
        c.policy_number,
        c.insurer_name,
        c.coverage_type,
      ]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(needle);
  };

  const filteredCoverage = useMemo(() => {
    const rows = coverageRows.filter((r) => {
      if (vendorId !== "all" && String(r.cert.vendor_id ?? "") !== vendorId)
        return false;
      if (type !== "all" && r.coverage.coverage_type !== type) return false;
      if (status !== "all" && r.status !== status) return false;
      if (endorsement !== "all" && !endorsementMatch(r.coverage, endorsement))
        return false;
      return matchesText(r.cert, r.coverage);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const statusRank: Record<CoverageStatus, number> = {
      expired: 0,
      expiring_soon: 1,
      unknown: 2,
      active: 3,
    };
    rows.sort((a, b) => {
      switch (sortKey) {
        case "vendor":
          return (
            dir *
            (a.cert.vendor?.name ?? "~").localeCompare(b.cert.vendor?.name ?? "~")
          );
        case "type":
          return dir * a.coverage.coverage_type.localeCompare(b.coverage.coverage_type);
        case "carrier":
          return (
            dir *
            (a.coverage.insurer_name ?? "~").localeCompare(
              b.coverage.insurer_name ?? "~",
            )
          );
        case "status":
          return dir * (statusRank[a.status] - statusRank[b.status]);
        case "effective":
          return dir * (a.coverage.effective_date ?? "").localeCompare(b.coverage.effective_date ?? "");
        case "expiration":
        default:
          return (
            dir *
            (a.coverage.expiration_date ?? "9999").localeCompare(
              b.coverage.expiration_date ?? "9999",
            )
          );
      }
    });
    return rows;
  }, [coverageRows, vendorId, type, status, endorsement, needle, sortKey, sortDir]);

  const filteredCerts = useMemo(() => {
    const rows = certificates.filter((cert) => {
      if (vendorId !== "all" && String(cert.vendor_id ?? "") !== vendorId)
        return false;
      if (type !== "all" && !cert.coverages.some((c) => c.coverage_type === type))
        return false;
      if (status !== "all") {
        const statuses = cert.coverages.map((c) =>
          coverageStatus(c.expiration_date, soonDays),
        );
        if (!statuses.includes(status as CoverageStatus)) return false;
      }
      if (
        endorsement !== "all" &&
        !cert.coverages.some((c) => endorsementMatch(c, endorsement))
      )
        return false;
      return matchesText(cert);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "vendor":
          return dir * (a.vendor?.name ?? "~").localeCompare(b.vendor?.name ?? "~");
        case "cert_date":
          return dir * (a.certificate_date ?? "").localeCompare(b.certificate_date ?? "");
        case "added":
          return dir * a.created_at.localeCompare(b.created_at);
        case "expiration":
        default: {
          const ax = earliestExpiration(a) ?? "9999";
          const bx = earliestExpiration(b) ?? "9999";
          return dir * ax.localeCompare(bx);
        }
      }
    });
    return rows;
  }, [
    certificates,
    vendorId,
    type,
    status,
    endorsement,
    needle,
    sortKey,
    sortDir,
    soonDays,
  ]);

  const visibleCertIds = useMemo(
    () =>
      view === "coverage"
        ? [...new Set(filteredCoverage.map((r) => r.cert.id))]
        : filteredCerts.map((c) => c.id),
    [view, filteredCoverage, filteredCerts],
  );
  const allSelected =
    visibleCertIds.length > 0 && visibleCertIds.every((id) => selected.has(id));

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((s) => {
      const next = new Set(s);
      if (allSelected) visibleCertIds.forEach((id) => next.delete(id));
      else visibleCertIds.forEach((id) => next.add(id));
      return next;
    });

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const arrow = (key: string) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  // Click a pill / badge to filter by it; click it again to clear.
  const pickType = (t: string) => setType((cur) => (cur === t ? "all" : t));
  const pickStatus = (s: CoverageStatus) =>
    setStatus((cur) => (cur === s ? "all" : s));
  const pickEndorsement = (e: Exclude<EndorsementFilter, "all">) =>
    setEndorsement((cur) => (cur === e ? "all" : e));

  const anyFilter =
    !!q ||
    vendorId !== "all" ||
    type !== "all" ||
    status !== "all" ||
    endorsement !== "all";
  const clearFilters = () => {
    setQ("");
    setVendorId("all");
    setType("all");
    setStatus("all");
    setEndorsement("all");
  };

  async function bulk(action: string, extra: Record<string, unknown> = {}) {
    const ids = [...selected];
    if (!ids.length) return;
    if (action === "delete" && !confirm(`Delete ${ids.length} certificate(s) and their files?`))
      return;
    setBulkBusy(true);
    await fetch("/api/certificates/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action, ...extra }),
    });
    setBulkBusy(false);
    setSelected(new Set());
    setBulkVendor("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          <button
            onClick={() => setView("coverage")}
            className={`px-3 py-1.5 text-sm font-medium ${
              view === "coverage"
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            By coverage line
          </button>
          <button
            onClick={() => setView("certificate")}
            className={`px-3 py-1.5 text-sm font-medium ${
              view === "certificate"
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            By certificate
          </button>
        </div>

        <input
          className="input max-w-xs"
          placeholder="Search vendor, policy #, carrier…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select
          className="input max-w-[12rem]"
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
        >
          <option value="all">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={String(v.id)}>
              {v.name}
            </option>
          ))}
        </select>

        <select
          className="input max-w-[14rem]"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">All coverage types</option>
          {COVERAGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          className="input max-w-[10rem]"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="expiring_soon">Expiring soon</option>
          <option value="expired">Expired</option>
          <option value="unknown">No date</option>
        </select>

        <a href="/api/certificates/export" className="btn-ghost">
          Export CSV
        </a>

        {endorsement !== "all" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-200">
            {ENDORSEMENT_LABEL[endorsement]}
            <button
              type="button"
              onClick={() => setEndorsement("all")}
              className="text-brand-600 hover:text-brand-900"
              aria-label="Clear endorsement filter"
            >
              ×
            </button>
          </span>
        )}

        {anyFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-brand-700 hover:underline"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-sm text-slate-500">
          {view === "coverage"
            ? `${filteredCoverage.length} coverage lines`
            : `${filteredCerts.length} certificates`}
        </span>
      </div>
      <p className="-mt-2 text-xs text-slate-400">
        Tip: click a status badge or endorsement pill to filter by it.
      </p>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm">
          <strong>{selected.size} selected</strong>
          <button
            className="btn-ghost"
            disabled={bulkBusy}
            onClick={() => bulk("review")}
          >
            Mark reviewed
          </button>
          <button
            className="btn-ghost"
            disabled={bulkBusy}
            onClick={() => bulk("unreview")}
          >
            Unreview
          </button>
          <span className="flex items-center gap-1">
            <input
              className="input h-8 w-48 py-1"
              list="bulk-vendor-list"
              placeholder="Assign to vendor…"
              value={bulkVendor}
              onChange={(e) => setBulkVendor(e.target.value)}
            />
            <datalist id="bulk-vendor-list">
              {vendors.map((v) => (
                <option key={v.id} value={v.name} />
              ))}
            </datalist>
            <button
              className="btn-ghost"
              disabled={bulkBusy || !bulkVendor.trim()}
              onClick={() => {
                const match = vendors.find(
                  (v) => v.name.toLowerCase() === bulkVendor.trim().toLowerCase(),
                );
                bulk(
                  "assign_vendor",
                  match
                    ? { vendor_id: match.id }
                    : { vendor_name: bulkVendor.trim() },
                );
              }}
            >
              Apply
            </button>
          </span>
          <button
            className="btn-danger"
            disabled={bulkBusy}
            onClick={() => bulk("delete")}
          >
            Delete
          </button>
          <button
            className="ml-auto text-slate-500 hover:underline"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      <div className="card overflow-x-auto">
        {view === "coverage" ? (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th className="th cursor-pointer" onClick={() => toggleSort("vendor")}>
                  Vendor{arrow("vendor")}
                </th>
                <th className="th cursor-pointer" onClick={() => toggleSort("type")}>
                  Coverage{arrow("type")}
                </th>
                <th className="th cursor-pointer" onClick={() => toggleSort("carrier")}>
                  Carrier{arrow("carrier")}
                </th>
                <th className="th">Policy #</th>
                <th className="th cursor-pointer" onClick={() => toggleSort("effective")}>
                  Effective{arrow("effective")}
                </th>
                <th className="th cursor-pointer" onClick={() => toggleSort("expiration")}>
                  Expiration{arrow("expiration")}
                </th>
                <th className="th">Limit</th>
                <th className="th">Endorsements</th>
                <th className="th cursor-pointer" onClick={() => toggleSort("status")}>
                  Status{arrow("status")}
                </th>
                <th className="th">COI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCoverage.map(({ cert, coverage, status: rowStatus }) => {
                const limit = headlineLimit(coverage.limits);
                return (
                  <tr key={coverage.id} className="hover:bg-slate-50">
                    <td className="td">
                      <input
                        type="checkbox"
                        checked={selected.has(cert.id)}
                        onChange={() => toggle(cert.id)}
                      />
                    </td>
                    <td className="td">
                      {cert.vendor ? (
                        <Link
                          href={`/vendors/${cert.vendor.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {cert.vendor.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                      <div className="text-xs text-slate-400">
                        {cert.insured_name ?? cert.original_file_name}
                      </div>
                    </td>
                    <td className="td">
                      <div>{coverage.coverage_type}</div>
                      {coverage.coverage_type_raw &&
                      coverage.coverage_type_raw !== coverage.coverage_type ? (
                        <div className="text-xs text-slate-400">
                          {coverage.coverage_type_raw}
                        </div>
                      ) : null}
                    </td>
                    <td className="td">{coverage.insurer_name ?? "-"}</td>
                    <td className="td font-mono text-xs">
                      {coverage.policy_number ?? "-"}
                    </td>
                    <td className="td">{formatDate(coverage.effective_date)}</td>
                    <td className="td">{formatDate(coverage.expiration_date)}</td>
                    <td className="td">
                      {limit ? (
                        <span title={coverage.limits.map((l) => `${l.label}: ${l.amount_raw ?? l.amount ?? "?"}`).join("\n")}>
                          {limit.amount != null
                            ? formatMoney(limit.amount)
                            : limit.amount_raw ?? "-"}
                          <span className="ml-1 text-xs text-slate-400">
                            {limit.label}
                          </span>
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="td">
                      <Endorsements
                        coverage={coverage}
                        activeKey={endorsement}
                        onPick={pickEndorsement}
                      />
                    </td>
                    <td className="td">
                      <StatusBadge
                        status={rowStatus}
                        onClick={() => pickStatus(rowStatus)}
                        active={status === rowStatus}
                      />
                    </td>
                    <td className="td whitespace-nowrap">
                      <a
                        href={`/api/files/${cert.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-700 hover:underline"
                      >
                        PDF
                      </a>
                      <span className="px-1 text-slate-300">·</span>
                      <Link
                        href={`/certificates/${cert.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filteredCoverage.length === 0 && (
                <tr>
                  <td className="td py-10 text-center text-slate-400" colSpan={11}>
                    No coverage lines match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th className="th cursor-pointer" onClick={() => toggleSort("vendor")}>
                  Vendor{arrow("vendor")}
                </th>
                <th className="th">Insured / holder</th>
                <th className="th cursor-pointer" onClick={() => toggleSort("cert_date")}>
                  Cert date{arrow("cert_date")}
                </th>
                <th className="th">Coverages</th>
                <th className="th cursor-pointer" onClick={() => toggleSort("expiration")}>
                  Earliest expiry{arrow("expiration")}
                </th>
                <th className="th">Reference</th>
                <th className="th">Extraction</th>
                <th className="th cursor-pointer" onClick={() => toggleSort("added")}>
                  Added{arrow("added")}
                </th>
                <th className="th">COI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCerts.map((cert) => {
                const exp = earliestExpiration(cert);
                const worst = worstStatus(cert, soonDays);
                return (
                  <tr key={cert.id} className="hover:bg-slate-50">
                    <td className="td">
                      <input
                        type="checkbox"
                        checked={selected.has(cert.id)}
                        onChange={() => toggle(cert.id)}
                      />
                    </td>
                    <td className="td">
                      {cert.vendor ? (
                        <Link
                          href={`/vendors/${cert.vendor.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {cert.vendor.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="td">
                      <div>{cert.insured_name ?? "-"}</div>
                      <div className="text-xs text-slate-400">
                        {cert.certificate_holder_name
                          ? `Holder: ${cert.certificate_holder_name}`
                          : cert.original_file_name}
                      </div>
                    </td>
                    <td className="td">{formatDate(cert.certificate_date)}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {[...new Set(cert.coverages.map((c) => c.coverage_type))].map(
                          (ct) => (
                            <Pill
                              key={ct}
                              onClick={() => pickType(ct)}
                              active={type === ct}
                              title={`Filter: ${ct}`}
                            >
                              {shortType(ct)}
                            </Pill>
                          ),
                        )}
                        {cert.coverages.length === 0 && (
                          <span className="text-xs text-slate-400">none</span>
                        )}
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        {formatDate(exp)}
                        <StatusBadge
                          status={worst}
                          onClick={() => pickStatus(worst)}
                          active={status === worst}
                        />
                      </div>
                    </td>
                    <td className="td text-xs text-slate-500">
                      {cert.contract_reference || cert.internal_owner ? (
                        <>
                          {cert.contract_reference && (
                            <div>{cert.contract_reference}</div>
                          )}
                          {cert.internal_owner && (
                            <div className="text-slate-400">
                              {cert.internal_owner}
                            </div>
                          )}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="td">
                      <ExtractionPill cert={cert} />
                    </td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">
                      {cert.created_at.slice(0, 10)}
                    </td>
                    <td className="td whitespace-nowrap">
                      <a
                        href={`/api/files/${cert.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-700 hover:underline"
                      >
                        PDF
                      </a>
                      <span className="px-1 text-slate-300">·</span>
                      <Link
                        href={`/certificates/${cert.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filteredCerts.length === 0 && (
                <tr>
                  <td className="td py-10 text-center text-slate-400" colSpan={10}>
                    No certificates match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Endorsements({
  coverage,
  activeKey,
  onPick,
}: {
  coverage: Coverage;
  activeKey: EndorsementFilter;
  onPick: (key: Exclude<EndorsementFilter, "all">) => void;
}) {
  const items = endorsementItems(coverage);
  if (items.length === 0)
    return <span className="text-xs text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => (
        <Pill
          key={it.key}
          tone="blue"
          onClick={() => onPick(it.key)}
          active={activeKey === it.key}
          title={`Filter: ${ENDORSEMENT_LABEL[it.key]}`}
        >
          {it.label}
        </Pill>
      ))}
    </div>
  );
}

function ExtractionPill({ cert }: { cert: CertificateWithRelations }) {
  if (cert.reviewed) return <Pill tone="green">Reviewed</Pill>;
  switch (cert.extraction_status) {
    case "ok":
      return <Pill tone="amber">Needs review</Pill>;
    case "failed":
      return <Pill tone="red">Extraction failed</Pill>;
    case "skipped":
      return <Pill tone="amber">Manual entry</Pill>;
    case "manual":
      return <Pill tone="amber">Needs review</Pill>;
    default:
      return <Pill>Pending</Pill>;
  }
}

function earliestExpiration(cert: CertificateWithRelations): string | null {
  const dates = cert.coverages
    .map((c) => c.expiration_date)
    .filter((d): d is string => !!d)
    .sort();
  return dates[0] ?? null;
}

function worstStatus(
  cert: CertificateWithRelations,
  soonDays: number,
): CoverageStatus {
  const order: CoverageStatus[] = ["expired", "expiring_soon", "unknown", "active"];
  const statuses = cert.coverages.map((c) =>
    coverageStatus(c.expiration_date, soonDays),
  );
  for (const s of order) if (statuses.includes(s)) return s;
  return "unknown";
}

function shortType(t: string): string {
  return (
    {
      "Commercial General Liability": "GL",
      "Automobile Liability": "Auto",
      "Umbrella / Excess Liability": "Umbrella",
      "Workers Compensation & Employers Liability": "WC",
      "Professional Liability / E&O": "Prof/E&O",
      "Cyber Liability": "Cyber",
      "Pollution / Environmental Liability": "Pollution",
      Property: "Property",
      Other: "Other",
    }[t] ?? t
  );
}
