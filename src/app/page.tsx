import Link from "next/link";
import { Pill } from "@/components/ui";
import DemoButton from "@/components/DemoButton";
import {
  certificatesForContract,
  getSoonDays,
  listCertificates,
  listContracts,
  listRequirements,
  listVendors,
} from "@/lib/db";
import { coverageStatus, formatDate } from "@/lib/dates";
import {
  evaluateContractCompliance,
  evaluateVendorCompliance,
} from "@/lib/compliance";
import type {
  CertificateWithRelations,
  Coverage,
  CoverageStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

interface Line {
  cert: CertificateWithRelations;
  coverage: Coverage;
  status: CoverageStatus;
}

export default function DashboardPage() {
  const certs = listCertificates();
  const vendors = listVendors();
  const requirements = listRequirements();
  const soonDays = getSoonDays();

  const lines: Line[] = certs.flatMap((cert) =>
    cert.coverages.map((coverage) => ({
      cert,
      coverage,
      status: coverageStatus(coverage.expiration_date, soonDays),
    })),
  );

  const byExpAsc = (a: Line, b: Line) =>
    (a.coverage.expiration_date ?? "9999").localeCompare(
      b.coverage.expiration_date ?? "9999",
    );

  const expired = lines
    .filter((l) => l.status === "expired")
    .sort((a, b) => -byExpAsc(a, b));
  const expiringSoon = lines
    .filter((l) => l.status === "expiring_soon")
    .sort(byExpAsc);
  const active = lines.filter((l) => l.status === "active").sort(byExpAsc);

  const needsReview = certs.filter(
    (c) => !c.reviewed && c.extraction_status !== "pending",
  );

  const byVendor = new Map<number, CertificateWithRelations[]>();
  for (const c of certs) {
    if (c.vendor_id == null) continue;
    const list = byVendor.get(c.vendor_id) ?? [];
    list.push(c);
    byVendor.set(c.vendor_id, list);
  }
  const nonCompliant = vendors
    .map((v) => ({
      vendor: v,
      result: evaluateVendorCompliance({
        vendorId: v.id,
        certs: byVendor.get(v.id) ?? [],
        requirements,
        soonDays,
      }),
    }))
    .filter(
      (v) =>
        v.result.status === "non_compliant" || v.result.status === "no_coi",
    );

  const certById = new Map(certs.map((c) => [c.id, c]));
  const contractIssues = listContracts()
    .map((contract) => ({
      contract,
      result: evaluateContractCompliance({
        contractId: contract.id,
        inheritGlobal: !!contract.inherit_global_requirements,
        certs: certificatesForContract(contract.id)
          .map((id) => certById.get(id))
          .filter((c): c is NonNullable<typeof c> => !!c),
        requirements,
        soonDays,
      }),
    }))
    .filter(
      (c) =>
        c.result.status === "non_compliant" || c.result.status === "no_coi",
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500">
          {certs.length === 0
            ? "Add your first certificate to get started."
            : `${certs.length} certificates · ${vendors.length} vendors · “expiring soon” = within ${soonDays} days.`}
        </p>
      </div>

      {certs.length === 0 && (
        <div className="card flex flex-col items-center gap-3 border-dashed p-8 text-center">
          <p className="text-sm text-slate-600">
            Want to see COI Hero with data in it? Load a realistic sample set:
            vendors, certificates, expirations, and compliance flags.
          </p>
          <DemoButton />
        </div>
      )}

      {/* Blue: needs review, sits above the three columns */}
      <Link
        href="/certificates"
        className={`block rounded-xl border p-4 transition-colors ${
          needsReview.length
            ? "border-brand-300 bg-brand-50 hover:bg-brand-100"
            : "border-slate-200 bg-white hover:bg-slate-50"
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg text-2xl font-bold ${
              needsReview.length
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            {needsReview.length}
          </div>
          <div>
            <p className="font-semibold text-slate-800">Needs review</p>
            <p className="text-sm text-slate-500">
              {needsReview.length
                ? `Extracted but not yet confirmed. Check the carriers, limits, and dates.`
                : "Every certificate has been reviewed."}
            </p>
          </div>
          <span className="ml-auto text-sm font-medium text-brand-700">
            Open →
          </span>
        </div>
      </Link>

      {/* Three columns: red / yellow / green */}
      <div className="grid gap-5 lg:grid-cols-3">
        <StatusColumn
          title="Expired"
          href="/certificates?status=expired"
          lines={expired}
          tone="red"
          emptyText="Nothing expired."
        />
        <StatusColumn
          title="Expiring soon"
          href="/certificates?status=expiring_soon"
          lines={expiringSoon}
          tone="amber"
          emptyText={`Nothing expiring in the next ${soonDays} days.`}
        />
        <StatusColumn
          title="Active"
          href="/certificates?status=active"
          lines={active}
          tone="green"
          emptyText="No active coverage on file."
        />
      </div>

      {/* Compliance rollup */}
      <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Vendors needing attention</h2>
          <Link href="/vendors" className="text-sm text-brand-700 hover:underline">
            All vendors →
          </Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {nonCompliant.slice(0, 12).map(({ vendor, result }) => (
            <li key={vendor.id} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <Link
                  href={`/vendors/${vendor.id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {vendor.name}
                </Link>
                <Pill tone={result.status === "no_coi" ? "amber" : "red"}>
                  {result.status === "no_coi" ? "No COI" : "Non-compliant"}
                </Pill>
              </div>
              {result.issues.slice(0, 2).map((issue, i) => (
                <div key={i} className="text-xs text-slate-500">
                  • {issue.message}
                </div>
              ))}
            </li>
          ))}
          {nonCompliant.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-400">
              {vendors.length
                ? "All vendors meet their requirements."
                : "No vendors yet."}
            </li>
          )}
        </ul>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Contracts needing attention</h2>
          <Link
            href="/contracts"
            className="text-sm text-brand-700 hover:underline"
          >
            All contracts →
          </Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {contractIssues.slice(0, 12).map(({ contract, result }) => (
            <li key={contract.id} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <Link
                  href={`/contracts/${contract.id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {contract.title}
                </Link>
                <Pill tone={result.status === "no_coi" ? "amber" : "red"}>
                  {result.status === "no_coi" ? "No COI linked" : "Non-compliant"}
                </Pill>
              </div>
              {result.issues.slice(0, 2).map((issue, i) => (
                <div key={i} className="text-xs text-slate-500">
                  • {issue.message}
                </div>
              ))}
            </li>
          ))}
          {contractIssues.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-400">
              No contracts flagged.
            </li>
          )}
        </ul>
      </section>
      </div>
    </div>
  );
}

const TONES = {
  red: {
    wrap: "border-red-300",
    head: "bg-red-100 text-red-900",
    count: "bg-red-600 text-white",
    dot: "bg-red-500",
  },
  amber: {
    wrap: "border-amber-300",
    head: "bg-amber-100 text-amber-900",
    count: "bg-amber-500 text-white",
    dot: "bg-amber-500",
  },
  green: {
    wrap: "border-emerald-300",
    head: "bg-emerald-100 text-emerald-900",
    count: "bg-emerald-600 text-white",
    dot: "bg-emerald-500",
  },
} as const;

function StatusColumn({
  title,
  href,
  lines,
  tone,
  emptyText,
}: {
  title: string;
  href: string;
  lines: Line[];
  tone: keyof typeof TONES;
  emptyText: string;
}) {
  const t = TONES[tone];
  return (
    <div className={`flex flex-col rounded-xl border bg-white shadow-sm ${t.wrap}`}>
      <Link
        href={href}
        className={`flex items-center justify-between rounded-t-xl px-4 py-2.5 ${t.head} hover:brightness-95`}
      >
        <span className="font-semibold">{title}</span>
        <span
          className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-sm font-bold ${t.count}`}
        >
          {lines.length}
        </span>
      </Link>
      <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
        {lines.map(({ cert, coverage }) => (
          <li key={coverage.id} className="px-4 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium text-slate-800">
                {cert.vendor ? (
                  <Link
                    href={`/vendors/${cert.vendor.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {cert.vendor.name}
                  </Link>
                ) : (
                  (cert.insured_name ?? cert.original_file_name)
                )}
              </span>
              <a
                href={`/api/files/${cert.id}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs text-brand-700 hover:underline"
              >
                PDF
              </a>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
              {coverage.coverage_type} · exp{" "}
              {formatDate(coverage.expiration_date)}
            </div>
          </li>
        ))}
        {lines.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-slate-400">
            {emptyText}
          </li>
        )}
      </ul>
    </div>
  );
}
