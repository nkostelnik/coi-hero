import Link from "next/link";
import { EmptyState, Pill, StatusBadge } from "@/components/ui";
import {
  getSoonDays,
  listCertificates,
  listRequirements,
  listVendors,
} from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { buildDigest, describeDays } from "@/lib/digest";

export const dynamic = "force-dynamic";

export default function DigestPage() {
  const soonDays = getSoonDays();
  const digest = buildDigest({
    certs: listCertificates(),
    vendors: listVendors(),
    requirements: listRequirements(),
    soonDays,
  });

  const lineCount = digest.reduce((n, g) => n + g.lines.length, 0);
  const gapCount = digest.reduce((n, g) => n + g.gaps.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expiration digest</h1>
          <p className="text-sm text-slate-500">
            Coverage that has expired or expires within {soonDays} days, plus
            compliance gaps, grouped by vendor with the earliest expiration
            first. {lineCount} coverage lines · {gapCount} gaps ·{" "}
            {digest.length} vendors.
          </p>
        </div>
        <a href="/api/digest/export" className="btn-ghost">
          Download digest
        </a>
      </div>

      {digest.length === 0 && (
        <EmptyState title="Nothing needs attention">
          No coverage is expired or expiring in the next {soonDays} days, and
          every vendor meets its requirements.
        </EmptyState>
      )}

      {digest.map((group) => (
        <section key={group.vendor?.id ?? "unassigned"} className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">
              {group.vendor ? (
                <Link
                  href={`/vendors/${group.vendor.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {group.name}
                </Link>
              ) : (
                group.name
              )}
            </h2>
            {group.earliestExpiration && (
              <span className="text-xs text-slate-500">
                Earliest: {formatDate(group.earliestExpiration)}
              </span>
            )}
          </div>

          {group.lines.length > 0 && (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr>
                  <th className="th">Coverage</th>
                  <th className="th">Carrier</th>
                  <th className="th">Policy</th>
                  <th className="th">Expires</th>
                  <th className="th">When</th>
                  <th className="th">Status</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {group.lines.map(({ certificate, coverage, status, days }) => (
                  <tr key={coverage.id}>
                    <td className="td">{coverage.coverage_type}</td>
                    <td className="td">{coverage.insurer_name ?? "-"}</td>
                    <td className="td">{coverage.policy_number ?? "-"}</td>
                    <td className="td">
                      {formatDate(coverage.expiration_date)}
                    </td>
                    <td
                      className={`td font-medium ${
                        days < 0 ? "text-red-700" : "text-amber-700"
                      }`}
                    >
                      {describeDays(days)}
                    </td>
                    <td className="td">
                      <StatusBadge status={status} />
                    </td>
                    <td className="td text-right">
                      <Link
                        href={`/certificates/${certificate.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        Certificate →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {group.gaps.length > 0 && (
            <div className={group.lines.length ? "mt-4" : ""}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Compliance gaps
              </h3>
              <ul className="divide-y divide-slate-100">
                {group.gaps.map(({ issue, certificate }, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Pill tone={issue.severity === "error" ? "red" : "amber"}>
                        {issue.severity === "error" ? "Gap" : "Verify"}
                      </Pill>
                      <span className="text-slate-700">{issue.message}</span>
                    </span>
                    {certificate && (
                      <Link
                        href={`/certificates/${certificate.id}`}
                        className="shrink-0 text-brand-700 hover:underline"
                      >
                        Certificate →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
