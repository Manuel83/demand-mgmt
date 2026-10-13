"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { Empty, PageHeader, Skeleton, StatusBadge, btnPrimary, input } from "@/components/ui";
import { Demand, pb } from "@/lib/pb";
import { fmtDate, STATUS_LABEL } from "@/lib/de";
import { useList } from "@/lib/data";

function useStored(key: string, init: string): [string, (v: string) => void] {
  const [v, setV] = useState(init);
  useEffect(() => {
    try {
      const s = sessionStorage.getItem(key);
      if (s !== null) setV(s);
    } catch {}
  }, [key]);
  return [v, (n) => { setV(n); try { sessionStorage.setItem(key, n); } catch {} }];
}

export default function MyDemands() {
  const { user } = useAuth();
  const [tab, setTab] = useStored("md.tab", "mine");
  const [status, setStatus] = useStored("md.status", "");
  const [dept, setDept] = useStored("md.dept", "");
  const [rows, setRows] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);
  const depts = useList("departments", { filter: "active=true", sort: "name" });

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const f: string[] = [];
    if (tab === "mine") f.push(`requester="${user.id}"`);
    else f.push(`department="${user.department}"`, `requester!="${user.id}"`);
    if (status) f.push(`status="${status}"`);
    if (dept) f.push(`department="${dept}"`);
    pb.collection("demands")
      .getList<Demand>(1, 100, { filter: f.join(" && "), sort: "-updated", expand: "assignee,domain.lead" })
      .then((r) => setRows(r.items))
      .finally(() => setLoading(false));
  }, [user, tab, status, dept]);

  return (
    <>
      <PageHeader title="Meine Demands" sub="Alles, was du erfasst hast – und was in deinem Fachbereich läuft." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
          {[["mine", "Meine"], ["dept", "Meines Fachbereichs (lesend)"]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 text-sm ${tab === k ? "bg-indigo-600 text-white" : ""}`}>
              {l}
            </button>
          ))}
        </div>
        <select className={`${input} !w-auto`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filtern">
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={`${input} !w-auto`} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Fachbereich filtern">
          <option value="">Alle Fachbereiche</option>
          {depts.items.map((d) => <option key={d.id} value={d.id}>{d.name as string}</option>)}
        </select>
      </div>
      {loading ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <Empty title="Keine Demands gefunden" hint="Passe die Filter an oder erfasse einen neuen Demand." action={<Link href="/demands/new" className={btnPrimary}>Demand erfassen</Link>} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Nummer</th><th className="px-4 py-3">Titel</th><th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ansprechpartner</th><th className="px-4 py-3">Zuletzt geändert</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 text-slate-500">{d.number}</td>
                  <td className="px-4 py-3 font-medium"><Link href={`/demands/${d.id}`} className="hover:underline">{d.title}</Link></td>
                  <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-3">{d.expand?.assignee?.name || d.expand?.domain?.expand?.lead?.name || "Triage-Team"}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(d.updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
