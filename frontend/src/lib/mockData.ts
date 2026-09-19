import type { Incident, RemediationProposal } from "./types";

// Demo data. This is what the UI runs on when NEXT_PUBLIC_USE_MOCK=true.
// The real backend returns the same shape from GET /incidents/{id}.

export const DEGRADED_SIGNALS = [
  { label: "Queue depth", value: "9,412", healthy: false },
  { label: "Payment p99", value: "3.41s", healthy: false },
  { label: "Worker concurrency", value: "98 / 100", healthy: false },
  { label: "Error rate", value: "31%", healthy: false },
  { label: "Baseline p99", value: "0.24s", healthy: true },
];

export const RECOVERED_SIGNALS = [
  { label: "Queue depth", value: "6", healthy: true },
  { label: "Payment p99", value: "0.26s", healthy: true },
  { label: "Worker concurrency", value: "11 / 100", healthy: true },
  { label: "Error rate", value: "0.1%", healthy: true },
  { label: "Baseline p99", value: "0.24s", healthy: true },
];

export const PRIMARY_PROPOSAL: RemediationProposal = {
  id: "prop-1",
  file_path: "services/checkout/payment_client.py",
  summary:
    "Restore the connection pool to 40 and fail fast instead of holding a worker slot for 30 seconds.",
  reasoning:
    "The pool was reduced to 8 in deploy a3f91c2. With 40 concurrent workers and 8 connections, most calls spend their time waiting for a free connection rather than waiting on the payment service itself. Restoring the pool removes the queueing, and a short acquire timeout means a starved pool fails in 2s instead of pinning a worker for 30s.",
  expected_behaviour:
    "Payment p99 returns to roughly 0.24s, worker concurrency drops back under 20, and the queue drains within a few minutes.",
  risks: [
    "Pool of 40 raises open connections to the payment service back to pre-deploy levels — this is a revert, not an increase.",
    "A 5s request timeout will surface genuinely slow payments as errors instead of silent latency.",
  ],
  additions: 4,
  deletions: 2,
  diff: `@@ -18,9 +18,11 @@ class PaymentClient:
     def __init__(self, settings):
-        self.pool = ConnectionPool(max_size=8)
-        self.timeout = 30
+        self.pool = ConnectionPool(max_size=40)
+        self.timeout = 5
+        # fail fast instead of holding a worker slot for 30s
+        self.pool.acquire_timeout = 2
         self.client = build_client(settings)`,
};

// Returned when the engineer clicks "Ask for a different fix".
export const ALTERNATIVE_PROPOSAL: RemediationProposal = {
  id: "prop-2",
  file_path: "services/checkout/payment_client.py",
  summary:
    "Make the pool size configurable and scale it with worker concurrency, rather than hardcoding a number.",
  reasoning:
    "A fixed pool size will drift out of step with worker concurrency again the next time either is tuned. Deriving the pool from the configured concurrency keeps them in proportion, and a floor of 20 prevents a misconfiguration from starving the client entirely.",
  expected_behaviour:
    "Same immediate recovery as the direct revert, but the mismatch cannot reappear when concurrency is changed later.",
  risks: [
    "Introduces a new config value that must be set correctly in every environment.",
    "Slightly larger change surface than a straight revert, so it carries more review burden under time pressure.",
  ],
  additions: 6,
  deletions: 2,
  diff: `@@ -18,9 +18,13 @@ class PaymentClient:
     def __init__(self, settings):
-        self.pool = ConnectionPool(max_size=8)
-        self.timeout = 30
+        # keep the pool in proportion to worker concurrency
+        pool_size = max(20, settings.worker_concurrency)
+        self.pool = ConnectionPool(max_size=pool_size)
+        self.timeout = settings.payment_timeout_seconds
+        self.pool.acquire_timeout = 2
+        log.info("payment pool sized to %s", pool_size)
         self.client = build_client(settings)`,
};

