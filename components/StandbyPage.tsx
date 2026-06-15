import type { ReactNode } from "react";

interface Props {
  title: string;
  description: string;
  icon: ReactNode;
  accentColor?: string;
  features?: string[];
}

export default function StandbyPage({
  title,
  description,
  icon,
  accentColor = "#E8A33D",
  features = [],
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] px-4 relative">
      {/* Background ambient glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: "500px",
          height: "400px",
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${accentColor}06 0%, transparent 70%)`,
          filter: "blur(60px)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      <div className="relative z-10 max-w-sm w-full text-center">
        {/* Icon container with gradient border */}
        <div
          className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
          style={{
            background: `linear-gradient(${accentColor}22, ${accentColor}08) padding-box,
                         linear-gradient(135deg, ${accentColor}50, ${accentColor}18) border-box`,
            border: "1px solid transparent",
          }}
        >
          <span style={{ color: accentColor }}>{icon}</span>
        </div>

        {/* Status badge */}
        <span
          className="inline-flex items-center gap-1.5 text-[10px] px-3 py-1 rounded-full font-medium uppercase tracking-widest mb-5"
          style={{
            background: `${accentColor}10`,
            color: accentColor,
            border: `1px solid ${accentColor}28`,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: accentColor }}
          />
          Em Desenvolvimento
        </span>

        <h1 className="text-2xl md:text-3xl font-bold text-zinc-100 mb-3">
          {title}
        </h1>
        <p className="text-zinc-500 text-sm leading-relaxed mb-8">
          {description}
        </p>

        {/* Features list (if provided) */}
        {features.length > 0 && (
          <div
            className="rounded-xl p-4 text-left space-y-2.5 mb-6"
            style={{
              background: `${accentColor}06`,
              border: `1px solid ${accentColor}14`,
            }}
          >
            <p className="text-[10px] uppercase tracking-widest font-medium mb-3" style={{ color: `${accentColor}80` }}>
              Previsto nesta seção
            </p>
            {features.map((f) => (
              <div key={f} className="flex items-center gap-2.5 text-xs text-zinc-500">
                <div
                  className="w-1 h-1 rounded-full shrink-0"
                  style={{ background: `${accentColor}60` }}
                />
                {f}
              </div>
            ))}
          </div>
        )}

        {/* Decorative dots */}
        <div className="flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === 0 ? "20px" : "6px",
                background: i === 0 ? accentColor : `${accentColor}28`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
