// These types mirror the Pydantic schemas in backend/app/models/.
// If your teammate changes a field name there, change it here too.

export type Role = "Admin" | "SRE" | "Developer" | "Viewer";

export type WorkflowStage =
  | "collecting_evidence"
  | "analysing"
  | "awaiting_engineer_review"
  | "regenerating"
  | "validating"
  | "awaiting_deploy_approval"
  | "deploying"
  | "replaying"
  | "recovered";

export type FindingKind = "root_cause" | "symptom" | "contributing_factor";

export interface EvidenceItem {
  id: string;
  timestamp: string; // "13:52:07"
  source: "github" | "cloudwatch" | "sqs" | "lambda";
  description: string;
  artifact_key?: string; // S3 key, shown as a link in the UI
  highlighted?: boolean;
}

export interface CausalNode {
  id: string;
  label: string;
  detail: string;
  kind: FindingKind | "alert";
}

export interface CausalEdge {
  from: string;
  to: string;
}

export interface Finding {
  kind: FindingKind;
  statement: string;
}

export interface RCAResult {
  headline: string;
  explanation: string;
  findings: Finding[];
  confidence: "low" | "medium" | "high";
  confidence_note: string;
  causal_nodes: CausalNode[];
  causal_edges: CausalEdge[];
}

export interface RemediationProposal {
  id: string;
  file_path: string;
  summary: string;
  reasoning: string;
  expected_behaviour: string;
  risks: string[];
  diff: string; // unified diff text
  additions: number;
  deletions: number;
}

export interface ValidationCheck {
  name: string;
  status: "pass" | "fail" | "running";
  detail?: string;
}

export interface ValidationReport {
  run_id: string;
  duration_seconds: number;
  checks: ValidationCheck[];
  report_key?: string;
}

export interface ReplayStatus {
  tied_to_incident: number;
  replayed: number;
  succeeded: number;
  failed: number;
  remaining: number;
}

export interface Signal {
  label: string;
  value: string;
  healthy: boolean;
}

export interface Incident {
  id: string;
  title: string;
  service: string;
  severity: string;
  opened_at: string;
  window: string;
  stage: WorkflowStage;
  services_touched: number;
  dlq_count: number;
  evidence: EvidenceItem[];
  rca: RCAResult | null;
  proposal: RemediationProposal | null;
  validation: ValidationReport | null;
  replay: ReplayStatus;
  signals: Signal[];
  deployed_version?: string;
  review_note?: string;
}

export type ReviewAction = "approve" | "reject" | "edit" | "request_new_fix";

export interface ReviewSubmission {
  action: ReviewAction;
  edited_diff?: string;
  constraints?: string;
}

export interface IncidentSummary {
  id: string;
  title: string;
  service: string;
  severity: string;
  opened_at: string;
  stage: WorkflowStage;
  dlq_count: number;
  headline: string | null;
}
