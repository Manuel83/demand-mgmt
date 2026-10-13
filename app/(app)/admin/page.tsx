"use client";
import { useState } from "react";
import { RecordModel } from "pocketbase";
import { useAuth } from "@/components/auth";
import { Card, PageHeader, Skeleton, btnGhost, btnPrimary, input } from "@/components/ui";
import { errMsg, pb, User } from "@/lib/pb";
import { ROLE_LABEL } from "@/lib/de";
import { useList } from "@/lib/data";

type Opt = { value: string; label: string };
type Col = { key: string; label: string; type: "text" | "number" | "bool" | "select"; options?: Opt[]; width?: string };

/** Einfacher Stammdaten-Editor: Zeilen inline bearbeiten, unten neue anlegen. */
function Editor({ collection, cols, defaults = {}, sort = "name", extra }: {
  collection: string; cols: Col[]; defaults?: Record<string, unknown>; sort?: string;
  extra?: (r: RecordModel) => React.ReactNode;
}) {
  const { toast } = useAuth();
  const { items, loading, reload } = useList(collection, { sort });
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  async function update(r: RecordModel, key: string, value: unknown) {
    try { await pb.collection(collection).update(r.id, { [key]: value }); toast("Gespeichert"); await reload(); } catch (e) { toast(errMsg(e), "error"); }
  }
  async function add() {
    try { await pb.collection(collection).create({ active: true, ...defaults, ...draft }); setDraft({}); toast("Angelegt"); await reload(); } catch (e) { toast(errMsg(e), "error"); }
  }
  const field = (c: Col, value: unknown, onChange: (v: unknown) => void, onCommit?: (v: unknown) => void) => {
    const common = { "aria-label": c.label, className: input };
    if (c.type === "bool") return <input type="checkbox" aria-label={c.label} checked={!!value} onChange={(e) => { onChange(e.target.checked); onCommit?.(e.target.checked); }} />;
    if (c.type === "select")
      return (
        <select {...common} value={String(value ?? "")} onChange={(e) => { onChange(e.target.value); onCommit?.(e.target.value); }}>
          <option value="">–</option>{c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    return (
      <input {...common} type={c.type} value={String(value ?? "")}
        onChange={(e) => onChange(c.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        onBlur={(e) => onCommit?.(c.type === "number" ? Number(e.target.value) : e.target.value)} />
    );
  };

  if (loading) return <Skeleton />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{cols.map((c) => <th key={c.key} className="px-2 py-2">{c.label}</th>)}{extra && <th />}</tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
              {cols.map((c) => (
                <td key={c.key} className="px-2 py-1.5">
                  <RowCell value={r[c.key]} render={(v, set) => field(c, v, set, (nv) => nv !== r[c.key] && update(r, c.key, nv))} />
                </td>
              ))}
              {extra && <td className="px-2 py-1.5">{extra(r)}</td>}
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200 dark:border-slate-700">
            {cols.map((c) => <td key={c.key} className="px-2 py-2">{field(c, draft[c.key], (v) => setDraft({ ...draft, [c.key]: v }))}</td>)}
            <td className="px-2 py-2"><button className={btnPrimary} onClick={add}>Anlegen</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RowCell({ value, render }: { value: unknown; render: (v: unknown, set: (v: unknown) => void) => React.ReactNode }) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setV(value); }
  return <>{render(v, setV)}</>;
}

function Users() {
  const { toast } = useAuth();
  const depts = useList("departments", { filter: "active=true", sort: "name" });
  const users = useList<User>("users", { sort: "name" });
  const [f, setF] = useState({ username: "", name: "", role: "antragsteller", department: "", password: "" });
  const deptOpts = depts.items.map((d) => ({ value: d.id, label: d.name as string }));

  async function create() {
    try {
      await pb.collection("users").create({
        ...f, email: `${f.username}@demand.local`, emailVisibility: true, verified: true, active: true, passwordConfirm: f.password,
      });
      setF({ username: "", name: "", role: "antragsteller", department: "", password: "" });
      toast("Benutzer angelegt");
      users.reload();
    } catch (e) { toast(errMsg(e), "error"); }
  }
  async function patch(u: User, data: Record<string, unknown>) {
    try { await pb.collection("users").update(u.id, data); toast("Gespeichert"); users.reload(); } catch (e) { toast(errMsg(e), "error"); }
  }
  async function resetPw(u: User) {
    const pw = prompt(`Neues Passwort für ${u.username} (mind. 8 Zeichen):`);
    if (pw) await patch(u, { password: pw, passwordConfirm: pw });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-2 py-2">Benutzername</th><th className="px-2 py-2">Name</th><th className="px-2 py-2">Rolle</th><th className="px-2 py-2">Fachbereich</th><th className="px-2 py-2">Aktiv</th><th /></tr>
          </thead>
          <tbody>
            {users.items.map((u) => (
              <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1.5">{u.username}</td>
                <td className="px-2 py-1.5">{u.name}</td>
                <td className="px-2 py-1.5">
                  <select className={input} aria-label="Rolle" value={u.role} onChange={(e) => patch(u, { role: e.target.value })}>
                    {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select className={input} aria-label="Fachbereich" value={u.department || ""} onChange={(e) => patch(u, { department: e.target.value })}>
                    <option value="">–</option>{deptOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5"><input type="checkbox" aria-label="Aktiv" checked={u.active} onChange={(e) => patch(u, { active: e.target.checked })} /></td>
                <td className="px-2 py-1.5"><button className={btnGhost} onClick={() => resetPw(u)}>Passwort zurücksetzen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 border-t border-slate-200 pt-4 sm:grid-cols-6 dark:border-slate-800">
        <input className={input} placeholder="Benutzername" aria-label="Benutzername" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        <input className={input} placeholder="Name" aria-label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select className={input} aria-label="Rolle" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={input} aria-label="Fachbereich" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
          <option value="">Fachbereich</option>{deptOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input className={input} type="password" placeholder="Passwort (min. 8)" aria-label="Passwort" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <button className={btnPrimary} onClick={create} disabled={!f.username || !f.name || f.password.length < 8}>Benutzer anlegen</button>
      </div>
    </div>
  );
}

function AppCaps({ app }: { app: RecordModel }) {
  const caps = useList("capabilities", { filter: "active=true && level=2", sort: "sortOrder" });
  const links = useList("application_capabilities", { filter: `application="${app.id}"` });
  const { toast } = useAuth();
  const [open, setOpen] = useState(false);
  async function toggle(capId: string) {
    const ex = links.items.find((l) => l.capability === capId);
    try {
      if (ex) await pb.collection("application_capabilities").delete(ex.id);
      else await pb.collection("application_capabilities").create({ application: app.id, capability: capId });
      links.reload();
    } catch (e) { toast(errMsg(e), "error"); }
  }
  return (
    <div>
      <button className={btnGhost} aria-expanded={open} onClick={() => setOpen(!open)}>Capabilities ({links.items.length})</button>
      {open && (
        <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
          {caps.items.map((c) => (
            <label key={c.id} className="flex items-center gap-2 py-0.5 text-sm">
              <input type="checkbox" checked={links.items.some((l) => l.capability === c.id)} onChange={() => toggle(c.id)} /> {c.name as string}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = ["Fachbereiche", "Domänen", "Capabilities", "Anwendungen", "Scoring", "Benutzer"] as const;

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Fachbereiche");
  const users = useList<User>("users", { sort: "name" });
  const domains = useList("domains", { sort: "name" });
  const caps = useList("capabilities", { filter: "level=1", sort: "sortOrder" });
  const all = useList("capabilities", {});

  if (!user) return null;
  if (user.role !== "admin") return <p>Dieser Bereich ist Admins vorbehalten.</p>;
  const uOpts = users.items.map((u) => ({ value: u.id, label: u.name }));

  return (
    <>
      <PageHeader title="Admin" sub="Stammdaten werden nie gelöscht, sondern deaktiviert." />
      <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-slate-500"}`}>{t}</button>
        ))}
      </div>
      <Card>
        {tab === "Fachbereiche" && <Editor collection="departments" cols={[{ key: "name", label: "Name", type: "text" }, { key: "active", label: "Aktiv", type: "bool" }]} />}
        {tab === "Domänen" && <Editor collection="domains" cols={[{ key: "name", label: "Name", type: "text" }, { key: "lead", label: "Leitung", type: "select", options: uOpts }, { key: "active", label: "Aktiv", type: "bool" }]} />}
        {tab === "Capabilities" && (
          <>
            <p className="mb-3 text-sm text-slate-500">Ebene 1 hat keine Eltern-Capability; für Ebene 2 die Ebene-1-Capability als Eltern wählen und Ebene = 2 setzen.</p>
            <Editor
              collection="capabilities"
              sort="sortOrder"
              defaults={{ level: 2, strategicImportance: 3 }}
              cols={[
                { key: "name", label: "Name", type: "text" },
                { key: "level", label: "Ebene", type: "number" },
                { key: "parent", label: "Eltern (Ebene 1)", type: "select", options: caps.items.map((c) => ({ value: c.id, label: c.name as string })) },
                { key: "description", label: "Beschreibung", type: "text" },
                { key: "strategicImportance", label: "Strategie (1–5)", type: "number" },
                { key: "sortOrder", label: "Sortierung", type: "number" },
                { key: "active", label: "Aktiv", type: "bool" },
              ]}
            />
            <span className="hidden">{all.items.length}</span>
          </>
        )}
        {tab === "Anwendungen" && (
          <Editor
            collection="applications"
            cols={[
              { key: "name", label: "Name", type: "text" },
              { key: "description", label: "Beschreibung", type: "text" },
              { key: "domain", label: "Domäne", type: "select", options: domains.items.map((d) => ({ value: d.id, label: d.name as string })) },
              { key: "lifecycle", label: "Lebenszyklus", type: "select", options: ["PLAN", "AKTIV", "AUSLAUFEND"].map((v) => ({ value: v, label: v })) },
              { key: "active", label: "Aktiv", type: "bool" },
            ]}
            extra={(r) => <AppCaps app={r} />}
          />
        )}
        {tab === "Scoring" && (
          <>
            <p className="mb-3 text-sm text-slate-500">Score = Summe(Wert × Gewicht) / Summe(Gewichte) × 20, also 20 bis 100. Strategischer Fit und Aufwand werden automatisch ermittelt.</p>
            <Editor collection="scoring_criteria" sort="sortOrder" cols={[
              { key: "name", label: "Kriterium", type: "text" },
              { key: "weight", label: "Gewicht", type: "number" },
              { key: "scaleHint", label: "Skalenhinweis", type: "text" },
              { key: "sortOrder", label: "Sortierung", type: "number" },
              { key: "active", label: "Aktiv", type: "bool" },
            ]} />
          </>
        )}
        {tab === "Benutzer" && <Users />}
      </Card>
    </>
  );
}
