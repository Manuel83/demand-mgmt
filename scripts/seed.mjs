// Legt Collections, API Rules und Demo-Daten in PocketBase an.
// Voraussetzung: PocketBase laeuft (npm run pb) und ein Superuser existiert:
//   ./pocketbase superuser upsert admin@demand.local demandadmin123
import PocketBase from "pocketbase";

const URL = process.env.NEXT_PUBLIC_PB_URL || "http://127.0.0.1:8090";
const SU_EMAIL = process.env.PB_ADMIN_EMAIL || "admin@demand.local";
const SU_PASS = process.env.PB_ADMIN_PASSWORD || "demandadmin123";
const DEMO_PASS = "demo1234";

const pb = new PocketBase(URL);
pb.autoCancellation(false);
await pb.collection("_superusers").authWithPassword(SU_EMAIL, SU_PASS);

// ---------- Feld-Helfer ----------
const text = (name, o = {}) => ({ name, type: "text", ...o });
const num = (name, o = {}) => ({ name, type: "number", ...o });
const bool = (name) => ({ name, type: "bool" });
const date = (name) => ({ name, type: "date" });
const select = (name, values, o = {}) => ({ name, type: "select", values, maxSelect: 1, ...o });
const rel = (name, collectionId, o = {}) => ({ name, type: "relation", collectionId, maxSelect: 1, cascadeDelete: false, ...o });
const stamps = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];

// ---------- API Rules ----------
const AUTH = `@request.auth.id != ""`;
const STAFF = `@request.auth.role != "antragsteller"`;
const ADMIN = `@request.auth.role = "admin"`;
const SEE_VIA_DEMAND = `${AUTH} && (@request.auth.role != "antragsteller" || demand.requester = @request.auth.id || demand.department = @request.auth.department)`;
const master = { listRule: AUTH, viewRule: AUTH, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN };
const demandChild = { listRule: SEE_VIA_DEMAND, viewRule: SEE_VIA_DEMAND, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH };

const ids = {};
async function ensure(name, def) {
  try {
    const c = await pb.collections.getOne(name);
    ids[name] = c.id;
    return false;
  } catch {
    const c = await pb.collections.create({ name, type: "base", ...def, fields: [...def.fields, ...stamps] });
    ids[name] = c.id;
    console.log("Collection angelegt:", name);
    return true;
  }
}

// ---------- Collections ----------
const users = await pb.collections.getOne("users");
ids.users = users.id;

await ensure("departments", { fields: [text("name", { required: true }), bool("active")], ...master });

if (!users.fields.find((f) => f.name === "role")) {
  users.fields.push(
    text("username"),
    select("role", ["antragsteller", "triage", "entscheider", "admin"], { required: true }),
    rel("department", ids.departments),
    bool("active"),
  );
  await pb.collections.update("users", {
    fields: users.fields,
    listRule: AUTH,
    viewRule: AUTH,
    createRule: ADMIN,
    updateRule: `${ADMIN} || (id = @request.auth.id && @request.body.role:isset = false && @request.body.active:isset = false)`,
    deleteRule: ADMIN,
    passwordAuth: { enabled: true, identityFields: ["username", "email"] },
    indexes: [...(users.indexes || []), "CREATE UNIQUE INDEX idx_users_username ON users (username)"],
  });
  console.log("users erweitert");
}

await ensure("domains", { fields: [text("name", { required: true }), rel("lead", ids.users), bool("active")], ...master });

if (await ensure("capabilities", {
  fields: [
    text("name", { required: true }),
    num("level", { min: 1, max: 3, onlyInt: true }),
    text("description"),
    rel("owner", ids.users),
    num("strategicImportance", { min: 1, max: 5, onlyInt: true }),
    num("sortOrder"),
    bool("active"),
  ],
  ...master,
})) {
  const c = await pb.collections.getOne("capabilities");
  c.fields.push(rel("parent", c.id));
  await pb.collections.update(c.id, { fields: c.fields });
}

