import { pb, Demand, Role, User } from "./pb";
import { STATUS_LABEL } from "./de";

export interface Transition {
  from: string[];
  to: string;
  roles: Role[]; // admin darf immer wie Triage und Entscheider
  reason?: "required" | "optional";
  label: string;
  primary?: boolean;
}

const OPEN3 = ["EINGEREICHT", "IN_QUALIFIZIERUNG", "ENTSCHEIDUNGSREIF"];

export const TRANSITIONS: Transition[] = [
  { from: ["ENTWURF"], to: "EINGEREICHT", roles: ["antragsteller", "triage", "entscheider", "admin"], label: "Einreichen", primary: true },
  { from: ["EINGEREICHT"], to: "IN_QUALIFIZIERUNG", roles: ["triage"], label: "Zur Qualifizierung freigeben", primary: true },
  { from: ["EINGEREICHT"], to: "SERVICE_REQUEST_ABGEGEBEN", roles: ["triage"], reason: "required", label: "Als Service Request abgeben" },
  { from: ["IN_QUALIFIZIERUNG"], to: "ENTSCHEIDUNGSREIF", roles: ["triage"], label: "Entscheidungsreif melden", primary: true },
  { from: ["ENTSCHEIDUNGSREIF"], to: "GENEHMIGT", roles: ["entscheider"], reason: "optional", label: "Genehmigen", primary: true },
  { from: ["ENTSCHEIDUNGSREIF"], to: "IN_QUALIFIZIERUNG", roles: ["entscheider"], reason: "required", label: "Rückfrage an Triage" },
  { from: ["GENEHMIGT"], to: "IN_UMSETZUNG", roles: ["triage"], label: "In Umsetzung nehmen", primary: true },
  { from: ["IN_UMSETZUNG"], to: "ABGESCHLOSSEN", roles: ["triage"], label: "Abschließen", primary: true },
  { from: OPEN3, to: "ZURUECKGESTELLT", roles: ["triage", "entscheider"], reason: "required", label: "Zurückstellen" },
  { from: OPEN3, to: "ABGELEHNT", roles: ["triage", "entscheider"], reason: "required", label: "Ablehnen" },
  { from: ["ZURUECKGESTELLT"], to: "EINGEREICHT", roles: ["triage"], label: "Wieder in die Triage", primary: true },
];

export const ENDSTATUS = ["ABGELEHNT", "ABGESCHLOSSEN", "SERVICE_REQUEST_ABGEGEBEN"];

function roleMatches(t: Transition, role: Role) {
  if (role === "admin") return true;
  return t.roles.includes(role);
}

/** Welche Statuswechsel darf der Benutzer fuer diesen Demand ausloesen? */
export function availableTransitions(d: Demand, user: User): Transition[] {
  return TRANSITIONS.filter((t) => {
    if (!t.from.includes(d.status)) return false;
    if (d.status === "ENTWURF") return d.requester === user.id || user.role === "admin";
    return roleMatches(t, user.role);
  });
}

/** Fachliche Voraussetzungen je Zielstatus; liefert Fehlertexte */
export async function checkPrerequisites(d: Demand, to: string): Promise<string[]> {
  const missing: string[] = [];
  const caps = await pb.collection("demand_capabilities").getFullList({ filter: `demand="${d.id}"` });
  const hasPrimary = caps.some((c) => c.isPrimary);

  if (to === "EINGEREICHT") {
    if (!d.title) missing.push("Titel");
    if (!d.description) missing.push("Beschreibung");
    if (!d.type) missing.push("Typ");
    if (!d.department) missing.push("Fachbereich");
    if (!d.benefitCategory) missing.push("Nutzenkategorie");
  }
  if (to === "IN_QUALIFIZIERUNG" && d.status === "EINGEREICHT") {
    if (!d.domain) missing.push("Domäne");
    if (!hasPrimary) missing.push("primäre Capability");
  }
  if (to === "ENTSCHEIDUNGSREIF") {
    if (!hasPrimary) missing.push("primäre Capability");
    if (!d.domain) missing.push("Domäne");
    if (!d.effortSize) missing.push("Aufwand");
    if (!d.sponsor) missing.push("Sponsor");
    if (!d.benefitDescription) missing.push("Nutzenbeschreibung");
    const [criteria, scores] = await Promise.all([
      pb.collection("scoring_criteria").getFullList({ filter: "active=true" }),
      pb.collection("demand_scores").getFullList({ filter: `demand="${d.id}"` }),
    ]);
    const have = new Set(scores.map((s) => s.criterion));
    const auto = new Set(["fit", "aufwand"]);
    const open = criteria.filter((c) => !auto.has(c.key) && !have.has(c.id));
    if (open.length) missing.push("vollständiges Scoring (" + open.map((c) => c.name).join(", ") + ")");
  }
  if (to === "IN_UMSETZUNG" && !d.assignee) missing.push("Bearbeiter");
  return missing;
}

