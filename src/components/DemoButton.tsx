"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface State {
  certificates: number;
  looksLikeDemo: boolean;
}

export default function DemoButton({ panel = false }: { panel?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refreshState = () =>
    fetch("/api/demo")
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState(null));

  useEffect(() => {
    if (panel) refreshState();
  }, [panel]);

  async function run(action: "seed" | "reset" | "wipe") {
    if (action === "wipe" && !confirm("Delete ALL certificates, vendors, and files?"))
      return;
    setBusy(action);
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setErr(body.error ?? "Something went wrong");
      return;
    }
    if (action === "wipe") setMsg("All data cleared.");
    else
      setMsg(
        `Loaded ${body.certificates} sample certificates across ${body.vendors} vendors.`,
      );
    await refreshState();
    router.refresh();
  }

  if (!panel) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          className="btn-primary"
          disabled={busy !== null}
          onClick={() => run("seed")}
        >
          {busy ? "Loading…" : "Load sample data"}
        </button>
        {err && (
          <p className="text-sm text-red-600">
            {err}{" "}
            <button className="underline" onClick={() => run("reset")}>
              Replace existing data with the demo set
            </button>
          </p>
        )}
        {msg && <p className="text-sm text-emerald-600">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-5">
      <h2 className="font-semibold">Demo data</h2>
      <p className="text-sm text-slate-600">
        {state == null
          ? "…"
          : state.certificates === 0
            ? "The database is empty."
            : `${state.certificates} certificates on file${
                state.looksLikeDemo ? " (all demo data)" : ""
              }.`}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-primary"
          disabled={busy !== null}
          onClick={() => run("seed")}
        >
          {busy === "seed" ? "Loading…" : "Load sample data"}
        </button>
        <button
          className="btn-ghost"
          disabled={busy !== null}
          onClick={() => run("reset")}
        >
          {busy === "reset" ? "Resetting…" : "Reset demo data (wipe + reload)"}
        </button>
        <button
          className="btn-danger"
          disabled={busy !== null}
          onClick={() => run("wipe")}
        >
          {busy === "wipe" ? "Clearing…" : "Clear all data"}
        </button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}
      <p className="text-xs text-slate-400">
        Sample certificates are generated stand-in PDFs, clearly marked “demo”.
        “Load sample data” only works when the database is empty; use “Reset” to
        replace whatever is there.
      </p>
    </div>
  );
}
