import RequirementsEditor from "@/components/RequirementsEditor";
import { getSoonDays, listRequirements, listVendors } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function RequirementsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Requirements</h1>
        <p className="text-sm text-slate-500">
          The insurance minimums COI Hero checks every certificate against. Global
          rules apply to all vendors; a vendor rule for the same coverage type
          overrides the global one.
        </p>
      </div>
      <RequirementsEditor
        requirements={listRequirements()}
        vendors={listVendors()}
        soonDays={getSoonDays()}
      />
    </div>
  );
}
