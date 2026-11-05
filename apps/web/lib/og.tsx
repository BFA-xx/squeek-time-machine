import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/** The brand's dot-matrix mark, drawn from circles so it needs no image fetch. */
const MARK = ["..ooo.....ooo..", ".ooooo...ooooo.", ".ooooooooooooo.", "ooooooooooooooo", "ooo.ooooo.ooooo", "ooo..ooo...oooo", "ooo..ooo...oooo", "ooooooooooooooo", ".ooooooooooooo.", "..ooooooooooo.."];

export function ogCard({ eyebrow, title, body, foot }: { eyebrow: string; title: string; body?: string; foot: string }) {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#0b0b0d", color: "#e6e6ec", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {MARK.map((row, y) => <div key={y} style={{ display: "flex", gap: 3 }}>{row.split("").map((c, x) => <div key={x} style={{ width: 7, height: 7, borderRadius: 7, background: c === "o" ? "#f2c230" : "transparent" }} />)}</div>)}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, fontWeight: 700 }}>Squeek Time Machine</div>
          <div style={{ fontSize: 22, color: "#82828f" }}>{eyebrow}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: title.length > 40 ? 64 : 84, fontWeight: 700, lineHeight: 1.04, color: "#f2c230" }}>{title.slice(0, 90)}</div>
        {body && <div style={{ fontSize: 30, color: "#b6b6c2", lineHeight: 1.3 }}>{body.slice(0, 170)}</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#82828f" }}><span>{foot}</span><span>Community-built</span></div>
    </div>,
    OG_SIZE,
  );
}
