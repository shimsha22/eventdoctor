"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { IncidentSummary, WorkflowStage } from "@/lib/types";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import RequireAuth from "@/components/RequireAuth";

const STAGE_LABEL: Record<WorkflowStage, { text: string; cls: string }> = {
  collecting_evidence: { text: "Collecting evidence", cls: "bg-signal-soft text-signal" },
  analysing: { text: "Investigating", cls: "bg-signal-soft text-signal" },
  awaiting_engineer_review: {
    text: "Needs engineer review",
    cls: "bg-symptom-soft text-symptom",
  },
  regenerating: { text: "Generating a new fix", cls: "bg-signal-soft text-signal" },
  validating: { text: "Checks running", cls: "bg-signal-soft text-signal" },
  awaiting_deploy_approval: {
    text: "Needs deploy approval",
    cls: "bg-symptom-soft text-symptom",
  },
  deploying: { text: "Deploying", cls: "bg-signal-soft text-signal" },
  replaying: { text: "Replaying events", cls: "bg-signal-soft text-signal" },
  recovered: { text: "Recovered", cls: "bg-ok-soft text-ok" },
};

export default function IncidentsPage() {
  const [items, setItems] = useState<IncidentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getIncidents()
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <RequireAuth>
      <Header />
      <main className="max-w-[1180px] mx-auto px-5 pb-20">
        <div className="pt-10 pb-6 border-b border-line">
          <h1 className="text-[30px] font-bold tracking-tight m-0">Incidents</h1>
          <p className="text-ink-3 text-sm mt-1 m-0">
            Anything waiting on a person is marked. Open one to investigate it.
          </p>
        </div>

        {error && (
          <p className="mt-6 border border-cause bg-cause-soft text-cause rounded-md px-4 py-3 text-sm">
            {error}
          </p>
        )}

        {!items && !error && <p className="text-ink-3 mt-8">Loading…</p>}

        <div className="mt-6">
          {items?.map((i, idx) => {
            const stage = STAGE_LABEL[i.stage];
            const needsYou =
              i.stage === "awaiting_engineer_review" ||
              i.stage === "awaiting_deploy_approval";
            return (
              <motion.div
                key={i.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06, duration: 0.25 }}
              >
                <Link
                  href={`/incidents/${i.id}`}
                  className={`block bg-card border rounded-lg p-5 mb-3 transition-colors hover:border-ink-3 ${
                    needsYou ? "border-symptom" : "border-line"
                  }`}
                >
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="font-mono text-[12.5px] text-ink-3">{i.id}</span>
                    <span
                      className={`text-[11.5px] font-semibold font-mono px-2 py-0.5 rounded ${stage.cls}`}
                    >
                      {stage.text}
                    </span>
                    <div className="flex-1" />
                    <span className="font-mono text-[12.5px] text-ink-3">
                      {i.opened_at}
                    </span>
                  </div>
                  <h2 className="text-[19px] font-semibold tracking-tight mt-2 mb-1 max-w-[46ch]">
                    {i.title}
                  </h2>
                  <p className="text-[13px] text-ink-3 m-0 font-mono">
                    {i.service}
                    {i.dlq_count > 0 && ` · ${i.dlq_count.toLocaleString()} in DLQ`}
                  </p>
                  {i.headline && (
                    <p className="text-sm text-ink-2 mt-3 m-0 max-w-[70ch]">
                      {i.headline}
                    </p>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </div>
      </main>
    </RequireAuth>
  );
}
