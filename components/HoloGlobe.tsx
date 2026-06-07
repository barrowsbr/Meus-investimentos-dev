"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
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

type HoloMode = "off" | "globe" | "sol" | "mercurio" | "venus" | "terra" | "marte" | "jupiter" | "saturno" | "urano" | "netuno" | "blackhole";

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
//
// Physics: the accretion disk is in the equatorial plane. Gravitational lensing
// bends light from the FAR side of the disk over the top and under the bottom
// of the event horizon, creating a vertical arc (the "photon ring"). The camera
// sees both the direct disk AND the lensed secondary image simultaneously.
// Doppler beaming makes the approaching side brighter.

const DISK_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;


const BH_LENS_FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;

float hash(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 starfield(vec3 dir){
  vec3 col = vec3(0.0);
  for(int i = 0; i < 3; i++){
    float scale = 24.0 + float(i) * 48.0;
    vec3 p  = dir * scale;
    vec3 ip = floor(p);
    float h = hash(ip);
    if(h > 0.982){
      float b = fract(h * 137.0);
      float tw = 0.6 + 0.4 * sin(uTime * 0.8 + h * 40.0);
      col += vec3(b * 0.9, b * 0.92, b) * tw;
    }
  }
  float neb = pow(max(0.0, 0.5 + 0.5 * dir.y), 2.0);
  col += vec3(0.015, 0.02, 0.045) * neb;
  return col;
}

vec3 diskColor(float r, float rin, float rout){
  float t = clamp((r - rin) / (rout - rin), 0.0, 1.0);
  vec3 hot  = vec3(1.0, 0.96, 0.85);
  vec3 mid  = vec3(1.0, 0.62, 0.22);
  vec3 cool = vec3(0.75, 0.20, 0.04);
  vec3 c = mix(hot, mid, smoothstep(0.0, 0.45, t));
  c = mix(c, cool, smoothstep(0.45, 1.0, t));
  return c;
}

float diskTexture(vec3 hit, float r){
  float ang = atan(hit.z, hit.x);
  float swirl = ang * 3.0 + r * 1.6 - uTime * 0.9;
  float bands = 0.6 + 0.4 * sin(swirl);
  float fine  = 0.7 + 0.3 * sin(swirl * 4.0 + r * 3.0);
  return bands * fine;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  float orbit = uTime * 0.05;
  float camDist = 10.0;
  vec3 ro = vec3(sin(orbit) * camDist, 1.4, -cos(orbit) * camDist);
  vec3 ta = vec3(0.0);
  vec3 fwd   = normalize(ta - ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up    = cross(fwd, right);
  float fov  = 1.05;
  vec3 dir = normalize(fwd + uv.x * fov * right + uv.y * fov * up);

  vec3 pos = ro;
  vec3 vel = dir;
  vec3 L   = cross(pos, vel);
  float h2 = dot(L, L);

  const float rs   = 1.0;
  const float rin  = 2.6;
  const float rout = 9.5;

  vec3  color = vec3(0.0);
  float alpha = 0.0;
  bool  captured = false;
  float dt = 0.16;

  for(int i = 0; i < 170; i++){
    float r = length(pos);
    if(r < rs * 1.02){ captured = true; break; }
    if(r > 32.0) break;

    vec3 prev = pos;
    vec3 acc = -1.5 * h2 * pos / pow(dot(pos, pos), 2.5);
    vel += acc * dt;
    pos += vel * dt;

    if(prev.y * pos.y < 0.0){
      float f = prev.y / (prev.y - pos.y);
      vec3 hit = mix(prev, pos, f);
      float rr = length(vec2(hit.x, hit.z));
      if(rr > rin && rr < rout){
        vec3 dc = diskColor(rr, rin, rout);
        float tex = diskTexture(hit, rr);
        float bright = 1.6 / (0.4 + (rr - rin) * 0.45);
        vec3 orbitDir = normalize(cross(vec3(0.0, 1.0, 0.0), hit));
        vec3 toCam = normalize(ro - hit);
        float dop = 0.5 + 0.5 * dot(orbitDir, toCam);
        dop = pow(dop, 2.2) * 2.2 + 0.25;
        vec3 add = dc * bright * tex * dop;
        color += (1.0 - alpha) * add;
        alpha += (1.0 - alpha) * 0.9;
      }
    }
  }

  vec3 bg = captured ? vec3(0.0) : starfield(normalize(vel));
  vec3 outc = color + (1.0 - alpha) * bg;
  outc = outc / (1.0 + outc);
  outc = pow(outc, vec3(0.82));

  float d = length(uv);
  float vig = smoothstep(0.72, 0.25, d);
  outc *= vig;
  float oAlpha = smoothstep(0.78, 0.38, d);

  gl_FragColor = vec4(outc, oAlpha);
}
`;

function BlackHoleLensQuad() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: BH_LENS_FRAG,
    uniforms: {
      uRes: { value: new THREE.Vector2(size.width, size.height) },
      uTime: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime();
      matRef.current.uniforms.uRes.value.set(size.width * window.devicePixelRatio, size.height * window.devicePixelRatio);
    }
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
}

function BlackHoleScene() {
  return <BlackHoleLensQuad />;
}

// ── Planet scenes — Solar system ─────────────────────────────────────────────

type PlanetMode = "sol" | "mercurio" | "venus" | "terra" | "marte" | "jupiter" | "saturno" | "urano" | "netuno";

const PLANET_MODES: PlanetMode[] = ["sol", "mercurio", "venus", "terra", "marte", "jupiter", "saturno", "urano", "netuno"];

const PLANET_CAPTIONS: Record<PlanetMode, { name: string; fact: string }> = {
  sol:      { name: "Sol",      fact: "Estrela G2V · 4.6 bilhões de anos" },
  mercurio: { name: "Mercúrio", fact: "Planeta mais próximo do Sol · 88 dias de órbita" },
  venus:    { name: "Vênus",    fact: "Rotação retrógrada · 462°C na superfície" },
  terra:    { name: "Terra",    fact: "Nosso planeta · 12.742 km de diâmetro" },
  marte:    { name: "Marte",    fact: "Planeta vermelho · Monte Olimpo 21.9 km" },
  jupiter:  { name: "Júpiter",  fact: "Gigante gasoso · Grande Mancha Vermelha" },
  saturno:  { name: "Saturno",  fact: "Anéis de gelo e rocha · 146 luas" },
  urano:    { name: "Urano",    fact: "Inclinação axial 98° · Gira de lado" },
  netuno:   { name: "Netuno",   fact: "Ventos de 2.100 km/h · Mais distante" },
};

// ── Sun (Sol) ──

const SUN_VERT = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.1 + vec2(1.7, 3.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.15;

    // Plasma turbulence
    float n1 = fbm(uv * 6.0 + vec2(t, t * 0.7));
    float n2 = fbm(uv * 8.0 - vec2(t * 0.5, t * 1.1));
    float n3 = fbm(uv * 12.0 + vec2(t * 0.3, -t * 0.4));
    float turb = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

    // Solar granulation
    float gran = noise(uv * 40.0 + t * 0.5);

    // Base colors: deep orange core -> yellow -> white hot spots
    vec3 deep = vec3(0.85, 0.25, 0.0);
    vec3 mid = vec3(1.0, 0.6, 0.05);
    vec3 hot = vec3(1.0, 0.95, 0.7);

    vec3 color = mix(deep, mid, turb);
    color = mix(color, hot, pow(turb, 3.0) * 1.2);
    color += gran * 0.08 * mid;

    // Sunspot-like dark patches
    float spot = smoothstep(0.62, 0.58, n1) * smoothstep(0.55, 0.60, n2);
    color = mix(color, vec3(0.3, 0.08, 0.0), spot * 0.4);

    // Limb darkening
    float rim = dot(vNormal, vec3(0.0, 0.0, 1.0));
    float limb = pow(max(rim, 0.0), 0.5);
    color *= 0.4 + 0.6 * limb;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const SUN_CORONA_FRAG = `
  varying vec3 vNormal;
  uniform float uTime;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    float rim = 1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0));
    float corona = pow(rim, 2.0);
    float flicker = 0.85 + 0.15 * sin(uTime * 2.0 + rim * 10.0);
    vec3 color = mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 0.9, 0.3), rim) * corona * flicker;
    gl_FragColor = vec4(color, corona * 0.6);
  }
