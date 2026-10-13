"use client";
import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/auth";
import { ROLE_LABEL } from "@/lib/de";
import { pb, q, Demand } from "@/lib/pb";
import { btnPrimary, StatusBadge } from "@/components/ui";

function Shell({ children }: { children: ReactNode }) {
  const { user, ready, logout } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!ready || !user) return <div className="p-10 text-slate-500">Lädt …</div>;

  const staff = user.role !== "antragsteller";
  const nav = [
    { href: "/", label: "Dashboard", show: true },
    { href: "/demands/new", label: "Neuer Demand", show: true },
    { href: "/demands", label: "Meine Demands", show: true },
    { href: "/triage", label: "Triage", show: user.role === "triage" || user.role === "admin" },
    { href: "/portfolio", label: "Portfolio", show: user.role !== "antragsteller" },
    { href: "/capabilities", label: "Heatmap", show: staff },
    { href: "/admin", label: "Admin", show: user.role === "admin" },
  ].filter((n) => n.show);

  const active = (h: string) => (h === "/" ? path === "/" : h === "/demands" ? path === "/demands" : path.startsWith(h));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:w-60 md:border-b-0 md:border-r">
        <Link href="/" className="mb-4 block text-lg font-semibold tracking-tight">
          Demand<span className="text-indigo-600">Hub</span>
        </Link>
        <nav aria-label="Hauptnavigation" className="flex gap-1 overflow-x-auto md:flex-col">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                active(n.href)
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 hidden border-t border-slate-200 pt-4 text-sm dark:border-slate-800 md:block">
          <div className="font-medium">{user.name || user.username}</div>
          <div className="text-slate-500">{ROLE_LABEL[user.role]}</div>
          <button onClick={logout} className="mt-2 text-indigo-600 hover:underline">
            Abmelden
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white/70 px-6 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex w-full max-w-sm items-center justify-between rounded-lg border border-slate-300 px-3 py-1.5 text-left text-sm text-slate-500 dark:border-slate-700"
          >
            <span>Suchen nach Nummer oder Titel …</span>
            <kbd className="rounded border px-1.5 text-xs">/</kbd>
          </button>
          <div className="flex items-center gap-3">
            <Link href="/demands/new" className={btnPrimary}>
              + Neuer Demand
            </Link>
            <button onClick={logout} className="text-sm text-indigo-600 md:hidden">
              Abmelden
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-6">{children}</main>
      </div>
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} onPick={(id) => { setSearchOpen(false); router.push(`/demands/${id}`); }} />}
    </div>
  );
}

function SearchDialog({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const [term, setTerm] = useState("");
  const [res, setRes] = useState<Demand[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    if (term.trim().length < 2) return setRes([]);
    const t = setTimeout(async () => {
      const s = q(term.trim());
      const r = await pb.collection("demands").getList<Demand>(1, 8, { filter: `number ~ ${s} || title ~ ${s} || description ~ ${s}`, sort: "-updated" });
      setRes(r.items);
    }, 200);
    return () => clearTimeout(t);
  }, [term]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Globale Suche" className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-24" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-white p-3 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <input
          ref={ref}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && res[0]) onPick(res[0].id);
          }}
          placeholder="Nummer, Titel oder Beschreibung …"
          className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"
        />
        <ul className="mt-2 max-h-80 overflow-auto">
          {res.map((d) => (
            <li key={d.id}>
              <button onClick={() => onPick(d.id)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
                <span>
                  <span className="mr-2 text-xs text-slate-500">{d.number}</span>
                  {d.title}
                </span>
                <StatusBadge status={d.status} />
              </button>
            </li>
          ))}
          {term.trim().length >= 2 && res.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Keine Treffer.</li>}
        </ul>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
