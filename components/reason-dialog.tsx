"use client";
import { useState } from "react";
import { Field, btnGhost, btnPrimary, input } from "./ui";
import { Transition } from "@/lib/workflow";

export function ReasonDialog({ t, onCancel, onOk }: { t: Transition; onCancel: () => void; onOk: (reason: string, followUp?: string) => void }) {
  const [reason, setReason] = useState("");
  const [follow, setFollow] = useState("");
  const required = t.reason === "required";
  return (
    <div role="dialog" aria-modal="true" aria-label={t.label} className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <form
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
        onSubmit={(e) => { e.preventDefault(); onOk(reason.trim(), follow || undefined); }}
      >
        <h2 className="text-lg font-semibold">{t.label}</h2>
        <Field label={required ? "Begründung (Pflicht)" : "Anmerkung / Abweichung vom Score (optional)"}>
          <textarea autoFocus className={input} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} required={required} />
        </Field>
        {t.to === "ZURUECKGESTELLT" && (
          <Field label="Wiedervorlage (optional)">
            <input type="date" className={input} value={follow} onChange={(e) => setFollow(e.target.value)} />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onCancel}>Abbrechen</button>
          <button className={t.to === "ABGELEHNT" ? "rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white" : btnPrimary}>{t.label}</button>
        </div>
      </form>
    </div>
  );
}