/** Zentrale Funktion fuer jeden Statuswechsel: prueft Regeln, schreibt Historie. */
export async function changeStatus(d: Demand, to: string, user: User, opts: { reason?: string; followUpDate?: string } = {}): Promise<Demand> {
  const t = TRANSITIONS.find((x) => x.from.includes(d.status) && x.to === to && roleMatches(x, user.role));
  if (!t) throw new Error(`Wechsel von „${STATUS_LABEL[d.status]}“ nach „${STATUS_LABEL[to]}“ ist nicht erlaubt.`);
  if (t.reason === "required" && !opts.reason?.trim()) throw new Error("Bitte eine Begründung angeben.");
  const missing = await checkPrerequisites(d, to);
  if (missing.length) throw new Error("Es fehlt noch: " + missing.join(", ") + ".");

  const patch: Record<string, unknown> = { status: to };
  if (["ABGELEHNT", "ZURUECKGESTELLT", "GENEHMIGT"].includes(to)) {
    patch.decidedAt = new Date().toISOString().replace("T", " ");
    patch.decidedBy = user.id;
    patch.decisionReason = opts.reason ?? "";
  }
  if (to === "ZURUECKGESTELLT") patch.followUpDate = opts.followUpDate || "";
  if (to === "SERVICE_REQUEST_ABGEGEBEN") patch.decisionReason = opts.reason ?? "";
  if (to === "IN_QUALIFIZIERUNG" && d.status === "ENTSCHEIDUNGSREIF") patch.decisionReason = "";

  const updated = await pb.collection("demands").update<Demand>(d.id, patch);
  await pb.collection("status_history").create({
    demand: d.id,
    fromStatus: d.status,
    toStatus: to,
    changedBy: user.id,
    reason: opts.reason ?? "",
  });
  if (opts.reason && t.reason === "required") {
    await pb.collection("comments").create({ demand: d.id, author: user.id, body: `${t.label}: ${opts.reason}`, isInternal: false });
  }
  return updated;
}

/** Score 20..100 aus gewichteten Einzelbewertungen */
export async function recalcScore(demandId: string): Promise<number> {
  const [d, criteria, scores, caps] = await Promise.all([
    pb.collection("demands").getOne<Demand>(demandId),
    pb.collection("scoring_criteria").getFullList({ filter: "active=true", sort: "sortOrder" }),
    pb.collection("demand_scores").getFullList({ filter: `demand="${demandId}"` }),
    pb.collection("demand_capabilities").getFullList({ filter: `demand="${demandId}" && isPrimary=true`, expand: "capability" }),
  ]);
  const manual = new Map(scores.map((s) => [s.criterion, s.value as number]));
  const eff: Record<string, number> = { XS: 5, S: 4, M: 3, L: 2, XL: 1 };
  let sum = 0;
  let wsum = 0;
  for (const c of criteria) {
    let v: number | undefined = manual.get(c.id);
    if (c.key === "fit") v = caps[0]?.expand?.capability?.strategicImportance;
    if (c.key === "aufwand") v = d.effortSize ? eff[d.effortSize] : undefined;
    if (c.key === "dringlichkeit" && d.type === "COMPLIANCE" && d.desiredDate && d.desiredDateReason) v = 5;
    if (v == null) continue;
    sum += v * c.weight;
    wsum += c.weight;
  }
  const score = wsum ? Math.round(((sum / wsum) * 20) * 10) / 10 : 0;
  await pb.collection("demands").update(demandId, { score });
  return score;
}

export async function nextNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const list = await pb.collection("demands").getList(1, 1, { filter: `number ~ "DEM-${year}-"`, sort: "-number", fields: "number" });
  const last = list.items[0]?.number as string | undefined;
  const n = last ? parseInt(last.split("-")[2], 10) + 1 : 1;
  return `DEM-${year}-${String(n).padStart(4, "0")}`;
}
