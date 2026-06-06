"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
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

interface ConflictZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  nearbyMarkets: string[];
}

const CONFLICT_ZONES: ConflictZone[] = [
  { id: "ukraine", name: "Guerra Rússia–Ucrânia", lat: 48.5, lng: 32.0, nearbyMarkets: ["^STOXX50E", "^GDAXI", "^FCHI"] },
  { id: "israel-palestine", name: "Conflito Israel–Palestina", lat: 31.5, lng: 34.8, nearbyMarkets: ["^TA125.TA", "^CASE30"] },
  { id: "sudan", name: "Guerra Civil no Sudão", lat: 15.5, lng: 32.5, nearbyMarkets: ["^CASE30", "^JN0U.JO"] },
  { id: "myanmar", name: "Guerra Civil em Myanmar", lat: 19.8, lng: 96.2, nearbyMarkets: ["^SET.BK", "^STI"] },
  { id: "taiwan-strait", name: "Tensão no Estreito de Taiwan", lat: 24.0, lng: 121.0, nearbyMarkets: ["^TWII", "^HSI", "^N225"] },
  { id: "red-sea", name: "Crise no Mar Vermelho (Houthis)", lat: 14.5, lng: 42.5, nearbyMarkets: ["^CASE30", "^BSESN", "^TA125.TA"] },
];

type SelectedItem =
  | { type: "market"; data: MarketPoint }
  | { type: "conflict"; data: ConflictZone; nearbyData: MarketPoint[] };

type HoloMode = "off" | "globe" | "blackhole";

interface HoloGlobeProps {
  mode: HoloMode;
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

// ── Earth sphere ─────────────────────────────────────────────────────────────

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
        specular={new THREE.Color(0x444444)}
        shininess={18}
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
          gl_FragColor = vec4(atmosphere, intensity * 0.65);
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

// ── Market marker ────────────────────────────────────────────────────────────

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

  const beamHeight = 0.03 + intensity * 0.016;
  const beamPos = useMemo(() => pos.clone().add(normal.clone().multiplyScalar(beamHeight / 2)), [pos, normal, beamHeight]);
  const beamQuat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    return q;
  }, [normal]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      const pulse = 1 + Math.sin(t * 2.5 + point.lat * 0.1) * 0.12;
      meshRef.current.scale.setScalar(isSelected ? baseScale * 1.6 * pulse : baseScale * pulse);
    }
    if (glowRef.current) {
      const gPulse = 0.8 + Math.sin(t * 1.8 + point.lng * 0.1) * 0.2;
      glowRef.current.scale.setScalar(gPulse);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = isSelected ? 0.15 : 0.07;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 1.5;
    }
  });

  return (
    <group>
      {/* Beam pillar */}
      <mesh position={beamPos} quaternion={beamQuat}>
        <cylinderGeometry args={[0.003, 0.001, beamHeight, 6]} />
        <meshBasicMaterial color={col} transparent opacity={0.3} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Outer glow */}
      <mesh ref={glowRef} position={pos}>
        <sphereGeometry args={[baseScale * 4, 16, 16]} />
        <meshBasicMaterial color={col} transparent opacity={0.07} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Clickable hit area (invisible, generous) */}
      <mesh position={pos} onClick={(e) => { e.stopPropagation(); onSelect(point); }}>
        <sphereGeometry args={[0.07, 8, 8]} />
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
    </group>
  );
}

// ── Conflict marker ─────────────────────────────────────────────────────────

