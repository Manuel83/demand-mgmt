"use client";
import { useMemo, useState } from "react";
import { Cap } from "@/lib/data";
import { IMPACT_LABEL } from "@/lib/de";
import { input } from "./ui";

export interface Selection {
  capability: string;
  isPrimary: boolean;
  impact: string;
}

/** Durchsuchbarer Baum (L1 aufklappbar), Mehrfachauswahl, genau eine primaer. */
export function CapabilityPicker({
  caps,
  value,
  onChange,
  disabled,
}: {
  caps: Cap[];
  value: Selection[];
  onChange: (v: Selection[]) => void;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const tree = useMemo(() => {
    const roots = caps.filter((c) => !c.parent);
    const kids = (id: string) => caps.filter((c) => c.parent === id);
    const t = term.trim().toLowerCase();
    const match = (c: Cap) => c.name.toLowerCase().includes(t) || (c.description || "").toLowerCase().includes(t);
    return roots
      .map((r) => {
        const children = kids(r.id).filter((k) => !t || match(k) || match(r));
        return { root: r, children, show: !t || match(r) || children.length > 0 };
      })
      .filter((x) => x.show);
  }, [caps, term]);

  const sel = (id: string) => value.find((v) => v.capability === id);
  const toggle = (id: string) => {
    if (disabled) return;
    if (sel(id)) {
      const rest = value.filter((v) => v.capability !== id);
      if (rest.length && !rest.some((v) => v.isPrimary)) rest[0] = { ...rest[0], isPrimary: true };
      onChange(rest);
    } else {
      onChange([...value, { capability: id, isPrimary: value.length === 0, impact: "VERBESSERUNG" }]);
    }
  };
  const setPrimary = (id: string) => onChange(value.map((v) => ({ ...v, isPrimary: v.capability === id })));
  const setImpact = (id: string, impact: string) => onChange(value.map((v) => (v.capability === id ? { ...v, impact } : v)));

  return (
    <div className="rounded-xl border border-slate-300 p-3 dark:border-slate-700">
      <input className={input} placeholder="Capability suchen …" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Capability suchen" />
      <div className="mt-3 max-h-72 space-y-1 overflow-auto pr-1">
        {tree.length === 0 && <p className="p-2 text-sm text-slate-500">Keine Capability gefunden.</p>}
        {tree.map(({ root, children }) => {
          const expanded = term.trim() ? true : !!open[root.id];
          return (
            <div key={root.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-expanded={expanded}
                onClick={() => setOpen({ ...open, [root.id]: !expanded })}
              >
                <span aria-hidden>{expanded ? "▾" : "▸"}</span>
                {root.name}
                <span className="text-xs font-normal text-slate-500">({children.length})</span>
              </button>
              {expanded &&
                children.map((c) => {
                  const s = sel(c.id);
                  return (
                    <div key={c.id} className="ml-6 flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/60" title={c.description}>
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1" checked={!!s} onChange={() => toggle(c.id)} disabled={disabled} />
                        <span>
                          {c.name}
                          {c.description && <span className="block text-xs text-slate-500">{c.description}</span>}
                        </span>
                      </label>
                      {s && (
                        <div className="flex items-center gap-2 text-xs">
                          <label className="flex items-center gap-1">
                            <input type="radio" name="primary-cap" checked={s.isPrimary} onChange={() => setPrimary(c.id)} disabled={disabled} />
                            primär
                          </label>
                          <select
                            aria-label="Auswirkung"
                            className="rounded border border-slate-300 bg-transparent px-1 py-0.5 dark:border-slate-700"
                            value={s.impact}
                            onChange={(e) => setImpact(c.id, e.target.value)}
                            disabled={disabled}
                          >
                            {Object.entries(IMPACT_LABEL).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