export const MOCK_INCIDENT: Incident = {
  id: "INC-4471",
  title: "Confirmation emails stopped going out during checkout",
  service: "checkout-confirmation",
  severity: "Sev-2 · customer impacting",
  opened_at: "14:06 IST",
  window: "13:48 – 14:21",
  stage: "awaiting_engineer_review",
  services_touched: 4,
  dlq_count: 1284,
  signals: DEGRADED_SIGNALS,
  replay: {
    tied_to_incident: 1284,
    replayed: 0,
    succeeded: 0,
    failed: 0,
    remaining: 1284,
  },
  evidence: [
    {
      id: "e1",
      timestamp: "13:52:07",
      source: "github",
      description:
        "Deploy a3f91c2 — “tune payment client pool for cost” — changed POOL_MAX_SIZE 40 → 8",
      artifact_key: "s3://eventdoctor-evidence/INC-4471/github-deploys.json",
      highlighted: true,
    },
    {
      id: "e2",
      timestamp: "13:54:41",
      source: "cloudwatch",
      description: "Payment call p99 crossed 1.0s for the first time in 30 days",
      artifact_key: "s3://eventdoctor-evidence/INC-4471/metrics-latency.json",
    },
    {
      id: "e3",
      timestamp: "13:58:12",
      source: "lambda",
      description: "Worker concurrency reached 98/100; throttles begin",
      artifact_key: "s3://eventdoctor-evidence/INC-4471/metrics-concurrency.json",
    },
    {
      id: "e4",
      timestamp: "14:01:35",
      source: "sqs",
      description: "Queue depth climbing steadily — 9,412 visible messages",
      artifact_key: "s3://eventdoctor-evidence/INC-4471/queue-depth.json",
    },
    {
      id: "e5",
      timestamp: "14:06:02",
      source: "sqs",
      description: "First message hit maxReceiveCount=5 and moved to the DLQ",
      artifact_key: "s3://eventdoctor-evidence/INC-4471/dlq-samples.json",
    },
    {
      id: "e6",
      timestamp: "14:06:02",
      source: "cloudwatch",
      description:
        "No scaling change, traffic spike, or config update in the window — alternatives ruled out",
      artifact_key: "s3://eventdoctor-evidence/INC-4471/ruled-out.json",
    },
  ],
  rca: {
    headline:
      "A deploy shrank the payment service connection pool from 40 to 8, and everything downstream queued behind it.",
    explanation:
      "Requests now wait for a free connection instead of a response. Each confirmation worker holds its slot about 14× longer, so the queue outpaces the consumer, retries pile more load onto the same starved pool, and messages eventually exhaust maxReceiveCount and drop into the DLQ.",
    findings: [
      {
        kind: "root_cause",
        statement:
          "Pool size reduced to 8 in payment_client.py under deploy a3f91c2, 14 minutes before the first timeout.",
      },
      {
        kind: "symptom",
        statement:
          "DLQ growth, queue depth, and worker concurrency saturation all began after the latency shift, not before it.",
      },
      {
        kind: "contributing_factor",
        statement:
          "Retry policy has no backoff, so failing messages returned at full rate and roughly doubled pressure on the pool.",
      },
    ],
    confidence: "high",
    confidence_note:
      "Deploy timing and the pool metric agree; no config or traffic change found in the window.",
    causal_nodes: [
      {
        id: "n1",
        label: "Connection pool cut 40 → 8",
        detail: "deploy a3f91c2 · 13:52",
        kind: "root_cause",
      },
      {
        id: "n2",
        label: "Payment calls slow down",
        detail: "p99 240ms → 3.4s",
        kind: "symptom",
      },
      {
        id: "n3",
        label: "Worker slots all busy",
        detail: "concurrency 98 / 100",
        kind: "symptom",
      },
      {
        id: "n4",
        label: "Queue stops draining",
        detail: "depth 12 → 9,400",
        kind: "symptom",
      },
      {
        id: "n5",
        label: "Messages retry",
        detail: "visibility timeouts",
        kind: "contributing_factor",
      },
      {
        id: "n6",
        label: "Payment service throttles",
        detail: "429 rate 0.2% → 31%",
        kind: "symptom",
      },
      {
        id: "n7",
        label: "DLQ fills up",
        detail: "1,284 events · the alert",
        kind: "alert",
      },
    ],
    causal_edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6" },
      { from: "n6", to: "n7" },
    ],
  },
  proposal: PRIMARY_PROPOSAL,
  validation: null,
};

export const MOCK_VALIDATION = {
  run_id: "318",
  duration_seconds: 161,
  report_key: "s3://eventdoctor-evidence/INC-4471/validation-318.json",
  checks: [
    { name: "Unit tests", status: "pass" as const, detail: "142 passed" },
    { name: "Build", status: "pass" as const, detail: "succeeded" },
    { name: "Static and security scan", status: "pass" as const, detail: "clean" },
    {
      name: "Sample failed events replayed on the patch",
      status: "pass" as const,
      detail: "20 of 20 succeeded",
    },
  ],
};

