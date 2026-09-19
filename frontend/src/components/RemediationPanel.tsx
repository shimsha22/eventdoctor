"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Incident, Role, ReviewSubmission } from "@/lib/types";
import { Panel, Button, Hint } from "./ui";
import DiffView from "./DiffView";

const CAN_REVIEW: Role[] = ["Admin", "SRE", "Developer"];

export default function RemediationPanel({
  incident,
  role,
  busy,
  onReview,
}: {
  incident: Incident;
  role: Role;
  busy: boolean;
  onReview: (body: ReviewSubmission) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "ask">("view");
  const [draft, setDraft] = useState("");
  const [constraints, setConstraints] = useState("");

  const proposal = incident.proposal;
  const allowed = CAN_REVIEW.includes(role);
  const open = incident.stage === "awaiting_engineer_review";

  if (incident.stage === "regenerating") {
    return (
      <Panel title="Proposed fix" sub="Working on a different approach.">
        <p className="text-ink-2 text-sm">
          {incident.review_note} Generating a new proposal against that constraint.
        </p>
        <div className="mt-4 h-1 w-full bg-line rounded overflow-hidden">
          <motion.div
            className="h-full bg-signal"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
            style={{ width: "40%" }}
          />
        </div>
      </Panel>
    );
  }

  if (!proposal) {
    return (
      <Panel title="Proposed fix">
        <p className="text-ink-2 text-sm m-0">
          {incident.review_note ?? "No fix is currently proposed."} Ask for a new one to
          continue.
        </p>
        <div className="flex gap-2.5 flex-wrap mt-4">
          <Button
            disabled={!allowed || busy}
            onClick={() => onReview({ action: "request_new_fix" })}
          >
            Generate a fix
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Proposed fix"
      sub={`${proposal.summary}`}
    >
      <div className="flex justify-between items-center gap-2.5 font-mono text-[12.5px] text-ink-2 bg-paper border border-line border-b-0 rounded-t-md px-3 py-2 flex-wrap">
        <span>{proposal.file_path}</span>
        <span>
          +{proposal.additions} −{proposal.deletions}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {mode === "edit" ? (
          <motion.textarea
            key="editor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="w-full h-56 border border-line rounded-b-md p-3 font-mono text-[13px] leading-[1.7] bg-card resize-y"
          />
        ) : (
          <motion.div key="diff" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <DiffView diff={proposal.diff} />
          </motion.div>
        )}
      </AnimatePresence>

      <details className="mt-4 text-sm text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">
          Why this change, and what could go wrong
        </summary>
        <p className="mt-2 max-w-[66ch]">{proposal.reasoning}</p>
        <p className="mt-2 max-w-[66ch]">
          <b className="text-ink">Expected after deploy: </b>
          {proposal.expected_behaviour}
        </p>
        <ul className="mt-2 pl-5 list-disc max-w-[66ch]">
          {proposal.risks.map((r) => (
            <li key={r} className="mt-1">
              {r}
            </li>
          ))}
        </ul>
      </details>

      {mode === "ask" && (
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1.5">
            What should the new fix do differently?
          </label>
          <input
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            placeholder="Don't touch the retry policy, only fix connection handling"
            className="w-full border border-line rounded-md px-3 py-2 text-sm bg-card"
          />
        </div>
      )}

      {open ? (
        <div className="flex gap-2.5 flex-wrap mt-5">
          {mode === "view" && (
            <>
              <Button
                variant="primary"
                disabled={!allowed || busy}
                onClick={() => onReview({ action: "approve" })}
              >
                Approve
              </Button>
              <Button
                disabled={!allowed || busy}
                onClick={() => {
                  setDraft(proposal.diff);
                  setMode("edit");
                }}
              >
                Edit patch
              </Button>
              <Button
                variant="danger"
                disabled={!allowed || busy}
                onClick={() => onReview({ action: "reject" })}
              >
                Reject
              </Button>
              <Button
                disabled={!allowed || busy}
                onClick={() => setMode("ask")}
              >
                Ask for a different fix
              </Button>
            </>
          )}

          {mode === "edit" && (
            <>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  onReview({ action: "edit", edited_diff: draft });
                  setMode("view");
                }}
              >
                Approve my edited patch
              </Button>
              <Button disabled={busy} onClick={() => setMode("view")}>
                Discard edits
              </Button>
            </>
          )}

          {mode === "ask" && (
            <>
              <Button
                variant="primary"
                disabled={busy || !constraints.trim()}
                onClick={() => {
                  onReview({ action: "request_new_fix", constraints });
                  setConstraints("");
                  setMode("view");
                }}
              >
                Request new fix
              </Button>
              <Button disabled={busy} onClick={() => setMode("view")}>
                Cancel
              </Button>
            </>
          )}
        </div>
      ) : (
        <Hint>
          {incident.review_note ?? "Review complete."} The remaining decision is the deploy
          approval.
        </Hint>
      )}

      {open && !allowed && (
        <Hint>
          A {role} can read this incident but cannot review a fix. The backend rejects the
          request too, so this is not just a hidden button.
        </Hint>
      )}
    </Panel>
  );
}