`;

const SunSurface = React.memo(function SunSurface() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SUN_VERT,
    fragmentShader: SUN_FRAG,
    uniforms: { uTime: { value: 0 } },
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh>
      <sphereGeometry args={[0.9, 64, 64]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
});

const SunCorona = React.memo(function SunCorona() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: SUN_CORONA_FRAG,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh scale={[1.25, 1.25, 1.25]}>
      <sphereGeometry args={[0.9, 64, 64]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
});

function SolScene() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.04;
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 0]} intensity={2} color="#ffaa44" />
      <group ref={groupRef}>
        <SunSurface />
        <SunCorona />
      </group>
      <OrbitControls enableZoom enablePan={false} minDistance={2.0} maxDistance={4.5} enableDamping dampingFactor={0.06} rotateSpeed={0.4} zoomSpeed={0.5} />
    </>
  );
}

// ── Mercury (Mercurio) ──

const MERCURY_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;

    // Base gray terrain
    float terrain = fbm(uv * 10.0);

    // Craters — multiple scales
    float craters = 0.0;
    for (int i = 0; i < 8; i++) {
      float scale = 15.0 + float(i) * 8.0;
      vec2 cell = floor(uv * scale);
      vec2 center = (cell + 0.5) / scale;
      float dist = length(uv - center) * scale;
      float rim = smoothstep(0.4, 0.35, dist) * smoothstep(0.2, 0.35, dist);
      float floor_c = smoothstep(0.3, 0.0, dist) * 0.15;
      craters += rim * 0.12 - floor_c;
    }

    vec3 baseColor = vec3(0.42, 0.40, 0.38);
    vec3 darkColor = vec3(0.25, 0.24, 0.22);
    vec3 lightColor = vec3(0.55, 0.53, 0.50);

    vec3 color = mix(darkColor, lightColor, terrain);
    color += craters;

    // Lighting
    float light = max(dot(vNormal, normalize(vec3(1.0, 0.5, 1.0))), 0.0);
    color *= 0.25 + 0.75 * light;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const MercurySurface = React.memo(function MercurySurface() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SUN_VERT,
    fragmentShader: MERCURY_FRAG,
    uniforms: { uTime: { value: 0 } },
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh>
      <sphereGeometry args={[0.6, 64, 64]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
});

function MercurioScene() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.03;
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 3, 5]} intensity={1.5} color="#fffdf0" />
      <group ref={groupRef}>
        <MercurySurface />
      </group>
      <OrbitControls enableZoom enablePan={false} minDistance={1.5} maxDistance={4.0} enableDamping dampingFactor={0.06} rotateSpeed={0.4} zoomSpeed={0.5} />
    </>
  );
}

// ── Venus (Venus) ──

const VENUS_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.03;

    // Cloud bands flowing horizontally
    float lat = uv.y;
    float bands = sin(lat * 12.0) * 0.15;

    float clouds1 = fbm(vec2(uv.x * 4.0 + t, uv.y * 6.0));
    float clouds2 = fbm(vec2(uv.x * 6.0 - t * 0.7, uv.y * 8.0 + t * 0.3));
    float clouds = clouds1 * 0.6 + clouds2 * 0.4 + bands;

    // Swirling vortex patterns
    float vortex = fbm(vec2(uv.x * 3.0 + sin(uv.y * 5.0 + t) * 0.3, uv.y * 4.0 + t * 0.2));
    clouds = mix(clouds, vortex, 0.3);

    // Venus palette: yellowish-white to pale orange
    vec3 pale = vec3(0.95, 0.90, 0.75);
    vec3 yellow = vec3(0.90, 0.78, 0.50);
    vec3 orange = vec3(0.82, 0.65, 0.40);

    vec3 color = mix(orange, pale, clouds);
    color = mix(color, yellow, vortex * 0.4);

    // Lighting
    float light = max(dot(vNormal, normalize(vec3(1.0, 0.3, 1.0))), 0.0);
    color *= 0.35 + 0.65 * light;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const VENUS_ATMO_FRAG = `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    vec3 glow = vec3(0.9, 0.8, 0.4) * intensity;
    gl_FragColor = vec4(glow, intensity * 0.5);
  }
