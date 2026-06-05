"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Sphere, Line, Html, Stars } from "@react-three/drei";
import * as THREE from "three";

// ── Types ────────────────────────────────────────────────────────────────────

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
  onClose: () => void;
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

function heatColor(pct: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (pct + 4) / 8));
  if (t < 0.5) {
    const s = t * 2;
    return new THREE.Color().setRGB(
      (239 + (250 - 239) * s) / 255,
      (68 + (204 - 68) * s) / 255,
      (68 + (21 - 68) * s) / 255,
    );
  }
  const s = (t - 0.5) * 2;
  return new THREE.Color().setRGB(
    (250 + (34 - 250) * s) / 255,
    (204 + (197 - 204) * s) / 255,
    (21 + (94 - 21) * s) / 255,
  );
}

function heatHex(pct: number): string {
  return "#" + heatColor(pct).getHexString();
}

// ── Globe wireframe (latitude/longitude grid) ────────────────────────────────

function GlobeGrid({ radius }: { radius: number }) {
  const lines = useMemo(() => {
    const result: THREE.Vector3[][] = [];
    // Latitude lines
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lng = 0; lng <= 360; lng += 3) {
        pts.push(latLngToVec3(lat, lng - 180, radius));
      }
      result.push(pts);
    }
    // Longitude lines
    for (let lng = -180; lng < 180; lng += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 3) {
        pts.push(latLngToVec3(lat, lng, radius));
      }
      result.push(pts);
    }
    return result;
  }, [radius]);

  return (
    <>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color="#0ef" lineWidth={0.3} transparent opacity={0.08} />
      ))}
    </>
  );
}

// ── Continent outlines ───────────────────────────────────────────────────────

const CONTINENT_PATHS: [number, number][][] = [
  // North America (simplified)
  [[-10,83],[-20,70],[-60,55],[-75,45],[-80,32],[-85,30],[-97,26],[-105,22],[-117,32],[-125,49],[-140,60],[-165,64],[-168,66],[-141,70],[-95,72],[-85,70],[-65,75],[-58,68],[-55,52],[-60,47],[-67,45],[-70,42],[-74,40],[-82,25],[-81,28],[-75,35],[-60,47],[-55,52],[-10,83]],
  // South America
  [[-80,10],[-75,5],[-70,-5],[-75,-15],[-70,-22],[-65,-35],[-68,-48],[-74,-52],[-70,-55],[-64,-55],[-58,-52],[-50,-30],[-47,-22],[-40,-15],[-35,-5],[-50,0],[-60,5],[-65,10],[-75,12],[-80,10]],
  // Europe + rough
  [[-10,36],[0,36],[5,44],[3,48],[-5,48],[-10,44],[-10,36]],
  [[3,48],[10,48],[15,54],[12,56],[25,56],[28,60],[30,70],[20,70],[10,60],[3,48]],
  // Africa
  [[-18,15],[-15,28],[0,37],[10,37],[12,32],[33,32],[42,12],[50,2],[45,-12],[35,-25],[28,-34],[18,-35],[12,-17],[10,-5],[5,5],[-5,5],[-10,7],[-18,15]],
  // Asia (very simplified)
  [[30,70],[40,65],[55,55],[60,40],[70,40],[75,30],[80,15],[90,22],[100,22],[105,15],[110,20],[120,30],[125,40],[130,42],[135,35],[140,40],[145,45],[142,55],[135,58],[120,55],[100,50],[80,55],[65,55],[55,55],[40,65],[30,70]],
  // Australia
  [[115,-35],[115,-20],[130,-12],[142,-12],[150,-22],[153,-28],[148,-38],[140,-38],[130,-33],[115,-35]],
];

function ContinentOutlines({ radius }: { radius: number }) {
  const paths = useMemo(() => {
    return CONTINENT_PATHS.map(coords =>
      coords.map(([lng, lat]) => latLngToVec3(lat, lng, radius + 0.003))
    );
  }, [radius]);

  return (
    <>
      {paths.map((pts, i) => (
        <Line key={`cont-${i}`} points={pts} color="#0ef" lineWidth={0.8} transparent opacity={0.2} />
      ))}
    </>
  );
}

