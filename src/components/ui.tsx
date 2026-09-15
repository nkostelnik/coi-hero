import Link from "next/link";
import type { CoverageStatus } from "@/lib/types";

const STATUS_STYLES: Record<CoverageStatus, string> = {
  active: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  expiring_soon: "bg-amber-100 text-amber-800 ring-amber-200",
  expired: "bg-red-100 text-red-800 ring-red-200",
  unknown: "bg-slate-100 text-slate-600 ring-slate-200",
};

const STATUS_LABEL: Record<CoverageStatus, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  unknown: "No date",
};

const BADGE_BASE =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

export function StatusBadge({
  status,
  onClick,
  active,
}: {
  status: CoverageStatus;
  onClick?: () => void;
  active?: boolean;
}) {
  const cls = `${BADGE_BASE} ${STATUS_STYLES[status]}`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`Filter by “${STATUS_LABEL[status]}”`}
        className={`${cls} transition-shadow hover:ring-2 ${
          active ? "ring-2 ring-offset-1" : ""
        }`}
      >
        {STATUS_LABEL[status]}
      </button>
    );
  }
  return <span className={cls}>{STATUS_LABEL[status]}</span>;
}

const PILL_TONES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  red: "bg-red-100 text-red-800 ring-red-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  blue: "bg-brand-100 text-brand-800 ring-brand-200",
};

export function Pill({
  tone = "slate",
  children,
  onClick,
  active,
  title,
}: {
  tone?: "slate" | "green" | "red" | "amber" | "blue";
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}) {
  const cls = `${BADGE_BASE} ${PILL_TONES[tone]}`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`${cls} transition-shadow hover:ring-2 ${
          active ? "ring-2 ring-offset-1" : ""
        }`}
      >
        {children}
      </button>
    );
  }
  return <span className={cls}>{children}</span>;
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card grid place-items-center gap-2 p-12 text-center">
      <p className="text-base font-semibold text-slate-700">{title}</p>
      {children ? (
        <div className="text-sm text-slate-500">{children}</div>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone = "slate",
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "slate" | "green" | "red" | "amber" | "blue";
  hint?: string;
  href?: string;
}) {
  const tones: Record<string, string> = {
    slate: "text-slate-900",
    green: "text-emerald-700",
    red: "text-red-700",
    amber: "text-amber-700",
    blue: "text-brand-700",
  };
  const inner = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-bold ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="card block p-4 transition-colors hover:border-brand-300 hover:bg-slate-50"
      >
        {inner}
      </Link>
    );
  }
  return <div className="card p-4">{inner}</div>;
}