`;

const VenusSurface = React.memo(function VenusSurface() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SUN_VERT,
    fragmentShader: VENUS_FRAG,
    uniforms: { uTime: { value: 0 } },
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh>
      <sphereGeometry args={[0.8, 64, 64]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
});

const VenusAtmosphere = React.memo(function VenusAtmosphere() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: VENUS_ATMO_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  }), []);

  return (
    <mesh scale={[1.12, 1.12, 1.12]}>
      <sphereGeometry args={[0.8, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
});

function VenusScene() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.025;
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 3, 5]} intensity={1.4} color="#fffde8" />
      <group ref={groupRef}>
        <VenusSurface />
        <VenusAtmosphere />
      </group>
      <OrbitControls enableZoom enablePan={false} minDistance={1.8} maxDistance={4.0} enableDamping dampingFactor={0.06} rotateSpeed={0.4} zoomSpeed={0.5} />
    </>
  );
}

// ── Earth close-up (Terra) ──

function TerraScene() {
  const groupRef = useRef<THREE.Group>(null);
  const R = 1;

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.05;
  });

  return (
    <>
      <ambientLight intensity={1.0} />
      <directionalLight position={[5, 3, 5]} intensity={1.8} color="#fffdf0" />
      <directionalLight position={[-3, -1, -4]} intensity={0.5} color="#a0c4ff" />
      <group ref={groupRef}>
        <EarthSphere radius={R} />
        <Atmosphere radius={R} />
        {/* Cloud layer */}
        <mesh scale={[1.015, 1.015, 1.015]}>
          <sphereGeometry args={[R, 64, 64]} />
          <meshPhongMaterial color="#ffffff" transparent opacity={0.12} depthWrite={false} />
        </mesh>
      </group>
      <OrbitControls enableZoom enablePan={false} minDistance={1.5} maxDistance={3.5} enableDamping dampingFactor={0.06} rotateSpeed={0.4} zoomSpeed={0.5} />
    </>
  );
}

// ── Mars (Marte) ──

const MARS_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;

    float terrain = fbm(uv * 8.0);
    float detail = fbm(uv * 20.0);

    // Mars palette
    vec3 rust = vec3(0.72, 0.30, 0.15);
    vec3 sand = vec3(0.82, 0.55, 0.30);
    vec3 dark = vec3(0.45, 0.20, 0.10);

    vec3 color = mix(rust, sand, terrain);
    color = mix(color, dark, detail * 0.3);

    // Polar ice caps
    float polar = abs(uv.y - 0.5) * 2.0;
    float ice = smoothstep(0.82, 0.95, polar);
    vec3 iceColor = vec3(0.92, 0.93, 0.95);
    color = mix(color, iceColor, ice * 0.85);

    // Valles Marineris hint (dark equatorial feature)
    float valley = smoothstep(0.48, 0.50, uv.y) * smoothstep(0.52, 0.50, uv.y);
    valley *= smoothstep(0.2, 0.3, uv.x) * smoothstep(0.6, 0.5, uv.x);
    color = mix(color, dark * 0.7, valley * 0.3);

    // Lighting
    float light = max(dot(vNormal, normalize(vec3(1.0, 0.5, 1.0))), 0.0);
    color *= 0.3 + 0.7 * light;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const MARS_ATMO_FRAG = `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
    vec3 glow = vec3(0.8, 0.4, 0.2) * intensity;
    gl_FragColor = vec4(glow, intensity * 0.3);
  }