// ── Atmospheric glow ─────────────────────────────────────────────────────────

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
          float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          gl_FragColor = vec4(0.0, 0.9, 1.0, 1.0) * intensity * 0.6;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
  }, []);

  return (
    <mesh scale={[1.15, 1.15, 1.15]}>
      <sphereGeometry args={[radius, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

// ── Inner atmosphere (front glow) ────────────────────────────────────────────

function InnerGlow({ radius }: { radius: number }) {
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
          float intensity = pow(0.5 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
          gl_FragColor = vec4(0.0, 0.85, 1.0, intensity * 0.25);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: false,
    });
  }, []);

  return (
    <mesh>
      <sphereGeometry args={[radius + 0.005, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

// ── Market data point (individual marker) ────────────────────────────────────

function MarkerPoint({
  point,
  radius,
  onHover,
  onSelect,
  isSelected,
}: {
  point: MarketPoint;
  radius: number;
  onHover: (p: MarketPoint | null) => void;
  onSelect: (p: MarketPoint) => void;
  isSelected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => latLngToVec3(point.lat, point.lng, radius), [point.lat, point.lng, radius]);
  const col = useMemo(() => heatColor(point.changePct), [point.changePct]);
  const hexCol = useMemo(() => heatHex(point.changePct), [point.changePct]);
  const intensity = Math.min(Math.abs(point.changePct), 5);
  const markerScale = 0.012 + intensity * 0.003;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      const pulse = 1 + Math.sin(t * 3 + point.lat) * 0.15;
      meshRef.current.scale.setScalar(isSelected ? markerScale * 1.8 * pulse : markerScale * pulse);
    }
    if (beamRef.current) {
      const bScale = 1 + Math.sin(t * 2 + point.lng) * 0.15;
      beamRef.current.scale.set(1, bScale, 1);
      (beamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(t * 2) * 0.05;
    }
    if (ringRef.current && isSelected) {
      ringRef.current.rotation.z = t * 2;
      const rPulse = 1 + Math.sin(t * 4) * 0.1;
      ringRef.current.scale.setScalar(rPulse);
    }
  });

  const normal = pos.clone().normalize();
  const beamHeight = 0.03 + intensity * 0.012;
  const beamMid = pos.clone().add(normal.clone().multiplyScalar(beamHeight / 2));
  const beamQuat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    return q;
  }, [normal]);

  return (
    <group>
      {/* Vertical beam / pillar */}
      <mesh ref={beamRef} position={beamMid} quaternion={beamQuat}>
        <cylinderGeometry args={[0.002, 0.001, beamHeight, 6]} />
        <meshBasicMaterial color={col} transparent opacity={0.2} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Glow sphere at base */}
      <mesh position={pos}>
        <sphereGeometry args={[markerScale * 2.5, 16, 16]} />
        <meshBasicMaterial color={col} transparent opacity={0.06} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Main point */}
      <mesh
        ref={meshRef}
        position={pos}
        onPointerEnter={(e) => { e.stopPropagation(); onHover(point); }}
        onPointerLeave={() => onHover(null)}
        onClick={(e) => { e.stopPropagation(); onSelect(point); }}
      >
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={col} />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh ref={ringRef} position={pos}>
          <ringGeometry args={[markerScale * 2.2, markerScale * 2.8, 32]} />
          <meshBasicMaterial color={col} transparent opacity={0.5} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}

      {/* Label */}
      {isSelected && (
        <Html position={pos.clone().add(normal.clone().multiplyScalar(0.08))} center distanceFactor={3}>
          <div
            className="pointer-events-none select-none whitespace-nowrap px-2.5 py-1.5 rounded-lg text-center"
            style={{
              background: "rgba(0,10,20,0.92)",
              border: `1px solid ${hexCol}50`,
              boxShadow: `0 0 20px ${hexCol}30, 0 0 40px ${hexCol}10`,
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="text-[10px] font-bold text-white flex items-center gap-1.5 justify-center">
              <span>{point.flag}</span>
              <span>{point.name}</span>
            </div>
            <div className="flex items-center gap-2 justify-center mt-0.5">
              <span className="text-[9px] text-zinc-400 font-mono">
                {point.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span
                className="text-[10px] font-bold font-mono"
                style={{ color: hexCol }}
              >
                {point.changePct >= 0 ? "+" : ""}{point.changePct.toFixed(2)}%
              </span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Connection arcs between markets ──────────────────────────────────────────

function MarketConnections({ points, radius, selectedSymbol }: {
  points: MarketPoint[];
  radius: number;
  selectedSymbol: string | null;
}) {
  const arcs = useMemo(() => {
    if (!selectedSymbol) return [];
    const selected = points.find(p => p.symbol === selectedSymbol);
    if (!selected) return [];

    const origin = latLngToVec3(selected.lat, selected.lng, radius);
    const sameRegionPoints = points.filter(p =>
      p.symbol !== selectedSymbol && p.changePct * selected.changePct > 0
    ).slice(0, 6);

    return sameRegionPoints.map(target => {
      const dest = latLngToVec3(target.lat, target.lng, radius);
      const mid = origin.clone().add(dest).multiplyScalar(0.5).normalize().multiplyScalar(radius * 1.3);
      const curve = new THREE.QuadraticBezierCurve3(origin, mid, dest);
      return {
        points: curve.getPoints(40),
        color: heatHex(target.changePct),
      };
    });
  }, [points, radius, selectedSymbol]);

  return (
    <>
      {arcs.map((arc, i) => (
        <Line key={i} points={arc.points} color={arc.color} lineWidth={0.5} transparent opacity={0.15} />
      ))}
    </>
  );
}

// ── Scan ring effect ─────────────────────────────────────────────────────────

function ScanRing({ radius }: { radius: number }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.getElapsedTime() * 0.3) % 1;
    const lat = 90 - t * 180;
    const phi = (90 - lat) * (Math.PI / 180);
    const y = radius * Math.cos(phi);
    const ringR = radius * Math.sin(phi);
    ref.current.position.y = y;
    ref.current.scale.setScalar(Math.max(ringR, 0.01));
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.06 + Math.sin(t * Math.PI) * 0.04;
  });

  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.98, 1, 64]} />
      <meshBasicMaterial color="#0ef" transparent opacity={0.08} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

// ── Floating particles ───────────────────────────────────────────────────────

function FloatingParticles({ count, radius }: { count: number; radius: number }) {
  const ref = useRef<THREE.Points>(null);

  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = radius + 0.02 + Math.random() * 0.08;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      sz[i] = 0.5 + Math.random() * 1.5;
    }
    return [pos, sz];
  }, [count, radius]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.getElapsedTime() * 0.02;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial color="#0ef" transparent opacity={0.3} size={0.004} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
    </points>
  );
}

