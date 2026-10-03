import Link from "next/link";
import CertificatesTable from "@/components/CertificatesTable";
import DemoButton from "@/components/DemoButton";
import { EmptyState } from "@/components/ui";
import { getSoonDays, listCertificates, listVendors } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_VALUES = ["active", "expiring_soon", "expired", "unknown"];

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const certificates = listCertificates();
  const vendors = listVendors();
  const soonDays = getSoonDays();

  const rawStatus = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const initialStatus = STATUS_VALUES.includes(rawStatus ?? "")
    ? rawStatus
    : undefined;
  const rawVendor = Array.isArray(sp.vendor) ? sp.vendor[0] : sp.vendor;
  const initialVendorId =
    rawVendor && vendors.some((v) => String(v.id) === rawVendor)
      ? rawVendor
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Certificates</h1>
        <p className="text-sm text-slate-500">
          Every COI on file, flattened and searchable. “Expiring soon” = within{" "}
          {soonDays} days.
        </p>
      </div>

      {certificates.length === 0 ? (
        <EmptyState title="No certificates yet">
          <p>
            <Link href="/upload" className="text-brand-700 hover:underline">
              Upload your first COI
            </Link>
            : drag in a PDF and COI Hero will pull out the carriers, policy
            numbers, limits, and dates.
          </p>
          <p className="mt-4 text-slate-400">or, to look around first:</p>
          <div className="mt-2">
            <DemoButton />
          </div>
        </EmptyState>
      ) : (
        <CertificatesTable
          key={`${initialStatus ?? "all"}:${initialVendorId ?? "all"}`}
          certificates={certificates}
          vendors={vendors}
          soonDays={soonDays}
          initialStatus={initialStatus}
          initialVendorId={initialVendorId}
        />
      )}
    </div>
  );
}
