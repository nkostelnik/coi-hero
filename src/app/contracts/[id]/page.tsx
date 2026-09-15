import Link from "next/link";
import { notFound } from "next/navigation";
import { Pill } from "@/components/ui";
import ContractEditor from "@/components/ContractEditor";
import ContractRequirementsEditor from "@/components/ContractRequirementsEditor";
import ContractCertLinker from "@/components/ContractCertLinker";
import {
  certificatesForContract,
  getContract,
  getSoonDays,
  listCertificates,
  listRequirements,
  listVendors,
} from "@/lib/db";
import { evaluateContractCompliance } from "@/lib/compliance";
import { formatDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const META: Record<
  string,
  { tone: "green" | "red" | "amber" | "slate"; label: string }
> = {
  compliant: { tone: "green", label: "Compliant" },
  non_compliant: { tone: "red", label: "Non-compliant" },
  no_coi: { tone: "amber", label: "No COI linked" },
  unknown: { tone: "slate", label: "No requirements" },
};

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contract = getContract(Number(id));
  if (!contract) notFound();

  const vendors = listVendors();
  const requirements = listRequirements();
  const soonDays = getSoonDays();
  const allCerts = listCertificates();
  const linkedIds = certificatesForContract(contract.id);
  const linkedSet = new Set(linkedIds);
  const linkedCerts = allCerts.filter((c) => linkedSet.has(c.id));

  const contractReqRows = requirements.filter(
    (r) => r.scope === "contract" && r.contract_id === contract.id,
  );

  const compliance = evaluateContractCompliance({
    contractId: contract.id,
    inheritGlobal: !!contract.inherit_global_requirements,
    certs: linkedCerts,
    requirements,
    soonDays,
  });
  const meta = META[compliance.status] ?? META.unknown;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/contracts"
          className="text-sm text-brand-700 hover:underline"
        >
          ← Contracts
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {contract.title}
        </h1>
        <p className="text-sm text-slate-500">
          {contract.counterparty ?? "-"} ·{" "}
          {formatDate(contract.effective_date)} to{" "}
          {formatDate(contract.expiration_date)}
        </p>
      </div>

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
          <h2 className="font-semibold">Contract compliance</h2>
          <Pill tone={meta.tone}>{meta.label}</Pill>
        </div>
        <p className="mb-2 text-xs text-slate-500">
          Evaluated against{" "}
          {compliance.evaluated_against === "contract"
            ? "this contract’s own requirements"
            : compliance.evaluated_against === "contract+global"
              ? "this contract’s requirements plus the global set"
              : compliance.evaluated_against === "global"
                ? "the global requirements"
                : "nothing (no requirements defined)"}
          , using the coverage on the {linkedCerts.length} linked certificate
          {linkedCerts.length === 1 ? "" : "s"}.
        </p>
        {compliance.issues.length === 0 ? (
          <p className="text-sm text-emerald-700">
            {compliance.status === "unknown"
              ? "Add requirements below to check this contract."
              : "All requirements met."}
          </p>
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
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ContractEditor contract={contract} vendors={vendors} />

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">
            Linked certificates ({linkedCerts.length})
          </h2>
          <ContractCertLinker
            contractId={contract.id}
            linkedIds={linkedIds}
            certs={allCerts.map((c) => ({
              id: c.id,
              vendor: c.vendor?.name ?? null,
              insured: c.insured_name,
              file: c.original_file_name,
              certDate: c.certificate_date,
            }))}
          />
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Insurance requirements for this contract</h2>
        <ContractRequirementsEditor
          contractId={contract.id}
          rows={contractReqRows}
          inheritGlobal={!!contract.inherit_global_requirements}
        />
      </section>
    </div>
  );
}