// ── Auto-rotate helper ───────────────────────────────────────────────────────

function AutoRotate({ speed }: { speed: number }) {
  const { scene } = useThree();
  const globeRef = useRef(scene);
  globeRef.current = scene;

  useFrame((_, delta) => {
    const globe = globeRef.current.getObjectByName("globe-group");
    if (globe) {
      globe.rotation.y += delta * speed;
    }
  });
  return null;
}

// ── Main scene ───────────────────────────────────────────────────────────────

function GlobeScene({ markets }: { markets: MarketPoint[] }) {
  const R = 1;
  const [hovered, setHovered] = useState<MarketPoint | null>(null);
  const [selected, setSelected] = useState<MarketPoint | null>(null);

  const handleSelect = useCallback((p: MarketPoint) => {
    setSelected(prev => prev?.symbol === p.symbol ? null : p);
  }, []);

  return (
    <>
      <ambientLight intensity={0.15} />
      <pointLight position={[5, 3, 5]} intensity={0.4} color="#0ef" />
      <pointLight position={[-5, -3, -5]} intensity={0.15} color="#06b" />

      <Stars radius={8} depth={20} count={1500} factor={2} saturation={0} fade speed={0.5} />

      <AutoRotate speed={selected ? 0.02 : 0.08} />

      <group name="globe-group">
        {/* Core sphere */}
        <Sphere args={[R, 64, 64]}>
          <meshPhysicalMaterial
            color="#040810"
            transparent
            opacity={0.4}
            roughness={0.8}
            metalness={0.2}
            envMapIntensity={0.5}
          />
        </Sphere>

        {/* Grid */}
        <GlobeGrid radius={R + 0.002} />

        {/* Continent outlines */}
        <ContinentOutlines radius={R} />

        {/* Atmospheres */}
        <Atmosphere radius={R} />
        <InnerGlow radius={R} />

        {/* Scan effect */}
        <ScanRing radius={R} />

        {/* Market points */}
        {markets.filter(m => m.symbol !== "^VIX").map(m => (
          <MarkerPoint
            key={m.symbol}
            point={m}
            radius={R + 0.01}
            onHover={setHovered}
            onSelect={handleSelect}
            isSelected={selected?.symbol === m.symbol}
          />
        ))}

        {/* Connection arcs */}
        <MarketConnections points={markets} radius={R + 0.01} selectedSymbol={selected?.symbol ?? null} />

        {/* Floating particles */}
        <FloatingParticles count={200} radius={R} />
      </group>

      <OrbitControls
        enableZoom={true}
        enablePan={false}
        minDistance={1.5}
        maxDistance={4}
        autoRotate={false}
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.5}
        zoomSpeed={0.5}
      />

      {/* Tooltip on hover (not selected) */}
      {hovered && !selected && (
        <Html position={latLngToVec3(hovered.lat, hovered.lng, R + 0.06)} center distanceFactor={3}>
          <div
            className="pointer-events-none select-none whitespace-nowrap px-2 py-1 rounded-md text-center"
            style={{
              background: "rgba(0,10,20,0.9)",
              border: `1px solid ${heatHex(hovered.changePct)}40`,
              boxShadow: `0 0 12px ${heatHex(hovered.changePct)}20`,
            }}
          >
            <span className="text-[9px] text-white font-semibold">{hovered.flag} {hovered.name}</span>
            <span className="text-[9px] font-bold font-mono ml-1.5" style={{ color: heatHex(hovered.changePct) }}>
              {hovered.changePct >= 0 ? "+" : ""}{hovered.changePct.toFixed(2)}%
            </span>
          </div>
        </Html>
      )}
    </>
  );
}

