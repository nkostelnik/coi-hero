import { NextResponse } from "next/server";
import { deleteVendor, getVendor, updateVendor } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const f of ["name", "contact_name", "contact_email", "notes"]) {
    if (f in body) patch[f] = body[f] === "" ? null : body[f];
  }
  if ("aliases" in body && Array.isArray(body.aliases)) {
    patch.aliases = (body.aliases as string[]).map((a) => String(a).trim()).filter(Boolean);
  }
  if (body.mark_update_requested) {
    patch.update_requested_on = new Date().toISOString().slice(0, 10);
  } else if ("update_requested_on" in body) {
    patch.update_requested_on = body.update_requested_on || null;
  }
  const vendor = updateVendor(Number(id), patch);
  if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ vendor });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getVendor(Number(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  deleteVendor(Number(id));
  return NextResponse.json({ ok: true });
}