function ConflictMarker({
  zone,
  radius,
  isSelected,
  onSelect,
}: {
  zone: ConflictZone;
  radius: number;
  isSelected: boolean;
  onSelect: (z: ConflictZone) => void;
}) {
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => latLngToVec3(zone.lat, zone.lng, radius), [zone.lat, zone.lng, radius]);
  const warColor = useMemo(() => new THREE.Color("#ff4444"), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ring1Ref.current) {
      const s = 1 + Math.sin(t * 3) * 0.3;
      ring1Ref.current.scale.setScalar(s);
      (ring1Ref.current.material as THREE.MeshBasicMaterial).opacity = 0.5 - Math.sin(t * 3) * 0.2;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = t * 2;
      const s2 = 1.3 + Math.sin(t * 2 + 1) * 0.2;
      ring2Ref.current.scale.setScalar(s2);
      (ring2Ref.current.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(t * 2 + 1) * 0.1;
    }
  });

  const markerScale = isSelected ? 0.045 : 0.032;

  return (
    <group>
      {/* Clickable hit area */}
      <mesh position={pos} onClick={(e) => { e.stopPropagation(); onSelect(zone); }}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Inner pulsing ring */}
      <mesh ref={ring1Ref} position={pos}>
        <ringGeometry args={[markerScale * 0.6, markerScale, 6]} />
        <meshBasicMaterial color={warColor} transparent opacity={0.5} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Outer rotating ring */}
      <mesh ref={ring2Ref} position={pos}>
        <ringGeometry args={[markerScale * 1.4, markerScale * 1.7, 4]} />
        <meshBasicMaterial color={warColor} transparent opacity={0.25} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Center glow */}
      <mesh position={pos}>
        <sphereGeometry args={[markerScale * 0.35, 12, 12]} />
        <meshBasicMaterial color={warColor} transparent opacity={isSelected ? 0.9 : 0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Danger glow halo */}
      <mesh position={pos}>
        <sphereGeometry args={[markerScale * 3, 16, 16]} />
        <meshBasicMaterial color={warColor} transparent opacity={isSelected ? 0.08 : 0.04} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ── Scene ────────────────────────────────────────────────────────────────────

function GlobeScene({ markets, onSelect }: { markets: MarketPoint[]; onSelect: (item: SelectedItem | null) => void }) {
  const R = 1;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  const handleSelectMarket = useCallback((p: MarketPoint) => {
    setSelectedId(prev => {
      const next = prev === p.symbol ? null : p.symbol;
      onSelect(next ? { type: "market", data: p } : null);
      return next;
    });
  }, [onSelect]);

  const handleSelectConflict = useCallback((z: ConflictZone) => {
    setSelectedId(prev => {
      const next = prev === z.id ? null : z.id;
      if (!next) { onSelect(null); return null; }
      const nearbyData = markets.filter(m => z.nearbyMarkets.includes(m.symbol));
      onSelect({ type: "conflict", data: z, nearbyData });
      return next;
    });
  }, [onSelect, markets]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * (selectedId ? 0.015 : 0.06);
    }
  });

  return (
    <>
      <ambientLight intensity={1.0} />
      <directionalLight position={[5, 3, 5]} intensity={1.8} color="#fffdf0" />
      <directionalLight position={[-3, -1, -4]} intensity={0.5} color="#a0c4ff" />
      <directionalLight position={[0, 5, 0]} intensity={0.3} color="#ffffff" />

      <group ref={groupRef}>
        <EarthSphere radius={R} />
        <Atmosphere radius={R} />

        {markets.filter(m => m.symbol !== "^VIX").map(m => (
          <MarkerPoint
            key={m.symbol}
            point={m}
            radius={R + 0.005}
            isSelected={selectedId === m.symbol}
            onSelect={handleSelectMarket}
          />
        ))}

        {CONFLICT_ZONES.map(z => (
          <ConflictMarker
            key={z.id}
            zone={z}
            radius={R + 0.005}
            isSelected={selectedId === z.id}
            onSelect={handleSelectConflict}
          />
        ))}
      </group>

      <OrbitControls
        enableZoom
        enablePan={false}
        minDistance={1.5}
        maxDistance={3.5}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.4}
        zoomSpeed={0.5}
      />
    </>
  );
}

// ── Info card (outside canvas, next to globe) ────────────────────────────────