await ensure("applications", {
  fields: [text("name", { required: true }), text("description"), rel("domain", ids.domains), select("lifecycle", ["PLAN", "AKTIV", "AUSLAUFEND"]), bool("active")],
  ...master,
});
await ensure("application_capabilities", {
  fields: [rel("application", ids.applications, { required: true }), rel("capability", ids.capabilities, { required: true })],
  ...master,
});
await ensure("scoring_criteria", {
  fields: [text("key"), text("name", { required: true }), text("description"), num("weight", { min: 0 }), text("scaleHint"), num("sortOrder"), bool("active")],
  ...master,
});

await ensure("demands", {
  fields: [
    text("number", { required: true }),
    text("title", { required: true, max: 120 }),
    text("description"),
    text("desiredOutcome"),
    select("type", ["NEU", "ERWEITERUNG", "ABLOESUNG", "TECHNIK", "COMPLIANCE", "SERVICE_REQUEST"]),
    select("status", ["ENTWURF", "EINGEREICHT", "IN_QUALIFIZIERUNG", "ENTSCHEIDUNGSREIF", "GENEHMIGT", "IN_UMSETZUNG", "ABGESCHLOSSEN", "ZURUECKGESTELLT", "ABGELEHNT", "SERVICE_REQUEST_ABGEGEBEN"], { required: true }),
    rel("requester", ids.users, { required: true }),
    rel("department", ids.departments),
    rel("sponsor", ids.users),
    rel("assignee", ids.users),
    select("benefitCategory", ["UMSATZ", "KOSTEN", "EFFIZIENZ", "RISIKO", "COMPLIANCE", "STRATEGIE"]),
    text("benefitDescription"),
    date("desiredDate"),
    text("desiredDateReason"),
    num("affectedUsers", { min: 0, onlyInt: true }),
    rel("domain", ids.domains),
    select("effortSize", ["XS", "S", "M", "L", "XL"]),
    text("risks"),
    num("score"),
    text("decisionReason"),
    text("decisionDeviation"),
    date("followUpDate"),
    date("decidedAt"),
    rel("decidedBy", ids.users),
  ],
  indexes: ["CREATE UNIQUE INDEX idx_demands_number ON demands (number)"],
  listRule: `${AUTH} && (@request.auth.role != "antragsteller" || requester = @request.auth.id || (department = @request.auth.department && status != "ENTWURF"))`,
  viewRule: `${AUTH} && (@request.auth.role != "antragsteller" || requester = @request.auth.id || (department = @request.auth.department && status != "ENTWURF"))`,
  createRule: `${AUTH} && @request.body.requester = @request.auth.id`,
  updateRule:
    `${AUTH} && (@request.auth.role != "antragsteller" || (requester = @request.auth.id && (status = "ENTWURF" || status = "EINGEREICHT")` +
    ` && (@request.body.status:isset = false || (status = "ENTWURF" && @request.body.status = "EINGEREICHT"))` +
    ` && @request.body.score:isset = false && @request.body.domain:isset = false && @request.body.decisionReason:isset = false))`,
  deleteRule: `${AUTH} && requester = @request.auth.id && status = "ENTWURF"`,
});

