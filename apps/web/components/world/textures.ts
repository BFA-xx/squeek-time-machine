import * as THREE from "three";

/** Everything is drawn in code at start-up. There are no image downloads to wait for. */
export function dotFloorTexture(repeat: number, base = "#17110d", dot = "#5e4516"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 30},${35},${Math.random() * 0.07})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.fillStyle = dot;
  g.beginPath();
  g.arc(64, 64, 4, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function earthBump(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 90 + Math.random() * 90;
    g.fillStyle = `rgba(${v},${v},${v},0.55)`;
    const s = 2 + Math.random() * 12;
    g.beginPath();
    g.ellipse(Math.random() * 256, Math.random() * 256, s, s * (0.4 + Math.random() * 0.6), Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 3);
  return t;
}

/** A soft round glow for particles and lantern halos. */
export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.35, "rgba(255,255,255,.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function noise2(x: number, y: number) {
  return Math.sin(x * 1.7 + Math.sin(y * 2.3) * 1.3) * 0.5 + Math.sin(y * 3.1 + Math.sin(x * 1.1) * 2) * 0.3 + Math.sin((x + y) * 5.3) * 0.2;
}

/** A polished stone floor, drawn once: concentric brass inlays with fine joints between the slabs. Used with no repeat. */
export function stoneFloor(radius: number, size: number, rings: number[], accent = "201,162,74"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const px = size / 2 / radius;
  const mid = size / 2;
  const base = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
  base.addColorStop(0, "#26211c");
  base.addColorStop(0.65, "#1c1814");
  base.addColorStop(1, "#141110");
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  // Very fine mottling, so the stone doesn't look like flat plastic.
  for (let i = 0; i < size * 5; i++) {
    const v = Math.random() > 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.018})`;
    const s = 1 + Math.random() * (size / 340);
    g.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  const ring = (r: number, width: number, style: string) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    g.beginPath();
    g.arc(mid, mid, r * px, 0, Math.PI * 2);
    g.stroke();
  };
  const all = [0, ...rings, radius];
  all.slice(0, -1).forEach((inner, i) => {
    const outer = all[i + 1];
    const n = Math.max(8, Math.round((Math.PI * 2 * ((inner + outer) / 2)) / 3.2));
    g.strokeStyle = "rgba(0,0,0,.42)";
    g.lineWidth = Math.max(1, size / 1400);
    for (let k = 0; k < n; k++) {
      const a = ((k + (i % 2) * 0.5) / n) * Math.PI * 2;
      g.beginPath();
      g.moveTo(mid + Math.cos(a) * inner * px, mid + Math.sin(a) * inner * px);
      g.lineTo(mid + Math.cos(a) * outer * px, mid + Math.sin(a) * outer * px);
      g.stroke();
    }
  });
  for (const r of rings) {
    ring(r, Math.max(1.5, size / 700), `rgba(${accent},.38)`);
    ring(r + 0.14, Math.max(1, size / 1500), "rgba(0,0,0,.4)");
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The same stone laid along a tunnel, with a joint every couple of metres. */
export function tunnelFloor(length: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1a1613";
  g.fillRect(0, 0, 128, 512);
  g.fillStyle = "rgba(0,0,0,.45)";
  for (let k = 0; k < 8; k++) g.fillRect(0, (k / 8) * 512, 128, 1.5);
  g.fillStyle = "rgba(201,162,74,.4)";
  g.fillRect(6, 0, 1.5, 512);
  g.fillRect(120.5, 0, 1.5, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, length / 16);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
