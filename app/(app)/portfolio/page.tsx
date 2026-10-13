"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { Empty, PageHeader, Skeleton, StatusBadge, btnGhost, btnPrimary, downloadCsv, input } from "@/components/ui";
import { ReasonDialog } from "@/components/reason-dialog";
import { Demand, errMsg, isDecider, pb } from "@/lib/pb";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/de";
import { useList } from "@/lib/data";
import { changeStatus, TRANSITIONS, Transition } from "@/lib/workflow";

const PORTFOLIO_STATUS = ["IN_QUALIFIZIERUNG", "ENTSCHEIDUNGSREIF", "GENEHMIGT", "IN_UMSETZUNG", "ABGESCHLOSSEN"];
const COLS = [
  ["type", "Typ"], ["effort", "Aufwand"], ["domain", "Domäne"], ["capability", "Primäre Capability"], ["department", "Fachbereich"],
] as const;

export default function Portfolio() {
  const { user, toast } = useAuth();
  const [rows, setRows] = useState<Demand[] | null>(null);
  const [capOf, setCapOf] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [domain, setDomain] = useState("");
  const [group, setGroup] = useState<"" | "domain" | "capability">("");
  const [sort, setSort] = useState<"score" | "number" | "status">("score");
  const [cols, setCols] = useState<string[]>(["effort", "domain", "capability"]);
  const [dlg, setDlg] = useState<{ d: Demand; t: Transition } | null>(null);
  const domains = useList("domains", { sort: "name" });

  const load = useCallback(async () => {
    const f = PORTFOLIO_STATUS.map((s) => `status="${s}"`).join(" || ");
    const [r, pc] = await Promise.all([
      pb.collection("demands").getFullList<Demand>({ filter: f, sort: "-score", expand: "domain,department" }),
      pb.collection("demand_capabilities").getFullList({ filter: "isPrimary=true", expand: "capability" }),
    ]);
    setRows(r);
    setCapOf(Object.fromEntries(pc.map((x) => [x.demand, x.expand?.capability?.name as string])));
  }, []);
  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    let v = (rows || []).filter((d) => (!status || d.status === status) && (!domain || d.domain === domain));
    v = [...v].sort((a, b) => (sort === "score" ? (b.score || 0) - (a.score || 0) : sort === "number" ? a.number.localeCompare(b.number) : a.status.localeCompare(b.status)));
    return v;
  }, [rows, status, domain, sort]);

  const rank = useMemo(() => {
    const m: Record<string, number> = {};
    [...(rows || [])].filter((d) => d.score > 0).sort((a, b) => b.score - a.score).forEach((d, i) => (m[d.id] = i + 1));
    return m;
  }, [rows]);

  if (!user) return null;
  if (user.role === "antragsteller") return <p>Das Portfolio ist für Triage und Entscheider sichtbar.</p>;
  if (!rows) return <Skeleton />;

  const cell = (d: Demand, c: string) =>
    c === "type" ? TYPE_LABEL[d.type] : c === "effort" ? d.effortSize || "–" : c === "domain" ? d.expand?.domain?.name || "–" : c === "capability" ? capOf[d.id] || "–" : d.expand?.department?.name || "–";
  const t = (from: string, to: string) => TRANSITIONS.find((x) => x.from.includes(from) && x.to === to)!;

  async function run(d: Demand, tr: Transition, reason?: string, follow?: string) {
    try {
      await changeStatus(d, tr.to, user!, { reason, followUpDate: follow });
      toast(`${d.number}: ${STATUS_LABEL[tr.to]}`);
      setDlg(null);
      load();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  const groups: [string, Demand[]][] = group
    ? Object.entries(view.reduce<Record<string, Demand[]>>((a, d) => { const k = group === "domain" ? d.expand?.domain?.name || "Ohne Domäne" : capOf[d.id] || "Ohne Capability"; (a[k] ||= []).push(d); return a; }, {}))
    : [["", view]];

  return (
    <>
      <PageHeader
        title="Portfolio"
        sub="Qualifizierte und genehmigte Demands nach Score."
        actions={
          <button className={btnGhost} onClick={() =>
            downloadCsv("portfolio.csv", [
              ["Rang", "Nummer", "Titel", "Status", "Score", ...COLS.map((c) => c[1])],
              ...view.map((d) => [rank[d.id] || "", d.number, d.title, STATUS_LABEL[d.status], d.score || "", ...COLS.map((c) => cell(d, c[0]))]),
            ])}>CSV-Export</button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className={`${input} !w-auto`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Alle Status</option>{PORTFOLIO_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select className={`${input} !w-auto`} value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Domäne">
          <option value="">Alle Domänen</option>{domains.items.map((x) => <option key={x.id} value={x.id}>{x.name as string}</option>)}
        </select>
        <select className={`${input} !w-auto`} value={group} onChange={(e) => setGroup(e.target.value as typeof group)} aria-label="Gruppierung">
          <option value="">Keine Gruppierung</option><option value="domain">Nach Domäne</option><option value="capability">Nach Capability</option>
        </select>
        <select className={`${input} !w-auto`} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sortierung">
          <option value="score">Sortiert nach Score</option><option value="number">Nach Nummer</option><option value="status">Nach Status</option>
        </select>
        <details className="relative">
          <summary className={`${btnGhost} cursor-pointer`}>Spalten</summary>
          <div className="absolute z-10 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {COLS.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" checked={cols.includes(k)} onChange={() => setCols(cols.includes(k) ? cols.filter((c) => c !== k) : [...cols, k])} /> {l}
              </label>
            ))}
          </div>
        </details>
      </div>
      {view.length === 0 ? (
        <Empty title="Noch nichts im Portfolio" hint="Sobald Demands in Qualifizierung sind, erscheinen sie hier mit Score und Rang." />
      ) : (
        groups.map(([name, list]) => (
          <section key={name} className="mb-6">
            {name && <h2 className="mb-2 font-semibold">{name} <span className="text-sm font-normal text-slate-500">({list.length})</span></h2>}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Rang</th><th className="px-4 py-3">Titel</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Score</th>
                    {COLS.filter((c) => cols.includes(c[0])).map((c) => <th key={c[0]} className="px-4 py-3">{c[1]}</th>)}
                    {isDecider(user) && <th className="px-4 py-3">Entscheidung</th>}
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-3 font-semibold">{rank[d.id] ? `#${rank[d.id]}` : "–"}</td>
                      <td className="px-4 py-3"><Link href={`/demands/${d.id}`} className="font-medium hover:underline">{d.title}</Link><div className="text-xs text-slate-500">{d.number}</div></td>
                      <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                      <td className="px-4 py-3">{d.score || "–"}</td>
                      {COLS.filter((c) => cols.includes(c[0])).map((c) => <td key={c[0]} className="px-4 py-3">{cell(d, c[0])}</td>)}
                      {isDecider(user) && (
                        <td className="px-4 py-3 w-px whitespace-nowrap">
                          {d.status === "ENTSCHEIDUNGSREIF" ? (
                            <div className="flex flex-col gap-1">
                              <button className={btnPrimary} onClick={() => setDlg({ d, t: t("ENTSCHEIDUNGSREIF", "GENEHMIGT") })}>Genehmigen</button>
                              <button className={btnGhost} onClick={() => setDlg({ d, t: t("ENTSCHEIDUNGSREIF", "ZURUECKGESTELLT") })}>Zurückstellen</button>
                            </div>
                          ) : <span className="text-slate-400">–</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
      {dlg && <ReasonDialog t={dlg.t} onCancel={() => setDlg(null)} onOk={(r, f) => run(dlg.d, dlg.t, r, f)} />}
    </>
  );
}
