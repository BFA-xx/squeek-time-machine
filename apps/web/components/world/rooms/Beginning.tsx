"use client";
import { Float } from "@react-three/drei";
import { useWorld } from "@/lib/store";
import { Hamster } from "../Hamster";
import { clickable, RoomSign, useSolid } from "./common";

const ARTIFACTS = [
  { slug: "squeektoshi", a: -2.5 }, { slug: "care-policy", a: -1.8 }, { slug: "wheely", a: -1.1 }, { slug: "three-clocks", a: -0.4 },
  { slug: "proof", a: 0.4 }, { slug: "squeeks", a: 1.1 }, { slug: "sqk", a: 1.8 }, { slug: "testnet", a: 2.5 },
];
const place = (a: number): [number, number] => [Math.sin(a) * 10.5, -Math.cos(a) * 10.5 + 1];

function Artifact({ slug }: { slug: string }) {
  switch (slug) {
    case "squeektoshi": return <group position={[0, 1.2, 0]}><Hamster scale={1.1} /></group>;
    case "care-policy": return <mesh position={[0, 2, 0]} castShadow><boxGeometry args={[1.4, 1.9, 0.2]} /><meshStandardMaterial color="#d7c9a6" roughness={0.9} /></mesh>;
    case "wheely": return <mesh position={[0, 2.1, 0]} castShadow><torusGeometry args={[0.85, 0.12, 8, 28]} /><meshStandardMaterial color="#b98a2a" metalness={0.8} roughness={0.35} /></mesh>;
    case "three-clocks": return <group position={[0, 2, 0]}>{[0, 1, 2].map((i) => <mesh key={i} position={[(i - 1) * 0.72, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.32, 0.32, 0.14, 20]} /><meshStandardMaterial color={["#f2c230", "#5b7cfa", "#a8baff"][i]} metalness={0.4} roughness={0.4} /></mesh>)}</group>;
    case "proof": return <mesh position={[0, 1.9, 0]} castShadow rotation={[0.2, 0.5, 0]}><dodecahedronGeometry args={[0.8]} /><meshStandardMaterial color="#6b6358" roughness={1} flatShading /></mesh>;
    case "squeeks": return <mesh position={[0, 2, 0]} castShadow><boxGeometry args={[1.1, 1.1, 0.14]} /><meshStandardMaterial color="#5b7cfa" emissive="#5b7cfa" emissiveIntensity={0.4} /></mesh>;
    case "sqk": return <mesh position={[0, 2, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.72, 0.72, 0.16, 28]} /><meshStandardMaterial color="#f2c230" metalness={0.9} roughness={0.25} /></mesh>;
    default: return <mesh position={[0, 2, 0]} castShadow><boxGeometry args={[1.6, 0.9, 0.12]} /><meshStandardMaterial color="#35d07f" emissive="#35d07f" emissiveIntensity={0.25} /></mesh>;
  }
}

export default function BeginningRoom({ index }: { index: number }) {
  const open = useWorld((s) => s.openPanel);
  useSolid(index, ARTIFACTS.map((x) => { const [lx, lz] = place(x.a); return [lx, lz, 1]; }));
  return (
    <group>
      <RoomSign text="The Beginning" color="#f2c230" />
      {ARTIFACTS.map((x) => {
        const [lx, lz] = place(x.a);
        return (
          <group key={x.slug} position={[lx, 0, lz]} {...clickable(open, { kind: "artifact", slug: x.slug })}>
            <mesh position={[0, 0.5, 0]} castShadow receiveShadow><cylinderGeometry args={[0.8, 0.95, 1, 8]} /><meshStandardMaterial color="#2d2119" roughness={1} /></mesh>
            <mesh position={[0, 1.02, 0]}><cylinderGeometry args={[0.82, 0.82, 0.05, 24]} /><meshStandardMaterial color="#f2c230" emissive="#f2c230" emissiveIntensity={0.9} toneMapped={false} /></mesh>
            <Float speed={1.4} floatIntensity={0.25} rotationIntensity={0.15}><Artifact slug={x.slug} /></Float>
          </group>
        );
      })}
    </group>
  );
}