// ── HUD Overlay ──────────────────────────────────────────────────────────────

function HUD({ markets, onClose }: { markets: MarketPoint[]; onClose: () => void }) {
  const up = markets.filter(m => m.symbol !== "^VIX" && m.changePct > 0).length;
  const down = markets.filter(m => m.symbol !== "^VIX" && m.changePct < 0).length;
  const best = markets.filter(m => m.symbol !== "^VIX").reduce((a, b) => a.changePct > b.changePct ? a : b, markets[0]);
  const worst = markets.filter(m => m.symbol !== "^VIX").reduce((a, b) => a.changePct < b.changePct ? a : b, markets[0]);

  return (
    <>
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 pointer-events-auto">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[9px] font-extrabold tracking-[2px] uppercase text-cyan-400/80">
              GLOBAL MARKETS
            </span>
          </div>
          <button
            onClick={onClose}
            className="pointer-events-auto text-[10px] px-2.5 py-1 rounded-md font-semibold tracking-wide uppercase transition-all hover:bg-cyan-400/20"
            style={{
              color: "rgba(0,238,255,0.7)",
              border: "1px solid rgba(0,238,255,0.2)",
              background: "rgba(0,10,20,0.6)",
            }}
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Bottom stats */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
        <div className="px-4 pb-3 flex items-end justify-between gap-3">
          {/* Left: breadth */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] text-cyan-400/50 uppercase tracking-wider font-bold">Breadth</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-emerald-400">{up} <span className="text-[8px] font-normal opacity-60">alta</span></span>
              <span className="text-[8px] text-zinc-600">|</span>
              <span className="text-[10px] font-bold text-red-400">{down} <span className="text-[8px] font-normal opacity-60">queda</span></span>
            </div>
          </div>

          {/* Center: heat legend */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] text-red-400 font-semibold">-4%</span>
              <div className="w-20 h-1 rounded-full" style={{ background: "linear-gradient(90deg, #ef4444, #facc15, #22c55e)" }} />
              <span className="text-[8px] text-emerald-400 font-semibold">+4%</span>
            </div>
          </div>

          {/* Right: best/worst */}
          <div className="flex flex-col gap-0.5 items-end">
            {best && (
              <span className="text-[9px]">
                <span className="text-zinc-500">Melhor: </span>
                <span className="text-emerald-400 font-bold">{best.flag} {best.name} +{best.changePct.toFixed(1)}%</span>
              </span>
            )}
            {worst && (
              <span className="text-[9px]">
                <span className="text-zinc-500">Pior: </span>
                <span className="text-red-400 font-bold">{worst.flag} {worst.name} {worst.changePct.toFixed(1)}%</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Corner decorations — sci-fi brackets */}
      {[
        "top-2 left-2 border-t border-l",
        "top-2 right-2 border-t border-r",
        "bottom-2 left-2 border-b border-l",
        "bottom-2 right-2 border-b border-r",
      ].map((cls, i) => (
        <div key={i} className={`absolute ${cls} w-4 h-4 pointer-events-none`} style={{ borderColor: "rgba(0,238,255,0.15)" }} />
      ))}

      {/* Scanline */}
      <div
        className="absolute inset-0 pointer-events-none z-30"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,238,255,0.015) 2px, rgba(0,238,255,0.015) 4px)",
        }}
      />
    </>
  );
}

