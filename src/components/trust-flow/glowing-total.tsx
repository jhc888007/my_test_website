"use client";

import { animate } from "framer-motion";
import { useEffect, useState } from "react";

export function GlowingTotal({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const c = animate(0, value, {
      duration: 2.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => c.stop();
  }, [value]);

  return (
    <span className="inline-block text-5xl font-medium tabular-nums tracking-tight text-gold drop-shadow-[0_0_28px_rgba(212,175,55,0.9)]">
      {display.toLocaleString("zh-CN")}
    </span>
  );
}
