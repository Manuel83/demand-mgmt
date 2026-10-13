"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider } from "@/components/auth";
import { pb, errMsg } from "@/lib/pb";
import { btnPrimary, btnGhost, input, label } from "@/components/ui";

const DEMO = [
  { u: "anna", n: "Anna", r: "Antragsteller" },
  { u: "tom", n: "Tom", r: "Triage / IT" },
  { u: "eva", n: "Eva", r: "Entscheider" },
  { u: "admin", n: "Alex", r: "Admin" },
];

function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(u: string, p: string) {
    setBusy(true);
    setError("");
    try {
      await pb.collection("users").authWithPassword(u, p);
      router.replace("/");
    } catch (e) {
      setError(errMsg(e).includes("Failed to authenticate") ? "Benutzername oder Passwort stimmt nicht." : errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold tracking-tight">
          Demand<span className="text-indigo-600">Hub</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">Anmelden, um IT-Demands zu erfassen und zu verfolgen.</p>
        <form
          className="mt-6 space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            login(username, password);
          }}
        >
          <div>
            <label className={label} htmlFor="u">Benutzername</label>
            <input id="u" className={input} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </div>
          <div>
            <label className={label} htmlFor="p">Passwort</label>
            <input id="p" type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button className={`${btnPrimary} w-full`} disabled={busy}>Anmelden</button>
        </form>
        <div className="mt-8 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Demo – Schnellauswahl</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <button key={d.u} className={btnGhost} disabled={busy} onClick={() => login(d.u, "demo1234")}>
                <span className="text-left">
                  <span className="block">{d.n}</span>
                  <span className="block text-xs font-normal text-slate-500">{d.r}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider requireAuth={false}>
      <LoginForm />
    </AuthProvider>
  );
}
