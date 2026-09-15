import Link from "next/link";
import { notFound } from "next/navigation";
import { Pill, StatusBadge } from "@/components/ui";
import VendorEditor from "@/components/VendorEditor";
import {
  getSoonDays,
  getVendor,
  listCertificates,
  listRequirements,
} from "@/lib/db";
import {
  currentCoverages,
  evaluateVendorCompliance,
  formatMoney,
  headlineLimit,
} from "@/lib/compliance";
import { coverageStatus, formatDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vendor = getVendor(Number(id));
  if (!vendor) notFound();

  const soonDays = getSoonDays();
  const requirements = listRequirements();
  const certs = listCertificates().filter((c) => c.vendor_id === vendor.id);
  const compliance = evaluateVendorCompliance({
    vendorId: vendor.id,
    certs,
    requirements,
    soonDays,
  });
  const current = currentCoverages(certs);
  const vendorRules = requirements.filter(
    (r) => r.scope === "vendor" && r.vendor_id === vendor.id,
  );

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/vendors"
          className="text-sm text-brand-700 hover:underline"
        >
          ← Vendors
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{vendor.name}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Current coverage on file</h2>
            {current.size === 0 ? (
              <p className="text-sm text-slate-500">
                No coverage lines extracted yet.
              </p>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr>
                    <th className="th">Coverage</th>
                    <th className="th">Carrier</th>
                    <th className="th">Limit</th>
                    <th className="th">Expires</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...current.values()].map(({ coverage }) => {
                    const limit = headlineLimit(coverage.limits);
                    return (
                      <tr key={coverage.id}>
                        <td className="td">{coverage.coverage_type}</td>
                        <td className="td">{coverage.insurer_name ?? "-"}</td>
                        <td className="td">
                          {limit
                            ? limit.amount != null
                              ? formatMoney(limit.amount)
                              : limit.amount_raw
                            : "-"}
                        </td>
                        <td className="td">
                          {formatDate(coverage.expiration_date)}
                        </td>
                        <td className="td">
                          <StatusBadge
                            status={coverageStatus(
                              coverage.expiration_date,
                              soonDays,
                            )}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Certificates ({certs.length})</h2>
              <Link href="/upload" className="text-sm text-brand-700 hover:underline">
                + Add
              </Link>
            </div>
            <ul className="divide-y divide-slate-100">
              {certs.map((cert) => (
                <li
                  key={cert.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {cert.original_file_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      Cert date {formatDate(cert.certificate_date)} ·{" "}
                      {cert.coverages.length} coverage lines ·{" "}
                      {cert.reviewed ? "reviewed" : "unreviewed"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={`/api/files/${cert.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-700 hover:underline"
                    >
                      PDF
                    </a>
                    <Link
                      href={`/certificates/${cert.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      Edit
                    </Link>
                  </div>
                </li>
              ))}
              {certs.length === 0 && (
                <li className="py-4 text-sm text-slate-400">
                  No certificates linked to this vendor.
                </li>
              )}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section
            className={`card p-5 ${
              compliance.status === "non_compliant"
                ? "border-red-200"
                : compliance.status === "compliant"
                  ? "border-emerald-200"
                  : ""
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Compliance</h2>
              <Pill
                tone={
                  compliance.status === "compliant"
                    ? "green"
                    : compliance.status === "non_compliant"
                      ? "red"
                      : compliance.status === "no_coi"
                        ? "amber"
                        : "slate"
                }
              >
                {compliance.status === "compliant"
                  ? "Compliant"
                  : compliance.status === "non_compliant"
                    ? "Non-compliant"
                    : compliance.status === "no_coi"
                      ? "No COI"
                      : "No rules"}
              </Pill>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Checked against{" "}
              {compliance.evaluated_against === "vendor"
                ? "this vendor’s own requirements"
                : compliance.evaluated_against === "global"
                  ? "the global requirements"
                  : "nothing (no requirements defined)"}
              .
            </p>
            {compliance.issues.length === 0 ? (
              <p className="text-sm text-emerald-700">No open issues.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {compliance.issues.map((issue, i) => (
                  <li
                    key={i}
                    className={
                      issue.severity === "error"
                        ? "text-red-700"
                        : "text-amber-700"
                    }
                  >
                    {issue.severity === "error" ? "✕" : "!"} {issue.message}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              {vendorRules.length
                ? `${vendorRules.length} vendor-specific rule(s). `
                : "Using global rules. "}
              <Link href="/requirements" className="text-brand-700 hover:underline">
                Edit requirements →
              </Link>
            </p>
          </section>

          <VendorEditor vendor={vendor} />
        </div>
      </div>
    </div>
  );
}
