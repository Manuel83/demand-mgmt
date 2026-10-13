import PocketBase, { RecordModel } from "pocketbase";

export const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL || "http://127.0.0.1:8090");
pb.autoCancellation(false);

export type Role = "antragsteller" | "triage" | "entscheider" | "admin";

export interface User extends RecordModel {
  username: string;
  name: string;
  role: Role;
  department: string;
  active: boolean;
}

export interface Demand extends RecordModel {
  number: string;
  title: string;
  description: string;
  desiredOutcome: string;
  type: string;
  status: string;
  requester: string;
  department: string;
  sponsor: string;
  benefitCategory: string;
  benefitDescription: string;
  desiredDate: string;
  desiredDateReason: string;
  affectedUsers: number;
  domain: string;
  assignee: string;
  effortSize: string;
  risks: string;
  score: number;
  decisionReason: string;
  decisionDeviation: string;
  followUpDate: string;
  decidedAt: string;
  decidedBy: string;
}

export const isTriage = (u?: User | null) => !!u && (u.role === "triage" || u.role === "admin");
export const isDecider = (u?: User | null) => !!u && (u.role === "entscheider" || u.role === "admin");
export const seesAll = (u?: User | null) => !!u && u.role !== "antragsteller";

export function errMsg(e: unknown): string {
  const x = e as { message?: string; response?: { message?: string } };
  return x?.response?.message || x?.message || "Unbekannter Fehler";
}

/** PocketBase-Filterstring sicher aus Nutzereingabe bauen */
export const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
