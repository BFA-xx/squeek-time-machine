"use client";
import { CONTRIBUTION_POINTS, etherscanTx } from "@stm/shared";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { useLoadMe, useMe } from "./account";
import { Heading, Section, TxLink } from "./ui";

interface Token { tokenId: string; custody: string; level: number }
type ChainMod = typeof import("@/lib/chain");
type Action = import("@/lib/chain").Action;
type Prepared = import("@/lib/chain").Prepared;
type Step = { at: "idle" } | { at: "checking"; note: string } | { at: "review"; prepared: Prepared; account: `0x${string}` } | { at: "sending"; title: string } | { at: "done"; hash: string; title: string; credit: string | null; ok: boolean } | { at: "unclear"; hash?: string };

const load = (): Promise<ChainMod> => import("@/lib/chain");

/** Everything here is signed by the visitor's own wallet. This site holds no keys and can't send anything itself. */
export function ContributePanel() {
  useLoadMe();
  const me = useMe((s) => s.me);
  const open = useWorld((s) => s.openPanel);
  const bumpDig = useWorld((s) => s.bumpDig);
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [step, setStep] = useState<Step>({ at: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [survivor, setSurvivor] = useState("");
  const [donor, setDonor] = useState("");
  const owned = useApi<{ tokens: Token[] }>(account ? `/squeeks/owner/${account}` : null);
  const tokens = owned.data?.tokens ?? [];
  const inWallet = tokens.filter((t) => t.custody === "wallet");
  const staked = tokens.filter((t) => t.custody === "staking");
  const survivorToken = tokens.find((t) => t.tokenId === survivor);
  const donors = tokens.filter((t) => survivorToken && t.tokenId !== survivor && t.level === survivorToken.level && t.custody === survivorToken.custody);

  const begin = async (action: Action) => {
    setProblem(null);
    setUnderstood(false);
    setStep({ at: "checking", note: "Reading the chain and running a simulation…" });
    try {
      const c = await load();
      await c.checkRelease();
      const who = await c.connectWallet();
      setAccount(who);
      const prepared = await c.prepare(action, who);
      await c.simulate(prepared, who);
      setStep({ at: "review", prepared, account: who });
    } catch (e) {
      setStep({ at: "idle" });
      setProblem((e as Error).message.slice(0, 240) || "That didn't work.");
    }
  };

  const confirm = async (prepared: Prepared, who: `0x${string}`) => {
    setStep({ at: "sending", title: prepared.title });
    let hash: string | undefined;
    try {
      const c = await load();
      const sent = await c.send(prepared, who);
      hash = sent.hash;
      if (prepared.approval && sent.status === "success") return void begin(prepared.action);
      let credit: string | null = null;
      if (sent.status === "success" && prepared.action.kind !== "withdraw") {
        if (me?.wallet?.toLowerCase() === who.toLowerCase()) {
          try {
            const r = await api<{ points: number }>("/dig/contributions", { method: "POST", body: { txHash: sent.hash } });
            credit = r.points > 0 ? `+${r.points} points for your crew.` : "No more points for this today, but it still counts on-chain.";
            bumpDig();
          } catch (e) {
            credit = (e as Error).message;
          }
        } else credit = "Link this wallet to your account to earn points for contributions like this.";
      }
      owned.reload();
      setStep({ at: "done", hash: sent.hash, title: prepared.title, credit, ok: sent.status === "success" });
    } catch (e) {
      if (hash) return setStep({ at: "unclear", hash });
      setStep({ at: "idle" });
      setProblem((e as Error).message.slice(0, 240));
    }
  };

  const busy = step.at === "checking" || step.at === "sending";
  return (
    <div>
      <Heading eyebrow="On-chain" title="Contribute to Squeekchain" sub="Real transactions on the Sepolia testnet, signed by your own wallet. Each one is checked and simulated first, and you see exactly what it does before you sign." />
      <p className="text-xs text-gray -mt-2 mb-3">You pay Sepolia gas, which has no monetary value. This site never holds keys and can't move anything for you.</p>

      {problem && <p role="alert" className="card p-3 text-sm text-rose mb-3">{problem}</p>}
      {step.at === "checking" && <p role="status" className="card p-3 text-sm text-dim mb-3 animate-pulse">{step.note}</p>}
      {step.at === "sending" && <p role="status" className="card p-3 text-sm text-dim mb-3 animate-pulse">{step.title}: check your wallet, then wait for it to confirm…</p>}

      {step.at === "review" && (
        <section aria-label="Review before signing" className="card p-3 mb-3 border-gold">
          <p className="label text-mint">Simulation passed</p>
          <h3 className="title text-2xl text-ink mt-1">{step.prepared.title}</h3>
          <ul className="list-disc pl-5 text-sm text-dim mt-2 space-y-1">{step.prepared.effects.map((e) => <li key={e}>{e}</li>)}</ul>
          <p className="font-data text-[11px] text-gray mt-2 break-all">To {step.prepared.to} · 0 ETH plus gas · Sepolia</p>
          {step.prepared.irreversible && (
            <label className="flex items-start gap-2 text-sm text-rose mt-2"><input type="checkbox" className="mt-1" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} /> I understand this permanently burns a Squeek.</label>
          )}
          <div className="flex gap-2 mt-3">
            <button className="btn btn-gold" disabled={step.prepared.irreversible && !understood} onClick={() => confirm(step.prepared, step.account)}>Sign in my wallet</button>
            <button className="btn" onClick={() => setStep({ at: "idle" })}>Cancel</button>
          </div>
        </section>
      )}

      {step.at === "done" && (
        <section role="status" className="card p-3 mb-3">
          <p className={`title text-2xl ${step.ok ? "text-mint" : "text-rose"}`}>{step.ok ? "Done, on-chain" : "It reverted on-chain"}</p>
          <p className="text-sm text-dim">{step.title}</p>
          {step.credit && <p className="text-sm text-amber mt-1">{step.credit}</p>}
          <div className="mt-1"><TxLink hash={step.hash} /></div>
        </section>
      )}
      {step.at === "unclear" && (
        <section role="alert" className="card p-3 mb-3 text-sm text-dim">
          <p className="text-amber">The transaction was sent, but its result couldn't be confirmed yet. Don't send it again until you've checked it.</p>
          {step.hash && <a className="text-sky underline underline-offset-2 break-all" href={etherscanTx(step.hash)} target="_blank" rel="noopener noreferrer nofollow">Check it on Etherscan ↗</a>}
        </section>
      )}

      <section className="card p-3">
        <h3 className="title text-2xl text-[#ff8a3d]">The checkpoint lever</h3>
        <p className="text-sm text-dim mt-1">Anyone can pull it. It turns settled rounds into SQK and funds every Squeek holder's rewards. You get no SQK for it, just {CONTRIBUTION_POINTS.checkpoint} points for your crew if it issues new blocks. Squeekchain may run this itself, so you won't always get there first.</p>
        <button className="btn btn-gold mt-2" disabled={busy} onClick={() => begin({ kind: "checkpoint" })}>Pull the checkpoint</button>
      </section>

      <Section title="Your rewards">
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={busy} onClick={() => begin({ kind: "claim" })}>Claim SQK</button>
          <button className="btn" disabled={busy} onClick={() => begin({ kind: "claimAndStake" })}>Claim and stake</button>
        </div>
      </Section>

      <Section title="Your Squeeks">
        {!account ? <button className="btn" disabled={busy} onClick={async () => { setProblem(null); try { setAccount(await (await load()).connectWallet()); } catch (e) { setProblem((e as Error).message.slice(0, 240)); } }}>Connect wallet</button> : (
          <>
            <p className="font-data text-xs text-gray break-all mb-2">{account}</p>
            {!tokens.length && <p className="text-sm text-gray">{owned.loading ? "Looking…" : "No Squeeks found for this wallet in the current release."}</p>}
            <ul className="space-y-1">
              {inWallet.map((t) => <li key={t.tokenId} className="flex items-center justify-between gap-2 card p-2 text-sm"><span>#{t.tokenId} · Lv {t.level} · <span className="text-amber">not earning</span></span><button className="btn" disabled={busy} onClick={() => begin({ kind: "deposit", tokenIds: [t.tokenId] })}>Deposit</button></li>)}
              {staked.map((t) => <li key={t.tokenId} className="flex items-center justify-between gap-2 card p-2 text-sm"><span>#{t.tokenId} · Lv {t.level} · <span className="text-mint">earning</span></span><button className="btn" disabled={busy} onClick={() => begin({ kind: "withdraw", tokenIds: [t.tokenId] })}>Withdraw</button></li>)}
            </ul>
            {tokens.length > 1 && (
              <div className="card p-3 mt-3">
                <h4 className="text-sm text-ink font-semibold">Merge two Squeeks</h4>
                <p className="text-xs text-gray">Same level and same place only. The donor is burned forever.</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <label className="text-xs text-dim">Keep<select className="field mt-1" value={survivor} onChange={(e) => { setSurvivor(e.target.value); setDonor(""); }}><option value="">Choose</option>{tokens.map((t) => <option key={t.tokenId} value={t.tokenId}>#{t.tokenId} · Lv {t.level}</option>)}</select></label>
                  <label className="text-xs text-dim">Burn<select className="field mt-1" value={donor} disabled={!survivor} onChange={(e) => setDonor(e.target.value)}><option value="">Choose</option>{donors.map((t) => <option key={t.tokenId} value={t.tokenId}>#{t.tokenId} · Lv {t.level}</option>)}</select></label>
                </div>
                <button className="btn mt-2" disabled={busy || !survivor || !donor} onClick={() => begin({ kind: "merge", survivor, donor, custody: survivorToken?.custody === "staking" ? "staking" : "wallet" })}>Check this merge</button>
              </div>
            )}
          </>
        )}
      </Section>

      {!me?.wallet && <p className="text-xs text-gray mt-4">To earn crew points for these, <button className="underline" onClick={() => open({ kind: "account" })}>link your wallet to your account</button>. The actions work either way.</p>}
    </div>
  );
}
