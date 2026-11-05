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
