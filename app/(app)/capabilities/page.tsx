"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RecordModel } from "pocketbase";
import { useAuth } from "@/components/auth";
import { Card, Empty, PageHeader, Skeleton, StatusBadge } from "@/components/ui";
import { Demand, pb } from "@/lib/pb";
import { EFFORT_MID, OPEN_STATUS } from "@/lib/de";
import { useCapabilities, useList } from "@/lib/data";

export default function Heatmap() {
  const { user } = useAuth();
  const caps = useCapabilities();
  const [links, setLinks] = useState<RecordModel[] | null>(null);
  const [mode, setMode] = useState<"count" | "effort">("count");
  const [open, setOpen] = useState<string | null>(null);
  const appCaps = useList("application_capabilities", { expand: "application" });

  useEffect(() => {
    pb.collection("demand_capabilities").getFullList({ expand: "demand", filter: OPEN_STATUS.map((s) => `demand.status="${s}"`).join(" || ") }).then(setLinks);
  }, []);

  const stats = useMemo(() => {
    const m: Record<string, { count: number; effort: number; demands: Demand[] }> = {};
    for (const l of links || []) {
      const d = l.expand?.demand as Demand | undefined;
      if (!d) continue;
      const s = (m[l.capability] ||= { count: 0, effort: 0, demands: [] });
      s.count += 1;
      s.effort += EFFORT_MID[d.effortSize] || 0;
      s.demands.push(d);
    }
    return m;
  }, [links]);

  if (!user) return null;
  if (user.role === "antragsteller") return <p>Die Heatmap ist für Triage und Entscheider sichtbar.</p>;
  if (!links || caps.loading) return <Skeleton />;

  const l1 = caps.items.filter((c) => !c.parent);
  const val = (id: string) => (mode === "count" ? stats[id]?.count || 0 : stats[id]?.effort || 0);
  const max = Math.max(1, ...caps.items.map((c) => val(c.id)));
  const sel = caps.items.find((c) => c.id === open);

  return (
    <>
      <PageHeader
        title="Capability-Heatmap"
        sub="Wo konzentriert sich der Veränderungsbedarf?"
        actions={
          <div role="group" aria-label="Darstellung" className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
            {([["count", "Anzahl offene Demands"], ["effort", "Summe Aufwand (Tage)"]] as const).map(([k, l]) => (
              <button key={k} aria-pressed={mode === k} onClick={() => setMode(k)} className={`rounded-md px-3 py-1.5 text-sm ${mode === k ? "bg-indigo-600 text-white" : ""}`}>{l}</button>
            ))}
          </div>
        }
      />
      {Object.keys(stats).length === 0 && <Empty title="Noch keine zugeordneten Demands" hint="Sobald Demands auf Capabilities gemappt sind, färbt sich die Karte ein." />}
      <div className="overflow-x-auto pb-2">
        <div className="grid grid-flow-col gap-3" style={{ gridAutoColumns: "minmax(170px, 1fr)" }}>
          {l1.map((root) => (
            <div key={root.id} className="min-w-0">
              <div className="mb-2 break-words rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-700">{root.name}</div>
              <div className="space-y-2">
                {caps.items.filter((c) => c.parent === root.id).map((c) => {
                  const v = val(c.id);
                  const a = v / max;
                  return (
                    <button key={c.id} onClick={() => setOpen(c.id)} aria-pressed={open === c.id}
                      title={c.description}
                      style={{ backgroundColor: v ? `rgba(79,70,229,${0.12 + a * 0.75})` : undefined }}
                      className={`block w-full min-w-0 break-words rounded-lg border p-3 text-left text-sm ${v ? "border-indigo-300" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"} ${a > 0.6 ? "text-white" : ""} ${open === c.id ? "ring-2 ring-indigo-600" : ""}`}>
                      <div className="font-medium">{c.name}</div>
                      <div className="mt-1 text-xs">{mode === "count" ? `${v} Demand${v === 1 ? "" : "s"}` : `${v} Tage`}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {sel && (
        <Card className="mt-6">
          <h2 className="font-semibold">{sel.name}</h2>
          <p className="text-sm text-slate-500">{sel.description}</p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium">Zugeordnete Demands</h3>
              {(stats[sel.id]?.demands || []).length === 0 && <p className="text-sm text-slate-500">Keine offenen Demands.</p>}
              <ul className="space-y-2">
                {(stats[sel.id]?.demands || []).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/demands/${d.id}`} className="hover:underline">{d.number} – {d.title}</Link>
                    <StatusBadge status={d.status} />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Tragende Anwendungen</h3>
              <ul className="space-y-1 text-sm">
                {appCaps.items.filter((a) => a.capability === sel.id).map((a) => <li key={a.id}>{a.expand?.application?.name as string}</li>)}
                {appCaps.items.filter((a) => a.capability === sel.id).length === 0 && <li className="text-slate-500">Keine Anwendung zugeordnet.</li>}
              </ul>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
