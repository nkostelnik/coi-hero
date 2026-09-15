import fs from "node:fs";
import { NextResponse } from "next/server";
import { getCertificate, updateCertificate } from "@/lib/db";
import { applyExtraction, filePathFor } from "@/lib/ingest";
import { demoMode, extractCoi, hasApiKey } from "@/lib/extract";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const certId = Number(id);
  const cert = getCertificate(certId);
  if (!cert) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!hasApiKey() && !demoMode()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set" },
      { status: 400 },
    );
  }
  const path = filePathFor(cert.file_name);
  if (!fs.existsSync(path)) {
    return NextResponse.json({ error: "File missing on disk" }, { status: 410 });
  }
  try {
    const { result, model } = await extractCoi(
      fs.readFileSync(path),
      cert.original_file_name,
    );
    applyExtraction(certId, result, model);
    return NextResponse.json({ certificate: getCertificate(certId) });
  } catch (err) {
    updateCertificate(certId, {
      extraction_status: "failed",
      extraction_error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