await ensure("demand_capabilities", {
  fields: [rel("demand", ids.demands, { required: true, cascadeDelete: true }), rel("capability", ids.capabilities, { required: true }), bool("isPrimary"), select("impact", ["NEU", "VERBESSERUNG", "ABLOESUNG"])],
  indexes: ["CREATE UNIQUE INDEX idx_dc_primary ON demand_capabilities (demand) WHERE isPrimary = 1"],
  ...demandChild,
});
await ensure("demand_applications", {
  fields: [rel("demand", ids.demands, { required: true, cascadeDelete: true }), rel("application", ids.applications, { required: true })],
  ...demandChild,
});
await ensure("demand_scores", {
  fields: [rel("demand", ids.demands, { required: true, cascadeDelete: true }), rel("criterion", ids["scoring_criteria"], { required: true }), num("value", { min: 1, max: 5, onlyInt: true }), rel("scoredBy", ids.users)],
  ...demandChild,
  createRule: STAFF,
  updateRule: STAFF,
  deleteRule: STAFF,
});
await ensure("demand_links", {
  fields: [rel("demand", ids.demands, { required: true, cascadeDelete: true }), rel("related", ids.demands, { required: true }), select("kind", ["DUPLIKAT", "VERWANDT"])],
  ...demandChild,
  createRule: AUTH,
});
await ensure("comments", {
  fields: [rel("demand", ids.demands, { required: true, cascadeDelete: true }), rel("author", ids.users, { required: true }), text("body", { required: true }), bool("isInternal")],
  listRule: `${SEE_VIA_DEMAND} && (isInternal = false || @request.auth.role != "antragsteller")`,
  viewRule: `${SEE_VIA_DEMAND} && (isInternal = false || @request.auth.role != "antragsteller")`,
  createRule: `${AUTH} && @request.body.author = @request.auth.id && (@request.body.isInternal = false || @request.auth.role != "antragsteller")`,
  updateRule: null,
  deleteRule: null,
});
await ensure("status_history", {
  fields: [
    rel("demand", ids.demands, { required: true, cascadeDelete: true }),
    text("fromStatus"),
    text("toStatus"),
    rel("changedBy", ids.users),
    text("reason"),
  ],
  listRule: SEE_VIA_DEMAND,
  viewRule: SEE_VIA_DEMAND,
  createRule: AUTH,
  updateRule: null, // unveraenderlich
  deleteRule: null,
});

// ---------- Demo-Daten ----------
if ((await pb.collection("departments").getList(1, 1)).totalItems > 0) {
  console.log("Daten vorhanden – Seed uebersprungen. (Zuruecksetzen: pb_data loeschen)");
  process.exit(0);
}

const dep = {};
for (const name of ["Vertrieb", "Produktion", "Finanzen"]) dep[name] = (await pb.collection("departments").create({ name, active: true })).id;

const U = {};
async function user(username, name, role, department) {
  const r = await pb.collection("users").create({
    username, name, role, department: dep[department], active: true,
    email: `${username}@demand.local`, emailVisibility: true, verified: true,
    password: DEMO_PASS, passwordConfirm: DEMO_PASS,
  });
  U[username] = r.id;
}
await user("anna", "Anna Antrag", "antragsteller", "Vertrieb");
await user("ben", "Ben Betrieb", "antragsteller", "Produktion");
await user("tom", "Tom Triage", "triage", "Finanzen");
await user("eva", "Eva Entscheid", "entscheider", "Finanzen");
await user("admin", "Alex Admin", "admin", "Finanzen");

const dom = {};
for (const [name, lead] of [["ERP & Finanzen", "tom"], ["Digital Sales & Marketing", "tom"], ["Infrastruktur & Security", "tom"]])
  dom[name] = (await pb.collection("domains").create({ name, lead: U[lead], active: true })).id;

