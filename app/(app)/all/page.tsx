"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { Empty, PageHeader, Skeleton, StatusBadge, btnGhost, downloadCsv, input } from "@/components/ui";
import { Demand, pb } from "@/lib/pb";
import { fmtDate, STATUS_LABEL, TYPE_LABEL } from "@/lib/de";
import { useList } from "@/lib/data";

const COLS = [
  ["type", "Typ"], ["department", "Fachbereich"], ["requester", "Antragsteller"], ["domain", "Domäne"],
  ["capability", "Primäre Capability"], ["effort", "Aufwand"], ["score", "Score"], ["updated", "Geändert"],
] as const;
const PAGE = 25;

/** Filter bleiben beim Wechsel der Ansicht erhalten (sessionStorage) */
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

export default function AllDemands() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Demand[] | null>(null);
  const [capOf, setCapOf] = useState<Record<string, string>>({});
  const [term, setTerm] = useStored("all.term", "");
  const [status, setStatus] = useStored("all.status", "");
  const [type, setType] = useStored("all.type", "");
  const [dept, setDept] = useStored("all.dept", "");
  const [domain, setDomain] = useStored("all.domain", "");
  const [group, setGroup] = useStored("all.group", "");
  const [sort, setSort] = useStored("all.sort", "updated");
  const [colsRaw, setCols] = useStored("all.cols", "type,department,domain,capability");
  const [page, setPage] = useState(1);
  const depts = useList("departments", { sort: "name" });
  const domains = useList("domains", { sort: "name" });
  const cols = colsRaw.split(",").filter(Boolean);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      pb.collection("demands").getFullList<Demand>({ sort: "-updated", expand: "domain,department,requester", batch: 200 }),
      pb.collection("demand_capabilities").getFullList({ filter: "isPrimary=true", expand: "capability", batch: 500 }),
    ]).then(([r, pc]) => {
      setRows(r);
      setCapOf(Object.fromEntries(pc.map((x) => [x.demand, x.expand?.capability?.name as string])));
    });
  }, [user]);

  const view = useMemo(() => {
    const t = term.trim().toLowerCase();
    const v = (rows || []).filter(
      (d) =>
        (!status || d.status === status) &&
        (!type || d.type === type) &&
        (!dept || d.department === dept) &&
        (!domain || d.domain === domain) &&
        (!t || d.number.toLowerCase().includes(t) || d.title.toLowerCase().includes(t) || (d.description || "").toLowerCase().includes(t)),
    );
    const cmp: Record<string, (a: Demand, b: Demand) => number> = {
      updated: (a, b) => b.updated.localeCompare(a.updated),
      created: (a, b) => b.created.localeCompare(a.created),
      number: (a, b) => a.number.localeCompare(b.number),
      score: (a, b) => (b.score || 0) - (a.score || 0),
      status: (a, b) => a.status.localeCompare(b.status),
    };
    return [...v].sort(cmp[sort] || cmp.updated);
  }, [rows, term, status, type, dept, domain, sort]);

  useEffect(() => setPage(1), [term, status, type, dept, domain, group, sort]);

  if (!user) return null;
  if (!rows) return (<><PageHeader title="Alle Demands" /><Skeleton /></>);

  const cell = (d: Demand, c: string) =>
    c === "type" ? TYPE_LABEL[d.type] || "–"
    : c === "department" ? d.expand?.department?.name || "–"
    : c === "requester" ? d.expand?.requester?.name || "–"
    : c === "domain" ? d.expand?.domain?.name || "–"
    : c === "capability" ? capOf[d.id] || "–"
    : c === "effort" ? d.effortSize || "–"
    : c === "score" ? (d.score ? String(d.score) : "–")
    : fmtDate(d.updated);

  const groupKey = (d: Demand) =>
    group === "status" ? STATUS_LABEL[d.status]
    : group === "domain" ? d.expand?.domain?.name || "Ohne Domäne"
    : group === "department" ? d.expand?.department?.name || "Ohne Fachbereich"
    : group === "capability" ? capOf[d.id] || "Ohne Capability"
    : group === "type" ? TYPE_LABEL[d.type] || "Ohne Typ"
    : "";

  const pages = Math.max(1, Math.ceil(view.length / PAGE));
  const shown = group ? view : view.slice((page - 1) * PAGE, page * PAGE);
  const groups: [string, Demand[]][] = group
    ? Object.entries(shown.reduce<Record<string, Demand[]>>((a, d) => { (a[groupKey(d)] ||= []).push(d); return a; }, {}))
    : [["", shown]];
  const active = [term, status, type, dept, domain].some(Boolean);
  const reset = () => { setTerm(""); setStatus(""); setType(""); setDept(""); setDomain(""); };

  return (
    <>
      <PageHeader
        title="Alle Demands"
        sub={`${view.length} von ${rows.length} Demands – für alle sichtbar, Entwürfe nur für ihre Antragsteller.`}
        actions={
          <button className={btnGhost} onClick={() =>
            downloadCsv("alle-demands.csv", [
              ["Nummer", "Titel", "Status", ...COLS.map((c) => c[1])],
              ...view.map((d) => [d.number, d.title, STATUS_LABEL[d.status], ...COLS.map((c) => cell(d, c[0]))]),
            ])}>CSV-Export</button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className={`${input} !w-64`} placeholder="Suchen nach Nummer, Titel …" aria-label="Suchen" value={term} onChange={(e) => setTerm(e.target.value)} />
        <select className={`${input} !w-auto`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={`${input} !w-auto`} value={type} onChange={(e) => setType(e.target.value)} aria-label="Typ">
          <option value="">Alle Typen</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={`${input} !w-auto`} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Fachbereich">
          <option value="">Alle Fachbereiche</option>
          {depts.items.map((x) => <option key={x.id} value={x.id}>{x.name as string}</option>)}
        </select>
        <select className={`${input} !w-auto`} value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Domäne">
          <option value="">Alle Domänen</option>
          {domains.items.map((x) => <option key={x.id} value={x.id}>{x.name as string}</option>)}
        </select>
        <select className={`${input} !w-auto`} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Gruppierung">
          <option value="">Keine Gruppierung</option>
          <option value="status">Nach Status</option><option value="domain">Nach Domäne</option>
          <option value="department">Nach Fachbereich</option><option value="capability">Nach Capability</option><option value="type">Nach Typ</option>
        </select>
        <select className={`${input} !w-auto`} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sortierung">
          <option value="updated">Zuletzt geändert</option><option value="created">Neueste zuerst</option>
          <option value="number">Nach Nummer</option><option value="score">Nach Score</option><option value="status">Nach Status</option>
        </select>
        <details className="relative">
          <summary className={`${btnGhost} cursor-pointer`}>Spalten</summary>
          <div className="absolute z-10 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {COLS.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" checked={cols.includes(k)} onChange={() => setCols((cols.includes(k) ? cols.filter((c) => c !== k) : [...cols, k]).join(","))} /> {l}
              </label>
            ))}
          </div>
        </details>
        {active && <button className="text-sm text-indigo-600 hover:underline" onClick={reset}>Filter zurücksetzen</button>}
      </div>

      {view.length === 0 ? (
        <Empty
          title="Keine Demands gefunden"
          hint={active ? "Mit diesen Filtern gibt es keine Treffer." : "Sobald jemand einen Demand einreicht, erscheint er hier."}
          action={active ? <button className={btnGhost} onClick={reset}>Filter zurücksetzen</button> : undefined}
        />
      ) : (
        <>
          {groups.map(([name, list]) => (
            <section key={name} className="mb-6">
              {name && <h2 className="mb-2 font-semibold">{name} <span className="text-sm font-normal text-slate-500">({list.length})</span></h2>}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Nummer</th><th className="px-4 py-3">Titel</th><th className="px-4 py-3">Status</th>
                      {COLS.filter((c) => cols.includes(c[0])).map((c) => <th key={c[0]} className="px-4 py-3">{c[1]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((d) => (
                      <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{d.number}</td>
                        <td className="px-4 py-3 font-medium"><Link href={`/demands/${d.id}`} className="hover:underline">{d.title}</Link></td>
                        <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                        {COLS.filter((c) => cols.includes(c[0])).map((c) => <td key={c[0]} className="px-4 py-3">{cell(d, c[0])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {!group && pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Seite {page} von {pages}</span>
              <div className="flex gap-2">
                <button className={btnGhost} disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</button>
                <button className={btnGhost} disabled={page >= pages} onClick={() => setPage(page + 1)}>Weiter</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
