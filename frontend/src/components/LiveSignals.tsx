"use client";

import { motion } from "framer-motion";
import type { Signal } from "@/lib/types";

export default function LiveSignals({
  signals,
  recovered,
}: {
  signals: Signal[];
  recovered: boolean;
}) {
  return (
    <section className="bg-card border border-line rounded-lg p-4 mb-5">
      <h3 className="text-sm font-semibold m-0 mb-3">
        {recovered ? "Signals after replay" : "Live signals"}
      </h3>
      {signals.map((s) => (
        <div
          key={s.label}
          className="flex justify-between gap-3 py-1.5 border-b border-line last:border-b-0 text-[13.5px]"
        >
          <span className="text-ink-3">{s.label}</span>
          <motion.b
            key={s.value}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            className={`font-mono font-medium ${s.healthy ? "text-ok" : "text-cause"}`}
          >
            {s.value}
          </motion.b>
        </div>
      ))}
    </section>
  );
}
