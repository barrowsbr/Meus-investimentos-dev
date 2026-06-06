"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, useTexture } from "@react-three/drei";
import * as THREE from "three";

interface MarketPoint {
  symbol: string;
  name: string;
  country: string;
  flag: string;
  lat: number;
  lng: number;
  changePct: number;
  price: number;
  currency: string;
}

interface HoloGlobeProps {
  active: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function heatHex(pct: number): string {
  const t = Math.max(0, Math.min(1, (pct + 4) / 8));
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const s = t * 2;
    r = Math.round(239 + (250 - 239) * s);
    g = Math.round(68 + (204 - 68) * s);
    b = Math.round(68 + (21 - 68) * s);
  } else {
    const s = (t - 0.5) * 2;
    r = Math.round(250 + (34 - 250) * s);
    g = Math.round(204 + (197 - 204) * s);
    b = Math.round(21 + (94 - 21) * s);
  }
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function fmtPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Earth sphere with NASA texture ───────────────────────────────────────────

const EARTH_TEX = "https://unpkg.com/three-globe@2.41.12/example/img/earth-blue-marble.jpg";
const BUMP_TEX = "https://unpkg.com/three-globe@2.41.12/example/img/earth-topology.png";

function EarthSphere({ radius }: { radius: number }) {
  const [color, bump] = useTexture([EARTH_TEX, BUMP_TEX]);

  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshPhongMaterial
        map={color}
        bumpMap={bump}
        bumpScale={0.015}
        specular={new THREE.Color(0x333333)}
        shininess={15}
      />
    </mesh>
  );
}

// ── Atmosphere glow ──────────────────────────────────────────────────────────

function Atmosphere({ radius }: { radius: number }) {
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          vec3 atmosphere = vec3(0.3, 0.6, 1.0) * intensity;
          gl_FragColor = vec4(atmosphere, intensity * 0.7);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
  }, []);

  return (
    <mesh scale={[1.12, 1.12, 1.12]}>
      <sphereGeometry args={[radius, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

// ── Single market marker ─────────────────────────────────────────────────────

function MarkerPoint({
  point,
  radius,
  isSelected,
  onSelect,
}: {
  point: MarketPoint;
  radius: number;
  isSelected: boolean;
  onSelect: (p: MarketPoint) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => latLngToVec3(point.lat, point.lng, radius), [point.lat, point.lng, radius]);
  const normal = useMemo(() => pos.clone().normalize(), [pos]);
  const hex = useMemo(() => heatHex(point.changePct), [point.changePct]);
  const col = useMemo(() => new THREE.Color(hex), [hex]);
  const intensity = Math.min(Math.abs(point.changePct), 5);
  const baseScale = 0.022 + intensity * 0.004;

  // Beam quaternion: orient cylinder along surface normal
  const beamPos = useMemo(() => pos.clone().add(normal.clone().multiplyScalar(0.015 + intensity * 0.008)), [pos, normal, intensity]);
  const beamQuat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    return q;
  }, [normal]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      const pulse = 1 + Math.sin(t * 2.5 + point.lat * 0.1) * 0.12;
      const s = isSelected ? baseScale * 1.6 * pulse : baseScale * pulse;
      meshRef.current.scale.setScalar(s);
    }
    if (glowRef.current) {
      const gPulse = 0.8 + Math.sin(t * 1.8 + point.lng * 0.1) * 0.2;
      glowRef.current.scale.setScalar(gPulse);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = isSelected ? 0.12 : 0.06;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 1.5;
      const rp = 1 + Math.sin(t * 3) * 0.08;
      ringRef.current.scale.setScalar(rp);
    }
  });

  return (
    <group>
      {/* Beam pillar */}
      <mesh position={beamPos} quaternion={beamQuat}>
        <cylinderGeometry args={[0.003, 0.001, 0.03 + intensity * 0.016, 6]} />
        <meshBasicMaterial color={col} transparent opacity={0.25} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Outer glow */}
      <mesh ref={glowRef} position={pos}>
        <sphereGeometry args={[baseScale * 4, 16, 16]} />
        <meshBasicMaterial color={col} transparent opacity={0.06} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Clickable hit area (invisible, large) */}
      <mesh position={pos} onClick={(e) => { e.stopPropagation(); onSelect(point); }}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Visible dot */}
      <mesh ref={meshRef} position={pos}>
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial color={col} />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <group position={pos}>
          <mesh ref={ringRef}>
            <ringGeometry args={[baseScale * 2.5, baseScale * 3.2, 32]} />
            <meshBasicMaterial color={col} transparent opacity={0.6} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <mesh>
            <ringGeometry args={[baseScale * 3.5, baseScale * 3.8, 32]} />
            <meshBasicMaterial color={col} transparent opacity={0.2} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      )}

      {/* Info card on selection */}
      {isSelected && (
        <Html position={pos.clone().add(normal.clone().multiplyScalar(0.1))} center distanceFactor={2.8}>
          <div
            className="pointer-events-none select-none whitespace-nowrap px-3 py-2 rounded-xl text-center"
            style={{
              background: "rgba(0,0,0,0.85)",
              border: `1px solid ${hex}55`,
              boxShadow: `0 0 24px ${hex}30, 0 4px 20px rgba(0,0,0,0.6)`,
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="text-[11px] font-bold text-white flex items-center gap-1.5 justify-center">
              <span className="text-sm">{point.flag}</span>
              <span>{point.name}</span>
            </div>
            <div className="flex items-center gap-2 justify-center mt-1">
              <span className="text-[10px] text-zinc-400 font-mono">
                {fmtPrice(point.price)} {point.currency}
              </span>
              <span className="text-[11px] font-extrabold font-mono" style={{ color: hex }}>
                {point.changePct >= 0 ? "+" : ""}{point.changePct.toFixed(2)}%
              </span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Main scene ───────────────────────────────────────────────────────────────

function GlobeScene({ markets }: { markets: MarketPoint[] }) {
  const R = 1;
  const [selected, setSelected] = useState<MarketPoint | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  const handleSelect = useCallback((p: MarketPoint) => {
    setSelected(prev => prev?.symbol === p.symbol ? null : p);
  }, []);

  // Slow auto-rotation
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * (selected ? 0.02 : 0.06);
    }
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} color="#fffbe6" />
      <directionalLight position={[-4, -2, -3]} intensity={0.3} color="#8ecaf6" />

      <group ref={groupRef}>
        <EarthSphere radius={R} />
        <Atmosphere radius={R} />

        {markets.filter(m => m.symbol !== "^VIX").map(m => (
          <MarkerPoint
            key={m.symbol}
            point={m}
            radius={R + 0.005}
            isSelected={selected?.symbol === m.symbol}
            onSelect={handleSelect}
          />
        ))}
      </group>

      <OrbitControls
        enableZoom
        enablePan={false}
        minDistance={1.4}
        maxDistance={3.5}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.4}
        zoomSpeed={0.5}
      />
    </>
  );
}

