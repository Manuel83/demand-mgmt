"use client";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, User } from "@/lib/pb";

interface Ctx {
  user: User | null;
  ready: boolean;
  logout: () => void;
  toast: (msg: string, kind?: "ok" | "error") => void;
}
const AuthCtx = createContext<Ctx>({ user: null, ready: false, logout: () => {}, toast: () => {} });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children, requireAuth = true }: { children: ReactNode; requireAuth?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);

  useEffect(() => {
    const sync = () => setUser(pb.authStore.isValid ? (pb.authStore.record as unknown as User) : null);
    sync();
    setReady(true);
    return pb.authStore.onChange(sync);
  }, []);

  useEffect(() => {
    if (ready && requireAuth && !user) router.replace("/login");
  }, [ready, user, requireAuth, router]);

  const toast = (msg: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  };

  return (
    <AuthCtx.Provider value={{ user, ready, logout: () => { pb.authStore.clear(); router.replace("/login"); }, toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg px-4 py-2 text-sm text-white shadow-lg ${t.kind === "error" ? "bg-red-600" : "bg-slate-900 dark:bg-slate-700"}`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </AuthCtx.Provider>
  );
}