`;

const MarsSurface = React.memo(function MarsSurface() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SUN_VERT,
    fragmentShader: MARS_FRAG,
    uniforms: { uTime: { value: 0 } },
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh>
      <sphereGeometry args={[0.7, 64, 64]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
});

const MarsAtmosphere = React.memo(function MarsAtmosphere() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: MARS_ATMO_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  }), []);

  return (
    <mesh scale={[1.08, 1.08, 1.08]}>
      <sphereGeometry args={[0.7, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
});

function MarteScene() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.045;
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 3, 5]} intensity={1.5} color="#fffdf0" />
      <group ref={groupRef}>
        <MarsSurface />
        <MarsAtmosphere />
      </group>
      <OrbitControls enableZoom enablePan={false} minDistance={1.5} maxDistance={4.0} enableDamping dampingFactor={0.06} rotateSpeed={0.4} zoomSpeed={0.5} />
    </>
  );
}

// ── Jupiter (Jupiter) ──

const JUPITER_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.02;
    float lat = uv.y;

    // Cloud bands — sinusoidal horizontal bands
    float bands = sin(lat * 28.0) * 0.5 + 0.5;
    float bandDetail = sin(lat * 56.0 + fbm(vec2(uv.x * 8.0 + t, lat * 4.0)) * 2.0) * 0.25 + 0.5;

    // Zonal flow distortion
    float flow = fbm(vec2(uv.x * 6.0 + t * (1.0 + sin(lat * 14.0) * 0.5), lat * 10.0));

    // Jupiter palette
    vec3 cream = vec3(0.92, 0.85, 0.72);
    vec3 orange = vec3(0.85, 0.55, 0.25);
    vec3 brown = vec3(0.60, 0.38, 0.20);
    vec3 white = vec3(0.95, 0.93, 0.88);

    vec3 color = mix(cream, orange, bands);
    color = mix(color, brown, bandDetail * 0.5);
    color = mix(color, white, flow * 0.2);

    // Great Red Spot (approximate position)
    vec2 spotCenter = vec2(0.35, 0.42);
    float spotDist = length((uv - spotCenter) * vec2(1.8, 2.8));
    float spot = smoothstep(0.12, 0.04, spotDist);
    float spotSwirl = fbm(vec2(atan(uv.y - spotCenter.y, uv.x - spotCenter.x) * 3.0 + t * 2.0, spotDist * 15.0));
    vec3 spotColor = mix(vec3(0.78, 0.28, 0.15), vec3(0.90, 0.45, 0.20), spotSwirl);
    color = mix(color, spotColor, spot * 0.8);

    // Lighting
    float light = max(dot(vNormal, normalize(vec3(1.0, 0.3, 1.0))), 0.0);
    color *= 0.3 + 0.7 * light;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const JupiterSurface = React.memo(function JupiterSurface() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SUN_VERT,
    fragmentShader: JUPITER_FRAG,
    uniforms: { uTime: { value: 0 } },
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh>
      <sphereGeometry args={[1.0, 64, 64]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
});

function JupiterScene() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.06;
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 3, 5]} intensity={1.5} color="#fffdf0" />
      <group ref={groupRef} rotation={[0.05, 0, 0]}>
        <JupiterSurface />
      </group>
      <OrbitControls enableZoom enablePan={false} minDistance={2.0} maxDistance={4.5} enableDamping dampingFactor={0.06} rotateSpeed={0.4} zoomSpeed={0.5} />
    </>
  );
}

// ── Saturn (Saturno) ──

const SATURN_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.015;
    float lat = uv.y;

    // Soft cloud bands
    float bands = sin(lat * 20.0) * 0.3 + 0.5;
    float flow = fbm(vec2(uv.x * 5.0 + t, lat * 8.0));

    // Saturn palette: golden/butterscotch tones
    vec3 gold = vec3(0.90, 0.78, 0.50);
    vec3 butter = vec3(0.85, 0.72, 0.42);
    vec3 pale = vec3(0.93, 0.88, 0.70);

    vec3 color = mix(butter, gold, bands);
    color = mix(color, pale, flow * 0.25);

    // Lighting
    float light = max(dot(vNormal, normalize(vec3(1.0, 0.3, 1.0))), 0.0);
    color *= 0.3 + 0.7 * light;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const SATURN_RING_FRAG = `
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float angle = atan(c.y, c.x);

    // Ring structure with gaps
    float ringBase = smoothstep(0.0, 0.08, r) * smoothstep(1.0, 0.85, r);

    // Cassini division (main gap)
    float cassini = 1.0 - smoothstep(0.42, 0.44, r) * smoothstep(0.48, 0.46, r) * 0.85;

    // Encke gap
    float encke = 1.0 - smoothstep(0.62, 0.63, r) * smoothstep(0.65, 0.64, r) * 0.6;

    // Ring density variations
    float density = hash(vec2(r * 200.0, 0.0)) * 0.3 + 0.7;
    density *= 0.8 + 0.2 * sin(r * 80.0);

    // Ring colors: inner bright → outer darker
    vec3 innerColor = vec3(0.85, 0.75, 0.55);
    vec3 midColor = vec3(0.75, 0.65, 0.50);
    vec3 outerColor = vec3(0.55, 0.48, 0.38);

    vec3 color = mix(innerColor, midColor, smoothstep(0.0, 0.5, r));
    color = mix(color, outerColor, smoothstep(0.5, 1.0, r));

    float alpha = ringBase * cassini * encke * density * 0.85;

    gl_FragColor = vec4(color, alpha);
  }
