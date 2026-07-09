// Logo "meatball" da NASA como SVG inline — sem fundo, escalável e self-contained
// (sem dependência de rede nem imagem externa). Rendição fiel: círculo azul NASA,
// campo de estrelas, órbita branca, wordmark "NASA" e o vetor (swoosh) vermelho.

export default function NasaLogo({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 220 220" className={className} role="img" aria-label="NASA">
      <circle cx="110" cy="110" r="108" fill="#0B3D91" />

      {/* Campo de estrelas */}
      <g fill="#ffffff">
        <circle cx="58" cy="56" r="2.2" />
        <circle cx="92" cy="40" r="1.5" />
        <circle cx="132" cy="50" r="2.6" />
        <circle cx="168" cy="70" r="1.8" />
        <circle cx="46" cy="92" r="1.5" />
        <circle cx="120" cy="30" r="1.3" />
        <circle cx="152" cy="150" r="1.8" />
        <circle cx="72" cy="150" r="1.5" />
        <circle cx="182" cy="118" r="1.6" />
        <circle cx="40" cy="128" r="1.4" />
        {/* Duas estrelas de 4 pontas */}
        <path d="M110 58 l2.2 6.4 6.4 2.2 -6.4 2.2 -2.2 6.4 -2.2 -6.4 -6.4 -2.2 6.4 -2.2z" />
        <path d="M150 96 l1.7 5 5 1.7 -5 1.7 -1.7 5 -1.7 -5 -5 -1.7 5 -1.7z" />
      </g>

      {/* Órbita branca */}
      <ellipse cx="110" cy="108" rx="95" ry="30" fill="none" stroke="#ffffff" strokeWidth="3.4" transform="rotate(-25 110 108)" />

      {/* Wordmark NASA */}
      <text x="110" y="131" textAnchor="middle" fontFamily="'Arial Black', Arial, Helvetica, sans-serif" fontWeight="900" fontSize="60" letterSpacing="-3" fill="#ffffff">NASA</text>

      {/* Vetor (swoosh) vermelho — pontas afiladas, leve arco */}
      <path d="M14 151 C 78 118, 150 92, 212 48 C 178 92, 98 120, 34 156 Z" fill="#FC3D21" />
    </svg>
  );
}
