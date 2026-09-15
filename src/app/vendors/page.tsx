import Link from "next/link";
import { Pill, EmptyState } from "@/components/ui";
import NewVendorButton from "@/components/NewVendorButton";
import {
  getSoonDays,
  listCertificates,
  listRequirements,
  listVendors,
} from "@/lib/db";
import { evaluateVendorCompliance } from "@/lib/compliance";
import { formatDate } from "@/lib/dates";
import type { CertificateWithRelations } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_META: Record<
  string,
  { tone: "green" | "red" | "amber" | "slate"; label: string }
> = {
  compliant: { tone: "green", label: "Compliant" },
  non_compliant: { tone: "red", label: "Non-compliant" },
  no_coi: { tone: "amber", label: "No COI" },
  unknown: { tone: "slate", label: "No rules" },
};

export default function VendorsPage() {
  const vendors = listVendors();
  const certs = listCertificates();
  const requirements = listRequirements();
  const soonDays = getSoonDays();

  const byVendor = new Map<number, CertificateWithRelations[]>();
  for (const c of certs) {
    if (c.vendor_id == null) continue;
    const list = byVendor.get(c.vendor_id) ?? [];
    list.push(c);
    byVendor.set(c.vendor_id, list);
  }
  const unassigned = certs.filter((c) => c.vendor_id == null);

  const rows = vendors.map((v) => {
    const vc = byVendor.get(v.id) ?? [];
    const latest = vc
      .map((c) => c.certificate_date)
      .filter(Boolean)
      .sort()
      .at(-1);
    return {
      vendor: v,
      count: vc.length,
      latest: latest ?? null,
      compliance: evaluateVendorCompliance({
        vendorId: v.id,
        certs: vc,
        requirements,
        soonDays,
      }),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
          <p className="text-sm text-slate-500">
            Counterparties you collect COIs from, with current compliance status.
          </p>
        </div>
        <NewVendorButton />
      </div>

      {vendors.length === 0 ? (
        <EmptyState title="No vendors yet">
          Vendors are created automatically from the “insured” name when you upload
          a certificate. You can also add one manually.
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Vendor</th>
                <th className="th">Certificates</th>
                <th className="th">Latest cert date</th>
                <th className="th">Compliance</th>
                <th className="th">Open issues</th>
                <th className="th">Renewal requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ vendor, count, latest, compliance }) => {
                const meta = STATUS_META[compliance.status] ?? STATUS_META.unknown;
                return (
                  <tr key={vendor.id} className="hover:bg-slate-50">
                    <td className="td">
                      <Link
                        href={`/vendors/${vendor.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {vendor.name}
                      </Link>
                    </td>
                    <td className="td">{count}</td>
                    <td className="td">{formatDate(latest)}</td>
                    <td className="td">
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                      {compliance.evaluated_against === "vendor" && (
                        <span className="ml-1 text-xs text-slate-400">
                          (vendor rules)
                        </span>
                      )}
                    </td>
                    <td className="td">
                      {compliance.issues.length ? (
                        <span className="text-slate-600">
                          {compliance.issues.filter((i) => i.severity === "error").length}{" "}
                          errors,{" "}
                          {compliance.issues.filter((i) => i.severity === "warning").length}{" "}
                          warnings
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="td text-xs text-slate-500">
                      {vendor.update_requested_on ?? "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {unassigned.length > 0 && (
        <section className="card border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>{unassigned.length}</strong> certificate
          {unassigned.length === 1 ? "" : "s"} not linked to a vendor.{" "}
          <Link href="/certificates" className="font-medium underline">
            Assign them
          </Link>{" "}
          from the certificate editor.
        </section>
      )}
    </div>
  );
}
