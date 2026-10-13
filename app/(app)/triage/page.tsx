"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth";
import { Card, Empty, PageHeader, Skeleton, StatusBadge, btnDanger, btnGhost, btnPrimary, downloadCsv, input } from "@/components/ui";
import { ReasonDialog } from "@/components/reason-dialog";
import { Demand, errMsg, isTriage, pb } from "@/lib/pb";
import { BENEFIT_LABEL, fmtDate, TYPE_LABEL } from "@/lib/de";
import { Cap, useCapabilities, useList } from "@/lib/data";
import { changeStatus, TRANSITIONS, Transition } from "@/lib/workflow";

export default function Triage() {
  const { user, toast } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Demand[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [dialog, setDialog] = useState<Transition | null>(null);
  const [primary, setPrimary] = useState<Record<string, Cap | undefined>>({});
  const [dup, setDup] = useState("");
  const domains = useList("domains", { filter: "active=true", sort: "name" });
  const caps = useCapabilities();

  const load = useCallback(async () => {
    const r = await pb.collection("demands").getFullList<Demand>({ filter: `status="EINGEREICHT"`, sort: "created", expand: "requester,department,domain" });
    setRows(r);
    const pc = await pb.collection("demand_capabilities").getFullList({ filter: `isPrimary=true && demand.status="EINGEREICHT"`, expand: "capability" });
    setPrimary(Object.fromEntries(pc.map((x) => [x.demand, x.expand?.capability as Cap])));
  }, []);
  useEffect(() => { load(); }, [load]);

  const cur = rows?.[selected];

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || dialog || !rows?.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, rows.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && rows[selected]) router.push(`/demands/${rows[selected].id}`);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [rows, selected, dialog, router]);

  if (!user) return null;
  if (!isTriage(user)) return <p>Dieser Bereich ist der Triage vorbehalten.</p>;
  if (!rows) return <Skeleton />;

  const tr = (to: string) => TRANSITIONS.find((t) => t.from.includes("EINGEREICHT") && t.to === to)!;

  async function patch(data: Record<string, unknown>, msg = "Gespeichert") {
    if (!cur) return;
    try { await pb.collection("demands").update(cur.id, data); toast(msg); await load(); } catch (e) { toast(errMsg(e), "error"); }
  }
  async function setPrimaryCap(capId: string) {
    if (!cur || !capId) return;
    try {
      const ex = await pb.collection("demand_capabilities").getFullList({ filter: `demand="${cur.id}"` });
      for (const r of ex.filter((r) => r.isPrimary)) await pb.collection("demand_capabilities").update(r.id, { isPrimary: false });
      const same = ex.find((r) => r.capability === capId);
      if (same) await pb.collection("demand_capabilities").update(same.id, { isPrimary: true });
      else await pb.collection("demand_capabilities").create({ demand: cur.id, capability: capId, isPrimary: true, impact: "VERBESSERUNG" });
      toast("Primäre Capability gesetzt");
      await load();
    } catch (e) { toast(errMsg(e), "error"); }
  }
  async function run(t: Transition, reason?: string, follow?: string) {
    if (!cur) return;
    try {
      await changeStatus(cur, t.to, user!, { reason, followUpDate: follow });
      toast(`${cur.number}: ${t.label}`);
      setDialog(null);
      setSelected((s) => Math.max(0, Math.min(s, rows!.length - 2)));
      await load();
    } catch (e) { toast(errMsg(e), "error"); }
  }
  async function linkDup() {
    if (!cur) return;
    try {
      const o = await pb.collection("demands").getFirstListItem(`number="${dup.trim().replace(/"/g, "")}"`);
      await pb.collection("demand_links").create({ demand: cur.id, related: o.id, kind: "DUPLIKAT" });
      await pb.collection("comments").create({ demand: cur.id, author: user!.id, body: `Als Duplikat von ${o.number} verknüpft.`, isInternal: true });
      toast(`Mit ${o.number} verknüpft – bitte zurückstellen oder ablehnen.`);
      setDup("");
    } catch (e) { toast(errMsg(e).includes("404") ? "Demand-Nummer nicht gefunden." : errMsg(e), "error"); }
  }
  const age = (d: Demand) => Math.max(0, Math.floor((Date.now() - new Date(d.created.replace(" ", "T")).getTime()) / 86400000));

  return (
    <>
      <PageHeader
        title="Triage-Inbox"
        sub="Neue Demands, älteste zuerst. Pfeiltasten wählen, Enter öffnet das Detail."
        actions={
          <button className={btnGhost} onClick={() => downloadCsv("triage.csv", [["Nummer", "Titel", "Typ", "Fachbereich", "Alter (Tage)"], ...rows.map((d) => [d.number, d.title, TYPE_LABEL[d.type] || "", d.expand?.department?.name || "", age(d)])])}>CSV-Export</button>
        }
      />
      {rows.length === 0 ? (
        <Empty title="Die Inbox ist leer" hint="Neue Demands erscheinen hier, sobald jemand etwas einreicht." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-2 lg:col-span-2">
            {rows.map((d, i) => (
              <button key={d.id} onClick={() => setSelected(i)} aria-pressed={i === selected}
                className={`block w-full rounded-xl border p-3 text-left ${i === selected ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}>
                <div className="flex justify-between text-xs text-slate-500"><span>{d.number}</span><span>{age(d)} Tage alt</span></div>
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-slate-500">{d.expand?.department?.name} · {TYPE_LABEL[d.type]}</div>
              </button>
            ))}
          </div>
          {cur && (
            <Card className="space-y-4 lg:col-span-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">{cur.number} · eingereicht {fmtDate(cur.created)} von {cur.expand?.requester?.name}</span>
                  <StatusBadge status={cur.status} />
                </div>
                <h2 className="mt-1 text-xl font-semibold">{cur.title}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm">{cur.description}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Nutzen: {BENEFIT_LABEL[cur.benefitCategory]}{cur.desiredDate ? ` · Wunschtermin ${fmtDate(cur.desiredDate)} (${cur.desiredDateReason})` : ""}
                </p>
                <Link className="mt-1 inline-block text-sm text-indigo-600 hover:underline" href={`/demands/${cur.id}`}>Vollständiges Detail öffnen →</Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm"><span className="mb-1 block font-medium">Domäne</span>
                  <select className={input} value={cur.domain || ""} onChange={(e) => patch({ domain: e.target.value })}>
                    <option value="">– zuweisen –</option>{domains.items.map((x) => <option key={x.id} value={x.id}>{x.name as string}</option>)}
                  </select>
                </label>
                <label className="text-sm"><span className="mb-1 block font-medium">Primäre Capability</span>
                  <select className={input} value={primary[cur.id]?.id || ""} onChange={(e) => setPrimaryCap(e.target.value)}>
                    <option value="">– wählen –</option>
                    {caps.items.filter((c) => c.parent).map((c) => <option key={c.id} value={c.id}>{caps.items.find((p) => p.id === c.parent)?.name} › {c.name}</option>)}
                  </select>
                </label>
                <label className="text-sm"><span className="mb-1 block font-medium">Typ</span>
                  <select className={input} value={cur.type} onChange={(e) => patch({ type: e.target.value })}>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <input className={`${input} !w-44`} placeholder="Duplikat von DEM-…" value={dup} onChange={(e) => setDup(e.target.value)} aria-label="Duplikat von Nummer" />
                <button className={btnGhost} disabled={!dup} onClick={linkDup}>Als Duplikat verknüpfen</button>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button className={btnPrimary} onClick={() => run(tr("IN_QUALIFIZIERUNG"))}>Zur Qualifizierung freigeben</button>
                <button className={btnGhost} onClick={() => setDialog(tr("SERVICE_REQUEST_ABGEGEBEN"))}>Als Service Request abgeben</button>
                <button className={btnGhost} onClick={() => setDialog(tr("ZURUECKGESTELLT"))}>Zurückstellen</button>
                <button className={btnDanger} onClick={() => setDialog(tr("ABGELEHNT"))}>Ablehnen</button>
              </div>
            </Card>
          )}
        </div>
      )}
      {dialog && <ReasonDialog t={dialog} onCancel={() => setDialog(null)} onOk={(r, f) => run(dialog, r, f)} />}
    </>
  );
}
