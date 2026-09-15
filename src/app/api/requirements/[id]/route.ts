import { NextResponse } from "next/server";
import { deleteRequirement, updateRequirement } from "@/lib/db";
import { normalizeCoverageType } from "@/lib/extract";

const num = (v: unknown) =>
  v === "" || v == null ? null : Number(String(v).replace(/[^0-9.]/g, "")) || null;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if ("coverage_type" in body)
    patch.coverage_type = normalizeCoverageType(body.coverage_type);
  if ("min_each_occurrence" in body)
    patch.min_each_occurrence = num(body.min_each_occurrence);
  if ("min_aggregate" in body) patch.min_aggregate = num(body.min_aggregate);
  if ("min_combined_single_limit" in body)
    patch.min_combined_single_limit = num(body.min_combined_single_limit);
  if ("require_additional_insured" in body)
    patch.require_additional_insured = body.require_additional_insured ? 1 : 0;
  if ("require_waiver_of_subrogation" in body)
    patch.require_waiver_of_subrogation = body.require_waiver_of_subrogation ? 1 : 0;
  if ("required" in body) patch.required = body.required ? 1 : 0;
  if ("notes" in body) patch.notes = (body.notes as string) || null;

  const requirement = updateRequirement(Number(id), patch);
  if (!requirement)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ requirement });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  deleteRequirement(Number(id));
  return NextResponse.json({ ok: true });
}