const MAP = {
  Vertrieb: ["Angebotserstellung", "Auftragsabwicklung", "Kundenmanagement", "Vertriebssteuerung"],
  Marketing: ["Kampagnenmanagement", "Content & Web", "Marktanalyse"],
  Produktentwicklung: ["Produktdaten", "Entwicklungsprozess", "Variantenmanagement"],
  Beschaffung: ["Lieferantenmanagement", "Bestellwesen", "Einkaufsanalyse"],
  Produktion: ["Fertigungsplanung", "Qualitätssicherung", "Instandhaltung", "Produktionssteuerung"],
  Logistik: ["Lagerverwaltung", "Transportplanung", "Versand"],
  Finanzen: ["Rechnungswesen", "Controlling", "Zahlungsverkehr", "Berichtswesen"],
  HR: ["Personaladministration", "Recruiting", "Weiterbildung"],
};
const DESC = {
  Angebotserstellung: "Konfiguration, Kalkulation und Erstellung von Kundenangeboten",
  Auftragsabwicklung: "Erfassung und Verfolgung von Kundenaufträgen bis zur Lieferung",
  Rechnungswesen: "Buchhaltung, Rechnungsstellung und Abschlüsse",
  Berichtswesen: "Management-Reports und gesetzliche Meldungen",
  Lagerverwaltung: "Bestände, Lagerplätze und Bewegungen",
};
const cap = {};
let sort = 0;
for (const [l1, l2s] of Object.entries(MAP)) {
  const p = await pb.collection("capabilities").create({ name: l1, level: 1, strategicImportance: 3, sortOrder: sort++, active: true, owner: U.tom, description: `Business Capability ${l1}` });
  cap[l1] = p.id;
  for (const n of l2s)
    cap[n] = (await pb.collection("capabilities").create({
      name: n, level: 2, parent: p.id, sortOrder: sort++, active: true,
      strategicImportance: 1 + ((n.length + l1.length) % 5), description: DESC[n] || `Teilbereich von ${l1}: ${n}`,
    })).id;
}

const app = {};
const APPS = [
  ["SAP ERP", "ERP-Kern für Finanzen, Einkauf und Logistik", "ERP & Finanzen", "AKTIV", ["Rechnungswesen", "Controlling", "Bestellwesen", "Lagerverwaltung", "Auftragsabwicklung"]],
  ["eShop", "Webshop für Kunden und Händler", "Digital Sales & Marketing", "AKTIV", ["Auftragsabwicklung", "Content & Web", "Kundenmanagement"]],
  ["CRM Classic", "Kundenstammdaten und Vertriebspipeline", "Digital Sales & Marketing", "AUSLAUFEND", ["Kundenmanagement", "Vertriebssteuerung", "Angebotserstellung"]],
  ["MES Werk 1", "Fertigungssteuerung im Hauptwerk", "Infrastruktur & Security", "AKTIV", ["Fertigungsplanung", "Produktionssteuerung", "Qualitätssicherung"]],
  ["PLM Suite", "Produktdaten und Entwicklungsprozess", "Infrastruktur & Security", "PLAN", ["Produktdaten", "Entwicklungsprozess", "Variantenmanagement"]],
];
for (const [name, description, domain, lifecycle, caps] of APPS) {
  app[name] = (await pb.collection("applications").create({ name, description, domain: dom[domain], lifecycle, active: true })).id;
  for (const c of caps) await pb.collection("application_capabilities").create({ application: app[name], capability: cap[c] });
}

const crit = {};
const CRITERIA = [
  ["nutzen", "Geschäftsnutzen", 30, "1 = gering, 5 = sehr hoch"],
  ["dringlichkeit", "Dringlichkeit / Pflicht", 20, "1 = kann warten, 5 = Frist oder Pflicht"],
  ["fit", "Strategischer Fit", 20, "Automatisch aus der primären Capability"],
  ["risiko", "Risiko bei Nichtstun", 15, "1 = gering, 5 = kritisch"],
  ["aufwand", "Aufwand (invers)", 15, "Automatisch: XS = 5 … XL = 1"],
];
let so = 0;
for (const [key, name, weight, scaleHint] of CRITERIA)
  crit[key] = (await pb.collection("scoring_criteria").create({ key, name, weight, scaleHint, sortOrder: so++, active: true })).id;

// ---------- Beispiel-Demands ----------
const W = { nutzen: 30, dringlichkeit: 20, fit: 20, risiko: 15, aufwand: 15 };
const EFF = { XS: 5, S: 4, M: 3, L: 2, XL: 1 };
const strat = (name) => 1 + ((name.length + Object.keys(MAP).find((k) => MAP[k].includes(name)).length) % 5);
function calcScore(d) {
  const v = { ...d.scores };
  v.fit = strat(d.primary);
  v.aufwand = EFF[d.effort];
  if (d.type === "COMPLIANCE" && d.desiredDate && d.reason) v.dringlichkeit = 5;
  let s = 0, w = 0;
  for (const k of Object.keys(W)) if (v[k] != null) { s += v[k] * W[k]; w += W[k]; }
  return w ? Math.round((s / w) * 20 * 10) / 10 : 0;
}