// ── Exported component ───────────────────────────────────────────────────────

export default function HoloGlobe({ active, onClose }: HoloGlobeProps) {
  const [markets, setMarkets] = useState<MarketPoint[]>([]);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (active) {
      setVisible(true);
      setExiting(false);
      fetch("/api/bolsas")
        .then(r => r.json())
        .then(d => {
          if (d.indices) {
            setMarkets(d.indices.map((i: MarketPoint & { change?: number }) => ({
              symbol: i.symbol,
              name: i.name,
              country: i.country,
              flag: i.flag,
              lat: i.lat,
              lng: i.lng,
              changePct: i.changePct,
              price: i.price,
              currency: i.currency,
            })));
          }
        })
        .catch(() => {});
    } else if (visible) {
      setExiting(true);
      const t = setTimeout(() => {
        setVisible(false);
        setExiting(false);
      }, 600);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!visible) return null;

  return (
    <div className="flex flex-col items-center w-full">
      {/* Projection beam */}
      <div
        className="w-[2px] h-5 mx-auto rounded-full"
        style={{
          background: "linear-gradient(180deg, rgba(0,255,255,0.7), rgba(0,255,255,0.05))",
          animation: "holoBeam 2s ease-in-out infinite",
          boxShadow: "0 0 12px rgba(0,255,255,0.4)",
        }}
      />

      {/* Globe container */}
      <div
        className={`relative w-full rounded-xl overflow-hidden ${exiting ? "holo-panel-exit" : "holo-panel-enter"}`}
        style={{
          aspectRatio: "1",
          maxWidth: "min(420px, 90vw)",
          background: "radial-gradient(ellipse at 50% 50%, rgba(0,20,35,0.95) 0%, rgba(0,5,10,0.98) 100%)",
          border: "1px solid rgba(0,238,255,0.15)",
          boxShadow: "0 0 60px rgba(0,238,255,0.08), 0 0 120px rgba(0,238,255,0.04), inset 0 0 30px rgba(0,238,255,0.02)",
        }}
      >
        <HUD markets={markets} onClose={onClose} />

        {!loaded && (
          <div className="absolute inset-0 z-40 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "rgba(0,238,255,0.3)", borderTopColor: "transparent" }}
              />
              <span className="text-[9px] text-cyan-400/50 tracking-widest uppercase font-bold">Inicializando</span>
            </div>
          </div>
        )}

        <Canvas
          camera={{ position: [0, 0, 2.8], fov: 45 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          dpr={[1, 1.5]}
          onCreated={() => setLoaded(true)}
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.8s ease" }}
        >
          <GlobeScene markets={markets} />
        </Canvas>
      </div>

      {/* Ground reflection */}
      <div
        className="w-24 h-[4px] mx-auto rounded-full mt-0.5"
        style={{
          background: "radial-gradient(ellipse, rgba(0,238,255,0.12), transparent)",
          filter: "blur(3px)",
        }}
      />
    </div>
  );
}
