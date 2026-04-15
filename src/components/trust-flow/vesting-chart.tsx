"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type VestingChartPoint = {
  name: string;
  unlock: string;
  amount: number;
  cumulative: number;
};

export function VestingChart({ data }: { data: VestingChartPoint[] }) {
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="goldArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.85} />
              <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.06} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#D4AF37" opacity={0.12} />
          <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
          <YAxis
            stroke="#94a3b8"
            tick={{ fill: "#cbd5e1", fontSize: 12 }}
            tickFormatter={(v) => `${Number(v).toLocaleString("zh-CN")}`}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as VestingChartPoint;
              return (
                <div className="rounded-xl border border-gold/35 bg-[rgba(0,21,41,0.94)] px-3 py-2 text-xs text-slate-100 shadow-lg backdrop-blur">
                  <div className="font-medium text-gold">{p.name}</div>
                  <div className="mt-1 text-white/70">解锁 {p.unlock}</div>
                  <div className="mt-1">本段 {p.amount.toLocaleString("zh-CN")}</div>
                  <div className="text-white/85">累计 {p.cumulative.toLocaleString("zh-CN")}</div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="#D4AF37"
            strokeWidth={2}
            fill="url(#goldArea)"
            animationDuration={1400}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
