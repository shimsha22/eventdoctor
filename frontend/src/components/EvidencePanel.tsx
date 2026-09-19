"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { EvidenceItem } from "@/lib/types";
import { Panel } from "./ui";

const SOURCE_LABEL: Record<EvidenceItem["source"], string> = {
  github: "GitHub deploy history",
  cloudwatch: "CloudWatch metrics and logs",
  sqs: "Queue and DLQ statistics",
  lambda: "Lambda execution metrics",
};

export default function EvidencePanel({ items }: { items: EvidenceItem[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Panel
      title="Evidence"
      sub="Click a line to see where it came from. Nothing here was typed by hand."
    >
      <div className="border-t border-line">
        {items.map((e) => {
          const isOpen = open === e.id;
          return (
            <div key={e.id} className="border-b border-line">
              <button
                onClick={() => setOpen(isOpen ? null : e.id)}
                className={`w-full text-left grid grid-cols-[76px_1fr_auto] gap-3 py-2.5 items-baseline ${
                  e.highlighted ? "bg-cause-soft rounded px-2.5 -mx-2.5" : ""
                }`}
              >
                <time className="font-mono text-[12px] text-ink-3">{e.timestamp}</time>
                <span className="text-sm max-w-[58ch]">{e.description}</span>
                <span className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">
                  {e.source}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-paper border border-line rounded-md p-3 mb-3 text-[12.5px]">
                      <p className="m-0 text-ink-2">{SOURCE_LABEL[e.source]}</p>
                      {e.artifact_key ? (
                        <p className="m-0 mt-1.5 font-mono text-ink-3 break-all">
                          {e.artifact_key}
                        </p>
                      ) : (
                        <p className="m-0 mt-1.5 text-ink-3">
                          Collected inline; no separate artifact was stored.
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
