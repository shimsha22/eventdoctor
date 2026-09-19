"use client";

import { motion } from "framer-motion";
import type { CausalNode, CausalEdge, FindingKind } from "@/lib/types";

const COLOR: Record<FindingKind | "alert", { fill: string; stroke: string }> = {
  root_cause: { fill: "var(--color-cause-soft)", stroke: "var(--color-cause)" },
  symptom: { fill: "var(--color-symptom-soft)", stroke: "var(--color-symptom)" },
  contributing_factor: {
    fill: "var(--color-signal-soft)",
    stroke: "var(--color-signal)",
  },
  alert: { fill: "var(--color-cause-soft)", stroke: "var(--color-cause)" },
};

// Fixed grid positions. Nodes are laid out in the order the backend returns
// them, so a longer or shorter chain still renders sensibly.
const COLS = 3;
const W = 200;
const H = 54;
const GAP_X = 34;
const GAP_Y = 30;

function position(index: number) {
  const row = Math.floor(index / COLS);
  const colInRow = index % COLS;
  // snake the chain left-to-right, then right-to-left, so arrows stay short
  const col = row % 2 === 0 ? colInRow : COLS - 1 - colInRow;
  return { x: col * (W + GAP_X), y: row * (H + GAP_Y) };
}

export default function CausalGraph({
  nodes,
  edges,
}: {
  nodes: CausalNode[];
  edges: CausalEdge[];
}) {
  const positions = new Map(nodes.map((n, i) => [n.id, position(i)]));
  const rows = Math.ceil(nodes.length / COLS);
  const width = COLS * W + (COLS - 1) * GAP_X;
  const height = rows * H + (rows - 1) * GAP_Y + 10;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label="How the failure spread from one change to the alert"
      >
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="var(--color-line-strong)" />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const a = positions.get(e.from);
          const b = positions.get(e.to);
          if (!a || !b) return null;
          const sameRow = a.y === b.y;
          const x1 = sameRow ? (b.x > a.x ? a.x + W : a.x) : a.x + W / 2;
          const y1 = sameRow ? a.y + H / 2 : a.y + H;
          const x2 = sameRow ? (b.x > a.x ? b.x : b.x + W) : b.x + W / 2;
          const y2 = sameRow ? b.y + H / 2 : b.y;
          return (
            <motion.line
              key={`${e.from}-${e.to}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--color-line-strong)"
              strokeWidth={1.5}
              markerEnd="url(#arrowhead)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 0.25 + i * 0.12, duration: 0.3 }}
            />
          );
        })}

        {nodes.map((n, i) => {
          const p = positions.get(n.id)!;
          const c = COLOR[n.kind];
          return (
            <motion.g
              key={n.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12, duration: 0.25 }}
            >
              <rect
                x={p.x}
                y={p.y}
                width={W}
                height={H}
                rx={6}
                fill={c.fill}
                stroke={c.stroke}
                strokeDasharray={n.kind === "alert" ? "4 3" : undefined}
              />
              <text
                x={p.x + 14}
                y={p.y + 23}
                fill={c.stroke}
                className="text-[12px] font-medium"
              >
                {n.label}
              </text>
              <text
                x={p.x + 14}
                y={p.y + 39}
                fill={c.stroke}
                className="text-[10.5px] font-mono"
              >
                {n.detail}
              </text>
            </motion.g>
          );
        })}
      </svg>

      <div className="flex gap-5 flex-wrap mt-3 text-[12.5px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-sm bg-cause inline-block" />
          Root cause
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-sm bg-symptom inline-block" />
          Knock-on effect
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-sm bg-signal inline-block" />
          Contributing factor
        </span>
      </div>
    </div>
  );
}