function MarketInfoCard({ point }: { point: MarketPoint }) {
  const hex = heatHex(point.changePct);
  const isUp = point.changePct >= 0;

  return (
    <a
      href={`/bolsas?symbol=${encodeURIComponent(point.symbol)}`}
      className="animate-card-in rounded-xl px-3.5 py-2.5 w-full max-w-[180px] block cursor-pointer transition-all duration-200 hover:brightness-125"
      style={{
        background: "rgba(13,14,20,0.88)",
        border: `1px solid ${hex}40`,
        boxShadow: `0 0 20px ${hex}15, 0 4px 16px rgba(0,0,0,0.5)`,
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-base">{point.flag}</span>
        <span className="text-[11px] font-bold text-white leading-tight">{point.name}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[13px] font-extrabold text-white font-mono">{fmtPrice(point.price)}</span>
        {point.currency && <span className="text-[8px] text-zinc-500">{point.currency}</span>}
      </div>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-[12px] font-extrabold font-mono" style={{ color: hex }}>
          {isUp ? "+" : ""}{point.changePct.toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[8px] text-zinc-600">{point.country}</p>
        <span className="text-[7px] text-zinc-600 font-semibold uppercase tracking-wider">Ver detalhes →</span>
      </div>
    </a>
  );
}

function ConflictInfoCard({ zone, nearbyMarkets }: { zone: ConflictZone; nearbyMarkets: MarketPoint[] }) {
  const aiQuery = `Analise o conflito "${zone.name}": quais os impactos econômicos e geopolíticos atuais? Como está afetando os mercados financeiros da região e as bolsas globais?`;

  return (
    <a
      href={`/agente-ia?q=${encodeURIComponent(aiQuery)}`}
      className="animate-card-in rounded-xl px-3.5 py-2.5 w-full max-w-[220px] block cursor-pointer transition-all duration-200 hover:brightness-125"
      style={{
        background: "rgba(13,14,20,0.92)",
        border: "1px solid rgba(255,68,68,0.3)",
        boxShadow: "0 0 20px rgba(255,68,68,0.1), 0 4px 16px rgba(0,0,0,0.5)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px]">⚠️</span>
        <span className="text-[10px] font-extrabold text-red-400 uppercase tracking-wider">Conflito Ativo</span>
      </div>
      <p className="text-[12px] font-bold text-white leading-snug mb-2">{zone.name}</p>

      {nearbyMarkets.length > 0 && (
        <>
          <p className="text-[8px] text-zinc-500 font-semibold uppercase tracking-wider mb-1">Bolsas impactadas</p>
          <div className="flex flex-col gap-1 mb-2">
            {nearbyMarkets.map(m => {
              const hex = heatHex(m.changePct);
              const isUp = m.changePct >= 0;
              return (
                <div
                  key={m.symbol}
                  className="flex items-center justify-between px-2 py-1 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <span className="flex items-center gap-1">
                    <span className="text-[10px]">{m.flag}</span>
                    <span className="text-[9px] font-semibold text-zinc-300">{m.name}</span>
                  </span>
                  <span className="text-[9px] font-bold font-mono" style={{ color: hex }}>
                    {isUp ? "+" : ""}{m.changePct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="flex items-center justify-center gap-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,68,68,0.15)" }}>
        <span className="text-[8px] text-red-400/70 font-semibold uppercase tracking-wider">Perguntar à IA →</span>
      </div>
    </a>
  );
}

// ── Black Hole — Gargantua easter egg ───────────────────────────────────────

const ACCRETION_VERT = `
  varying vec2 vUv;
  varying float vRadius;
  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vRadius = length(worldPos.xz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const ACCRETION_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vRadius;

  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
    float r = length(vUv - 0.5) * 2.0;

    float rotAngle = angle - uTime * 0.15 + r * 2.0;
    float turbulence = fbm(vec2(rotAngle * 3.0, r * 8.0 + uTime * 0.3));

    // Temperature gradient: white-hot inner → orange → deep red outer
    vec3 hotCore = vec3(1.0, 0.95, 0.85);
    vec3 warmMid = vec3(1.0, 0.55, 0.1);
    vec3 coolEdge = vec3(0.6, 0.08, 0.0);
    vec3 darkEdge = vec3(0.15, 0.0, 0.0);

    float t = smoothstep(0.0, 0.5, r);
    vec3 color = mix(hotCore, warmMid, smoothstep(0.0, 0.35, r));
    color = mix(color, coolEdge, smoothstep(0.25, 0.7, r));
    color = mix(color, darkEdge, smoothstep(0.6, 1.0, r));

    // Streaks in the disk
    float streaks = sin(rotAngle * 12.0 + r * 30.0) * 0.5 + 0.5;
    streaks = pow(streaks, 3.0);
    color += hotCore * streaks * 0.15 * (1.0 - r);

    color += turbulence * 0.08 * warmMid;

    // Doppler beaming — one side brighter
    float doppler = 0.7 + 0.3 * sin(angle + 1.0);
    color *= doppler;

    // Fade at edges
    float alpha = smoothstep(0.0, 0.08, r) * smoothstep(1.0, 0.55, r);
    alpha *= 0.85 + turbulence * 0.15;

    gl_FragColor = vec4(color, alpha);
  }
`;

const LENSING_VERT = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LENSING_FRAG = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
    rim = pow(rim, 3.0);

    float shimmer = sin(vWorldPos.x * 20.0 + uTime * 2.0) * 0.5 + 0.5;
    shimmer = 0.7 + shimmer * 0.3;

    vec3 color = mix(vec3(1.0, 0.6, 0.15), vec3(1.0, 0.9, 0.7), rim);
    float alpha = rim * 0.6 * shimmer;

    gl_FragColor = vec4(color, alpha);
  }
`;

function EventHorizon({ radius }: { radius: number }) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshBasicMaterial color="#000000" />
    </mesh>
  );
}

function EventHorizonGlow({ radius }: { radius: number }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
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
        float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 4.0);
        vec3 glow = vec3(0.8, 0.3, 0.0) * intensity;
        gl_FragColor = vec4(glow, intensity * 0.4);
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  }), []);

  return (
    <mesh scale={[1.15, 1.15, 1.15]}>
      <sphereGeometry args={[radius, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

function AccretionDisk({ innerRadius, outerRadius }: { innerRadius: number; outerRadius: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: ACCRETION_VERT,
    fragmentShader: ACCRETION_FRAG,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh rotation={[Math.PI * 0.5, 0, 0]}>
      <ringGeometry args={[innerRadius, outerRadius, 128, 1]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
}

function LensingRing({ radius }: { radius: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: LENSING_VERT,
    fragmentShader: LENSING_FRAG,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh rotation={[0, 0, 0]}>
      <torusGeometry args={[radius, 0.012, 16, 128]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
}

function SpiralParticles({ count, innerR, outerR }: { count: number; innerR: number; outerR: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = innerR + Math.random() * (outerR - innerR);
      const angle = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.06;
      pos[i * 3 + 2] = Math.sin(angle) * r;
      vel[i] = 0.2 + Math.random() * 0.6;
    }
    return { positions: pos, velocities: vel };
  }, [count, innerR, outerR]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const posArr = ref.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const x = posArr[i * 3];
      const z = posArr[i * 3 + 2];
      const r = Math.sqrt(x * x + z * z);
      const speed = (velocities[i] / (r * r + 0.3)) * 0.02;
      const angle = Math.atan2(z, x) + speed;
      const newR = Math.max(innerR * 0.8, r - 0.00008 * velocities[i]);
      posArr[i * 3] = Math.cos(angle) * newR;
      posArr[i * 3 + 2] = Math.sin(angle) * newR;
      posArr[i * 3 + 1] *= 0.999;
      if (newR <= innerR * 0.85) {
        const resetR = innerR + Math.random() * (outerR - innerR);
        const resetAngle = Math.random() * Math.PI * 2;
        posArr[i * 3] = Math.cos(resetAngle) * resetR;
        posArr[i * 3 + 1] = (Math.random() - 0.5) * 0.06;
        posArr[i * 3 + 2] = Math.sin(resetAngle) * resetR;
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffaa44" size={0.008} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
    </points>
  );
}

function BlackHoleScene() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.03;
    }
  });

  return (
    <>
      <ambientLight intensity={0.05} />
      <pointLight position={[0, 0, 0]} intensity={0.3} color="#ff6600" distance={5} />

      <group ref={groupRef} rotation={[0.3, 0, 0.1]}>
        <EventHorizon radius={0.35} />
        <EventHorizonGlow radius={0.35} />
        <AccretionDisk innerRadius={0.5} outerRadius={1.4} />
        <LensingRing radius={0.52} />
        <LensingRing radius={0.48} />
        <SpiralParticles count={600} innerR={0.5} outerR={1.4} />
      </group>

      <OrbitControls
        enableZoom
        enablePan={false}
        minDistance={1.5}
        maxDistance={4.0}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.4}
        zoomSpeed={0.5}
      />
    </>
  );
}

// ── Exported component ───────────────────────────────────────────────────────

export default function HoloGlobe({ mode }: HoloGlobeProps) {
  const [markets, setMarkets] = useState<MarketPoint[]>([]);
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [visible, setVisible] = useState(false);
  const [animClass, setAnimClass] = useState("");
  const [displayMode, setDisplayMode] = useState<"globe" | "blackhole">("globe");
  const prevModeRef = useRef<HoloMode>("off");

  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = mode;

    if (mode === "off") {
      if (visible) {
        setAnimClass("animate-globe-out");
        setSelected(null);
        const t = setTimeout(() => { setVisible(false); setAnimClass(""); }, 400);
        return () => clearTimeout(t);
      }
    } else if (mode === "globe") {
      setDisplayMode("globe");
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
    } else if (mode === "blackhole") {
      setSelected(null);
      if (prev === "globe") {
        setAnimClass("animate-globe-out");
        const t = setTimeout(() => {
          setDisplayMode("blackhole");
          setAnimClass("animate-globe-in");
        }, 400);
        return () => clearTimeout(t);
      } else {
        setDisplayMode("blackhole");
        setVisible(true);
        setAnimClass("animate-globe-in");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Force canvas to recalculate viewport after mount
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 120);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!visible) return null;

  const isBlackHole = displayMode === "blackhole";

  return (
    <div className={animClass} style={{ width: "100%" }}>
      <div style={{ width: "min(320px, 80vw)", height: "min(320px, 80vw)", margin: "0 auto" }}>
        <Canvas
          camera={{ position: [0, 0, 3.2], fov: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); }}
          dpr={[1, 2]}
          style={{ background: "transparent" }}
        >
          <React.Suspense fallback={null}>
            {isBlackHole ? <BlackHoleScene /> : <GlobeScene markets={markets} onSelect={setSelected} />}
          </React.Suspense>
        </Canvas>
      </div>

      {/* Shadow */}
      <div
        style={{
          width: isBlackHole ? "60%" : "40%",
          height: isBlackHole ? 18 : 14,
          margin: "-6px auto 0",
          background: isBlackHole
            ? "radial-gradient(ellipse, rgba(255,100,0,0.18) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)"
            : "radial-gradient(ellipse, rgba(0,0,0,0.35) 0%, transparent 70%)",
          filter: "blur(6px)",
          pointerEvents: "none",
        }}
      />

      {isBlackHole ? (
        /* Black hole caption */
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 6, gap: 2 }}>
          <span className="text-[9px] font-bold text-orange-400/50 uppercase tracking-[3px]">Gargantua</span>
          <span className="text-[7px] text-zinc-600 italic">Easter egg · Clique na logo para fechar</span>
        </div>
      ) : (
        <>
          {/* Heat legend — centered */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span className="text-[8px] text-red-400/60 font-semibold">-4%</span>
            <div style={{ width: 56, height: 3, borderRadius: 4, background: "linear-gradient(90deg, #ef4444, #facc15, #22c55e)", opacity: 0.5 }} />
            <span className="text-[8px] text-emerald-400/60 font-semibold">+4%</span>
            <span className="text-[8px] text-zinc-600 mx-1">|</span>
            <span className="text-[8px] text-red-500/70 font-semibold flex items-center gap-1">
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ff4444", display: "inline-block", boxShadow: "0 0 4px #ff4444" }} />
              Conflitos
            </span>
          </div>

          {/* Info card below globe when selected */}
          {selected && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
              {selected.type === "market" ? (
                <MarketInfoCard point={selected.data} />
              ) : (
                <ConflictInfoCard zone={selected.data} nearbyMarkets={selected.nearbyData} />
              )}
            </div>
          )}
        </>
      )}

      <style jsx global>{`
        @keyframes globe-in {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes globe-out {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-16px); }
        }
        @keyframes card-in {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-globe-in { animation: globe-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-globe-out { animation: globe-out 0.35s cubic-bezier(0.55, 0, 1, 0.45) forwards; }
        .animate-card-in { animation: card-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
}
