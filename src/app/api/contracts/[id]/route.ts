import { NextResponse } from "next/server";
import { deleteContract, getContract, updateContract } from "@/lib/db";
import { toIsoDate } from "@/lib/dates";

const STATUSES = ["active", "expired", "terminated"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contract = getContract(Number(id));
  if (!contract)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ contract });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  for (const f of ["title", "counterparty", "reference", "owner", "notes"]) {
    if (f in body) patch[f] = body[f] === "" ? null : body[f];
  }
  if ("vendor_id" in body)
    patch.vendor_id = body.vendor_id ? Number(body.vendor_id) : null;
  if ("effective_date" in body)
    patch.effective_date = toIsoDate(body.effective_date as string);
  if ("expiration_date" in body)
    patch.expiration_date = toIsoDate(body.expiration_date as string);
  if ("status" in body && STATUSES.includes(body.status as string))
    patch.status = body.status;
  if ("inherit_global_requirements" in body)
    patch.inherit_global_requirements = body.inherit_global_requirements ? 1 : 0;

  const contract = updateContract(Number(id), patch);
  if (!contract)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ contract });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getContract(Number(id)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  deleteContract(Number(id));
  return NextResponse.json({ ok: true });
}
