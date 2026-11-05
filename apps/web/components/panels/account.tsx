"use client";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { api, type Me } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { Heading } from "./ui";

export const useMe = create<{ me: Me | null; loaded: boolean; setMe: (m: Me | null) => void; refresh: () => Promise<void> }>((set) => ({
  me: null,
  loaded: false,
  setMe: (me) => set({ me, loaded: true }),
  refresh: async () => {
    try {
      const r = await api<{ user: Me | null }>("/auth/me");
      set({ me: r.user, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));

export function useLoadMe() {
  const { refresh, loaded } = useMe();
  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);
}

declare global {
  interface Window {
    ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

export function AccountPanel() {
  useLoadMe();
  const { me, setMe } = useMe();
  const open = useWorld((s) => s.openPanel);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: Me }>(`/auth/${mode}`, { method: "POST", body: { username, password } });
      setMe(r.user);
      setPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const wallet = async () => {
    setError(null);
    if (!window.ethereum) {
      setError("No wallet found in this browser. A username and password works too.");
      return;
    }
    setBusy(true);
    try {
      const [address] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const c = await api<{ nonce: string; message: string }>("/auth/wallet/challenge", { method: "POST", body: { address } });
      const signature = await window.ethereum.request({ method: "personal_sign", params: [c.message, address] });
      const r = await api<{ user: Me }>("/auth/wallet/verify", { method: "POST", body: { nonce: c.nonce, signature } });
      setMe(r.user);
    } catch (err) {
      setError((err as Error).message || "Wallet sign-in was cancelled.");
    } finally {
      setBusy(false);
    }
  };

  if (me) {
    return (
      <div>
        <Heading eyebrow="Your account" title={me.username} sub={me.wallet ? `Wallet ${me.wallet}` : "No wallet linked. You don't need one."} />
        {error && <p role="alert" className="text-sm text-rose mb-3">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => open({ kind: "user", username: me.username })}>View profile</button>
          {!me.wallet && <button className="btn" disabled={busy} onClick={wallet}>Link a wallet</button>}
          <button className="btn" onClick={async () => { await api("/auth/logout", { method: "POST" }); setMe(null); }}>Sign out</button>
        </div>
        <p className="text-xs text-gray mt-4">Linking only asks your wallet to sign a message. It never sends a transaction, costs nothing, and this site never sees your keys.</p>
      </div>
    );
  }

  return (
    <div>
      <Heading eyebrow="Community account" title={mode === "register" ? "Join the archive" : "Welcome back"} sub="You can explore everything without an account. You only need one to leave a memory, comment, react or vote." />
      <form onSubmit={submit} className="space-y-3">
        <label className="block"><span className="label">Username</span><input className="field mt-1" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={24} /></label>
        <label className="block"><span className="label">Password</span><input className="field mt-1" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "register" ? 10 : 1} /></label>
        {mode === "register" && <p className="text-xs text-gray">At least 10 characters. Don't reuse a password, and never enter a wallet seed phrase here.</p>}
        {error && <p role="alert" className="text-sm text-rose">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-gold" disabled={busy}>{mode === "register" ? "Create account" : "Sign in"}</button>
          <button type="button" className="btn" disabled={busy} onClick={wallet}>Use a wallet instead</button>
        </div>
      </form>
      <button className="mt-4 text-sm text-sky underline underline-offset-2" onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(null); }}>
        {mode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </div>
  );
}