`;

const SaturnBody = React.memo(function SaturnBody() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SUN_VERT,
    fragmentShader: SATURN_FRAG,
    uniforms: { uTime: { value: 0 } },
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh>
      <sphereGeometry args={[0.7, 64, 64]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
});

const SaturnRings = React.memo(function SaturnRings() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: DISK_VERT,
    fragmentShader: SATURN_RING_FRAG,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh rotation={[Math.PI * 0.5, 0, 0]}>
      <ringGeometry args={[0.85, 1.45, 128, 1]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
});

function SaturnoScene() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.04;
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 3, 5]} intensity={1.5} color="#fffdf0" />
      <group ref={groupRef} rotation={[0.4, 0, -0.1]}>
        <SaturnBody />
        <SaturnRings />
      </group>
      <OrbitControls enableZoom enablePan={false} minDistance={2.5} maxDistance={5.0} enableDamping dampingFactor={0.06} rotateSpeed={0.4} zoomSpeed={0.5} />
    </>
  );
}

// ── Uranus (Urano) ──

const URANUS_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.01;

    // Subtle atmospheric banding
    float bands = sin(uv.y * 16.0 + fbm(uv * 3.0 + t) * 0.5) * 0.08;
    float clouds = fbm(vec2(uv.x * 4.0 + t, uv.y * 5.0));

    // Uranus palette: pale cyan to blue-green
    vec3 cyan = vec3(0.60, 0.82, 0.85);
    vec3 teal = vec3(0.50, 0.75, 0.78);
    vec3 pale = vec3(0.70, 0.88, 0.90);

    vec3 color = mix(teal, cyan, bands + 0.5);
    color = mix(color, pale, clouds * 0.15);

    // Lighting
    float light = max(dot(vNormal, normalize(vec3(1.0, 0.3, 1.0))), 0.0);
    color *= 0.35 + 0.65 * light;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const URANUS_RING_FRAG = `
  varying vec2 vUv;

  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;

    float ring = smoothstep(0.0, 0.1, r) * smoothstep(1.0, 0.8, r);
    // Thin, faint rings
    float bands = sin(r * 60.0) * 0.5 + 0.5;
    bands = pow(bands, 8.0);

    vec3 color = vec3(0.6, 0.7, 0.75);
    float alpha = ring * bands * 0.35;

    gl_FragColor = vec4(color, alpha);
  }
