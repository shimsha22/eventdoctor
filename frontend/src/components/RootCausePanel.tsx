import type { RCAResult, FindingKind } from "@/lib/types";
import { Panel } from "./ui";

const LABEL: Record<FindingKind, { text: string; cls: string }> = {
  root_cause: { text: "root cause", cls: "bg-cause-soft text-cause" },
  symptom: { text: "symptom", cls: "bg-symptom-soft text-symptom" },
  contributing_factor: {
    text: "contributing",
    cls: "bg-signal-soft text-signal",
  },
};

const WIDTH = { low: "34%", medium: "62%", high: "86%" };

export default function RootCausePanel({ rca }: { rca: RCAResult }) {
  return (
    <Panel
      title="Root cause"
      sub="Generated from the evidence package, not from a fixed script."
    >
      <div className="border-l-[3px] border-cause pl-4 mb-5">
        <p className="text-[16.5px] font-semibold tracking-tight mb-1.5 max-w-[66ch]">
          {rca.headline}
        </p>
        <p className="m-0 max-w-[66ch] text-ink-2">{rca.explanation}</p>
      </div>

      <div className="grid gap-0">
        {rca.findings.map((f) => (
          <div
            key={f.kind}
            className="grid sm:grid-cols-[120px_1fr] gap-3 items-baseline py-2.5 border-t border-line"
          >
            <span
              className={`font-mono text-[11.5px] font-semibold px-2 py-0.5 rounded justify-self-start ${LABEL[f.kind].cls}`}
            >
              {LABEL[f.kind].text}
            </span>
            <p className="m-0 text-sm text-ink-2 max-w-[60ch]">{f.statement}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-5 text-[13.5px] text-ink-2 flex-wrap">
        <span>Confidence</span>
        <span className="flex-1 max-w-[190px] h-1.5 rounded bg-line overflow-hidden">
          <i className="block h-full bg-ok" style={{ width: WIDTH[rca.confidence] }} />
        </span>
        <b className="capitalize">{rca.confidence}</b>
        <span className="text-ink-3">— {rca.confidence_note}</span>
      </div>
    </Panel>
  );
}
