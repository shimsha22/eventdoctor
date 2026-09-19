"use client";

import { motion } from "framer-motion";
import type { ValidationReport } from "@/lib/types";
import { Panel, Hint } from "./ui";

export default function ValidationPanel({
  report,
}: {
  report: ValidationReport | null;
}) {
  if (!report) {
    return (
      <Panel title="Automated checks">
        <p className="text-sm text-ink-3 m-0">
          Checks run on an isolated branch once a fix is approved.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Automated checks">
      {report.checks.map((c) => (
        <motion.div
          key={c.name}
          layout
          className="flex gap-2.5 items-start py-2 text-[13.5px]"
        >
          <span
            className={`font-bold leading-snug ${
              c.status === "pass"
                ? "text-ok"
                : c.status === "fail"
                  ? "text-cause"
                  : "text-ink-3"
            }`}
          >
            {c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : "…"}
          </span>
          <span className={c.status === "running" ? "text-ink-3" : ""}>
            {c.name}
            {c.detail && <span className="text-ink-3"> — {c.detail}</span>}
          </span>
        </motion.div>
      ))}
      <Hint>
        Run #{report.run_id} · {Math.floor(report.duration_seconds / 60)}m{" "}
        {report.duration_seconds % 60}s · full report stored
      </Hint>
    </Panel>
  );
}
