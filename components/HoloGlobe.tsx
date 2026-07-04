"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { Cloud, Rocket } from "lucide-react";

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
  // Campos ao vivo (ACLED) — opcionais para o fallback continuar válido.
  events?: number;       // eventos violentos no período
  fatalities?: number;   // mortes no período
  periodDias?: number;   // janela (30)
  detail?: string;       // rótulo pronto p/ desastres (ex.: "Magnitude 6.2 · sismo")
  source?: string;       // fonte (USGS / NASA EONET / GDELT)
  spots?: string[];      // cidades-foco dentro do país
  headlines?: string[];  // manchetes derivadas das notícias (GDELT)
}

// Reserva caso /api/globe/conflicts não responda (a rota já tem seu próprio
// fallback ACLED→curado; este é o último recurso client-side).
const FALLBACK_CONFLICT_ZONES: ConflictZone[] = [
  { id: "ukraine", name: "Guerra Rússia–Ucrânia", lat: 48.5, lng: 32.0, nearbyMarkets: ["^STOXX50E", "^GDAXI", "^FCHI"] },
  { id: "israel-palestine", name: "Conflito Israel–Palestina", lat: 31.5, lng: 34.8, nearbyMarkets: ["^TA125.TA", "^CASE30"] },
  { id: "sudan", name: "Guerra Civil no Sudão", lat: 15.5, lng: 32.5, nearbyMarkets: ["^CASE30", "^JN0U.JO"] },
  { id: "myanmar", name: "Guerra Civil em Myanmar", lat: 19.8, lng: 96.2, nearbyMarkets: ["^SET.BK", "^STI"] },
  { id: "taiwan-strait", name: "Tensão no Estreito de Taiwan", lat: 24.0, lng: 121.0, nearbyMarkets: ["^TWII", "^HSI", "^N225"] },
  { id: "red-sea", name: "Crise no Mar Vermelho (Houthis)", lat: 14.5, lng: 42.5, nearbyMarkets: ["^CASE30", "^BSESN", "^TA125.TA"] },
];

// O globo mostra só CONFLITOS (protestos/desastres saíram da UI; os motores
// seguem nas libs para virarem filtros). Uma cor, um significado.
const CONFLICT_COLOR = "#ff4444";

// Error boundary de assets: se uma textura falhar (404/rede/CDN fora), o
// pedaço some e a cena segue — SEM isso, qualquer falha de useTexture estoura
// no render e derruba a página inteira ("Application error" do Next).
class SafeVisual extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) {
    console.error("[HoloGlobe] asset falhou — seguindo sem ele:", err);
  }
  render() { return this.state.failed ? null : this.props.children; }
}

type SelectedItem =
  | { type: "market"; data: MarketPoint }
  | { type: "conflict"; data: ConflictZone; nearbyData: MarketPoint[] };

type HoloMode = "off" | "globe" | "sol" | "mercurio" | "venus" | "terra" | "marte" | "jupiter" | "saturno" | "urano" | "netuno" | "blackhole";

