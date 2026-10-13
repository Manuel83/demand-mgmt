"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { Card, Empty, PageHeader, Skeleton, StatusBadge, btnPrimary } from "@/components/ui";
import { Demand, pb } from "@/lib/pb";
import { fmtDate, OPEN_STATUS } from "@/lib/de";

function Tile({ title, value, href }: { title: string; value: string | number; href?: string }) {
  const body = (
    <Card className="h-full transition hover:shadow-md">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mineOpen, setMineOpen] = useState(0);
  const [waiting, setWaiting] = useState(0);
  const [recent, setRecent] = useState<Demand[]>([]);
  const [stats, setStats] = useState<{ submitted: number; ready: number; days: number | null }>({ submitted: 0, ready: 0, days: null });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const open = OPEN_STATUS.map((s) => `status="${s}"`).join(" || ");
      const mine = await pb.collection("demands").getList<Demand>(1, 1, { filter: `requester="${user.id}" && (${open})` });
      setMineOpen(mine.totalItems);
      const recentRes = await pb.collection("demands").getList<Demand>(1, 6, { sort: "-updated", filter: user.role === "antragsteller" ? `requester="${user.id}"` : "" });
      setRecent(recentRes.items);

      const countWhere = async (f: string) => (await pb.collection("demands").getList(1, 1, { filter: f })).totalItems;
      if (user.role === "antragsteller") {
        setWaiting(await countWhere(`requester="${user.id}" && status="ENTWURF"`));
      } else {
        const submitted = await countWhere(`status="EINGEREICHT"`);
        const ready = await countWhere(`status="ENTSCHEIDUNGSREIF"`);
        setWaiting(user.role === "entscheider" ? ready : submitted);
        const done = await pb.collection("demands").getFullList<Demand>({ filter: `decidedAt != ""`, fields: "created,decidedAt" });
        const days = done.length
          ? done.reduce((a, d) => a + (new Date(d.decidedAt.replace(" ", "T")).getTime() - new Date(d.created.replace(" ", "T")).getTime()) / 86400000, 0) / done.length
          : null;
        setStats({ submitted, ready, days: days === null ? null : Math.round(days * 10) / 10 });
      }
      setLoading(false);
    })();
  }, [user]);

  if (!user) return null;
  const staff = user.role !== "antragsteller";
  const waitLabel = user.role === "entscheider" ? "Entscheidungsreif – wartet auf mich" : user.role === "antragsteller" ? "Entwürfe zum Einreichen" : "In der Triage – wartet auf mich";
  const waitHref = user.role === "entscheider" ? "/portfolio" : user.role === "antragsteller" ? "/demands" : "/triage";

  return (
    <>
      <PageHeader
        title={`Hallo ${user.name?.split(" ")[0] || user.username}`}
        sub="Was liegt an?"
      />
      {loading ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile title="Meine offenen Demands" value={mineOpen} href="/demands" />
            <Tile title={waitLabel} value={waiting} href={waitHref} />
            {staff && <Tile title="Neue Demands (Eingereicht)" value={stats.submitted} href="/triage" />}
            {staff && <Tile title="Entscheidungsreif" value={stats.ready} href="/portfolio" />}
            {staff && <Tile title="Ø Durchlaufzeit bis Entscheidung (Tage)" value={stats.days === null ? "–" : stats.days} />}
          </div>
          <h2 className="mb-3 mt-8 text-lg font-semibold">Zuletzt geändert</h2>
          {recent.length === 0 ? (
            <Empty title="Noch keine Demands" hint="Erfasse deine erste Idee in unter 5 Minuten." action={<Link href="/demands/new" className={btnPrimary}>Demand erfassen</Link>} />
          ) : (
            <Card className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
              {recent.map((d) => (
                <Link key={d.id} href={`/demands/${d.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <span className="min-w-0">
                    <span className="mr-2 text-xs text-slate-500">{d.number}</span>
                    <span className="font-medium">{d.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="hidden text-xs text-slate-500 sm:inline">{fmtDate(d.updated)}</span>
                    <StatusBadge status={d.status} />
                  </span>
                </Link>
              ))}
            </Card>
          )}
        </>
      )}
    </>
  );
}
