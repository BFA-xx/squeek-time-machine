"use client";
import { formatInt, formatSqk } from "@stm/shared";
import { useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { useLoadMe, useMe } from "./account";
import { Empty, ErrorNote, Facts, Heading, Loading, Section } from "./ui";

interface Token { tokenId: string; custody: string; level: number; basePower: string; nextMergeHeight: string | null; mergeState: string | null }
interface Owned { wallet: string; installationId: string; partial: boolean; counts: { staking?: string; wallet?: string } | null; claimableBaseUnits: string | null; power: { nftPower: string; sqkPower: string } | null; tokens: Token[] }
interface Detail { tokenId: string; name: string; level: number; basePower: string; mergeState: string | null; nextMergeHeight: string | null; burned: boolean; image: string | null; attributes: { trait: string; value: string }[] }

const STORE = "stm.viewWallet";
const custodyLabel = (c: string) => (c === "staking" ? "Staked" : c === "wallet" ? "In wallet" : c);
const OFFICIAL = "https://sepolia.squeekchain.com/squeeks";

/** The art is a sanitised base64 SVG, shown in an <img> so nothing inside it can run. */
export function SqueekArt({ tokenId, size = 120 }: { tokenId: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setSeen(true); }, { rootMargin: "200px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const { data, loading } = useApi<Detail>(seen ? `/squeeks/${tokenId}` : null);
  return (
    <div ref={ref} className="bg-bench aspect-square w-full flex items-center justify-center overflow-hidden">
      {data?.image ? <img src={data.image} alt={data.name} width={size} height={size} className="w-full h-full object-contain [image-rendering:pixelated]" /> : <span className="label">{loading || !seen ? "…" : "No art"}</span>}
    </div>
  );
}

export function SqueekDetail({ id }: { id: string }) {
  const { data, error, loading, reload } = useApi<Detail>(`/squeeks/${id}`);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorNote retry={reload}>{error ?? "That Squeek can't be shown."}</ErrorNote>;
  return (
    <article>
      <Heading eyebrow="Your Squeek" title={data.name} />
      <div className="max-w-xs"><SqueekArt tokenId={id} size={320} /></div>
      <Section title="Details">
        <Facts rows={[
          ["Level", String(data.level)],
          ["Power", formatInt(data.basePower)],
          ["Merging", data.mergeState ?? "unknown"],
          ...(data.nextMergeHeight && data.nextMergeHeight !== "0" ? [["Next merge at block", formatInt(data.nextMergeHeight)] as [string, React.ReactNode]] : []),
          ...data.attributes.map((a) => [a.trait, a.value] as [string, React.ReactNode]),
        ]} />
      </Section>
      <p className="mt-4"><a className="text-sky underline underline-offset-2 text-sm" href={OFFICIAL} target="_blank" rel="noopener noreferrer nofollow">Stake or merge on the official site ↗</a></p>
    </article>
  );
}

/** Viewing is public, so connecting here asks for no signature and no transaction. Nothing can be moved from this screen. */
export function SqueeksPanel() {
  useLoadMe();
  const me = useMe((s) => s.me);
  const open = useWorld((s) => s.openPanel);
  const [wallet, setWallet] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORE);
    } catch {}
    setWallet(me?.wallet ?? saved);
  }, [me?.wallet]);
  const use = (w: string | null) => {
    setWallet(w);
    setNote(null);
    try {
      if (w) localStorage.setItem(STORE, w);
      else localStorage.removeItem(STORE);
    } catch {}
  };
  const connect = async () => {
    setNote(null);
    if (!window.ethereum) return setNote("No wallet found in this browser. Paste your address instead, or open this in your wallet app's browser.");
    try {
      const [a] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (a) use(a);
    } catch {
      setNote("The wallet didn't connect.");
    }
  };
  const { data, error, loading, reload } = useApi<Owned>(wallet ? `/squeeks/owner/${wallet}` : null);
  return (
    <div>
      <Heading eyebrow="Your collection" title="My Squeeks" sub="Connect the wallet you use on Squeekchain to see your Squeeks here. Connecting only reads your address. It asks for no signature and can't move anything." />
      {!wallet ? (
        <div className="card p-3 space-y-3">
          <button className="btn btn-gold" onClick={connect}>Connect wallet</button>
          <form className="flex gap-2" onSubmit={(e) => {
            e.preventDefault();
            if (/^0x[0-9a-fA-F]{40}$/.test(typed.trim())) use(typed.trim());
            else setNote("That doesn't look like a wallet address.");
          }}>
            <label className="sr-only" htmlFor="sq-w">Wallet address</label>
            <input id="sq-w" className="field font-data" placeholder="Or paste a wallet address" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button className="btn">View</button>
          </form>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 card p-2">
          <span className="font-data text-xs text-dim break-all">{wallet}</span>
          <button className="btn" onClick={() => use(null)}>Disconnect</button>
        </div>
      )}
      {note && <p role="alert" className="text-sm text-rose mt-2">{note}</p>}
      {wallet && (loading && !data ? <Loading label="Looking in your burrow…" /> : error ? <div className="mt-3"><ErrorNote retry={reload}>{error}</ErrorNote></div> : data && (
        <>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="card p-2"><p className="label">Squeeks</p><p className="title text-2xl">{formatInt(data.tokens.length)}</p></div>
            <div className="card p-2"><p className="label">Staked</p><p className="title text-2xl">{formatInt(data.tokens.filter((t) => t.custody === "staking").length)}</p></div>
            <div className="card p-2"><p className="label">Claimable SQK</p><p className="title text-2xl">{data.claimableBaseUnits ? formatSqk(data.claimableBaseUnits, 0) : "?"}</p></div>
          </div>
          {data.tokens.some((t) => t.custody === "wallet") && <p className="text-xs text-amber mt-2">Squeeks held in a wallet earn nothing, according to the official site. Deposit them there to start earning.</p>}
          {data.tokens.length ? (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">{data.tokens.map((t) => (
              <li key={t.tokenId}>
                <button className="card w-full text-left p-1.5 hover:border-gold" onClick={() => open({ kind: "squeek", id: t.tokenId })}>
                  <SqueekArt tokenId={t.tokenId} />
                  <span className="title text-lg block mt-1">#{t.tokenId}</span>
                  <span className="font-data text-[11px] text-gray">Lv {t.level} · {custodyLabel(t.custody)}</span>
                </button>
              </li>
            ))}</ul>
          ) : <Empty>This wallet doesn't hold any Squeeks in the current release.</Empty>}
          {data.partial && <p className="text-xs text-gray mt-2">Showing the first 500. This wallet holds more.</p>}
          <p className="text-xs text-gray mt-3">From release {data.installationId}. Squeekchain is on testnet, so these have no monetary value.</p>
          <p className="mt-2"><a className="text-sky underline underline-offset-2 text-sm" href={OFFICIAL} target="_blank" rel="noopener noreferrer nofollow">Stake or merge on the official site ↗</a></p>
        </>
      ))}
    </div>
  );
}
