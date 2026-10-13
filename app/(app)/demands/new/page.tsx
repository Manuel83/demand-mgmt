"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth";
import { Card, Field, PageHeader, btnGhost, btnPrimary, input } from "@/components/ui";
import { CapabilityPicker, Selection } from "@/components/capability-picker";
import { Demand, errMsg, pb, q } from "@/lib/pb";
import { BENEFIT_LABEL, TYPE_HELP, TYPE_LABEL } from "@/lib/de";
import { useCapabilities, useList } from "@/lib/data";
import { changeStatus, nextNumber } from "@/lib/workflow";

const DRAFT_KEY = "demand.draft";

export default function NewDemand() {
  const { user, toast } = useAuth();
  const router = useRouter();
  const caps = useCapabilities();
  const depts = useList("departments", { filter: "active=true", sort: "name" });
  const apps = useList("applications", { filter: "active=true", sort: "name" });
  const appCaps = useList("application_capabilities");

  const [f, setF] = useState({ title: "", description: "", type: "", department: "", benefitCategory: "", desiredDate: "", desiredDateReason: "" });
  const [selection, setSelection] = useState<Selection[]>([]);
  const [unknownCap, setUnknownCap] = useState(false);
  const [chosenApps, setChosenApps] = useState<string[]>([]);
  const [similar, setSimilar] = useState<Demand[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const loaded = useRef(false);

  // Entwurf wiederherstellen
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setF((p) => ({ ...p, ...d.f }));
        setSelection(d.selection || []);
        setChosenApps(d.chosenApps || []);
      }
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (user && !f.department) setF((p) => ({ ...p, department: p.department || user.department }));
  }, [user, f.department]);
  // automatisch speichern
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ f, selection, chosenApps }));
        setSaved("Entwurf automatisch gespeichert");
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [f, selection, chosenApps]);

  // ähnliche Demands
  useEffect(() => {
    const words = f.title.trim().split(/\s+/).filter((w) => w.length > 3).slice(0, 4);
    if (words.length === 0) return setSimilar([]);
    const t = setTimeout(async () => {
      const filter = words.map((w) => `title ~ ${q(w)}`).join(" || ");
      const r = await pb.collection("demands").getList<Demand>(1, 3, { filter: `(${filter}) && status != "ENTWURF"`, sort: "-updated" });
      setSimilar(r.items);
    }, 350);
    return () => clearTimeout(t);
  }, [f.title]);

  // vorgeschlagene Anwendungen aus den gewählten Capabilities
  const suggested = Array.from(
    new Set(appCaps.items.filter((ac) => selection.some((s) => s.capability === ac.capability)).map((ac) => ac.application as string)),
  );

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const valid = f.title && f.description && f.type && f.department && f.benefitCategory && (!f.desiredDate || f.desiredDateReason);

  async function save(submit: boolean) {
    if (!user) return;
    setBusy(true);
    try {
      const number = await nextNumber();
      let d = await pb.collection("demands").create<Demand>({ ...f, number, status: "ENTWURF", requester: user.id });
      for (const s of selection) await pb.collection("demand_capabilities").create({ demand: d.id, capability: s.capability, isPrimary: s.isPrimary, impact: s.impact });
      for (const a of chosenApps) await pb.collection("demand_applications").create({ demand: d.id, application: a });
      if (submit) d = await changeStatus(d, "EINGEREICHT", user);
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      toast(submit ? `${d.number} eingereicht – die Triage meldet sich binnen 5 Arbeitstagen.` : "Als Entwurf gespeichert.");
      router.push(`/demands/${d.id}`);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Neuer Demand" sub="Beschreibe kurz dein Anliegen. Details klärt die IT später mit dir." />
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <strong>Demand oder Ticket?</strong> Wenn jemand dafür Zeit und Geld freigeben muss, ist es ein Demand. Störungen und Standardbestellungen gehören ins bestehende Ticket-Tool.
      </div>
      <form className="mx-auto max-w-2xl space-y-5" onSubmit={(e) => { e.preventDefault(); if (valid) save(true); }}>
        <Card className="space-y-5">
          <Field label="Titel *" hint={`${f.title.length}/120`}>
            <input className={input} maxLength={120} value={f.title} onChange={set("title")} placeholder="Kurz und sprechend, z. B. „Digitale Rechnungsfreigabe“" required />
          </Field>
          {similar.length > 0 && (
            <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
              <p className="font-medium">Gibt es das vielleicht schon?</p>
              <ul className="mt-1 space-y-1">
                {similar.map((s) => (
                  <li key={s.id}><Link className="text-indigo-600 hover:underline" href={`/demands/${s.id}`} target="_blank">{s.number} – {s.title}</Link></li>
                ))}
              </ul>
            </div>
          )}
          <Field label="Problem oder Ziel *" hint="Beschreibe das Problem oder Ziel – nicht die Lösung.">
            <textarea className={input} rows={5} value={f.description} onChange={set("description")} required />
          </Field>
          <Field label="Typ *">
            <select className={input} value={f.type} onChange={set("type")} required>
              <option value="">Bitte wählen …</option>
              {Object.entries(TYPE_LABEL).filter(([k]) => k !== "SERVICE_REQUEST").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {f.type && <span className="mt-1 block text-xs text-slate-500">{TYPE_HELP[f.type]}</span>}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Fachbereich *">
              <select className={input} value={f.department} onChange={set("department")} required>
                <option value="">Bitte wählen …</option>
                {depts.items.map((d) => <option key={d.id} value={d.id}>{d.name as string}</option>)}
              </select>
            </Field>
            <Field label="Wozu dient es? *">
              <select className={input} value={f.benefitCategory} onChange={set("benefitCategory")} required>
                <option value="">Bitte wählen …</option>
                {Object.entries(BENEFIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Wunschtermin (optional)">
              <input type="date" className={input} value={f.desiredDate} onChange={set("desiredDate")} />
            </Field>
            <Field label="Begründung des Termins" hint={f.desiredDate ? "Pflicht, wenn ein Termin gesetzt ist" : undefined}>
              <input className={input} value={f.desiredDateReason} onChange={set("desiredDateReason")} placeholder="z. B. gesetzliche Frist" required={!!f.desiredDate} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Betroffene Business Capabilities (optional)</h2>
            <p className="text-sm text-slate-500">Welche Fähigkeiten des Unternehmens sind betroffen? Die Triage bestätigt oder korrigiert.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={unknownCap} onChange={(e) => { setUnknownCap(e.target.checked); if (e.target.checked) setSelection([]); }} />
            Weiß ich nicht – die Triage klärt das
          </label>
          {!unknownCap && <CapabilityPicker caps={caps.items} value={selection} onChange={setSelection} />}
          {suggested.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">Betroffene Anwendungen (Vorschlag)</p>
              <div className="flex flex-wrap gap-2">
                {suggested.map((id) => {
                  const a = apps.items.find((x) => x.id === id);
                  const on = chosenApps.includes(id);
                  return (
                    <button type="button" key={id} aria-pressed={on} onClick={() => setChosenApps(on ? chosenApps.filter((x) => x !== id) : [...chosenApps, id])}
                      className={`rounded-full border px-3 py-1 text-sm ${on ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200" : "border-slate-300 dark:border-slate-700"}`}>
                      {on ? "✓ " : ""}{a?.name as string}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{saved}</span>
          <div className="flex gap-2">
            <button type="button" className={btnGhost} disabled={busy || !f.title} onClick={() => save(false)}>Als Entwurf speichern</button>
            <button className={btnPrimary} disabled={busy || !valid}>Demand einreichen</button>
          </div>
        </div>
      </form>
    </>
  );
}
