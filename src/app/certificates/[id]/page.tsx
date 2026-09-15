import Link from "next/link";
import { notFound } from "next/navigation";
import CertificateEditor from "@/components/CertificateEditor";
import { getCertificate, listContracts, listVendors } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CertificateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const certificate = getCertificate(Number(id));
  if (!certificate) notFound();

  return (
    <div className="space-y-4">
      <Link href="/certificates" className="text-sm text-brand-700 hover:underline">
        ← Certificates
      </Link>
      <CertificateEditor
        certificate={certificate}
        vendors={listVendors()}
        contracts={listContracts()}
      />
    </div>
  );
}