// Two extra incidents so the list page isn't a list of one.
// Only INC-4471 has a full investigation attached.
export const OTHER_INCIDENTS: Incident[] = [
  {
    id: "INC-4468",
    title: "Search results going stale for logged-in users",
    service: "catalog-search",
    severity: "Sev-3 · degraded",
    opened_at: "09:14 IST",
    window: "08:50 – 09:40",
    stage: "recovered",
    services_touched: 2,
    dlq_count: 0,
    signals: RECOVERED_SIGNALS,
    replay: { tied_to_incident: 0, replayed: 0, succeeded: 0, failed: 0, remaining: 0 },
    deployed_version: "catalog-search-indexer:41",
    review_note: "Approved as proposed.",
    evidence: [
      {
        id: "a1",
        timestamp: "08:51:20",
        source: "cloudwatch",
        description: "Index refresh job stopped emitting completion metrics",
      },
      {
        id: "a2",
        timestamp: "09:02:11",
        source: "lambda",
        description: "Refresh function timing out at 900s, its configured ceiling",
        highlighted: true,
      },
      {
        id: "a3",
        timestamp: "09:14:00",
        source: "cloudwatch",
        description: "Cache age crossed the 30 minute staleness threshold",
      },
    ],
    rca: {
      headline:
        "The index refresh job outgrew its 15 minute timeout, so the cache was never replaced.",
      explanation:
        "Catalog volume grew past the point where a full refresh finishes inside the function timeout. Each run was killed partway through, leaving the previous index in place, so results aged without anything reporting an error.",
      findings: [
        {
          kind: "root_cause",
          statement:
            "Refresh job runtime exceeded the 900s Lambda timeout after catalog volume grew 40% this quarter.",
        },
        {
          kind: "symptom",
          statement: "Stale search results, with no error surfaced to users.",
        },
        {
          kind: "contributing_factor",
          statement:
            "No alarm existed on refresh completion, only on refresh errors — and a timeout is not an error.",
        },
      ],
      confidence: "high",
      confidence_note: "Runtime trend and catalog growth line up precisely.",
      causal_nodes: [
        {
          id: "m1",
          label: "Catalog grew 40%",
          detail: "over the quarter",
          kind: "root_cause",
        },
        {
          id: "m2",
          label: "Refresh hits timeout",
          detail: "900s ceiling",
          kind: "symptom",
        },
        { id: "m3", label: "Index never replaced", detail: "cache ages", kind: "symptom" },
        { id: "m4", label: "Stale results", detail: "the report", kind: "alert" },
      ],
      causal_edges: [
        { from: "m1", to: "m2" },
        { from: "m2", to: "m3" },
        { from: "m3", to: "m4" },
      ],
    },
    proposal: {
      id: "prop-a",
      file_path: "services/catalog/refresh_handler.py",
      summary: "Refresh the index in batches so a run always finishes inside the timeout.",
      reasoning:
        "Raising the timeout only buys time until the catalog grows again. Batching makes runtime independent of total catalog size.",
      expected_behaviour: "Refresh completes in under 4 minutes regardless of catalog size.",
      risks: ["A partial batch failure now leaves part of the index older than the rest."],
      additions: 5,
      deletions: 1,
      diff: `@@ -44,7 +44,11 @@ def handler(event, context):
-    reindex(catalog.all())
+    for batch in catalog.batches(size=5000):
+        reindex(batch)
+        checkpoint(batch.last_id)
+    log.info("refresh complete")`,
    },
    validation: {
      run_id: "311",
      duration_seconds: 138,
      checks: [
        { name: "Unit tests", status: "pass", detail: "88 passed" },
        { name: "Build", status: "pass", detail: "succeeded" },
        { name: "Static and security scan", status: "pass", detail: "clean" },
        { name: "Refresh run against a sample catalog", status: "pass", detail: "3m 42s" },
      ],
    },
  },
  {
    id: "INC-4472",
    title: "Intermittent 502s on the storefront edge",
    service: "storefront-edge",
    severity: "Sev-3 · degraded",
    opened_at: "15:41 IST",
    window: "15:30 – now",
    stage: "analysing",
    services_touched: 3,
    dlq_count: 0,
    signals: [
      { label: "5xx rate", value: "1.8%", healthy: false },
      { label: "Upstream p99", value: "0.9s", healthy: true },
      { label: "Healthy targets", value: "6 / 8", healthy: false },
    ],
    replay: { tied_to_incident: 0, replayed: 0, succeeded: 0, failed: 0, remaining: 0 },
    evidence: [
      {
        id: "b1",
        timestamp: "15:31:02",
        source: "cloudwatch",
        description: "Two targets failing health checks, rotating between instances",
      },
      {
        id: "b2",
        timestamp: "15:38:47",
        source: "cloudwatch",
        description: "5xx rate climbing on the edge, no matching upstream error",
      },
    ],
    rca: null,
    proposal: null,
    validation: null,
  },
];

export const ALL_MOCK_INCIDENTS = [MOCK_INCIDENT, ...OTHER_INCIDENTS];