// ── Exported component ───────────────────────────────────────────────────────

export default function HoloGlobe({ active }: HoloGlobeProps) {
  const [markets, setMarkets] = useState<MarketPoint[]>([]);
  const [visible, setVisible] = useState(false);
  const [animClass, setAnimClass] = useState("");

  useEffect(() => {
    if (active) {
      setVisible(true);
      setAnimClass("animate-globe-in");
      if (markets.length === 0) {
        fetch("/api/bolsas")
          .then(r => r.json())
          .then(d => {
            if (d.indices) {
              setMarkets(d.indices.map((i: MarketPoint) => ({
                symbol: i.symbol, name: i.name, country: i.country,
                flag: i.flag, lat: i.lat, lng: i.lng,
                changePct: i.changePct, price: i.price, currency: i.currency,
              })));
            }
          })
          .catch(() => {});
      }
    } else if (visible) {
      setAnimClass("animate-globe-out");
      const t = setTimeout(() => { setVisible(false); setAnimClass(""); }, 400);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!visible) return null;

  return (
    <div className={`w-full flex flex-col items-center ${animClass}`}>
      <div
        className="relative"
        style={{
          width: "min(340px, 85vw)",
          height: "min(340px, 85vw)",
          filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.5)) drop-shadow(0 2px 8px rgba(60,130,200,0.15))",
        }}
      >
        <Canvas
          camera={{ position: [0, 0.2, 2.6], fov: 42 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          dpr={[1, 2]}
          style={{ background: "transparent" }}
        >
          <React.Suspense fallback={null}>
            <GlobeScene markets={markets} />
          </React.Suspense>
        </Canvas>
      </div>

      {/* Heat legend — subtle, below the globe */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[8px] text-red-400/70 font-semibold">-4%</span>
        <div className="w-16 h-1 rounded-full" style={{ background: "linear-gradient(90deg, #ef4444, #facc15, #22c55e)", opacity: 0.6 }} />
        <span className="text-[8px] text-emerald-400/70 font-semibold">+4%</span>
      </div>

      <style jsx global>{`
        @keyframes globe-in {
          from { opacity: 0; transform: scale(0.5) translateY(-20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes globe-out {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to { opacity: 0; transform: scale(0.5) translateY(-20px); }
        }
        .animate-globe-in { animation: globe-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-globe-out { animation: globe-out 0.35s cubic-bezier(0.55, 0, 1, 0.45) forwards; }
      `}</style>
    </div>
  );
}
