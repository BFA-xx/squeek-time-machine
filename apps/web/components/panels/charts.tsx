"use client";
import { useMemo, useRef, useState } from "react";

export interface Point { label: string; value: number | null; display: string }
export interface Series { name: string; color: string; points: Point[] }

const H = 150;
const PAD = { l: 8, r: 8, t: 10, b: 20 };

/** Single axis, thin marks, hover readout, and a table view. Null is drawn as a gap: unknown isn't zero. */
export function LineChart({ series, title, unit, height = H }: { series: Series[]; title: string; unit?: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const W = 560;
  const n = Math.max(...series.map((s) => s.points.length), 0);
  const { min, max } = useMemo(() => {
    const vals = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v !== null);
    const lo = Math.min(...vals, Infinity);
    const hi = Math.max(...vals, -Infinity);
    return { min: lo === hi ? lo - 1 : lo, max: lo === hi ? hi + 1 : hi };
  }, [series]);
  if (n === 0 || !Number.isFinite(min)) return <p className="text-sm text-gray">No readings yet for {title.toLowerCase()}.</p>;
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (height - PAD.t - PAD.b);
  const path = (pts: Point[]) => {
    let d = "";
    let pen = false;
    pts.forEach((p, i) => {
      if (p.value === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const i = Math.round((((e.clientX - r.left) / r.width) * W - PAD.l) / ((W - PAD.l - PAD.r) / Math.max(n - 1, 1)));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const first = series[0].points[0]?.label;
  const last = series[0].points[n - 1]?.label;
  return (
    <figure className="m-0">
      <figcaption className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm text-ink">{title}{unit ? <span className="text-gray"> · {unit}</span> : null}</span>
        <button className="label underline underline-offset-2" onClick={() => setTable(!table)}>{table ? "Chart" : "Table"}</button>
      </figcaption>
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-3 mb-1 text-xs text-dim">
          {series.map((s) => <li key={s.name} className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5" style={{ background: s.color }} />{s.name}</li>)}
        </ul>
      )}
      {table ? (
        <div className="max-h-56 overflow-auto scrollbar-thin">
          <table className="w-full text-xs font-data">
            <thead><tr className="text-gray text-left"><th className="py-1 font-normal">Point</th>{series.map((s) => <th key={s.name} className="font-normal text-right">{s.name}</th>)}</tr></thead>
            <tbody>{Array.from({ length: n }, (_, i) => (
              <tr key={i} className="border-t border-line"><td className="py-1 text-dim">{series[0].points[i]?.label}</td>{series.map((s) => <td key={s.name} className="text-right text-ink">{s.points[i]?.display ?? "—"}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg ref={ref} viewBox={`0 0 ${W} ${height}`} className="w-full h-auto touch-none" role="img" aria-label={`${title} from ${first} to ${last}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            <line x1={PAD.l} x2={W - PAD.r} y1={height - PAD.b} y2={height - PAD.b} stroke="#26262f" />
            {series.map((s) => <path key={s.name} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={height - PAD.b} stroke="#82828f" strokeDasharray="2 3" />}
            {hover !== null && series.map((s) => {
              const v = s.points[hover]?.value;
              return v === null || v === undefined ? null : <circle key={s.name} cx={x(hover)} cy={y(v)} r={4} fill={s.color} stroke="#0f0f12" strokeWidth={2} />;
            })}
            <text x={PAD.l} y={height - 5} fill="#82828f" fontSize="10" fontFamily="monospace">{first}</text>
            <text x={W - PAD.r} y={height - 5} fill="#82828f" fontSize="10" fontFamily="monospace" textAnchor="end">{last}</text>
          </svg>
          {hover !== null && (
            <div className="absolute top-0 card px-2 py-1 pointer-events-none text-xs" style={{ left: `${Math.min(70, (hover / Math.max(n - 1, 1)) * 100)}%` }}>
              <p className="text-gray font-data">{series[0].points[hover]?.label}</p>
              {series.map((s) => <p key={s.name} className="text-ink font-data"><span className="inline-block w-2 h-0.5 mr-1 align-middle" style={{ background: s.color }} />{s.points[hover]?.display ?? "—"}</p>)}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

export function BarChart({ points, title, unit, color = "#c47d10", height = 130, onSelect }: { points: Point[]; title: string; unit?: string; color?: string; height?: number; onSelect?: (i: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 560;
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  const bw = (W - PAD.l - PAD.r) / Math.max(points.length, 1);
  if (!points.length) return <p className="text-sm text-gray">No readings yet for {title.toLowerCase()}.</p>;
  return (
    <figure className="m-0">
      <figcaption className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm text-ink">{title}{unit ? <span className="text-gray"> · {unit}</span> : null}</span>
        <button className="label underline underline-offset-2" onClick={() => setTable(!table)}>{table ? "Chart" : "Table"}</button>
      </figcaption>
      {table ? (
        <div className="max-h-56 overflow-auto scrollbar-thin">
          <table className="w-full text-xs font-data"><tbody>{points.map((p, i) => <tr key={i} className="border-t border-line"><td className="py-1 text-dim">{p.label}</td><td className="text-right text-ink">{p.display}</td></tr>)}</tbody></table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto" role="img" aria-label={title} onPointerLeave={() => setHover(null)}>
            <line x1={PAD.l} x2={W - PAD.r} y1={height - PAD.b} y2={height - PAD.b} stroke="#26262f" />
            {points.map((p, i) => {
              const h = p.value === null ? 0 : (p.value / max) * (height - PAD.t - PAD.b);
              return (
                <g key={i} onPointerEnter={() => setHover(i)} onClick={() => onSelect?.(i)} style={{ cursor: onSelect ? "pointer" : undefined }}>
                  <rect x={PAD.l + i * bw} y={PAD.t} width={bw} height={height - PAD.t - PAD.b} fill="transparent" />
                  {p.value === null
                    ? <line x1={PAD.l + i * bw + 1} x2={PAD.l + (i + 1) * bw - 1} y1={height - PAD.b - 1} y2={height - PAD.b - 1} stroke="#3a3a46" strokeDasharray="2 2" />
                    : <rect x={PAD.l + i * bw + 1} y={height - PAD.b - h} width={Math.max(bw - 2, 1)} height={h} rx={Math.min(2, bw / 3)} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />}
                </g>
              );
            })}
            <text x={PAD.l} y={height - 5} fill="#82828f" fontSize="10" fontFamily="monospace">{points[0].label}</text>
            <text x={W - PAD.r} y={height - 5} fill="#82828f" fontSize="10" fontFamily="monospace" textAnchor="end">{points[points.length - 1].label}</text>
          </svg>
          {hover !== null && (
            <div className="absolute top-0 card px-2 py-1 pointer-events-none text-xs" style={{ left: `${Math.min(70, (hover / points.length) * 100)}%` }}>
              <p className="text-gray font-data">{points[hover].label}</p>
              <p className="text-ink font-data">{points[hover].display}</p>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
