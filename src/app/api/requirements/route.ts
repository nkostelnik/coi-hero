import { NextResponse } from "next/server";
import { createRequirement, listRequirements, setSetting } from "@/lib/db";
import { normalizeCoverageType } from "@/lib/extract";

export async function GET() {
  return NextResponse.json({ requirements: listRequirements() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.expiring_soon_days != null) {
    const n = Number(body.expiring_soon_days);
    if (Number.isFinite(n) && n > 0) setSetting("expiring_soon_days", String(Math.round(n)));
    return NextResponse.json({ ok: true });
  }

  const num = (v: unknown) =>
    v === "" || v == null ? null : Number(String(v).replace(/[^0-9.]/g, "")) || null;

  const requirement = createRequirement({
    scope: body.contract_id ? "contract" : body.vendor_id ? "vendor" : "global",
    vendor_id: body.vendor_id ? Number(body.vendor_id) : null,
    contract_id: body.contract_id ? Number(body.contract_id) : null,
    coverage_type: normalizeCoverageType(body.coverage_type),
    min_each_occurrence: num(body.min_each_occurrence),
    min_aggregate: num(body.min_aggregate),
    min_combined_single_limit: num(body.min_combined_single_limit),
    require_additional_insured: body.require_additional_insured ? 1 : 0,
    require_waiver_of_subrogation: body.require_waiver_of_subrogation ? 1 : 0,
    required: body.required === false ? 0 : 1,
    notes: (body.notes as string) ?? null,
  });
  return NextResponse.json({ requirement });
}
