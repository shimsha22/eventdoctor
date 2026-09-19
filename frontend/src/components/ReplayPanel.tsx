"use client";

import { motion } from "framer-motion";
import type { Incident } from "@/lib/types";
import { Button, Hint } from "./ui";

export default function ReplayPanel({
  incident,
  busy,
  onReplay,
}: {
  incident: Incident;
  busy: boolean;
  onReplay: () => void;
}) {
  const r = incident.replay;
  const ready = incident.stage === "replaying" && r.replayed === 0;
  const running = incident.stage === "replaying" && r.replayed > 0;

  const cells = [
    { label: "Tied to this incident", value: r.tied_to_incident },
    { label: "Replayed", value: r.replayed },
    { label: "Succeeded", value: r.succeeded },
    { label: "Still queued", value: r.remaining },
  ];

  return (
    <section className="bg-card border border-line rounded-lg p-4 mb-5">
      <h3 className="text-sm font-semibold m-0 mb-3">Failed events</h3>
      <dl className="grid grid-cols-2 gap-px bg-line border border-line rounded-md overflow-hidden m-0">
        {cells.map((c) => (
          <div key={c.label} className="bg-card px-3 py-2.5">
            <dt className="text-[12px] text-ink-3">{c.label}</dt>
            <motion.dd
              key={c.value}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              className="m-0 font-mono font-semibold text-[19px] leading-tight"
            >
              {c.value.toLocaleString()}
            </motion.dd>
          </div>
        ))}
      </dl>

      {ready && (
        <div className="mt-3">
          <Button variant="primary" disabled={busy} onClick={onReplay}>
            Replay these events
          </Button>
        </div>
      )}

      <Hint>
        {incident.stage === "recovered"
          ? "Replay finished. Only events from this incident were re-driven."
          : running
            ? "Re-driving against the newly deployed version."
            : "Replay only ever touches events tied to this incident, never the whole queue."}
      </Hint>
    </section>
  );
}
