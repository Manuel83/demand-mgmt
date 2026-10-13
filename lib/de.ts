// Alle sichtbaren Texte der Fachlogik an einer Stelle (spaeter Englisch ergaenzbar)
export const STATUS_LABEL: Record<string, string> = {
  ENTWURF: "Entwurf",
  EINGEREICHT: "Eingereicht",
  IN_QUALIFIZIERUNG: "In Qualifizierung",
  ENTSCHEIDUNGSREIF: "Entscheidungsreif",
  GENEHMIGT: "Genehmigt",
  IN_UMSETZUNG: "In Umsetzung",
  ABGESCHLOSSEN: "Abgeschlossen",
  ZURUECKGESTELLT: "Zurückgestellt",
  ABGELEHNT: "Abgelehnt",
  SERVICE_REQUEST_ABGEGEBEN: "Service Request abgegeben",
};

export const STATUS_NEXT: Record<string, string> = {
  ENTWURF: "Noch nicht eingereicht.",
  EINGEREICHT: "Wartet auf Triage – Entscheidung binnen 5 Arbeitstagen.",
  IN_QUALIFIZIERUNG: "Wird gemeinsam mit der IT qualifiziert.",
  ENTSCHEIDUNGSREIF: "Wartet auf die Entscheidung des Gremiums.",
  GENEHMIGT: "Genehmigt – Umsetzung wird geplant.",
  IN_UMSETZUNG: "Wird umgesetzt.",
  ABGESCHLOSSEN: "Abgeschlossen.",
  ZURUECKGESTELLT: "Zurückgestellt – wird später erneut betrachtet.",
  ABGELEHNT: "Abgelehnt – siehe Begründung.",
  SERVICE_REQUEST_ABGEGEBEN: "Wurde als Service Request ans Ticket-Tool abgegeben.",
};

export const STATUS_STYLE: Record<string, string> = {
  ENTWURF: "bg-slate-100 text-slate-700 ring-slate-300",
  EINGEREICHT: "bg-blue-100 text-blue-800 ring-blue-300",
  IN_QUALIFIZIERUNG: "bg-amber-100 text-amber-800 ring-amber-300",
  ENTSCHEIDUNGSREIF: "bg-violet-100 text-violet-800 ring-violet-300",
  GENEHMIGT: "bg-green-100 text-green-800 ring-green-300",
  IN_UMSETZUNG: "bg-teal-100 text-teal-800 ring-teal-300",
  ABGESCHLOSSEN: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  ZURUECKGESTELLT: "bg-orange-100 text-orange-800 ring-orange-300",
  ABGELEHNT: "bg-red-100 text-red-800 ring-red-300",
  SERVICE_REQUEST_ABGEGEBEN: "bg-slate-200 text-slate-800 ring-slate-400",
};

export const OPEN_STATUS = ["EINGEREICHT", "IN_QUALIFIZIERUNG", "ENTSCHEIDUNGSREIF", "GENEHMIGT", "IN_UMSETZUNG", "ZURUECKGESTELLT"];

export const TYPE_LABEL: Record<string, string> = {
  NEU: "Neu",
  ERWEITERUNG: "Erweiterung",
  ABLOESUNG: "Ablösung",
  TECHNIK: "Technik",
  COMPLIANCE: "Compliance",
  SERVICE_REQUEST: "Service Request",
};

export const TYPE_HELP: Record<string, string> = {
  NEU: "Neue Anwendung, Plattform oder Funktion – z. B. ein neues Tool für die Angebotserstellung.",
  ERWEITERUNG: "Änderung an einer bestehenden Anwendung – z. B. neues Feld und Report im eShop.",
  ABLOESUNG: "Ersatz einer vorhandenen Lösung – z. B. altes System durch neues ersetzen.",
  TECHNIK: "Technische Erneuerung aus der IT selbst – Upgrade, Architekturthema, Security.",
  COMPLIANCE: "Gesetzlich oder auditgetrieben, oft mit Termin – z. B. neue Meldepflicht.",
};

export const BENEFIT_LABEL: Record<string, string> = {
  UMSATZ: "Mehr Umsatz",
  KOSTEN: "Weniger Kosten",
  EFFIZIENZ: "Mehr Effizienz",
  RISIKO: "Weniger Risiko",
  COMPLIANCE: "Vorgabe erfüllen",
  STRATEGIE: "Strategischer Beitrag",
};

export const ROLE_LABEL: Record<string, string> = {
  antragsteller: "Antragsteller",
  triage: "Triage / IT",
  entscheider: "Entscheider",
  admin: "Admin",
};

export const EFFORT_DAYS: Record<string, [number, number]> = {
  XS: [1, 3],
  S: [4, 10],
  M: [11, 30],
  L: [31, 80],
  XL: [81, 200],
};
export const EFFORT_MID: Record<string, number> = { XS: 2, S: 7, M: 20, L: 55, XL: 140 };

export const IMPACT_LABEL: Record<string, string> = { NEU: "Neu", VERBESSERUNG: "Verbesserung", ABLOESUNG: "Ablösung" };

export function fmtDate(s?: string) {
  if (!s) return "–";
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? "–" : d.toLocaleDateString("de-DE");
}
export function fmtDateTime(s?: string) {
  if (!s) return "–";
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? "–" : d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}
