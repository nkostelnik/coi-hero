import { NextResponse } from "next/server";
import { demoState, resetDemo, seedDemo, wipeAll } from "@/lib/demoSeed";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(demoState());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    switch (body.action) {
      case "seed":
        return NextResponse.json({ ok: true, ...seedDemo() });
      case "reset":
        return NextResponse.json({ ok: true, ...resetDemo() });
      case "wipe":
        wipeAll();
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
