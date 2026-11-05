"use client";
import { useWorld } from "@/lib/store";

export function PanelHistoryBar() {
  const history = useWorld((s) => s.history);
  const back = useWorld((s) => s.backPanel);
  if (!history.length) return null;
  return <button className="label mb-3 underline underline-offset-2" onClick={back}>← Back</button>;
}

export function SiteFoot() {
  return (
    <footer className="mt-6 text-xs text-gray">
      <p>Squeek Time Machine is a community-built archive. It isn't made or endorsed by the Squeekchain team. Squeekchain runs on the Sepolia testnet, where SQK and Squeeks have no monetary value.</p>
      <p className="mt-1">Data from <a className="underline" href="https://docs.squeekchain.com/developers/api/" target="_blank" rel="noopener noreferrer">the official Squeekchain API</a> and the contracts' public logs.</p>
    </footer>
  );
}
