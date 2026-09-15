import { NextResponse } from "next/server";
import { demoMode, extractionModel, hasApiKey } from "@/lib/extract";

export async function GET() {
  return NextResponse.json({
    hasApiKey: hasApiKey(),
    demoMode: demoMode(),
    model: extractionModel(),
  });
}
