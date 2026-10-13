"use client";
import { ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { RecordModel } from "pocketbase";
import { useAuth } from "@/components/auth";
import { Card, Field, Skeleton, StatusBadge, btnDanger, btnGhost, btnPrimary, input } from "@/components/ui";
import { CapabilityPicker, Selection } from "@/components/capability-picker";
import { Demand, User, errMsg, isTriage, pb } from "@/lib/pb";
import { BENEFIT_LABEL, EFFORT_DAYS, fmtDate, fmtDateTime, STATUS_LABEL, STATUS_NEXT, TYPE_LABEL } from "@/lib/de";
import { useCapabilities, useList } from "@/lib/data";
import { ReasonDialog } from "@/components/reason-dialog";
import { availableTransitions, changeStatus, ENDSTATUS, recalcScore, Transition } from "@/lib/workflow";

type Tab = "overview" | "qualify" | "links" | "history";

export default function DemandDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, toast } = useAuth();
  const [d, setD] = useState<Demand | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [dialog, setDialog] = useState<Transition | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      setD(await pb.collection("demands").getOne<Demand>(id, { expand: "requester,department,domain,sponsor,assignee,decidedBy" }));
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-red-600">Demand nicht gefunden oder kein Zugriff. ({error})</p>;
  if (!d || !user) return <Skeleton />;

  const transitions = availableTransitions(d, user);
  const primary = transitions.find((t) => t.primary);
  const others = transitions.filter((t) => t !== primary);
  const showReason = ["ABGELEHNT", "ZURUECKGESTELLT", "SERVICE_REQUEST_ABGEGEBEN"].includes(d.status) && d.decisionReason;

  async function run(t: Transition, reason?: string, followUp?: string) {
    try {
      await changeStatus(d!, t.to, user!, { reason, followUpDate: followUp });
      toast(`Status: ${STATUS_LABEL[t.to]}`);
      setDialog(null);
      await load();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }
  const act = (t: Transition) => (t.reason ? setDialog(t) : run(t));

  return (
    <>
      <div className="mb-6">
        <Link href="/demands" className="text-sm text-slate-500 hover:underline">← Meine Demands</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{d.number} · {TYPE_LABEL[d.type] || d.type}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{d.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <StatusBadge status={d.status} />
              <span className="text-sm text-slate-600 dark:text-slate-300">{STATUS_NEXT[d.status]}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {others.map((t) => (
              <button key={t.to + t.label} className={t.to === "ABGELEHNT" ? btnDanger : btnGhost} onClick={() => act(t)}>{t.label}</button>
            ))}
            {primary && <button className={btnPrimary} onClick={() => act(primary)}>{primary.label}</button>}
          </div>
        </div>
      </div>

      {showReason && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          <p className="text-sm font-semibold">Begründung</p>
          <p className="mt-1">{d.decisionReason}</p>
          {d.followUpDate && <p className="mt-1 text-sm">Wiedervorlage: {fmtDate(d.followUpDate)}</p>}
        </div>
      )}

      <div role="tablist" className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {([["overview", "Übersicht"], ["qualify", "Qualifizierung"], ["links", "Verknüpfungen"], ["history", "Verlauf"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-slate-500"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview d={d} user={user} onSaved={load} />}
      {tab === "qualify" && <Qualify d={d} user={user} onSaved={load} />}
      {tab === "links" && <Links d={d} user={user} version={version} onChanged={load} />}
      {tab === "history" && <History d={d} user={user} version={version} />}

      {dialog && <ReasonDialog t={dialog} onCancel={() => setDialog(null)} onOk={(r, f) => run(dialog, r, f)} />}
    </>
  );
}

// ---------------------------------------------------------------- Übersicht
function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-3">
      <dt className="text-sm text-slate-500">{k}</dt>
      <dd className="sm:col-span-2 whitespace-pre-wrap">{children || "–"}</dd>
    </div>
  );
}

function Overview({ d, user, onSaved }: { d: Demand; user: User; onSaved: () => void }) {
  const { toast } = useAuth();
  const depts = useList("departments", { filter: "active=true", sort: "name" });
  const canEdit = (d.requester === user.id && ["ENTWURF", "EINGEREICHT"].includes(d.status)) || (isTriage(user) && !ENDSTATUS.includes(d.status));
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: d.title, description: d.description, type: d.type, department: d.department, benefitCategory: d.benefitCategory, desiredDate: d.desiredDate?.slice(0, 10) || "", desiredDateReason: d.desiredDateReason || "" });

  async function save() {
    try {
      await pb.collection("demands").update(d.id, f);
      toast("Gespeichert");
      setEdit(false);
      onSaved();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  if (edit)
    return (
      <Card className="max-w-2xl space-y-4">
        <Field label="Titel"><input className={input} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Problem oder Ziel"><textarea className={input} rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Typ">
            <select className={input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {Object.entries(TYPE_LABEL).filter(([k]) => k !== "SERVICE_REQUEST").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Fachbereich">
            <select className={input} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
              {depts.items.map((x) => <option key={x.id} value={x.id}>{x.name as string}</option>)}
            </select>
          </Field>
          <Field label="Nutzenkategorie">
            <select className={input} value={f.benefitCategory} onChange={(e) => setF({ ...f, benefitCategory: e.target.value })}>
              {Object.entries(BENEFIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Wunschtermin"><input type="date" className={input} value={f.desiredDate} onChange={(e) => setF({ ...f, desiredDate: e.target.value })} /></Field>
        </div>
        <Field label="Begründung des Termins"><input className={input} value={f.desiredDateReason} onChange={(e) => setF({ ...f, desiredDateReason: e.target.value })} /></Field>
        <div className="flex gap-2"><button className={btnPrimary} onClick={save}>Speichern</button><button className={btnGhost} onClick={() => setEdit(false)}>Abbrechen</button></div>
      </Card>
    );

  return (
    <Card>
      <div className="mb-2 flex justify-end">{canEdit && <button className={btnGhost} onClick={() => setEdit(true)}>Bearbeiten</button>}</div>
      <dl className="divide-y divide-slate-100 dark:divide-slate-800">
        <Row k="Problem / Ziel">{d.description}</Row>
        <Row k="Antragsteller">{d.expand?.requester?.name}</Row>
        <Row k="Fachbereich">{d.expand?.department?.name}</Row>
        <Row k="Nutzenkategorie">{BENEFIT_LABEL[d.benefitCategory]}</Row>
        <Row k="Wunschtermin">{d.desiredDate ? `${fmtDate(d.desiredDate)}${d.desiredDateReason ? ` – ${d.desiredDateReason}` : ""}` : ""}</Row>
        <Row k="Domäne / Team">{d.expand?.domain?.name}</Row>
        <Row k="Erfasst am">{fmtDate(d.created)}</Row>
      </dl>
    </Card>
  );
}

// ---------------------------------------------------------------- Qualifizierung
function Qualify({ d, user, onSaved }: { d: Demand; user: User; onSaved: () => void }) {
  const { toast } = useAuth();
  const staff = isTriage(user) && !ENDSTATUS.includes(d.status);
  const users = useList<User>("users", { filter: "active=true", sort: "name" });
  const domains = useList("domains", { filter: "active=true", sort: "name" });
  const criteria = useList("scoring_criteria", { filter: "active=true", sort: "sortOrder" });
  const scores = useList("demand_scores", { filter: `demand="${d.id}"` });
  const primaryCap = useList("demand_capabilities", { filter: `demand="${d.id}" && isPrimary=true`, expand: "capability" });
  const [f, setF] = useState({
    desiredOutcome: d.desiredOutcome || "", benefitDescription: d.benefitDescription || "", sponsor: d.sponsor || "", assignee: d.assignee || "",
    affectedUsers: String(d.affectedUsers ?? ""), effortSize: d.effortSize || "", risks: d.risks || "", domain: d.domain || "",
  });

  async function save() {
    try {
      await pb.collection("demands").update(d.id, { ...f, affectedUsers: f.affectedUsers === "" ? 0 : Number(f.affectedUsers) });
      await recalcScore(d.id);
      toast("Gespeichert");
      onSaved();
      primaryCap.reload();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  async function setScore(criterion: string, value: number) {
    try {
      const ex = scores.items.find((s) => s.criterion === criterion);
      if (ex) await pb.collection("demand_scores").update(ex.id, { value, scoredBy: user.id });
      else await pb.collection("demand_scores").create({ demand: d.id, criterion, value, scoredBy: user.id });
      await recalcScore(d.id);
      await scores.reload();
      onSaved();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  const eff: Record<string, number> = { XS: 5, S: 4, M: 3, L: 2, XL: 1 };
  const autoValue = (key: string): number | undefined => {
    if (key === "fit") return primaryCap.items[0]?.expand?.capability?.strategicImportance;
    if (key === "aufwand") return d.effortSize ? eff[d.effortSize] : undefined;
    if (key === "dringlichkeit" && d.type === "COMPLIANCE" && d.desiredDate && d.desiredDateReason) return 5;
    return undefined;
  };
  const dis = !staff;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        <h2 className="font-semibold">Stufe 2 – Qualifizierung</h2>
        {!staff && <p className="text-sm text-slate-500">Diese Angaben ergänzt die IT gemeinsam mit dem Fachbereich. Du kannst sie hier einsehen.</p>}
        <Field label="Gewünschtes Ergebnis"><textarea className={input} rows={2} disabled={dis} value={f.desiredOutcome} onChange={(e) => setF({ ...f, desiredOutcome: e.target.value })} /></Field>
        <Field label="Nutzen (wenn möglich in Euro oder Stunden pro Jahr)"><textarea className={input} rows={2} disabled={dis} value={f.benefitDescription} onChange={(e) => setF({ ...f, benefitDescription: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sponsor">
            <select className={input} disabled={dis} value={f.sponsor} onChange={(e) => setF({ ...f, sponsor: e.target.value })}>
              <option value="">–</option>{users.items.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Domäne / Team">
            <select className={input} disabled={dis} value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })}>
              <option value="">–</option>{domains.items.map((x) => <option key={x.id} value={x.id}>{x.name as string}</option>)}
            </select>
          </Field>
          <Field label="Aufwand">
            <select className={input} disabled={dis} value={f.effortSize} onChange={(e) => setF({ ...f, effortSize: e.target.value })}>
              <option value="">–</option>{Object.entries(EFFORT_DAYS).map(([k, [a, b]]) => <option key={k} value={k}>{k} ({a}–{b} Tage)</option>)}
            </select>
          </Field>
          <Field label="Betroffene Nutzer (geschätzt)"><input type="number" min={0} className={input} disabled={dis} value={f.affectedUsers} onChange={(e) => setF({ ...f, affectedUsers: e.target.value })} /></Field>
          <Field label="Bearbeiter / Verantwortlich">
            <select className={input} disabled={dis} value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}>
              <option value="">–</option>{users.items.filter((u) => u.role !== "antragsteller").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Risiken und Abhängigkeiten"><textarea className={input} rows={2} disabled={dis} value={f.risks} onChange={(e) => setF({ ...f, risks: e.target.value })} /></Field>
        {staff && <button className={btnPrimary} onClick={save}>Speichern</button>}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Scoring</h2>
          <div className="text-right">
            <div className="text-3xl font-semibold">{d.score ? d.score : "–"}</div>
            <div className="text-xs text-slate-500">Score (20–100)</div>
          </div>
        </div>
        <ul className="space-y-3">
          {criteria.items.map((c) => {
            const auto = autoValue(c.key as string);
            const manual = scores.items.find((s) => s.criterion === c.id)?.value as number | undefined;
            const isAutoKey = c.key === "fit" || c.key === "aufwand";
            return (
              <li key={c.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{c.name as string} <span className="text-xs font-normal text-slate-500">· Gewicht {c.weight as number}</span></div>
                    <div className="text-xs text-slate-500">{c.scaleHint as string}</div>
                  </div>
                  {isAutoKey || auto != null ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800">{auto ?? "–"} <span className="text-xs text-slate-500">automatisch</span></span>
                  ) : (
                    <select aria-label={c.name as string} className={`${input} !w-24`} disabled={dis && user.role !== "entscheider"} value={manual ?? ""}
                      onChange={(e) => e.target.value && setScore(c.id, Number(e.target.value))}>
                      <option value="">–</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-slate-500">Der Score ist eine Entscheidungshilfe. Das Gremium kann davon abweichen und trägt dann eine Begründung ein.</p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Verknüpfungen
function Links({ d, user, version, onChanged }: { d: Demand; user: User; version: number; onChanged: () => void }) {
  const { toast } = useAuth();
  const caps = useCapabilities();
  const apps = useList("applications", { filter: "active=true", sort: "name" });
  const appCaps = useList("application_capabilities");
  const [sel, setSel] = useState<Selection[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [links, setLinks] = useState<RecordModel[]>([]);
  const [rows, setRows] = useState<RecordModel[]>([]);
  const [appRows, setAppRows] = useState<RecordModel[]>([]);
  const [num, setNum] = useState("");
  const [kind, setKind] = useState("DUPLIKAT");
  const editable = (isTriage(user) || d.requester === user.id) && !ENDSTATUS.includes(d.status);

  const load = useCallback(async () => {
    const [c, a, l] = await Promise.all([
      pb.collection("demand_capabilities").getFullList({ filter: `demand="${d.id}"` }),
      pb.collection("demand_applications").getFullList({ filter: `demand="${d.id}"` }),
      pb.collection("demand_links").getFullList({ filter: `demand="${d.id}" || related="${d.id}"`, expand: "demand,related" }),
    ]);
    setRows(c);
    setAppRows(a);
    setSel(c.map((x) => ({ capability: x.capability, isPrimary: !!x.isPrimary, impact: x.impact || "VERBESSERUNG" })));
    setChosen(a.map((x) => x.application));
    setLinks(l);
  }, [d.id]);
  useEffect(() => { load(); }, [load, version]);

  async function saveCaps() {
    try {
      if (sel.length && sel.filter((s) => s.isPrimary).length !== 1) throw new Error("Genau eine Capability muss primär sein.");
      // erst primär-Flags zurücknehmen (partieller Unique-Index)
      for (const r of rows.filter((r) => r.isPrimary)) await pb.collection("demand_capabilities").update(r.id, { isPrimary: false });
      for (const r of rows) if (!sel.find((s) => s.capability === r.capability)) await pb.collection("demand_capabilities").delete(r.id);
      for (const s of sel) {
        const ex = rows.find((r) => r.capability === s.capability);
        if (ex) await pb.collection("demand_capabilities").update(ex.id, { isPrimary: s.isPrimary, impact: s.impact });
        else await pb.collection("demand_capabilities").create({ demand: d.id, capability: s.capability, isPrimary: s.isPrimary, impact: s.impact });
      }
      if (d.status !== "ENTWURF") await recalcScore(d.id);
      toast("Capabilities gespeichert");
      onChanged();
      load();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  async function saveApps() {
    try {
      for (const r of appRows) if (!chosen.includes(r.application)) await pb.collection("demand_applications").delete(r.id);
      for (const a of chosen) if (!appRows.find((r) => r.application === a)) await pb.collection("demand_applications").create({ demand: d.id, application: a });
      toast("Anwendungen gespeichert");
      load();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  async function addLink() {
    try {
      const other = await pb.collection("demands").getFirstListItem(`number="${num.trim().replace(/"/g, "")}"`);
      if (other.id === d.id) throw new Error("Ein Demand kann nicht mit sich selbst verknüpft werden.");
      await pb.collection("demand_links").create({ demand: d.id, related: other.id, kind });
      setNum("");
      load();
    } catch (e) { toast(errMsg(e).includes("404") || errMsg(e).includes("not found") ? "Demand-Nummer nicht gefunden." : errMsg(e), "error"); }
  }

  const suggested = Array.from(new Set(appCaps.items.filter((ac) => sel.some((s) => s.capability === ac.capability)).map((ac) => ac.application as string)));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-semibold">Business Capabilities</h2>
        {sel.length === 0 && <p className="text-sm text-amber-700 dark:text-amber-300">Noch keine Capability zugeordnet – die Triage muss vor der Qualifizierung mappen.</p>}
        <CapabilityPicker caps={caps.items} value={sel} onChange={setSel} disabled={!editable} />
        {editable && <button className={btnPrimary} onClick={saveCaps}>Capabilities speichern</button>}
      </Card>
      <div className="space-y-6">
        <Card className="space-y-3">
          <h2 className="font-semibold">Betroffene Anwendungen</h2>
          <div className="flex flex-wrap gap-2">
            {apps.items.map((a) => {
              const on = chosen.includes(a.id);
              const sug = suggested.includes(a.id);
              return (
                <button key={a.id} type="button" disabled={!editable} aria-pressed={on} onClick={() => setChosen(on ? chosen.filter((x) => x !== a.id) : [...chosen, a.id])}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200" : "border-slate-300 dark:border-slate-700"} ${sug && !on ? "ring-2 ring-amber-300" : ""}`}>
                  {on ? "✓ " : ""}{a.name as string}{sug && !on ? " (Vorschlag)" : ""}
                </button>
              );
            })}
          </div>
          {editable && <button className={btnPrimary} onClick={saveApps}>Anwendungen speichern</button>}
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">Verknüpfte Demands</h2>
          {links.length === 0 && <p className="text-sm text-slate-500">Keine Verknüpfungen.</p>}
          <ul className="space-y-1 text-sm">
            {links.map((l) => {
              const o = l.demand === d.id ? l.expand?.related : l.expand?.demand;
              return o ? (
                <li key={l.id}>
                  <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{l.kind === "DUPLIKAT" ? "Duplikat" : "Verwandt"}</span>
                  <Link className="text-indigo-600 hover:underline" href={`/demands/${o.id}`}>{o.number} – {o.title}</Link>
                </li>
              ) : null;
            })}
          </ul>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <input className={`${input} !w-40`} placeholder="DEM-2026-0001" value={num} onChange={(e) => setNum(e.target.value)} aria-label="Demand-Nummer" />
              <select className={`${input} !w-auto`} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Art der Verknüpfung">
                <option value="DUPLIKAT">Duplikat</option><option value="VERWANDT">Verwandt</option>
              </select>
              <button className={btnGhost} onClick={addLink} disabled={!num}>Verknüpfen</button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Verlauf
function History({ d, user, version }: { d: Demand; user: User; version: number }) {
  const { toast } = useAuth();
  const [items, setItems] = useState<{ at: string; kind: "status" | "comment"; r: RecordModel }[]>([]);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);

  const load = useCallback(async () => {
    const [h, c] = await Promise.all([
      pb.collection("status_history").getFullList({ filter: `demand="${d.id}"`, expand: "changedBy" }),
      pb.collection("comments").getFullList({ filter: `demand="${d.id}"`, expand: "author" }),
    ]);
    const all = [
      ...h.map((r) => ({ at: r.created as string, kind: "status" as const, r })),
      ...c.map((r) => ({ at: r.created as string, kind: "comment" as const, r })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    setItems(all);
  }, [d.id]);
  useEffect(() => { load(); }, [load, version]);

  async function send() {
    try {
      await pb.collection("comments").create({ demand: d.id, author: user.id, body: body.trim(), isInternal: internal });
      setBody("");
      load();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  const mention = (t: string) =>
    t.split(/(@[a-zA-Z0-9_.-]+)/g).map((p, i) => (p.startsWith("@") ? <span key={i} className="rounded bg-indigo-100 px-1 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">{p}</span> : p));

  return (
    <div className="max-w-2xl">
      <ol className="relative space-y-4 border-l border-slate-300 pl-6 dark:border-slate-700">
        {items.length === 0 && <li className="text-sm text-slate-500">Noch kein Verlauf.</li>}
        {items.map((it) => (
          <li key={it.kind + it.r.id} className="relative">
            <span className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-600" aria-hidden />
            <div className="text-xs text-slate-500">
              {fmtDateTime(it.at)} · {it.kind === "status" ? it.r.expand?.changedBy?.name : it.r.expand?.author?.name}
              {it.kind === "comment" && it.r.isInternal && <span className="ml-2 rounded bg-amber-100 px-1.5 text-amber-800">intern</span>}
            </div>
            {it.kind === "status" ? (
              <div className="text-sm">
                Status: <strong>{STATUS_LABEL[it.r.fromStatus] || it.r.fromStatus}</strong> → <strong>{STATUS_LABEL[it.r.toStatus] || it.r.toStatus}</strong>
                {it.r.reason && <div className="mt-1 text-slate-600 dark:text-slate-300">Begründung: {it.r.reason}</div>}
              </div>
            ) : (
              <div className="mt-1 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">{mention(it.r.body)}</div>
            )}
          </li>
        ))}
      </ol>
      <Card className="mt-6 space-y-3">
        <Field label="Kommentar"><textarea className={input} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Mit @benutzername kannst du jemanden erwähnen." /></Field>
        <div className="flex items-center justify-between">
          {user.role !== "antragsteller" ? (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Nur intern (Triage & Entscheider)</label>
          ) : <span />}
          <button className={btnPrimary} disabled={!body.trim()} onClick={send}>Kommentieren</button>
        </div>
      </Card>
    </div>
  );
}
