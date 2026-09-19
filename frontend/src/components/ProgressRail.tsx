import type { WorkflowStage } from "@/lib/types";

const STEPS: { key: WorkflowStage[]; label: string }[] = [
  { key: ["collecting_evidence"], label: "Evidence collected" },
  { key: ["analysing"], label: "Root cause found" },
  { key: ["awaiting_engineer_review", "regenerating"], label: "Fix proposed" },
  { key: ["validating"], label: "Checks running" },
  { key: ["awaiting_deploy_approval"], label: "Waiting on approval" },
  { key: ["deploying"], label: "Deploy" },
  { key: ["replaying"], label: "Replay failed events" },
  { key: ["recovered"], label: "Recovery confirmed" },
];

const ORDER: WorkflowStage[] = [
  "collecting_evidence",
  "analysing",
  "awaiting_engineer_review",
  "regenerating",
  "validating",
  "awaiting_deploy_approval",
  "deploying",
  "replaying",
  "recovered",
];

export default function ProgressRail({ stage }: { stage: WorkflowStage }) {
  const current = ORDER.indexOf(stage);

  return (
    <div className="flex mt-6 overflow-x-auto pb-1">
      {STEPS.map((step, i) => {
        const stepIndex = ORDER.indexOf(step.key[0]);
        const isActive = step.key.includes(stage);
        const isDone = stepIndex < current && !isActive;
        return (
          <div
            key={step.label}
            className={`flex-1 min-w-[108px] pr-3 py-2.5 border-t-[3px] text-[12.5px] ${
              isActive
                ? "border-signal text-ink font-semibold"
                : isDone
                  ? "border-ok text-ink-2"
                  : "border-line text-ink-3"
            }`}
          >
            <span className="block font-mono text-[11px] text-ink-3">
              {String(i + 1).padStart(2, "0")}
            </span>
            {step.label}
          </div>
        );
      })}
    </div>
  );
}
