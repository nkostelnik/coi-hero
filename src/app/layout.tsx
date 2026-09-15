import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "COI Hero",
  description: "Collect, organize, and track certificates of insurance.",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/certificates", label: "Certificates" },
  { href: "/vendors", label: "Vendors" },
  { href: "/contracts", label: "Contracts" },
  { href: "/requirements", label: "Requirements" },
  { href: "/demo", label: "Demo" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
              <Link href="/" className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-lg font-black text-white">
                  C
                </span>
                <span className="text-lg font-bold tracking-tight">
                  COI&nbsp;Hero
                </span>
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="ml-auto">
                <Link href="/upload" className="btn-primary">
                  + Add certificate
                </Link>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
