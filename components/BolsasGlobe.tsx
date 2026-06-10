"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import * as THREE from "three";

export interface BolsasGlobeIndex {
  symbol: string;
  tvSymbol: string;
  name: string;
  country: string;
  flag: string;
  region: string;
  lat: number;
  lng: number;
  price: number;
  change: number;
  changePct: number;
  currency: string;
}

export interface BolsasGlobeProps {
  indices: BolsasGlobeIndex[];
  selectedRegion: string | null;
  hoveredIndex: string | null;
  selectedIndex: BolsasGlobeIndex | null;
  onHover: (symbol: string | null) => void;
  onSelect: (i: BolsasGlobeIndex | null) => void;
}

const EARTH_TEX = "https://unpkg.com/three-globe@2.41.12/example/img/earth-blue-marble.jpg";
const BUMP_TEX = "https://unpkg.com/three-globe@2.41.12/example/img/earth-topology.png";
const WATER_TEX = "https://unpkg.com/three-globe@2.41.12/example/img/earth-water.png";
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

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

// ── Earth sphere ─────────────────────────────────────────────────────────────

function EarthSphere({ radius }: { radius: number }) {
  const [color, bump, water] = useTexture([EARTH_TEX, BUMP_TEX, WATER_TEX]);
  useMemo(() => {
    const maxAniso = 8;
    color.anisotropy = maxAniso;
    bump.anisotropy = maxAniso;
    water.anisotropy = maxAniso;
  }, [color, bump, water]);

  return (
    <mesh>
      <sphereGeometry args={[radius, 96, 96]} />
      <meshStandardMaterial
        map={color}
        bumpMap={bump}
        bumpScale={0.02}
        roughnessMap={water}
        roughness={0.85}
        metalness={0.08}
        envMapIntensity={0.6}
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

// ── Country border lines (TopoJSON) ──────────────────────────────────────────

function CountryBorders({ radius }: { radius: number }) {
  const [lineGeo, setLineGeo] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    fetch(GEO_URL)
      .then(r => r.json())
      .then(topo => {
        const transform = topo.transform;
        if (!transform) return;

        const arcs = topo.arcs as number[][][];
        const R = radius + 0.003;
        const points: number[] = [];

        for (const arc of arcs) {
          let x = 0, y = 0;
          const decoded: [number, number][] = [];
          for (const pt of arc) {
            x += pt[0];
            y += pt[1];
            decoded.push([
              x * transform.scale[0] + transform.translate[0],
              y * transform.scale[1] + transform.translate[1],
            ]);
          }
          for (let i = 0; i < decoded.length - 1; i++) {
            const p1 = latLngToVec3(decoded[i][1], decoded[i][0], R);
            const p2 = latLngToVec3(decoded[i + 1][1], decoded[i + 1][0], R);
            points.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
        setLineGeo(geo);
      })
      .catch(() => {});
  }, [radius]);

  if (!lineGeo) return null;

  return (
    <lineSegments geometry={lineGeo}>
      <lineBasicMaterial
        color="#4dd0e1"
        transparent
        opacity={0.18}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

// ── Heat patch (colored glow on globe surface per market) ────────────────────

function HeatPatch({
  lat, lng, radius, changePct, active, isDimmed,
}: {
  lat: number; lng: number; radius: number;
  changePct: number; active: boolean; isDimmed: boolean;
}) {
  const pos = useMemo(() => latLngToVec3(lat, lng, radius + 0.002), [lat, lng, radius]);
  const normal = useMemo(() => pos.clone().normalize(), [pos]);
  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    return q;
  }, [normal]);
  const col = useMemo(() => new THREE.Color(heatHex(changePct)), [changePct]);
  const patchRadius = 0.08 + Math.min(Math.abs(changePct), 5) * 0.014;
  const opacity = isDimmed ? 0.02 : active ? 0.18 : 0.08;

  return (
    <mesh position={pos} quaternion={quat}>
      <circleGeometry args={[patchRadius, 32]} />
      <meshBasicMaterial
        color={col}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Market marker ────────────────────────────────────────────────────────────

function GlobeMarker({
  index, radius, isSelected, isHovered, isDimmed, onSelect, onHover,
}: {
  index: BolsasGlobeIndex;
  radius: number;
  isSelected: boolean;
  isHovered: boolean;
  isDimmed: boolean;
  onSelect: (i: BolsasGlobeIndex) => void;
  onHover: (symbol: string | null) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => latLngToVec3(index.lat, index.lng, radius), [index.lat, index.lng, radius]);
  const normal = useMemo(() => pos.clone().normalize(), [pos]);
  const hex = useMemo(() => heatHex(index.changePct), [index.changePct]);
  const col = useMemo(() => new THREE.Color(hex), [hex]);
  const intensity = Math.min(Math.abs(index.changePct), 5);
  const baseScale = 0.022 + intensity * 0.004;
  const active = isSelected || isHovered;

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
      const pulse = 1 + Math.sin(t * 2.5 + index.lat * 0.1) * 0.12;
      meshRef.current.scale.setScalar(active ? baseScale * 1.6 * pulse : baseScale * pulse);
    }
    if (glowRef.current) {
      const gPulse = 0.8 + Math.sin(t * 1.8 + index.lng * 0.1) * 0.2;
      glowRef.current.scale.setScalar(gPulse);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = active ? 0.15 : 0.07;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 1.5;
    }
  });

  return (
    <group>
      <mesh position={beamPos} quaternion={beamQuat}>
        <cylinderGeometry args={[0.003, 0.001, beamHeight, 6]} />
        <meshBasicMaterial color={col} transparent opacity={isDimmed ? 0.08 : 0.3} blending={THREE.AdditiveBlending} />
      </mesh>

      <mesh ref={glowRef} position={pos}>
        <sphereGeometry args={[baseScale * 4, 16, 16]} />
        <meshBasicMaterial color={col} transparent opacity={isDimmed ? 0.02 : 0.07} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      <mesh
        position={pos}
        onClick={(e) => { e.stopPropagation(); onSelect(index); }}
        onPointerOver={() => onHover(index.symbol)}
        onPointerOut={() => onHover(null)}
      >
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <mesh ref={meshRef} position={pos}>
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial color={col} transparent opacity={isDimmed ? 0.2 : 1} />
      </mesh>

      {active && !isDimmed && (
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

// ── Scene ────────────────────────────────────────────────────────────────────

function GlobeScene({
  indices, selectedRegion, hoveredIndex, selectedIndex, onHover, onSelect,
}: BolsasGlobeProps) {
  const R = 1;
  const groupRef = useRef<THREE.Group>(null);

  const handleSelect = useCallback((idx: BolsasGlobeIndex) => {
    onSelect(selectedIndex?.symbol === idx.symbol ? null : idx);
  }, [onSelect, selectedIndex]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * (selectedIndex ? 0.015 : 0.04);
    }
  });

  const filtered = indices.filter(i => i.symbol !== "^VIX");

  return (
    <>
      <ambientLight intensity={1.0} />
      <directionalLight position={[5, 3, 5]} intensity={1.8} color="#fffdf0" />
      <directionalLight position={[-3, -1, -4]} intensity={0.5} color="#a0c4ff" />
      <directionalLight position={[0, 5, 0]} intensity={0.3} color="#ffffff" />

      <group ref={groupRef}>
        <EarthSphere radius={R} />
        <Atmosphere radius={R} />
        <CountryBorders radius={R} />

        {filtered.map(idx => {
          const isDimmed = !!selectedRegion && idx.region !== selectedRegion;
          const isSelected = selectedIndex?.symbol === idx.symbol;
          const isHovered = hoveredIndex === idx.symbol;
          return (
            <React.Fragment key={idx.symbol}>
              <HeatPatch
                lat={idx.lat}
                lng={idx.lng}
                radius={R}
                changePct={idx.changePct}
                active={isSelected || isHovered}
                isDimmed={isDimmed}
              />
              <GlobeMarker
                index={idx}
                radius={R + 0.005}
                isSelected={isSelected}
                isHovered={isHovered}
                isDimmed={isDimmed}
                onSelect={handleSelect}
                onHover={onHover}
              />
            </React.Fragment>
          );
        })}
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

// ── Exported component ───────────────────────────────────────────────────────

export default function BolsasGlobe(props: BolsasGlobeProps) {
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ width: "100%", height: 420 }}>
      <Canvas
        camera={{ position: [0, 0.3, 2.8], fov: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); }}
        dpr={[1, 2]}
        style={{ background: "transparent" }}
      >
        <React.Suspense fallback={null}>
          <GlobeScene {...props} />
        </React.Suspense>
      </Canvas>
    </div>
  );
}
