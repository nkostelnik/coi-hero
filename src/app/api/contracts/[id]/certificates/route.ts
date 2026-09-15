import { NextResponse } from "next/server";
import { getContract, setContractCertificates } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getContract(Number(id)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as {
    certificate_ids?: unknown[];
  };
  const ids = (body.certificate_ids ?? [])
    .map(Number)
    .filter((n) => Number.isFinite(n));
  setContractCertificates(Number(id), ids);
  return NextResponse.json({ ok: true, count: ids.length });
}
