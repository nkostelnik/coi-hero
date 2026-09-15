import Link from "next/link";
import { EmptyState, Pill } from "@/components/ui";
import NewContractButton from "@/components/NewContractButton";
import {
  certificatesForContract,
  getSoonDays,
  listCertificates,
  listContracts,
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
  unknown: { tone: "slate", label: "No rules" },
};

export default function ContractsPage() {
  const contracts = listContracts();
  const vendors = listVendors();
  const requirements = listRequirements();
  const allCerts = listCertificates();
  const soonDays = getSoonDays();
  const certById = new Map(allCerts.map((c) => [c.id, c]));

  const rows = contracts.map((contract) => {
    const linkedIds = certificatesForContract(contract.id);
    const certs = linkedIds
      .map((id) => certById.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c);
    return {
      contract,
      linked: certs.length,
      compliance: evaluateContractCompliance({
        contractId: contract.id,
        inheritGlobal: !!contract.inherit_global_requirements,
        certs,
        requirements,
        soonDays,
      }),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contracts</h1>
          <p className="text-sm text-slate-500">
            Link the certificates you collected to the contract that required
            them, and see whether each contract’s insurance requirements are met.
          </p>
        </div>
        <NewContractButton vendors={vendors} />
      </div>

      {contracts.length === 0 ? (
        <EmptyState title="No contracts yet">
          Create a contract, give it insurance requirements, then link the COIs
          you’ve collected for that counterparty.
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Contract</th>
                <th className="th">Counterparty</th>
                <th className="th">Term</th>
                <th className="th">Linked COIs</th>
                <th className="th">Compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ contract, linked, compliance }) => {
                const meta = META[compliance.status] ?? META.unknown;
                return (
                  <tr key={contract.id} className="hover:bg-slate-50">
                    <td className="td">
                      <Link
                        href={`/contracts/${contract.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {contract.title}
                      </Link>
                      {contract.reference && (
                        <div className="text-xs text-slate-400">
                          {contract.reference}
                        </div>
                      )}
                    </td>
                    <td className="td">
                      {contract.counterparty ?? "-"}
                      {contract.status !== "active" && (
                        <span className="ml-1 text-xs text-slate-400">
                          ({contract.status})
                        </span>
                      )}
                    </td>
                    <td className="td text-xs text-slate-500">
                      {formatDate(contract.effective_date)} to{" "}
                      {formatDate(contract.expiration_date)}
                    </td>
                    <td className="td">{linked}</td>
                    <td className="td">
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                      {compliance.issues.filter((i) => i.severity === "error")
                        .length > 0 && (
                        <span className="ml-1 text-xs text-slate-400">
                          {
                            compliance.issues.filter(
                              (i) => i.severity === "error",
                            ).length
                          }{" "}
                          issue(s)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
