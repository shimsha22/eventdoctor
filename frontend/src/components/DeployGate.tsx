"use client";

import type { Incident, Role } from "@/lib/types";
import { Button, Hint } from "./ui";

const CAN_DEPLOY: Role[] = ["Admin", "SRE"];

export default function DeployGate({
  incident,
  role,
  busy,
  onApprove,
}: {
  incident: Incident;
  role: Role;
  busy: boolean;
  onApprove: () => void;
}) {
  const allowed = CAN_DEPLOY.includes(role);
  const waiting = incident.stage === "awaiting_deploy_approval";

  if (incident.stage === "deploying") {
    return (
      <section className="bg-card border border-line rounded-lg p-4 mb-5">
        <h3 className="text-sm font-semibold m-0 mb-2">Deploying</h3>
        <p className="text-[13.5px] text-ink-2 m-0">
          Publishing a new version and moving the live alias onto it.
        </p>
      </section>
    );
  }

  if (incident.deployed_version) {
    return (
      <section className="bg-ok-soft border border-ok rounded-lg p-4 mb-5">
        <h3 className="text-sm font-semibold m-0 mb-2 text-ok">Deployed</h3>
        <p className="text-[13.5px] text-ink-2 m-0 font-mono">
          {incident.deployed_version}
        </p>
        <Hint>The previous version is still published and can be flipped back.</Hint>
      </section>
    );
  }

  return (
    <section
      className={`rounded-lg p-4 mb-5 border ${
        waiting ? "bg-symptom-soft border-symptom" : "bg-card border-line"
      }`}
    >
      <h3
        className={`text-sm font-semibold m-0 mb-2 ${waiting ? "text-symptom" : ""}`}
      >
        Deploy approval
      </h3>
      <p className="text-[13.5px] text-ink-2 m-0 mb-3">
        {waiting
          ? "Publishes a new version of order-confirmation-worker and points the live alias at it."
          : "Unlocks once a fix has been approved and the checks pass."}
      </p>
      <div className="flex gap-2.5 flex-wrap">
        <Button
          variant="primary"
          disabled={!waiting || !allowed || busy}
          onClick={onApprove}
        >
          Deploy this fix
        </Button>
      </div>
      <Hint>
        {allowed
          ? "Only Admin and SRE can deploy. Checked on the server, not just here."
          : `A ${role} cannot approve a deploy. The backend rejects it as well.`}
      </Hint>
    </section>
  );
}
