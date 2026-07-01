"use client";

// Miniatura leve do globo (para o botão da CommandBar que abre o globo holo).
// NÃO é o HoloGlobe (WebGL pesado) — é um globo em CSS/SVG: esfera azul + grade
// de meridianos/paralelos + brilho especular + halo ciano. Barato e sempre-on.

export default function GlobeThumb({ size = 26 }: { size?: number }) {
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
      <style>{`@keyframes globe-thumb-glow{0%,100%{opacity:.55}50%{opacity:.9}}`}</style>

      {/* Esfera */}
      <span
        style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "radial-gradient(circle at 34% 30%, #bae6fd 0%, #38bdf8 20%, #0ea5e9 44%, #0369a1 70%, #082f49 100%)",
          boxShadow: "0 0 5px rgba(56,189,248,.6), inset -2px -2px 4px rgba(0,0,0,.5), inset 2px 2px 3px rgba(255,255,255,.4)",
          animation: "globe-thumb-glow 3.5s ease-in-out infinite",
        }}
      />

      {/* Grade do globo (meridianos + paralelos) */}
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ position: "absolute", inset: 0 }}>
        <g fill="none" stroke="rgba(224,247,255,.5)" strokeWidth="2.4">
          <circle cx="50" cy="50" r="47" />
          <ellipse cx="50" cy="50" rx="18" ry="47" />
          <ellipse cx="50" cy="50" rx="35" ry="47" />
          <line x1="3" y1="50" x2="97" y2="50" />
          <ellipse cx="50" cy="50" rx="47" ry="20" />
          <ellipse cx="50" cy="50" rx="47" ry="38" />
        </g>
      </svg>

      {/* Brilho especular */}
      <span
        style={{
          position: "absolute", top: "13%", left: "21%", width: "30%", height: "22%",
          borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,.8), rgba(255,255,255,0))",
        }}
      />
    </span>
  );
}
