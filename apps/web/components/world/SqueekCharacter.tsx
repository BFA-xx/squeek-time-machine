"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useWorld } from "@/lib/store";

const GRID = 72;
const CELL = 5;
const HEIGHT = 2.3;

interface Dots { positions: [number, number][]; colors: [number, number, number][] }

/** Reads the Squeek's own dot-grid art into points. The SVG only ever goes through an <img> and a canvas, never the page. */
async function artToDots(src: string): Promise<Dots | null> {
  const img = new Image();
  await new Promise<void>((ok, bad) => {
    img.onload = () => ok();
    img.onerror = () => bad(new Error("art failed"));
    img.src = src;
  });
  // Drawn large, then each grid cell keeps its brightest pixel, so thin lines of dots survive the shrink.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = GRID * CELL;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  let data: Uint8ClampedArray;
  try {
    data = g.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return null;
  }
  const positions: [number, number][] = [];
  const colors: [number, number, number][] = [];
  let minY = GRID;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      let best = -1;
      let at = 0;
      for (let v = 0; v < CELL; v++) {
        for (let u = 0; u < CELL; u++) {
          const i = ((y * CELL + v) * canvas.width + x * CELL + u) * 4;
          const lum = (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) * (data[i + 3] / 255);
          if (lum > best) {
            best = lum;
            at = i;
          }
        }
      }
      if (best < 62) continue;
      if (y < minY) minY = y;
      positions.push([x, y]);
      colors.push([data[at] / 255, data[at + 1] / 255, data[at + 2] / 255]);
    }
  }
  if (positions.length < 20) return null;
  const maxY = Math.max(...positions.map((p) => p[1]));
  const scale = HEIGHT / Math.max(1, maxY - minY);
  return { positions: positions.map(([x, y]) => [(x - GRID / 2) * scale, (maxY - y) * scale]), colors };
}

/** The visitor's own Squeek, built from its art. It always faces the camera, and it waddles as it walks. Hopping is only ever the player's choice. */
export function SqueekCharacter({ tokenId, speedRef }: { tokenId: string; speedRef: React.RefObject<number>; }) {
  const { camera } = useThree();
  const [dots, setDots] = useState<Dots | null>(null);
  const body = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);
  const reduced = useWorld((s) => s.settings.reducedMotion);
  useEffect(() => {
    let live = true;
    setDots(null);
    fetch(`/api/v1/squeeks/${tokenId}`).then((r) => r.json()).then((d) => (d.image ? artToDots(d.image) : null)).then((r) => {
      if (live) setDots(r);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [tokenId]);
  useEffect(() => {
    const m = mesh.current;
    if (!m || !dots) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    dots.positions.forEach(([x, y], i) => {
      o.position.set(x, y + 0.05, (i % 2) * 0.05);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.setRGB(dots.colors[i][0], dots.colors[i][1], dots.colors[i][2]));
    });
    m.count = dots.positions.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [dots]);
  useFrame((_, dt) => {
    const g = body.current;
    if (!g?.parent) return;
    const speed = speedRef.current ?? 0;
    t.current += dt * (1.6 + speed * 1.7);
    const amount = reduced ? 0 : Math.min(1, speed / 7);
    g.position.y = Math.abs(Math.sin(t.current)) * 0.05 * amount;
    const at = new THREE.Vector3();
    g.parent.getWorldPosition(at);
    g.rotation.y = Math.atan2(camera.position.x - at.x, camera.position.z - at.z) - g.parent.rotation.y;
    g.rotation.z = Math.sin(t.current) * 0.1 * amount;
  });
  return (
    <group ref={body}>
      {dots ? (
        <instancedMesh ref={mesh} args={[undefined, undefined, dots.positions.length]} frustumCulled={false} castShadow>
          <sphereGeometry args={[0.03, 6, 5]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      ) : <mesh position={[0, 0.9, 0]}><octahedronGeometry args={[0.35]} /><meshBasicMaterial color="#5b7cfa" wireframe toneMapped={false} /></mesh>}
    </group>
  );
}