const DEMANDS = [
  { t: "Neues Tool für Angebotserstellung", u: "anna", dep: "Vertrieb", type: "NEU", st: "ENTSCHEIDUNGSREIF", ben: "EFFIZIENZ", domain: "Digital Sales & Marketing", primary: "Angebotserstellung", more: ["Kundenmanagement"], apps: ["CRM Classic"], effort: "L", scores: { nutzen: 5, dringlichkeit: 3, risiko: 3 }, sponsor: "eva", desc: "Angebote werden heute in Excel gebaut und dauern pro Stück bis zu zwei Tage.", benefit: "ca. 1.800 Stunden pro Jahr" },
  { t: "Neues Feld und Report im eShop", u: "anna", dep: "Vertrieb", type: "ERWEITERUNG", st: "IN_QUALIFIZIERUNG", ben: "UMSATZ", domain: "Digital Sales & Marketing", primary: "Content & Web", apps: ["eShop"], effort: "S", scores: { nutzen: 3 }, desc: "Händler sollen ihre Wunschlieferzeit im Bestellprozess angeben können." },
  { t: "Altes CRM durch neue Lösung ersetzen", u: "anna", dep: "Vertrieb", type: "ABLOESUNG", st: "EINGEREICHT", ben: "STRATEGIE", desc: "CRM Classic läuft aus der Wartung; es braucht einen Nachfolger." },
  { t: "Meldepflicht Lieferkettengesetz umsetzen", u: "ben", dep: "Produktion", type: "COMPLIANCE", st: "ENTSCHEIDUNGSREIF", ben: "COMPLIANCE", date: "2027-03-31", reason: "Gesetzliche Frist", domain: "ERP & Finanzen", primary: "Lieferantenmanagement", apps: ["SAP ERP"], effort: "M", scores: { nutzen: 3, risiko: 5 }, sponsor: "eva", desc: "Berichte zu Lieferanten müssen ab 2027 elektronisch gemeldet werden.", benefit: "Vermeidung von Bußgeldern" },
  { t: "Fertigungsdaten im Dashboard anzeigen", u: "ben", dep: "Produktion", type: "NEU", st: "EINGEREICHT", ben: "EFFIZIENZ", desc: "Schichtleiter wollen Stückzahlen und Stillstände live sehen." },
  { t: "MES-Upgrade auf aktuelle Version", u: "tom", dep: "Finanzen", type: "TECHNIK", st: "IN_QUALIFIZIERUNG", ben: "RISIKO", domain: "Infrastruktur & Security", primary: "Produktionssteuerung", apps: ["MES Werk 1"], effort: "M", scores: { risiko: 4 }, desc: "Die eingesetzte Version erhält ab Ende des Jahres keine Sicherheitsupdates." },
  { t: "Digitale Rechnungsfreigabe", u: "anna", dep: "Vertrieb", type: "NEU", st: "EINGEREICHT", ben: "KOSTEN", desc: "Rechnungen gehen heute per Hauspost zur Freigabe." },
  { t: "Mitarbeiterbefragung als Tool", u: "ben", dep: "Produktion", type: "NEU", st: "ABGELEHNT", ben: "STRATEGIE", reasonText: "Wird bereits über die Plattform des HR-Dienstleisters abgedeckt.", desc: "Eigenes Tool für die jährliche Mitarbeiterbefragung." },
  { t: "Lagerplätze automatisch vorschlagen", u: "ben", dep: "Produktion", type: "ERWEITERUNG", st: "GENEHMIGT", ben: "EFFIZIENZ", domain: "ERP & Finanzen", primary: "Lagerverwaltung", apps: ["SAP ERP"], effort: "S", scores: { nutzen: 4, dringlichkeit: 2, risiko: 2 }, sponsor: "eva", desc: "Einlagerung dauert zu lange, weil Plätze manuell gesucht werden.", benefit: "ca. 400 Stunden pro Jahr" },
  { t: "Idee: Chatbot für Kundenanfragen", u: "anna", dep: "Vertrieb", type: "NEU", st: "ENTWURF", ben: "EFFIZIENZ", desc: "" },
];

