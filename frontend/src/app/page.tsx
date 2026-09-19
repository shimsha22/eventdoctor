"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

const CHAIN = [
  { label: "Connection pool cut 40 → 8", detail: "a deploy nobody flagged", tone: "cause" },
  { label: "Payment calls slow down", detail: "p99 240ms → 3.4s", tone: "symptom" },
  { label: "Worker slots all busy", detail: "concurrency 98 / 100", tone: "symptom" },
  { label: "Queue stops draining", detail: "depth 12 → 9,400", tone: "symptom" },
  { label: "DLQ fills up", detail: "1,284 events — this is what paged you", tone: "cause" },
];

const STEPS = [
  {
    n: "Evidence",
    body: "Metrics, logs, queue depth, retry counts, deploy history and failed event samples are pulled into one structured package — not a wall of dashboards to read by hand.",
  },
  {
    n: "Root cause",
    body: "The model reasons over that package and separates what broke from what merely reacted, says how confident it is, and shows what it ruled out.",
  },
  {
    n: "A fix, reviewed",
    body: "It reads the relevant commits and proposes an actual diff. An engineer approves it, edits it, rejects it, or asks for a different approach in plain English.",
  },
  {
    n: "Checks, then a person",
    body: "The patch is built and tested on an isolated branch. Only after it passes can someone with the right role approve the deploy. Nothing ships without both.",
  },
  {
    n: "Recovery, verified",
    body: "A new version goes out, only the failed events from this incident are replayed, and the metrics are checked again to confirm it actually worked.",
  },
];

export default function Landing() {
  const chainRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: chainRef,
    offset: ["start 0.8", "end 0.4"],
  });
  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <main className="max-w-[1000px] mx-auto px-5">
      <nav className="flex items-center py-5">
        <span className="font-bold text-[17px] tracking-tight">EventDoctor</span>
        <div className="flex-1" />
        <Link
          href="/incidents"
          className="text-sm font-semibold text-signal hover:underline"
        >
          Open the console
        </Link>
      </nav>

      {/* hero */}
      <section className="pt-16 pb-20 border-b border-line">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="font-mono text-[13px] text-cause m-0 mb-4"
        >
          02:14 — DLQ depth above threshold
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-[clamp(32px,6vw,56px)] leading-[1.08] tracking-[-0.03em] font-bold m-0 max-w-[16ch]"
        >
          The thing that paged you is rarely the thing that broke.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="text-ink-2 text-[17px] mt-6 max-w-[58ch] leading-relaxed"
        >
          EventDoctor sits above your monitoring and works backwards from the alert —
          across queues, logs, metrics, deploys and source — to the change that actually
          started it. Then it proposes a fix and waits for a human to say yes.
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-8 flex gap-3 flex-wrap"
        >
          <Link
            href="/incidents"
            className="bg-signal text-white font-semibold text-sm rounded-md px-5 py-2.5"
          >
            See a real incident
          </Link>
          <Link
            href="/login"
            className="border border-line-strong font-semibold text-sm rounded-md px-5 py-2.5"
          >
            Sign in
          </Link>
        </motion.div>
      </section>

      {/* the chain */}
      <section ref={chainRef} className="py-20 border-b border-line">
        <h2 className="text-[clamp(22px,3.5vw,30px)] tracking-tight font-bold m-0 max-w-[20ch]">
          One incident, read from the bottom up
        </h2>
        <p className="text-ink-2 mt-3 max-w-[58ch]">
          This is the failure chain behind a single alert. Every link is supported by
          evidence from two independent sources.
        </p>

        <div className="relative mt-10 pl-8">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-line">
            <motion.div
              className="w-px bg-cause origin-top"
              style={{ height: lineHeight }}
            />
          </div>

          {CHAIN.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.35 }}
              className="relative pb-8 last:pb-0"
            >
              <span
                className={`absolute -left-8 top-1.5 w-[15px] h-[15px] rounded-full border-2 bg-paper ${
                  c.tone === "cause" ? "border-cause" : "border-symptom"
                }`}
              />
              <p className="m-0 font-semibold text-[17px] tracking-tight">{c.label}</p>
              <p className="m-0 font-mono text-[12.5px] text-ink-3 mt-0.5">{c.detail}</p>
              {i === CHAIN.length - 1 && (
                <p className="mt-3 text-sm text-ink-2 max-w-[52ch]">
                  An on-call engineer starts here, at the bottom, and works up. EventDoctor
                  starts here and finishes at the top in about ninety seconds.
                </p>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section className="py-20 border-b border-line">
        <h2 className="text-[clamp(22px,3.5vw,30px)] tracking-tight font-bold m-0 max-w-[20ch]">
          What happens between the alert and the fix
        </h2>
        <div className="mt-10 grid gap-0">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.35 }}
              className="grid sm:grid-cols-[200px_1fr] gap-4 py-6 border-t border-line"
            >
              <h3 className="m-0 text-[17px] font-semibold tracking-tight">
                <span className="font-mono text-[12px] text-ink-3 mr-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.n}
              </h3>
              <p className="m-0 text-ink-2 max-w-[60ch]">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* the rule */}
      <section className="py-20 border-b border-line">
        <blockquote className="m-0 border-l-[3px] border-cause pl-5">
          <p className="text-[clamp(20px,3vw,26px)] leading-snug tracking-tight font-semibold m-0 max-w-[24ch]">
            EventDoctor never changes production on its own.
          </p>
          <p className="text-ink-2 mt-4 max-w-[58ch]">
            Every code change passes through engineer review, then automated validation,
            then an explicit approval from someone whose role allows it — in that order,
            enforced on the server. Replay only ever touches the events tied to the
            incident being resolved.
          </p>
        </blockquote>
      </section>

      <section className="py-20 text-center">
        <Link
          href="/incidents"
          className="bg-signal text-white font-semibold rounded-md px-6 py-3 inline-block"
        >
          Open the console
        </Link>
      </section>
    </main>
  );
}