`;

const UranusBody = React.memo(function UranusBody() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SUN_VERT,
    fragmentShader: URANUS_FRAG,
    uniforms: { uTime: { value: 0 } },
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh>
      <sphereGeometry args={[0.8, 64, 64]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
});

const UranusRings = React.memo(function UranusRings() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: DISK_VERT,
    fragmentShader: URANUS_RING_FRAG,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  return (
    <mesh rotation={[Math.PI * 0.5, 0, 0]}>
      <ringGeometry args={[0.95, 1.2, 128, 1]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
});

const UranusAtmosphere = React.memo(function UranusAtmosphere() {
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
        float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
        vec3 glow = vec3(0.4, 0.8, 0.85) * intensity;
        gl_FragColor = vec4(glow, intensity * 0.4);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  }), []);

  return (
    <mesh scale={[1.1, 1.1, 1.1]}>
      <sphereGeometry args={[0.8, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
});

function UranoScene() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.035;
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 3, 5]} intensity={1.3} color="#f0f8ff" />
      {/* Tilted ~98 degrees on its side */}
      <group ref={groupRef} rotation={[1.71, 0, 0.2]}>
        <UranusBody />
        <UranusAtmosphere />
        <UranusRings />
      </group>
      <OrbitControls enableZoom enablePan={false} minDistance={2.0} maxDistance={4.5} enableDamping dampingFactor={0.06} rotateSpeed={0.4} zoomSpeed={0.5} />
    </>
  );
}

// ── Neptune (Netuno) ──

const NEPTUNE_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.025;

    // Strong atmospheric bands
    float lat = uv.y;
    float bands = sin(lat * 18.0) * 0.15;
    float flow = fbm(vec2(uv.x * 6.0 + t * 1.5, lat * 8.0));
    float wispy = fbm(vec2(uv.x * 10.0 + t * 2.0, lat * 12.0));

    // Neptune palette: deep blue
    vec3 deepBlue = vec3(0.15, 0.25, 0.65);
    vec3 blue = vec3(0.25, 0.40, 0.80);
    vec3 lightBlue = vec3(0.45, 0.60, 0.90);
    vec3 white = vec3(0.85, 0.88, 0.95);

    vec3 color = mix(deepBlue, blue, bands + 0.5);
    color = mix(color, lightBlue, flow * 0.3);

    // White cloud streaks (high-altitude cirrus)
    float clouds = pow(wispy, 3.0);
    color = mix(color, white, clouds * 0.5);

    // Great Dark Spot
    vec2 spotCenter = vec2(0.6, 0.45);
    float spotDist = length((uv - spotCenter) * vec2(2.0, 3.0));
    float darkSpot = smoothstep(0.15, 0.05, spotDist);
    vec3 darkColor = vec3(0.08, 0.12, 0.35);
    color = mix(color, darkColor, darkSpot * 0.6);

    // Lighting
    float light = max(dot(vNormal, normalize(vec3(1.0, 0.3, 1.0))), 0.0);
    color *= 0.3 + 0.7 * light;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const NeptuneSurface = React.memo(function NeptuneSurface() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SUN_VERT,
    fragmentShader: NEPTUNE_FRAG,
    uniforms: { uTime: { value: 0 } },
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh>
      <sphereGeometry args={[0.85, 64, 64]} />
      <primitive ref={matRef} object={mat} attach="material" />
    </mesh>
  );
});

const NeptuneAtmosphere = React.memo(function NeptuneAtmosphere() {
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
        float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
        vec3 glow = vec3(0.2, 0.4, 1.0) * intensity;
        gl_FragColor = vec4(glow, intensity * 0.5);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  }), []);

  return (
    <mesh scale={[1.1, 1.1, 1.1]}>
      <sphereGeometry args={[0.85, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
});

function NetunoScene() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.05;
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 3, 5]} intensity={1.4} color="#e8f0ff" />
      <group ref={groupRef} rotation={[0.5, 0, 0]}>
        <NeptuneSurface />
        <NeptuneAtmosphere />
      </group>
      <OrbitControls enableZoom enablePan={false} minDistance={2.0} maxDistance={4.5} enableDamping dampingFactor={0.06} rotateSpeed={0.4} zoomSpeed={0.5} />
    </>
  );
}

// ── Planet scene dispatcher ─────────────────────────────────────────────────

function PlanetSceneContent({ planet }: { planet: PlanetMode }) {
  switch (planet) {
    case "sol": return <SolScene />;
    case "mercurio": return <MercurioScene />;
    case "venus": return <VenusScene />;
    case "terra": return <TerraScene />;
    case "marte": return <MarteScene />;
    case "jupiter": return <JupiterScene />;
    case "saturno": return <SaturnoScene />;
    case "urano": return <UranoScene />;
    case "netuno": return <NetunoScene />;
  }
}

// ── Exported component ───────────────────────────────────────────────────────

export default function HoloGlobe({ mode }: HoloGlobeProps) {
  const [markets, setMarkets] = useState<MarketPoint[]>([]);
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [visible, setVisible] = useState(false);
  const [animClass, setAnimClass] = useState("");
  const [displayMode, setDisplayMode] = useState<"globe" | "blackhole" | PlanetMode>("globe");
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
    } else if (mode === "blackhole" || PLANET_MODES.includes(mode as PlanetMode)) {
      setSelected(null);
      if (prev !== "off") {
        setAnimClass("animate-globe-out");
        const t = setTimeout(() => {
          setDisplayMode(mode as "blackhole" | PlanetMode);
          setAnimClass("animate-globe-in");
        }, 400);
        return () => clearTimeout(t);
      } else {
        setDisplayMode(mode as "blackhole" | PlanetMode);
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
  const isPlanet = PLANET_MODES.includes(displayMode as PlanetMode);

  const planetCaptionColor: Record<string, string> = {
    sol: "text-amber-400/60",
    mercurio: "text-zinc-400/60",
    venus: "text-yellow-300/60",
    terra: "text-blue-400/60",
    marte: "text-red-400/60",
    jupiter: "text-orange-300/60",
    saturno: "text-yellow-400/60",
    urano: "text-cyan-400/60",
    netuno: "text-blue-500/60",
  };

  return (
    <div className={animClass} style={{ width: "100%" }}>
      <div style={{
        width: isBlackHole ? "min(420px, 95vw)" : "min(320px, 80vw)",
        height: isBlackHole ? "min(360px, 82vw)" : "min(320px, 80vw)",
        margin: isBlackHole ? "-10px auto -16px" : "0 auto",
      }}>
        <Canvas
          camera={{ position: [0, 0, 3.2], fov: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); }}
          dpr={[1, 2]}
          style={{ background: "transparent" }}
        >
          <React.Suspense fallback={null}>
            {isBlackHole ? (
              <BlackHoleScene />
            ) : isPlanet ? (
              <PlanetSceneContent planet={displayMode as PlanetMode} />
            ) : (
              <GlobeScene markets={markets} onSelect={setSelected} />
            )}
          </React.Suspense>
        </Canvas>
      </div>

      {/* Shadow */}
      <div
        style={{
          width: isBlackHole ? "50%" : "40%",
          height: isBlackHole ? 12 : 14,
          margin: isBlackHole ? "0 auto 0" : "-6px auto 0",
          background: isBlackHole
            ? "radial-gradient(ellipse, rgba(255,120,20,0.12) 0%, transparent 65%)"
            : displayMode === "sol"
            ? "radial-gradient(ellipse, rgba(255,170,0,0.15) 0%, rgba(0,0,0,0.25) 40%, transparent 70%)"
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
      ) : isPlanet ? (
        /* Planet caption */
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 6, gap: 2 }}>
          <span className={`text-[9px] font-bold uppercase tracking-[3px] ${planetCaptionColor[displayMode] || "text-zinc-400/60"}`}>
            {PLANET_CAPTIONS[displayMode as PlanetMode].name}
          </span>
          <span className="text-[7px] text-zinc-600 italic">
            {PLANET_CAPTIONS[displayMode as PlanetMode].fact}
          </span>
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
