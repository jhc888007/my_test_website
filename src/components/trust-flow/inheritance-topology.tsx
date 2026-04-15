"use client";

export function InheritanceTopology({
  trusteeName,
  beneficiaryNames,
}: {
  trusteeName: string;
  beneficiaryNames: string[];
}) {
  const w = 560;
  const h = 280;
  const cx = w / 2;
  const topY = 56;
  const bottomY = 220;
  const count = Math.max(beneficiaryNames.length, 1);
  const gap = w / (count + 1);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-auto w-full max-w-2xl"
      role="img"
      aria-label="传承拓扑"
    >
      <defs>
        <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#D4AF37" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.15" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {beneficiaryNames.map((_, i) => {
        const bx = gap * (i + 1);
        const d = `M ${cx} ${topY + 24} C ${cx} ${topY + 90}, ${bx} ${bottomY - 90}, ${bx} ${bottomY - 28}`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="url(#flowGrad)"
            strokeWidth={2}
            strokeLinecap="round"
            className="tf-flow-line"
          />
        );
      })}
      <style>{`
        .tf-flow-line {
          stroke-dasharray: 10 8;
          stroke-dashoffset: 0;
          animation: tfFlow 3.2s linear infinite;
        }
        @keyframes tfFlow {
          to { stroke-dashoffset: -220; }
        }
      `}</style>
      <circle
        cx={cx}
        cy={topY}
        r={18}
        fill="rgba(212,175,55,0.12)"
        stroke="#D4AF37"
        strokeWidth={1.5}
        filter="url(#glow)"
      />
      <text
        x={cx}
        y={topY + 5}
        textAnchor="middle"
        fill="#f8fafc"
        fontSize="12"
        fontWeight="500"
      >
        {trusteeName}
      </text>
      <text
        x={cx}
        y={topY + 22}
        textAnchor="middle"
        fill="#D4AF37"
        fontSize="10"
        opacity={0.85}
      >
        Trustee
      </text>
      {beneficiaryNames.map((name, i) => {
        const bx = gap * (i + 1);
        return (
          <g key={name}>
            <circle
              cx={bx}
              cy={bottomY}
              r={16}
              fill="rgba(0,21,41,0.65)"
              stroke="#D4AF37"
              strokeWidth={1.25}
            />
            <text
              x={bx}
              y={bottomY + 5}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize="11"
            >
              {name.length > 8 ? `${name.slice(0, 7)}…` : name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