interface HoloGlobeProps {
  mode: HoloMode;
  // "imersivo" (padrão): tela cheia, espaço infinito, zoom com limites.
  // "classico": janela compacta com bordas (comportamento antigo).
  variant?: "imersivo" | "classico";
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

// ── Sol real — ponto subsolar (lat/lng onde o Sol está a pino) em UTC ────────
// Astronomia de baixa precisão (±0,1°, sobra para visual): longitude eclíptica
// do Sol → declinação (lat) e, via equação do tempo, a longitude onde o meio-
// dia solar é agora. Posicionar o Sol nessa direção (no MESMO frame geográfico
// dos marcadores) dá o terminador dia/noite correto em tempo real.
function subsolarPoint(now: Date): { lat: number; lng: number } {
  const RAD = Math.PI / 180;
  const d = (now.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000; // dias desde J2000
  const g = (357.528 + 0.9856003 * d) * RAD;                  // anomalia média
  const L = 280.46 + 0.9856474 * d;                           // longitude média (°)
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // long. eclíptica
  const eps = 23.439 * RAD;                                   // obliquidade
  const lat = Math.asin(Math.sin(eps) * Math.sin(lambda)) / RAD; // declinação = lat subsolar
  const alpha = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD; // ascensão reta (°)
  const eot = ((L - alpha) % 360 + 540) % 360 - 180;          // equação do tempo (°)
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  let lng = 15 * (12 - utcH) - eot;                           // long. do meio-dia solar
  lng = ((lng + 540) % 360) - 180;
  return { lat, lng };
}

// ── Lua real — posição de baixa precisão (~1°, sobra para visual) ────────────
// Devolve a direção da Lua no MESMO frame fixo do Sol: lat = declinação e
// refLng = deslocamento de longitude em relação ao Sol (αsol − αlua). Como a
// luz direcional do Sol ilumina a cena toda, a FASE da Lua sai correta de
// graça — lua cheia quando oposta ao Sol, nova quando alinhada.
function moonPoint(now: Date): { lat: number; refLng: number } {
  const RAD = Math.PI / 180;
  const d = (now.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  const eps = 23.439 * RAD;

  // α do Sol (mesmas contas do subsolarPoint)
  const gs = (357.528 + 0.9856003 * d) * RAD;
  const Ls = 280.46 + 0.9856474 * d;
  const lamS = (Ls + 1.915 * Math.sin(gs) + 0.02 * Math.sin(2 * gs)) * RAD;
  const alphaS = Math.atan2(Math.cos(eps) * Math.sin(lamS), Math.cos(lamS)) / RAD;

  // Lua: longitude/latitude eclípticas (termos principais)
  const Lp = 218.316 + 13.176396 * d;   // longitude média
  const Mm = (134.963 + 13.064993 * d) * RAD; // anomalia média
  const F = (93.272 + 13.22935 * d) * RAD;    // argumento da latitude
  const lamM = (Lp + 6.289 * Math.sin(Mm)) * RAD;
  const betM = 5.128 * Math.sin(F) * RAD;

  // Eclíptica → equatorial
  const sinDec = Math.sin(betM) * Math.cos(eps) + Math.cos(betM) * Math.sin(eps) * Math.sin(lamM);
  const lat = Math.asin(sinDec) / RAD;
  const alphaM = Math.atan2(
    Math.sin(lamM) * Math.cos(eps) - Math.tan(betM) * Math.sin(eps),
    Math.cos(lamM),
  ) / RAD;

  const refLng = ((alphaS - alphaM) % 360 + 540) % 360 - 180;
  return { lat, refLng };
}

// ── Planetas reais — efemérides de Kepler de baixa precisão (~0,5°) ──────────
// Elementos orbitais médios J2000 (JPL "approximate positions"):
// [a(UA), e, I°, L0°, L°/século, ϖ°, Ω°]. Posição heliocêntrica → geocêntrica
// (menos a Terra) → equatorial → direção no MESMO frame fixo do Sol/Lua
// (lat = declinação; refLng = αsol − αplaneta).
// Escala de distâncias do sistema: 1 UA = 40 unidades no ponto do Sol, e as
// distâncias geocêntricas seguem √UA (compressão clássica de planetário —
// preserva ordem e proporção relativa; escala linear não cabe: Netuno a 30 UA
// ficaria 1.200 unidades longe). dist = SUN_DIST · √(UA).
const SUN_DIST = 40;
const distForAU = (rAU: number) => SUN_DIST * Math.sqrt(rAU);

const PLANET_ELEMENTS: Record<string, [number, number, number, number, number, number, number]> = {
  mercurio: [0.387098, 0.20563, 7.005, 252.251, 149472.674, 77.457, 48.331],
  venus: [0.723332, 0.006773, 3.395, 181.98, 58517.816, 131.602, 76.68],
  terra: [1.000003, 0.016709, 0.0, 100.464, 35999.372, 102.937, 0.0],
  marte: [1.523679, 0.093394, 1.85, 355.447, 19140.303, 336.06, 49.558],
  jupiter: [5.202887, 0.048386, 1.304, 34.397, 3034.746, 14.728, 100.474],
  saturno: [9.536676, 0.053862, 2.486, 49.954, 1222.494, 92.599, 113.663],
  urano: [19.189165, 0.047257, 0.773, 313.238, 428.482, 170.954, 74.017],
  netuno: [30.069923, 0.00859, 1.77, 304.88, 218.459, 44.965, 131.784],
};

function helioEcliptic(id: string, T: number): [number, number, number] {
  const RAD = Math.PI / 180;
  const [a, e, I0, L0, Ldot, wbar, Om] = PLANET_ELEMENTS[id];
  const L = L0 + Ldot * T;
  const M = ((L - wbar) % 360 + 540) % 360 - 180;
  let E = M * RAD;
  for (let i = 0; i < 6; i++) E = M * RAD + e * Math.sin(E);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = (wbar - Om) * RAD, o = Om * RAD, inc = I0 * RAD;
  const cw = Math.cos(w), sw = Math.sin(w), co = Math.cos(o), so = Math.sin(o), ci = Math.cos(inc), si = Math.sin(inc);
  return [
    (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
    (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
    (sw * si) * xp + (cw * si) * yp,
  ];
}

/** Direção geocêntrica do planeta no frame fixo do Sol + distância em UA. */
function planetPoint(id: string, now: Date): { lat: number; refLng: number; rAU: number } {
  const RAD = Math.PI / 180;
  const d = (now.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  const T = d / 36_525;
  const [px, py, pz] = helioEcliptic(id, T);
  const [ex, ey, ez] = helioEcliptic("terra", T);
  const gx = px - ex, gy = py - ey, gz = pz - ez;      // geocêntrico (eclíptica)
  const rAU = Math.hypot(gx, gy, gz);
  const eps = 23.439 * RAD;
  const yeq = gy * Math.cos(eps) - gz * Math.sin(eps); // eclíptica → equatorial
  const zeq = gy * Math.sin(eps) + gz * Math.cos(eps);
  const alphaP = Math.atan2(yeq, gx) / RAD;
  const lat = Math.asin(zeq / rAU) / RAD;
  // α do Sol (mesma conta do subsolarPoint) para ancorar no frame da cena.
  const gs = (357.528 + 0.9856003 * d) * RAD;
  const Ls = 280.46 + 0.9856474 * d;
  const lamS = (Ls + 1.915 * Math.sin(gs) + 0.02 * Math.sin(2 * gs)) * RAD;
  const alphaS = Math.atan2(Math.cos(eps) * Math.sin(lamS), Math.cos(lamS)) / RAD;
  const refLng = ((alphaS - alphaP) % 360 + 540) % 360 - 180;
  return { lat, refLng, rAU };
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
const WATER_TEX = "https://unpkg.com/three-globe@2.41.12/example/img/earth-water.png";
const NIGHT_TEX = "https://unpkg.com/three-globe@2.41.12/example/img/earth-night.jpg";
// Nuvens estáticas (acervo clássico de demos three.js — branco sobre preto,
// serve de map E alphaMap). Só entram quando a textura VIVA não carrega —
// a imagem do GIBS já traz as nuvens reais do dia embutidas.
const CLOUDS_TEX = "https://raw.githubusercontent.com/turban/webgl-earth/master/images/fair_clouds_4k.png";

// Camada do satélite do dia COMPOSTA sobre o blue marble: o mosaico diário tem
// buracos (faixas sem passagem do satélite, noite polar) — em vez de trocar a
// textura inteira (buraco = mancha preta), o shader deixa TRANSPARENTE onde não
// há dado (revela o blue marble) e esmaece no lado noturno (revela as luzes de
// cidade). Iluminação lambertiana pela mesma direção do Sol da cena.
function LiveOverlay({ radius, map, sunDirRef }: { radius: number; map: THREE.Texture; sunDirRef?: React.MutableRefObject<THREE.Vector3> }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      void main() {
        vec3 c = texture2D(uMap, vUv).rgb;
        // Sem dado (preto) → transparente: o blue marble aparece por baixo.
        float data = smoothstep(0.02, 0.07, max(c.r, max(c.g, c.b)));
        float sun = dot(vWorldNormal, uSunDir);
        // No lado noturno o satélite some (revela as luzes de cidade da base).
        float dayside = smoothstep(-0.05, 0.3, sun);
        float lambert = 0.12 + 1.05 * max(sun, 0.0);
        gl_FragColor = vec4(c * min(lambert, 1.15), data * dayside);
      }
    `,
    transparent: true,
    depthWrite: false,
  }), [map]);

  useFrame(() => {
    if (sunDirRef) mat.uniforms.uSunDir.value.copy(sunDirRef.current);
  });
  useEffect(() => () => { mat.dispose(); }, [mat]);

  return (
    <mesh scale={[1.001, 1.001, 1.001]}>
      <sphereGeometry args={[radius, 96, 96]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

// `liveClouds`: camada de nuvens/satélite do dia LIGADA (padrão). Desligada →
// blue marble limpo, sem casca de nuvens. As texturas seguem carregadas; o
// toggle é instantâneo.
function EarthSphere({ radius, night = false, liveClouds = true, sunDirRef }: { radius: number; night?: boolean; liveClouds?: boolean; sunDirRef?: React.MutableRefObject<THREE.Vector3> }) {
  // `night` (imersivo): luzes de cidade como emissivo — brilham onde o Sol não
  // alcança. A lista de texturas muda com a variante, mas a variante nunca muda
  // com a cena montada (o Canvas remonta ao trocar de estilo).
  const textures = useTexture(night ? [EARTH_TEX, BUMP_TEX, WATER_TEX, NIGHT_TEX] : [EARTH_TEX, BUMP_TEX, WATER_TEX]);
  const [color, bump, water, nightMap] = textures;
  useMemo(() => {
    for (const t of textures) t.anisotropy = 8;
  }, [textures]);

  // "A Terra de hoje": mosaico diário de satélite (NASA GIBS via nossa API,
  // nuvens/tempestades reais do dia). Carregamento FORA do Suspense: falhou →
  // fica o blue marble + nuvens estáticas, sem drama. Só no imersivo.
  const [liveMap, setLiveMap] = useState<THREE.Texture | null>(null);
  const [clouds, setClouds] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!night) return;
    let dead = false;
    const loader = new THREE.TextureLoader();
    loader.load("/api/globe/earth-today", t => {
      if (dead) { t.dispose(); return; }
      // SEM marcar sRGB: o overlay usa ShaderMaterial cru (sem re-encode de
      // saída) — deixar os valores passarem direto exibe as cores corretas.
      t.anisotropy = 8;
      setLiveMap(t);
    }, undefined, () => { /* sem live hoje — segue o blue marble */ });
    loader.load(CLOUDS_TEX, t => {
      if (dead) { t.dispose(); return; }
      t.anisotropy = 4;
      setClouds(t);
    }, undefined, () => { /* sem nuvens estáticas — segue sem */ });
    return () => { dead = true; };
  }, [night]);
  useEffect(() => () => { liveMap?.dispose(); }, [liveMap]);
  useEffect(() => () => { clouds?.dispose(); }, [clouds]);

  return (
    <group>
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
          emissiveMap={night ? nightMap : undefined}
          emissive={night ? "#ffffff" : "#000000"}
          emissiveIntensity={night ? 0.95 : 0}
        />
      </mesh>

      {/* Satélite do dia composto por cima (buracos ficam transparentes) */}
      {night && liveClouds && liveMap && (
        <LiveOverlay radius={radius} map={liveMap} sunDirRef={sunDirRef} />
      )}

      {/* Nuvens estáticas — casca fina acima da superfície, iluminada pelo
          mesmo Sol (some no lado noturno). Ocultas quando o live está ativo
          (as nuvens reais já vêm na imagem do dia). */}
      {night && liveClouds && clouds && !liveMap && (
        <mesh scale={[1.012, 1.012, 1.012]}>
          <sphereGeometry args={[radius, 64, 64]} />
          <meshStandardMaterial
            map={clouds}
            alphaMap={clouds}
            transparent
            opacity={0.85}
            depthWrite={false}
            roughness={1}
            metalness={0}
          />
        </mesh>
      )}
    </group>
  );
}

// ── Atmosphere glow ──────────────────────────────────────────────────────────

// Com Sol real (sunDirRef), a atmosfera clareia no lado iluminado e quase some
// no lado noturno — um halo uniforme denunciaria que a luz é fake.
function Atmosphere({ radius, sunDirRef }: { radius: number; sunDirRef?: React.MutableRefObject<THREE.Vector3> }) {
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: new THREE.Vector3(1, 0, 0) },
        uReal: { value: sunDirRef ? 1 : 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform float uReal;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        void main() {
          float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          float day = mix(1.0, 0.18 + 0.95 * smoothstep(-0.25, 0.55, dot(vWorldNormal, uSunDir)), uReal);
          vec3 atmosphere = vec3(0.3, 0.6, 1.0) * intensity * day;
          gl_FragColor = vec4(atmosphere, intensity * 0.65 * day);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(() => {
    if (sunDirRef) mat.uniforms.uSunDir.value.copy(sunDirRef.current);
  });

  return (
    <mesh scale={[1.12, 1.12, 1.12]}>
      <sphereGeometry args={[radius, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

// ── Espaço imersivo — estrelas, Via Láctea, nebulosas e poeira ───────────────
//
// O globo deixa de ser um objeto "numa caixa": a cena é um pedaço de espaço.
// Tudo procedural (zero texturas externas): estrelas são THREE.Points com
// shader próprio (disco suave + cintilação por fase), a Via Láctea é uma banda
// inclinada de estrelas + brilhos alongados, as nebulosas são sprites aditivos
// de gradiente radial e a poeira PRÓXIMA da câmera dá paralaxe real ao zoom —
// é ela que vende a sensação de atravessar o espaço ao mergulhar até a Terra.

const STAR_VERT = `
  attribute float aSize;
  attribute float aPhase;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPhase;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vPhase = aPhase;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (450.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_FRAG = `
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPhase;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float disc = smoothstep(0.5, 0.08, d);
    float tw = 0.72 + 0.28 * sin(uTime * (0.4 + fract(vPhase * 7.31) * 1.8) + vPhase * 6.2831);
    float a = disc * vAlpha * tw;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

// Aproximação de gaussiana (soma de uniformes) — espalhamento natural da banda.
function gauss(): number {
  return Math.random() + Math.random() + Math.random() - 1.5;
}

type StarKind = "sky" | "band" | "dust";

function buildStarGeometry(count: number, kind: StarKind): THREE.BufferGeometry {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const alpha = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    let x = 0, y = 0, z = 0;
    if (kind === "band") {
      // Anel no plano XZ com espalhamento gaussiano — vira a Via Láctea quando
      // o grupo é inclinado.
      const ang = Math.random() * Math.PI * 2;
      const r = 150 + Math.random() * 55;
      x = Math.cos(ang) * r + gauss() * 7;
      y = gauss() * 11;
      z = Math.sin(ang) * r + gauss() * 7;
    } else {
      // Esfera uniforme: céu distante (42–75) ou casca de poeira próxima (2.5–9).
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = kind === "dust" ? 2.5 + Math.random() * 6.5 : 135 + Math.random() * 105;
      x = s * Math.cos(t) * r;
      y = u * r;
      z = s * Math.sin(t) * r;
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;

    // Cor: maioria branca, ~22% azuladas, ~10% quentes (gigantes vermelhas).
    const roll = Math.random();
    let cr = 1, cg = 1, cb = 1;
    if (kind === "dust") { cr = 0.66; cg = 0.75; cb = 0.85; }
    else if (roll < 0.1) { cr = 1; cg = 0.82; cb = 0.62; }
    else if (roll < 0.32) { cr = 0.74; cg = 0.85; cb = 1; }
    else { const j = 0.92 + Math.random() * 0.08; cr = j; cg = j; cb = 1; }
    col[i * 3] = cr; col[i * 3 + 1] = cg; col[i * 3 + 2] = cb;

    if (kind === "sky") {
      const bright = Math.random() < 0.06;
      size[i] = bright ? 2.4 + Math.random() * 1.3 : 0.5 + Math.random() * 1.4;
      alpha[i] = 0.25 + Math.pow(Math.random(), 1.6) * 0.75;
    } else if (kind === "band") {
      size[i] = 0.4 + Math.random() * 0.9;
      alpha[i] = 0.14 + Math.random() * 0.42;
    } else {
      size[i] = 0.016 + Math.random() * 0.027;
      alpha[i] = 0.1 + Math.random() * 0.16;
    }
    phase[i] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  return geo;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.3, "rgba(255,255,255,0.28)");
  g.addColorStop(0.7, "rgba(255,255,255,0.06)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}


// Céu REAL de fundo: panorama estelar equiretangular (Via Láctea de verdade),
// numa esfera gigante vista por dentro. As estrelas procedurais ficam POR CIMA
// só para dar cintilação e profundidade; a banda/nebulosas fake saíram — o
// panorama já traz as de verdade.
const SKY_TEX = "https://unpkg.com/three-globe@2.41.12/example/img/night-sky.png";

function SkySphere() {
  const tex = useTexture(SKY_TEX);
  useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
  }, [tex]);
  return (
    <mesh scale={[-1, 1, 1]} renderOrder={-2}>
      <sphereGeometry args={[320, 48, 48]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

function SpaceEnvironment() {
  const starMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  const skyGeo = useMemo(() => buildStarGeometry(1400, "sky"), []);
  const dustGeo = useMemo(() => buildStarGeometry(160, "dust"), []);

  useEffect(() => () => {
    skyGeo.dispose(); dustGeo.dispose(); starMat.dispose();
  }, [skyGeo, dustGeo, starMat]);

  useFrame(({ clock }) => {
    // Só a cintilação anima; o CÉU FICA PARADO — no modelo físico (Sol fixo,
    // Terra girando 1 volta/24h) as estrelas não orbitam a Terra.
    starMat.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <group>
      {/* Se o panorama falhar, as estrelas procedurais seguram o fundo */}
      <SafeVisual>
        <React.Suspense fallback={null}>
          <SkySphere />
        </React.Suspense>
      </SafeVisual>
      <points geometry={skyGeo} material={starMat} />
      <points geometry={dustGeo} material={starMat} />
    </group>
  );
}

// ── Lua ──────────────────────────────────────────────────────────────────────
// Companheira do globo: posição real (moonPoint) no mesmo frame fixo do Sol, e
// como quem ilumina é a MESMA luz direcional do Sol, a fase aparece correta
// (cheia oposta ao Sol, nova alinhada). Escala cinematográfica: proporção real
// de tamanho (0,27×Terra), distância comprimida para caber na cena.
//
// Textura em CASCATA (a 1ª aposta 404ou em produção e a Lua sumia): tenta cada
// fonte em ordem; se TODAS falharem, a Lua aparece mesmo assim como esfera
// cinza-lunar lisa — posição e fase continuam reais. Nunca mais "sem Lua".
const MOON_TEXES = [
  "https://unpkg.com/three-globe@2.41.12/example/img/lunar_surface.jpg",
  "https://cdn.jsdelivr.net/npm/three-globe@2.41.12/example/img/lunar_surface.jpg",
  "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg",
];
const MOON_DIST = 12;

function Moon({ anchorRef }: { anchorRef: React.RefObject<THREE.Group> }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let dead = false;
    const loader = new THREE.TextureLoader();
    const tryLoad = (i: number) => {
      if (dead || i >= MOON_TEXES.length) return;
      loader.load(
        MOON_TEXES[i],
        t => {
          if (dead) { t.dispose(); return; }
          t.anisotropy = 8;
          setTex(t);
        },
        undefined,
        () => tryLoad(i + 1),
      );
    };
    tryLoad(0);
    return () => { dead = true; };
  }, []);
  useEffect(() => () => { tex?.dispose(); }, [tex]);

  return (
    <group ref={anchorRef} position={[MOON_DIST, 0, -4]}>
      <mesh>
        <sphereGeometry args={[0.27, 48, 48]} />
        {tex ? (
          <meshStandardMaterial map={tex} roughness={1} metalness={0} />
        ) : (
          <meshStandardMaterial color="#9a968f" roughness={1} metalness={0} />
        )}
      </mesh>
    </group>
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
  const isLive = point.price > 0;
  const hex = useMemo(() => isLive ? heatHex(point.changePct) : "#555555", [point.changePct, isLive]);
  const col = useMemo(() => new THREE.Color(hex), [hex]);
  const intensity = isLive ? Math.min(Math.abs(point.changePct), 5) : 0;
  const baseScale = isLive ? 0.022 + intensity * 0.004 : 0.016;

  const beamHeight = isLive ? 0.03 + intensity * 0.016 : 0.015;
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
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = isSelected ? 0.15 : isLive ? 0.07 : 0.03;
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
        <meshBasicMaterial color={col} transparent opacity={isLive ? 0.3 : 0.12} blending={THREE.AdditiveBlending} />
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
  color,
  onSelect,
}: {
  zone: ConflictZone;
  radius: number;
  isSelected: boolean;
  color: string;
  onSelect: (z: ConflictZone) => void;
}) {
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => latLngToVec3(zone.lat, zone.lng, radius), [zone.lat, zone.lng, radius]);
  const warColor = useMemo(() => new THREE.Color(color), [color]);

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

// ── Controle livre (imersivo) — arcball sem trava de polo ────────────────────
// O OrbitControls prende a rotação nos polos e engessa o giro. Este controle
// gira a câmera em QUALQUER direção (dá pra passar por cima dos polos; o roll
// emerge naturalmente), com inércia ao soltar, pinch para zoom no touch,
// velocidade adaptativa ao zoom e duplo-clique/toque para endireitar o norte.
function FreeOrbit({ minDist, maxDist, onUserStart }: { minDist: number; maxDist: number; onUserStart?: () => void }) {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });      // inércia angular (px suavizados)
  const zoomVel = useRef(0);               // zoom suave (fração por frame)
  const pinchDist = useRef<number | null>(null);

  const rotateBy = useCallback((dxPx: number, dyPx: number) => {
    // Ângulo por pixel adaptado ao zoom: rasante gira fino, longe gira rápido.
    const dist = camera.position.length();
    const speed = 0.0045 * THREE.MathUtils.clamp(dist / 4, 0.4, 1.5);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    const q = new THREE.Quaternion().setFromAxisAngle(up, -dxPx * speed)
      .multiply(new THREE.Quaternion().setFromAxisAngle(right, -dyPx * speed));
    camera.position.applyQuaternion(q);
    camera.up.applyQuaternion(q);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
    const pts = new Map<number, { x: number; y: number }>();

    const onDown = (e: PointerEvent) => {
      onUserStart?.();
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        dragging.current = true;
        last.current = { x: e.clientX, y: e.clientY };
        vel.current = { x: 0, y: 0 };
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        // Pinch → zoom
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist.current != null && d > 0) zoomVel.current += (pinchDist.current - d) * 0.0035;
        pinchDist.current = d;
        dragging.current = false;
        return;
      }
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      rotateBy(dx, dy);
      // Última amostra (suavizada) vira a inércia do soltar.
      vel.current = { x: vel.current.x * 0.4 + dx * 0.6, y: vel.current.y * 0.4 + dy * 0.6 };
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinchDist.current = null;
      if (pts.size === 0) dragging.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      onUserStart?.();
      zoomVel.current += e.deltaY * 0.0011;
    };
    const onDbl = () => {
      // Endireita o norte (remove o roll acumulado do giro livre).
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDbl);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDbl);
    };
  }, [gl, camera, rotateBy, onUserStart]);

  useFrame((_, delta) => {
    // Inércia do giro — decai suavemente após soltar.
    if (!dragging.current && Math.abs(vel.current.x) + Math.abs(vel.current.y) > 0.02) {
      rotateBy(vel.current.x, vel.current.y);
      const f = Math.exp(-3.0 * delta);
      vel.current.x *= f;
      vel.current.y *= f;
    }
    // Zoom suave com limites.
    if (Math.abs(zoomVel.current) > 1e-4) {
      const dist = camera.position.length();
      const next = THREE.MathUtils.clamp(dist * (1 + zoomVel.current), minDist, maxDist);
      camera.position.multiplyScalar(next / dist);
      zoomVel.current *= Math.exp(-7 * delta);
    }
  });

  return null;
}

// ── Voo livre — a câmera vira uma nave ───────────────────────────────────────
// Desacopla da órbita: arrastar OLHA ao redor (a Terra pode sair do centro),
// scroll/pinça AVANÇA/RECUA na direção do olhar, com deriva e inércia. Duplo
// clique/toque mira a Terra de volta. Limites: não entra na Terra (1.15) nem
// foge do universo (70). Ao SAIR do modo, a câmera volta ao regime de órbita
// (distância clampada, norte endireitado, mirando a Terra).
function FreeFly({ onUserStart }: { onUserStart?: () => void }) {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const lookVel = useRef({ x: 0, y: 0 });
  const speed = useRef(0); // unidades/s (+ frente, − ré)
  const pinchDist = useRef<number | null>(null);

  const lookBy = useCallback((dxPx: number, dyPx: number) => {
    camera.rotateY(-dxPx * 0.0021);
    camera.rotateX(-dyPx * 0.0021);
  }, [camera]);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
    const pts = new Map<number, { x: number; y: number }>();

    const onDown = (e: PointerEvent) => {
      onUserStart?.();
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        dragging.current = true;
        last.current = { x: e.clientX, y: e.clientY };
        lookVel.current = { x: 0, y: 0 };
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        // Pinça: abrir acelera pra frente, fechar dá ré.
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist.current != null) speed.current += (d - pinchDist.current) * 0.02;
        pinchDist.current = d;
        dragging.current = false;
        return;
      }
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      lookBy(dx, dy);
      lookVel.current = { x: lookVel.current.x * 0.4 + dx * 0.6, y: lookVel.current.y * 0.4 + dy * 0.6 };
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinchDist.current = null;
      if (pts.size === 0) dragging.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      onUserStart?.();
      speed.current = THREE.MathUtils.clamp(speed.current - e.deltaY * 0.004, -18, 18);
    };
    const onDbl = () => {
      // "Onde está a Terra?" — mira de volta.
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDbl);
    const cam = camera;
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDbl);
      // Reentrada na órbita: volta para o envelope do FreeOrbit.
      const dist = THREE.MathUtils.clamp(cam.position.length(), 1.25, 7.5);
      cam.position.setLength(dist);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
    };
  }, [gl, camera, lookBy, onUserStart]);

  useFrame((_, delta) => {
    // Inércia do olhar.
    if (!dragging.current && Math.abs(lookVel.current.x) + Math.abs(lookVel.current.y) > 0.02) {
      lookBy(lookVel.current.x, lookVel.current.y);
      const f = Math.exp(-3.0 * delta);
      lookVel.current.x *= f;
      lookVel.current.y *= f;
    }
    // Deslocamento na direção do olhar, com deriva (decai devagar — "nave").
    if (Math.abs(speed.current) > 0.005) {
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      camera.position.addScaledVector(fwd, speed.current * delta);
      speed.current *= Math.exp(-1.1 * delta);
      const len = camera.position.length();
      if (len < 1.15) camera.position.setLength(1.15); // não entra na Terra
      if (len > 260) camera.position.setLength(260);   // não foge do universo (Netuno fica a ~218)
    }
  });

  return null;
}

// ── Scene ────────────────────────────────────────────────────────────────────

// Abertura cinematográfica em "pull-back": a Terra nasce mais perto e RECUA
// até o zoom-out máximo — o globo abre pequeno, jogado no meio das estrelas
// (e o gesto já ensina que dá pra mergulhar). Qualquer input assume na hora.
const INTRO_FROM = new THREE.Vector3(0.4, 0.6, 4.6);
const INTRO_TO = new THREE.Vector3(0, 0, 7.45);

function GlobeScene({ markets, conflicts, onSelect, classic = false, liveClouds = true, freeFly = false }: { markets: MarketPoint[]; conflicts: ConflictZone[]; onSelect: (item: SelectedItem | null) => void; classic?: boolean; liveClouds?: boolean; freeFly?: boolean }) {
  const R = 1;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  // Clássico: sem intro (câmera fixa em 3.2, como era antes).
  const introDone = useRef(
    classic ||
    (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true),
  );

  useEffect(() => {
    if (!introDone.current) {
      camera.position.copy(INTRO_FROM);
      camera.lookAt(0, 0, 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ativar o voo livre no meio do intro assume o controle na hora.
  useEffect(() => {
    if (freeFly) introDone.current = true;
  }, [freeFly]);

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

  // Sol real (imersivo) — modelo FÍSICO: o Sol fica PARADO no mundo e a TERRA
  // gira 1 volta a cada 24h (real; ~0,004°/s — sem movimento visível, como na
  // vida). O Sol vive fora do grupo de rotação, numa longitude de referência
  // fixa (0 → direção +x); o ângulo da Terra é ABSOLUTO, derivado do ponto
  // subsolar: rotation.y = −lngSubsolar. Assim o meridiano do meio-dia sempre
  // encara o Sol, o terminador fica exato e a rotação real vem de graça
  // (a longitude subsolar anda 15°/h). A declinação sazonal vira a altura do
  // Sol (lat na longitude de referência).
  const RAD = Math.PI / 180;
  const sunAnchorRef = useRef<THREE.Group>(null);
  const fillAnchorRef = useRef<THREE.Group>(null);
  const moonAnchorRef = useRef<THREE.Group>(null);
  const sunDirWorld = useRef(new THREE.Vector3(1, 0, 0));
  const lastSunUpdate = useRef(-Infinity);
  const sunGlowTex = useMemo(makeGlowTexture, []);
  useEffect(() => () => { sunGlowTex.dispose(); }, [sunGlowTex]);

  useFrame(({ clock }, delta) => {
    if (classic) {
      // Clássico mantém o giro estético de antes.
      if (groupRef.current) {
        groupRef.current.rotation.y += delta * (selectedId ? 0.015 : 0.06);
      }
    } else if (sunAnchorRef.current && groupRef.current) {
      // Recalcular a cada 10s basta: a Terra anda 0,04° nesse intervalo.
      if (clock.elapsedTime - lastSunUpdate.current > 10) {
        lastSunUpdate.current = clock.elapsedTime;
        const now = new Date();
        const { lat, lng } = subsolarPoint(now);
        groupRef.current.rotation.y = -lng * RAD;                       // Terra: ângulo real
        sunAnchorRef.current.position.copy(latLngToVec3(lat, 0, SUN_DIST));       // Sol fixo
        fillAnchorRef.current?.position.copy(latLngToVec3(-lat, 180, SUN_DIST));  // anti-sol
        if (moonAnchorRef.current) {
          const m = moonPoint(now);
          moonAnchorRef.current.position.copy(latLngToVec3(m.lat, m.refLng, MOON_DIST));
          moonAnchorRef.current.lookAt(0, 0, 0); // face travada para a Terra
        }
      }
      // Direção do Sol no mundo (p/ a atmosfera).
      sunAnchorRef.current.getWorldPosition(sunDirWorld.current).normalize();
    }
    if (!introDone.current) {
      camera.position.lerp(INTRO_TO, 1 - Math.exp(-2.2 * delta));
      // Re-mira na Terra a CADA frame do intro: o OrbitControls só corrige o
      // lookAt quando há interação — sem isso o globo estaciona fora do centro.
      camera.lookAt(0, 0, 0);
      if (camera.position.distanceTo(INTRO_TO) < 0.05) {
        camera.position.copy(INTRO_TO);
        camera.lookAt(0, 0, 0);
        introDone.current = true;
      }
    }
  });

  return (
    <>
      {classic ? (
        <>
          <ambientLight intensity={1.0} />
          <directionalLight position={[5, 3, 5]} intensity={1.8} color="#fffdf0" />
          <directionalLight position={[-3, -1, -4]} intensity={0.5} color="#a0c4ff" />
          <directionalLight position={[0, 5, 0]} intensity={0.3} color="#ffffff" />
        </>
      ) : (
        // Imersivo: quem ilumina é o SOL (na âncora subsolar). Ambiente mínimo
        // para o lado noturno não virar breu total — as luzes de cidade
        // (emissiveMap) fazem o resto.
        <ambientLight intensity={0.12} />
      )}

      {!classic && <SpaceEnvironment />}

      {/* Inclinação axial real da Terra (23,4°) — só no imersivo; o clássico
          gira reto, como era antes. */}
      <group rotation={[0, 0, classic ? 0 : -0.41]}>
        {/* Sol e "luar" FORA do grupo que gira: o Sol fica parado no mundo
            enquanto a Terra roda dentro (1 volta/24h, tempo real). */}
        {!classic && (
          <>
            {/* O Sol: corpo REAL do easter egg (superfície de plasma + coroa)
                + halos aditivos + a luz principal, na direção subsolar */}
            <group ref={sunAnchorRef} position={[SUN_DIST, 0, 0]}>
              <directionalLight intensity={2.6} color="#fff3d6" />
              <group scale={[3.2, 3.2, 3.2]}>
                <SunSurface />
                <SunCorona />
              </group>
              <sprite scale={[30, 30, 1]}>
                <spriteMaterial map={sunGlowTex} color="#ff9a3d" transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} />
              </sprite>
              <sprite scale={[12, 12, 1]}>
                <spriteMaterial map={sunGlowTex} color="#ffca66" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
              </sprite>
            </group>

            {/* Os planetas — nas direções reais de agora (Kepler) */}
            <SolarSystem />
            {/* "Luar": preenchimento azulado fraquíssimo vindo do anti-sol.
                Mais fraco que antes: a noite escura faz as luzes de cidade
                brilharem de verdade. */}
            <group ref={fillAnchorRef} position={[-SUN_DIST, 0, 0]}>
              <directionalLight intensity={0.1} color="#7d95c9" />
            </group>

            {/* A Lua — posição e fase reais. Carregamento próprio em cascata:
                sem textura, vira esfera cinza-lunar — mas SEMPRE aparece. */}
            <Moon anchorRef={moonAnchorRef} />
          </>
        )}

        <group ref={groupRef}>
          <EarthSphere radius={R} night={!classic} liveClouds={liveClouds} sunDirRef={classic ? undefined : sunDirWorld} />
          <Atmosphere radius={R} sunDirRef={classic ? undefined : sunDirWorld} />

          {markets.filter(m => m.symbol !== "^VIX").map(m => (
            <MarkerPoint
              key={m.symbol}
              point={m}
              radius={R + 0.005}
              isSelected={selectedId === m.symbol}
              onSelect={handleSelectMarket}
            />
          ))}

          {conflicts.map(z => (
            <ConflictMarker
              key={z.id}
              zone={z}
              color={CONFLICT_COLOR}
              radius={R + 0.005}
              isSelected={selectedId === z.id}
              onSelect={handleSelectConflict}
            />
          ))}
        </group>
      </group>

      {/* Imersivo: órbita livre (arcball) ou VOO LIVRE (nave), conforme o
          toggle do HUD. Clássico: OrbitControls de sempre. */}
      {classic ? (
        <OrbitControls
          enableZoom
          enablePan={false}
          minDistance={1.5}
          maxDistance={3.5}
          enableDamping
          dampingFactor={0.06}
          rotateSpeed={0.4}
          zoomSpeed={0.5}
          onStart={() => { introDone.current = true; }}
        />
      ) : freeFly ? (
        <FreeFly onUserStart={() => { introDone.current = true; }} />
      ) : (
        <FreeOrbit minDist={1.25} maxDist={7.5} onUserStart={() => { introDone.current = true; }} />
      )}
    </>
  );
}

// ── Info card (outside canvas, next to globe) ────────────────────────────────

function MarketInfoCard({ point }: { point: MarketPoint }) {
  const live = point.price > 0;
  const hex = live ? heatHex(point.changePct) : "#555555";
  const isUp = point.changePct >= 0;

  return (
    <a
      href={`/radar?symbol=${encodeURIComponent(point.symbol)}`}
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
      {live ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-extrabold text-white font-mono">{fmtPrice(point.price)}</span>
            {point.currency && <span className="text-[8px] text-zinc-500">{point.currency}</span>}
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[12px] font-extrabold font-mono" style={{ color: hex }}>
              {isUp ? "+" : ""}{point.changePct.toFixed(2)}%
            </span>
          </div>
        </>
      ) : (
        <div className="mt-0.5">
          <span className="text-[10px] text-zinc-500 font-mono">Sem dados ao vivo</span>
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[8px] text-zinc-600">{point.country}</p>
        <span className="text-[7px] text-zinc-600 font-semibold uppercase tracking-wider">Ver detalhes →</span>
      </div>
    </a>
  );
}

function ConflictInfoCard({ zone, nearbyMarkets }: { zone: ConflictZone; nearbyMarkets: MarketPoint[] }) {
  const col = CONFLICT_COLOR;
  const kind = "Conflito Ativo";
  // Pergunta enxuta para a IA do sistema: explicar de forma sintética e precisa
  // o que está acontecendo. (Voltamos do Gemini porque lá exigiria o dono digitar
  // /enviar; aqui a pergunta já dispara sozinha.) Cidades-foco entram no contexto.
  const ctxParts = [
    zone.spots?.length ? `focos em ${zone.spots.join(", ")}` : "",
    zone.detail ?? "",
  ].filter(Boolean);
  const ctx = ctxParts.length > 0 ? ` (${ctxParts.join("; ")})` : "";
  const question = `Explique de forma sintética e precisa o que está acontecendo agora: ${zone.name}${ctx}.`;

  return (
    <a
      href={`/agente-ia?q=${encodeURIComponent(question)}`}
      className="animate-card-in rounded-xl px-3.5 py-2.5 w-full max-w-[220px] block cursor-pointer transition-all duration-200 hover:brightness-125"
      style={{
        background: "rgba(13,14,20,0.92)",
        border: `1px solid ${col}4d`,
        boxShadow: `0 0 20px ${col}1a, 0 4px 16px rgba(0,0,0,0.5)`,
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span style={{ width: 6, height: 6, borderRadius: 999, background: col, display: "inline-block" }} />
        <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: col }}>{kind}</span>
      </div>
      <p className="text-[12px] font-bold text-white leading-snug mb-1">{zone.name}</p>
      {zone.detail ? (
        <p className="text-[9px] font-mono mb-1.5" style={{ color: `${col}cc` }}>
          {zone.detail}
          {zone.source && <span className="text-zinc-600"> · {zone.source}</span>}
        </p>
      ) : zone.events != null ? (
        <p className="text-[9px] font-mono mb-1.5" style={{ color: `${col}cc` }}>
          {zone.events} menções · {zone.periodDias ?? 7}d
          <span className="text-zinc-600"> · GDELT</span>
        </p>
      ) : null}

      {/* O que está acontecendo, de fato: cidades-foco + manchetes das notícias */}
      {zone.spots && zone.spots.length > 0 && (
        <p className="text-[9px] text-zinc-300 mb-1 leading-snug">
          <span className="text-zinc-500">Focos:</span> {zone.spots.join(" · ")}
        </p>
      )}
      {zone.headlines && zone.headlines.length > 0 && (
        <div className="mb-2 flex flex-col gap-0.5">
          {zone.headlines.map((h, i) => (
            <p key={i} className="text-[8px] text-zinc-400 leading-snug">▸ {h}</p>
          ))}
        </div>
      )}

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

      <div className="flex items-center justify-center gap-1.5 pt-1.5" style={{ borderTop: `1px solid ${col}26` }}>
        <span className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: `${col}b3` }}>Perguntar à IA →</span>
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

// ── Sistema solar no espaço imersivo ─────────────────────────────────────────
// Reusa os corpos celestes dos easter eggs (superfícies procedurais) e os
// posiciona nas DIREÇÕES REAIS de agora (planetPoint — Kepler geocêntrico, no
// mesmo frame fixo do Sol/Lua). Distância comprimida em escala log (entre a
// Lua/12 e o céu/42); tamanhos cinematográficos. Voe até eles no modo 🚀.
const SOLAR_BODIES: { id: string; scale: number; tilt?: [number, number, number]; node: React.ReactNode }[] = [
  { id: "mercurio", scale: 0.5, node: <MercurySurface /> },
  { id: "venus", scale: 0.55, node: <><VenusSurface /><VenusAtmosphere /></> },
  { id: "marte", scale: 0.6, node: <><MarsSurface /><MarsAtmosphere /></> },
  { id: "jupiter", scale: 0.9, node: <JupiterSurface /> },
  { id: "saturno", scale: 0.9, tilt: [0.4, 0, -0.1], node: <><SaturnBody /><SaturnRings /></> },
  { id: "urano", scale: 0.6, tilt: [1.71, 0, 0.2], node: <><UranusBody /><UranusAtmosphere /><UranusRings /></> },
  { id: "netuno", scale: 0.6, node: <><NeptuneSurface /><NeptuneAtmosphere /></> },
];

function SolarSystem() {
  // Direções geocêntricas calculadas na montagem (drift < 1°/dia — estático
  // durante a sessão é fiel o bastante). Distância em escala √UA coerente com
  // o Sol: da Terra os planetas são pontinhos (como no céu real) que crescem
  // quando você voa até eles.
  const items = useMemo(() => {
    const now = new Date();
    return SOLAR_BODIES.map(b => {
      const { lat, refLng, rAU } = planetPoint(b.id, now);
      return { ...b, pos: latLngToVec3(lat, refLng, distForAU(rAU)) };
    });
  }, []);

  return (
    <>
      {items.map(p => (
        <group key={p.id} position={p.pos}>
          <group scale={[p.scale, p.scale, p.scale]} rotation={p.tilt ?? [0, 0, 0]}>
            {p.node}
          </group>
        </group>
      ))}
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

// Legenda dos dois tipos de ponto do globo: conflitos (vermelho, GDELT) e
// bolsas (pontos coloridos pelo dia do índice). Cada indicador com nome.
function ConflictLegend({ count }: { count: number }) {
  return (
    <div
      className="flex items-center gap-1"
      style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".04em", color: CONFLICT_COLOR }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 999, background: CONFLICT_COLOR, boxShadow: `0 0 4px ${CONFLICT_COLOR}` }} />
      Conflitos ao vivo
      {count > 0 && <span style={{ opacity: 0.65 }}>·{count}</span>}
    </div>
  );
}

function MarketHeatLegend() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold tracking-[.04em] text-zinc-400">Bolsas</span>
      <span className="text-[8px] font-semibold text-red-400/60">-4%</span>
      <div style={{ width: 44, height: 3, borderRadius: 4, background: "linear-gradient(90deg, #ef4444, #facc15, #22c55e)", opacity: 0.5 }} />
      <span className="text-[8px] font-semibold text-emerald-400/60">+4%</span>
    </div>
  );
}

export default function HoloGlobe({ mode, variant = "imersivo" }: HoloGlobeProps) {
  const classic = variant === "classico";
  // Nuvens/satélite do dia: toggle discreto no HUD, preferência lembrada.
  // DESLIGADO por padrão (pedido do dono) — só liga quem escolheu ("1").
  const [cloudsOn, setCloudsOn] = useState(false);
  useEffect(() => {
    setCloudsOn(window.localStorage.getItem("holoCloudsOn") === "1");
  }, []);
  const toggleClouds = useCallback(() => {
    setCloudsOn(v => {
      const next = !v;
      try { window.localStorage.setItem("holoCloudsOn", next ? "1" : "0"); } catch { /* sem storage */ }
      return next;
    });
  }, []);
  // Voo livre: câmera-nave (não persiste — voar é um momento, não preferência).
  const [freeFly, setFreeFly] = useState(false);
  useEffect(() => { if (mode === "off") setFreeFly(false); }, [mode]);
  const [markets, setMarkets] = useState<MarketPoint[]>([]);
  const [conflicts, setConflicts] = useState<ConflictZone[]>(FALLBACK_CONFLICT_ZONES);
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

  // Focos de TODAS as camadas ao mesmo tempo (conflitos + protestos + desastres),
  // convivendo no globo — cada ponto pinta pela sua própria categoria. Um ÚNICO
  // endpoint devolve os três já mesclados: o servidor serializa as chamadas do
  // GDELT (1 req/5s só funciona dentro da mesma invocação). Se vier vazio, cai
  // na lista curada de conflitos.
  useEffect(() => {
    if (mode !== "globe") return;
    let cancelled = false;
    fetch(`/api/globe/foci`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        const zones = Array.isArray(d?.zones) ? (d.zones as ConflictZone[]) : [];
        setConflicts(zones.length > 0 ? zones : FALLBACK_CONFLICT_ZONES);
      })
      .catch(() => { if (!cancelled) setConflicts(FALLBACK_CONFLICT_ZONES); });
    return () => { cancelled = true; };
  }, [mode]);

  // Re-mede o canvas DEPOIS da animação de escala do palco (0.74s): o r3f mede
  // via getBoundingClientRect, que é afetado pelo transform — medir no meio da
  // animação deixa o buffer MENOR que a tela (render "recortado" no canto).
  // O transform não dispara ResizeObserver, então forçamos re-medições em
  // instantes que cobrem o fim da animação (e uma tardia p/ devices lentos).
  useEffect(() => {
    if (visible) {
      const ts = [150, 900, 2200].map(ms => setTimeout(() => window.dispatchEvent(new Event("resize")), ms));
      return () => ts.forEach(clearTimeout);
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

  // ── Variante CLÁSSICA: janela compacta com bordas (comportamento antigo) ──
  if (classic) {
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
            <SafeVisual>
              <React.Suspense fallback={null}>
                {isBlackHole ? (
                  <BlackHoleScene />
                ) : isPlanet ? (
                  <PlanetSceneContent planet={displayMode as PlanetMode} />
                ) : (
                  <GlobeScene markets={markets} conflicts={conflicts} onSelect={setSelected} classic />
                )}
              </React.Suspense>
            </SafeVisual>
          </Canvas>
        </div>

        {/* Legenda: conflitos ao vivo */}
        {displayMode === "globe" && (
          <div className="flex items-center justify-center mt-1">
            <ConflictLegend count={conflicts.length} />
          </div>
        )}

        {/* Sombra sob o globo */}
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 6, gap: 2 }}>
            <span className="text-[9px] font-bold text-orange-400/50 uppercase tracking-[3px]">Gargantua</span>
            <span className="text-[7px] text-zinc-600 italic">Easter egg · Clique na logo para fechar</span>
          </div>
        ) : isPlanet ? (
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
            {/* Escala de calor das bolsas */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: 4 }}>
              <MarketHeatLegend />
            </div>

            {/* Card de detalhe abaixo do globo */}
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

  return (
    <div className={animClass} data-no-pull style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* O canvas ocupa a tela inteira — o "quadrado" sumiu. O palco é o espaço:
          céu estrelado infinito com a Terra imersa nele; a UI vira HUD flutuante. */}
      <div style={{ position: "absolute", inset: 0 }}>
        <Canvas
          camera={{ position: [0, 0, 7.45], fov: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); }}
          dpr={[1, 2]}
          style={{ background: "transparent" }}
        >
          <SafeVisual>
            <React.Suspense fallback={null}>
              {isBlackHole ? (
                <BlackHoleScene />
              ) : isPlanet ? (
                <>
                  <SpaceEnvironment />
                  <PlanetSceneContent planet={displayMode as PlanetMode} />
                </>
              ) : (
                <GlobeScene markets={markets} conflicts={conflicts} onSelect={setSelected} liveClouds={cloudsOn} freeFly={freeFly} />
              )}
            </React.Suspense>
          </SafeVisual>
        </Canvas>
      </div>

      {/* HUD inferior do globo: conflitos ao vivo + escala de calor, num pill
          translúcido. */}
      {displayMode === "globe" && (
        <div
          className="absolute left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 64px)", pointerEvents: "none" }}
        >
          <div
            className="flex items-center gap-2.5 rounded-full px-3.5 py-1.5"
            style={{ background: "rgba(6,10,16,0.55)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(8px)" }}
          >
            <ConflictLegend count={conflicts.length} />
            <span className="text-[8px] text-zinc-700">|</span>
            <MarketHeatLegend />
            <span className="text-[8px] text-zinc-700">|</span>
            {/* Toggle discreto da camada de nuvens/satélite do dia */}
            <button
              onClick={toggleClouds}
              title={cloudsOn ? "Desligar nuvens (satélite do dia)" : "Ligar nuvens (satélite do dia)"}
              className="flex items-center gap-1 transition-colors"
              style={{
                pointerEvents: "auto",
                fontSize: 9, fontWeight: 700, letterSpacing: ".04em",
                color: cloudsOn ? "#67e8f9" : "#52525b",
                background: "transparent", border: "none", cursor: "pointer", padding: 0,
              }}
            >
              <Cloud size={10} strokeWidth={2.5} style={{ opacity: cloudsOn ? 1 : 0.45 }} />
              Nuvens
            </button>
            <span className="text-[8px] text-zinc-700">|</span>
            {/* Toggle do VOO LIVRE (câmera-nave) */}
            <button
              onClick={() => setFreeFly(v => !v)}
              title={freeFly ? "Sair do voo livre (volta à órbita)" : "Voo livre: voar pelo espaço e escolher o ponto de vista"}
              className="flex items-center gap-1 transition-colors"
              style={{
                pointerEvents: "auto",
                fontSize: 9, fontWeight: 700, letterSpacing: ".04em",
                color: freeFly ? "#67e8f9" : "#52525b",
                background: "transparent", border: "none", cursor: "pointer", padding: 0,
              }}
            >
              <Rocket size={10} strokeWidth={2.5} style={{ opacity: freeFly ? 1 : 0.45 }} />
              Voo
            </button>
          </div>
          {freeFly ? (
            <span className="text-[9px] tracking-[0.14em] text-cyan-200/60 uppercase" aria-hidden>
              arraste para olhar · role ou pinça para voar · 2 toques mira a Terra
            </span>
          ) : (
            <span
              className="holo-hint text-[9px] tracking-[0.14em] text-cyan-200/50 uppercase"
              aria-hidden
            >
              arraste para girar · role para mergulhar
            </span>
          )}
        </div>
      )}

      {/* Card de detalhe: flutua sobre o espaço — direita no desktop, acima do
          HUD no mobile. */}
      {displayMode === "globe" && selected && (
        <div className="absolute z-20 left-1/2 bottom-[118px] -translate-x-1/2 sm:bottom-auto sm:left-auto sm:right-10 sm:top-1/2 sm:translate-x-0 sm:-translate-y-1/2">
          {selected.type === "market" ? (
            <MarketInfoCard point={selected.data} />
          ) : (
            <ConflictInfoCard zone={selected.data} nearbyMarkets={selected.nearbyData} />
          )}
        </div>
      )}

      {/* Legendas dos easter eggs (buraco negro / planetas) — HUD inferior */}
      {isBlackHole && (
        <div
          className="absolute left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-0.5"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 64px)", pointerEvents: "none" }}
        >
          <span className="text-[9px] font-bold text-orange-400/50 uppercase tracking-[3px]">Gargantua</span>
          <span className="text-[7px] text-zinc-600 italic">Easter egg · Clique na logo para fechar</span>
        </div>
      )}
      {isPlanet && (
        <div
          className="absolute left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-0.5"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 64px)", pointerEvents: "none" }}
        >
          <span className={`text-[9px] font-bold uppercase tracking-[3px] ${planetCaptionColor[displayMode] || "text-zinc-400/60"}`}>
            {PLANET_CAPTIONS[displayMode as PlanetMode].name}
          </span>
          <span className="text-[7px] text-zinc-600 italic">
            {PLANET_CAPTIONS[displayMode as PlanetMode].fact}
          </span>
        </div>
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
        @keyframes holo-hint {
          0% { opacity: 0; }
          12% { opacity: 0.8; }
          72% { opacity: 0.8; }
          100% { opacity: 0; }
        }
        .holo-hint { opacity: 0; animation: holo-hint 6.5s ease 1.2s forwards; }
        @media (prefers-reduced-motion: reduce) { .holo-hint { animation: none; opacity: 0.6; } }
      `}</style>
    </div>
  );
}
