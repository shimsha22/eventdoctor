import type { Incident, IncidentSummary, ReviewSubmission, Signal } from "./types";
import {
  MOCK_INCIDENT,
  MOCK_VALIDATION,
  ALTERNATIVE_PROPOSAL,
  PRIMARY_PROPOSAL,
  RECOVERED_SIGNALS,
  ALL_MOCK_INCIDENTS,
} from "./mockData";

/**
 * Everything the UI needs from the backend goes through this file.
 *
 * NEXT_PUBLIC_USE_MOCK=true  -> the UI runs on the demo data in mockData.ts
 * NEXT_PUBLIC_USE_MOCK=false -> the UI calls the FastAPI backend
 *
 * Both adapters return exactly the same shape, so no component ever
 * knows or cares which one is in use.
 */

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const isMockMode = () => USE_MOCK;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- mock state

let mockIncident: Incident = structuredClone(MOCK_INCIDENT);

function resetMock() {
  mockIncident = structuredClone(MOCK_INCIDENT);
}

// ---------------------------------------------------------------- live calls

async function call<T = Incident>(path: string, init?: RequestInit): Promise<T> {
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem("ed_token") : null;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 403) {
    throw new Error("Your role is not allowed to do that.");
  }
  if (res.status === 401) {
    throw new Error("Your Cognito session is missing or expired. Please sign in again.");
  }
  if (!res.ok) {
    throw new Error(`Backend returned ${res.status}. Is FastAPI running?`);
  }
  return res.json();
}

// ---------------------------------------------------------------- public API

export const api = {
  async getIncidents(): Promise<IncidentSummary[]> {
    if (USE_MOCK) {
      await wait(200);
      return ALL_MOCK_INCIDENTS.map((i) => ({
        id: i.id,
        title: i.title,
        service: i.service,
        severity: i.severity,
        opened_at: i.opened_at,
        // the live incident's stage comes from the mutable copy
        stage: i.id === mockIncident.id ? mockIncident.stage : i.stage,
        dlq_count: i.dlq_count,
        headline: i.rca?.headline ?? null,
      }));
    }
    return call<IncidentSummary[]>("/incidents", { method: "GET" });
  },

  async getIncident(id: string): Promise<Incident> {
    if (USE_MOCK) {
      await wait(250);
      if (id === mockIncident.id) return structuredClone(mockIncident);
      const other = ALL_MOCK_INCIDENTS.find((i) => i.id === id);
      if (!other) throw new Error(`No incident called ${id}.`);
      return structuredClone(other);
    }
    return call(`/incidents/${id}`);
  },

  async getLiveSignals(id: string): Promise<Signal[]> {
    if (USE_MOCK) return structuredClone(mockIncident.signals);
    const token = typeof window !== "undefined" ? window.localStorage.getItem("ed_token") : null;
    const res = await fetch(`${API_URL}/incidents/${id}/signals`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) throw new Error("Your Cognito session is missing or expired. Please sign in again.");
    if (res.status === 403) throw new Error("Your role is not allowed to do that.");
    if (!res.ok) throw new Error(`Backend returned ${res.status}. Is the API Gateway running?`);
    const payload = await res.json();
    return payload.signals;
  },

  async submitReview(id: string, body: ReviewSubmission): Promise<Incident> {
    if (USE_MOCK) {
      await wait(500);
      if (body.action === "approve" || body.action === "edit") {
        if (body.action === "edit" && body.edited_diff && mockIncident.proposal) {
          mockIncident.proposal = {
            ...mockIncident.proposal,
            diff: body.edited_diff,
            summary: `${mockIncident.proposal.summary} (edited by the reviewing engineer)`,
          };
        }
        mockIncident.stage = "validating";
        mockIncident.review_note =
          body.action === "edit"
            ? "Approved with engineer edits."
            : "Approved as proposed.";
      } else if (body.action === "request_new_fix") {
        mockIncident.stage = "regenerating";
        mockIncident.review_note = body.constraints
          ? `New fix requested: “${body.constraints}”`
          : "New fix requested.";
        await wait(1600);
        mockIncident.proposal =
          mockIncident.proposal?.id === PRIMARY_PROPOSAL.id
            ? structuredClone(ALTERNATIVE_PROPOSAL)
            : structuredClone(PRIMARY_PROPOSAL);
        mockIncident.stage = "awaiting_engineer_review";
      } else {
        mockIncident.stage = "awaiting_engineer_review";
        mockIncident.proposal = null;
        mockIncident.review_note = "Rejected. No fix is currently proposed.";
      }
      return structuredClone(mockIncident);
    }
    return call(`/incidents/${id}/review`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async runValidation(
    id: string,
    onProgress?: (i: Incident) => void,
  ): Promise<Incident> {
    if (USE_MOCK) {
      mockIncident.stage = "validating";
      mockIncident.validation = {
        ...MOCK_VALIDATION,
        checks: MOCK_VALIDATION.checks.map((c) => ({ ...c, status: "running" as const })),
      };
      // reveal the checks one at a time so the demo shows real progress
      for (let i = 0; i < MOCK_VALIDATION.checks.length; i++) {
        await wait(700);
        mockIncident.validation!.checks[i] = { ...MOCK_VALIDATION.checks[i] };
        onProgress?.(structuredClone(mockIncident));
      }
      mockIncident.stage = "awaiting_deploy_approval";
      return structuredClone(mockIncident);
    }
    return call(`/incidents/${id}/validate`, { method: "POST" });
  },

  async approveDeploy(id: string): Promise<Incident> {
    if (USE_MOCK) {
      mockIncident.stage = "deploying";
      await wait(1800);
      mockIncident.deployed_version = "order-confirmation-worker:12";
      mockIncident.stage = "replaying";
      return structuredClone(mockIncident);
    }
    return call(`/incidents/${id}/deploy`, { method: "POST" });
  },

  async startReplay(
    id: string,
    onProgress?: (i: Incident) => void,
  ): Promise<Incident> {
    if (USE_MOCK) {
      mockIncident.stage = "replaying";
      const total = mockIncident.replay.tied_to_incident;
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        await wait(320);
        const done = Math.round((total * i) / steps);
        const failed = Math.min(3, Math.floor(done / 500));
        mockIncident.replay = {
          tied_to_incident: total,
          replayed: done,
          succeeded: done - failed,
          failed,
          remaining: total - done,
        };
        onProgress?.(structuredClone(mockIncident));
      }
      mockIncident.signals = RECOVERED_SIGNALS;
      mockIncident.stage = "recovered";
      return structuredClone(mockIncident);
    }
    return call(`/incidents/${id}/replay`, { method: "POST" });
  },

  async reset(id: string): Promise<Incident> {
    if (USE_MOCK) {
      resetMock();
      await wait(200);
      return structuredClone(mockIncident);
    }
    return call(`/incidents/${id}/reset`, { method: "POST" });
  },
};
