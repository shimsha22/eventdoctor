"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Incident, ReviewSubmission } from "@/lib/types";
import { api, isMockMode } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Header from "@/components/Header";
import RequireAuth from "@/components/RequireAuth";
import ProgressRail from "@/components/ProgressRail";
import CausalGraph from "@/components/CausalGraph";
import RootCausePanel from "@/components/RootCausePanel";
import EvidencePanel from "@/components/EvidencePanel";
import RemediationPanel from "@/components/RemediationPanel";
import ValidationPanel from "@/components/ValidationPanel";
import DeployGate from "@/components/DeployGate";
import ReplayPanel from "@/components/ReplayPanel";
import LiveSignals from "@/components/LiveSignals";
import { Panel, Button } from "@/components/ui";

function Body() {
  const params = useParams<{ id: string }>();
  const incidentId = params.id;
  const { user } = useAuth();
  const role = user?.role ?? "Viewer";

  const [incident, setIncident] = useState<Incident | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setIncident(await api.getIncident(incidentId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [incidentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Wraps every action so one failure can never leave a button stuck spinning.
  async function run(fn: () => Promise<Incident>) {
    setBusy(true);
    setError(null);
    try {
      setIncident(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const handleReview = async (body: ReviewSubmission) => {
    await run(() => api.submitReview(incidentId, body));
    // approving a fix kicks the validation run off automatically
    if (body.action === "approve" || body.action === "edit") {
      await run(() => api.runValidation(incidentId, setIncident));
    }
  };

  if (error && !incident) {
    return (
      <>
        <Header />
        <div className="max-w-[1180px] mx-auto px-5 py-16">
          <Panel title="Can't load this incident">
            <p className="text-sm text-ink-2">{error}</p>
            <p className="text-sm text-ink-2">
              Start the FastAPI backend, or set NEXT_PUBLIC_USE_MOCK=true in .env.local to
              run on the built-in demo data.
            </p>
            <div className="mt-4 flex gap-2.5">
              <Button onClick={load}>Try again</Button>
              <Link href="/incidents">
                <Button>Back to incidents</Button>
              </Link>
            </div>
          </Panel>
        </div>
      </>
    );
  }

  if (!incident) {
    return (
      <>
        <Header />
        <div className="max-w-[1180px] mx-auto px-5 py-16 text-ink-3">
          Loading incident…
        </div>
      </>
    );
  }

  const recovered = incident.stage === "recovered";

  return (
    <>
      <Header />

      <div className="max-w-[1180px] mx-auto px-5 pb-20">
        <div className="pt-6 pb-7 border-b border-line">
          <Link
            href="/incidents"
            className="text-[13px] text-ink-3 hover:text-ink inline-block mb-4"
          >
            ← All incidents
          </Link>
          <p className="font-mono text-[13px] text-ink-3 m-0 mb-2">
            {incident.id} · opened {incident.opened_at} · {incident.service}
          </p>
          <h1 className="text-[clamp(24px,3.4vw,34px)] leading-tight tracking-tight m-0 mb-2 max-w-[22ch] font-bold">
            {incident.title}
          </h1>
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-semibold ${
              recovered ? "bg-ok-soft text-ok" : "bg-cause-soft text-cause"
            }`}
          >
            <i className="w-1.5 h-1.5 rounded-full bg-current not-italic" />
            {recovered ? "Recovered" : incident.severity}
          </span>

          <dl className="flex gap-7 flex-wrap mt-5">
            {[
              { label: "Time window analysed", value: incident.window },
              { label: "Services touched", value: String(incident.services_touched) },
              { label: "Events in DLQ", value: incident.dlq_count.toLocaleString() },
              { label: "Evidence artifacts", value: String(incident.evidence.length) },
            ].map((f) => (
              <div key={f.label}>
                <dt className="text-[12.5px] text-ink-3">{f.label}</dt>
                <dd className="m-0 font-mono font-medium text-sm">{f.value}</dd>
              </div>
            ))}
          </dl>

          <ProgressRail stage={incident.stage} />
        </div>

        {error && (
          <div className="mt-5 border border-cause bg-cause-soft text-cause rounded-md px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_340px] gap-6 mt-8 items-start">
          <main>
            {incident.rca ? (
              <>
                <Panel
                  title="How the failure spread"
                  sub="Each arrow is a link EventDoctor could support with evidence from two independent sources."
                >
                  <CausalGraph
                    nodes={incident.rca.causal_nodes}
                    edges={incident.rca.causal_edges}
                  />
                </Panel>
                <RootCausePanel rca={incident.rca} />
              </>
            ) : (
              <Panel title="Root cause" sub="Still working through the evidence.">
                <p className="text-sm text-ink-2 m-0">
                  Evidence is still being collected for this incident. The causal chain and
                  root cause appear once the analysis finishes.
                </p>
              </Panel>
            )}

            <EvidencePanel items={incident.evidence} />

            {incident.rca && (
              <RemediationPanel
                incident={incident}
                role={role}
                busy={busy}
                onReview={handleReview}
              />
            )}
          </main>

          <aside>
            <DeployGate
              incident={incident}
              role={role}
              busy={busy}
              onApprove={() => run(() => api.approveDeploy(incidentId))}
            />
            <ValidationPanel report={incident.validation} />
            {incident.replay.tied_to_incident > 0 && (
              <ReplayPanel
                incident={incident}
                busy={busy}
                onReplay={() => run(() => api.startReplay(incidentId, setIncident))}
              />
            )}
            <LiveSignals signals={incident.signals} recovered={recovered} />

            {isMockMode() && (
              <div className="text-center">
                <Button disabled={busy} onClick={() => run(() => api.reset(incidentId))}>
                  Reset the demo
                </Button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

export default function IncidentPage() {
  return (
    <RequireAuth>
      <Body />
    </RequireAuth>
  );
}