const year = new Date().getFullYear();
let n = 1;
for (const d of DEMANDS) {
  const data = {
    number: `DEM-${year}-${String(n++).padStart(4, "0")}`,
    title: d.t, description: d.desc, type: d.type, status: d.st, requester: U[d.u], department: dep[d.dep],
    benefitCategory: d.ben, desiredDate: d.date || "", desiredDateReason: d.reason || "",
    domain: d.domain ? dom[d.domain] : "", effortSize: d.effort || "", sponsor: d.sponsor ? U[d.sponsor] : "",
    benefitDescription: d.benefit || "", affectedUsers: d.effort ? 40 : 0,
    decisionReason: d.reasonText || "",
  };
  if (d.st === "ABGELEHNT") { data.decidedBy = U.eva; data.decidedAt = new Date().toISOString().replace("T", " "); }
  if (d.primary) data.score = calcScore(d);
  const rec = await pb.collection("demands").create(data);

  if (d.primary) {
    await pb.collection("demand_capabilities").create({ demand: rec.id, capability: cap[d.primary], isPrimary: true, impact: "VERBESSERUNG" });
    for (const m of d.more || []) await pb.collection("demand_capabilities").create({ demand: rec.id, capability: cap[m], isPrimary: false, impact: "VERBESSERUNG" });
  }
  for (const a of d.apps || []) await pb.collection("demand_applications").create({ demand: rec.id, application: app[a] });
  for (const [k, value] of Object.entries(d.scores || {}))
    await pb.collection("demand_scores").create({ demand: rec.id, criterion: crit[k], value, scoredBy: U.tom });

  // Historie
  const path = {
    ENTWURF: [],
    EINGEREICHT: ["EINGEREICHT"],
    IN_QUALIFIZIERUNG: ["EINGEREICHT", "IN_QUALIFIZIERUNG"],
    ENTSCHEIDUNGSREIF: ["EINGEREICHT", "IN_QUALIFIZIERUNG", "ENTSCHEIDUNGSREIF"],
    GENEHMIGT: ["EINGEREICHT", "IN_QUALIFIZIERUNG", "ENTSCHEIDUNGSREIF", "GENEHMIGT"],
    ABGELEHNT: ["EINGEREICHT", "ABGELEHNT"],
  }[d.st];
  let from = "ENTWURF";
  for (const to of path) {
    await pb.collection("status_history").create({
      demand: rec.id, fromStatus: from, toStatus: to,
      changedBy: from === "ENTWURF" ? U[d.u] : to === "ABGELEHNT" || to === "GENEHMIGT" ? U.eva : U.tom,
      reason: to === "ABGELEHNT" ? d.reasonText : "",
    });
    from = to;
  }
  if (d.st === "IN_QUALIFIZIERUNG" || d.st === "ENTSCHEIDUNGSREIF")
    await pb.collection("comments").create({ demand: rec.id, author: U.tom, body: "Bitte kurz den erwarteten Nutzen in Stunden pro Jahr abschätzen.", isInternal: false });
}

console.log("\nFertig. Demo-Benutzer (Passwort für alle: " + DEMO_PASS + "):");
console.log("  anna  – Antragsteller\n  ben   – Antragsteller (Produktion)\n  tom   – Triage / IT\n  eva   – Entscheider\n  admin – Admin");
