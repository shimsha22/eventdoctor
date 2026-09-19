# EventDoctor — frontend

The full console: landing page, sign-in, incident list, and the investigation and
approval workflow for a single incident.

## Run it

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. It works immediately — no backend, no AWS account, no
Cognito pool needed.

## The two switches

`.env.local`:

```
NEXT_PUBLIC_USE_MOCK=true          # UI runs on its own demo data
NEXT_PUBLIC_API_URL=http://localhost:8000

NEXT_PUBLIC_COGNITO_USER_POOL_ID=  # empty -> role picker instead of real login
NEXT_PUBLIC_COGNITO_CLIENT_ID=
NEXT_PUBLIC_COGNITO_REGION=ap-south-1
```

They're independent. You can run real Cognito against mock data, or the real backend
with the role picker. Restart `npm run dev` after changing either.

- **Data:** set `NEXT_PUBLIC_USE_MOCK=false` to call FastAPI. Every network call lives
  in `src/lib/api.ts`, so nothing else changes.
- **Auth:** fill in the two Cognito values to get a real username/password form. Leave
  them empty and the login page offers a role picker instead.

Demo on whichever side is actually working. That's the point of splitting them.

## Pages

| Route | What it is |
|---|---|
| `/` | Landing page — the failure chain, how the workflow runs, the safety rule |
| `/login` | Cognito sign-in, or role picker when Cognito isn't configured |
| `/incidents` | All incidents, with the ones waiting on a person marked |
| `/incidents/[id]` | The investigation and the full approval workflow |

`/incidents` and `/incidents/[id]` redirect to `/login` without a session.

## Features

**Investigation**
- Causal graph laid out from whatever chain the backend returns
- Root cause with symptom / root cause / contributing factor kept separate
- Confidence level, plus what the analysis ruled out
- Expandable evidence rows showing the stored artifact each line came from

**Remediation and approval**
- Proposed fix with a syntax-coloured diff, reasoning, expected behaviour and risks
- Engineer review: approve, edit the patch inline, reject, or ask for a different fix
  with a constraint in plain English
- Automated checks that appear one at a time as they finish
- Role-checked deploy approval — Admin and SRE only
- Versioned deploy, then replay limited to this incident's failed events
- Counters and signals that move as the replay runs, ending in recovery

**Everywhere**
- Role switcher to demonstrate what each role can and can't do
- "Reset the demo" so the next judge sees it from the start
- Errors are shown, never swallowed; no button can get stuck

## Demo path (about 2 minutes)

1. Landing page — scroll the failure chain. "The alert was the DLQ. The cause was a
   connection pool."
2. Sign in as **SRE**.
3. Open INC-4471. Show the graph, then the root cause with symptom separated from cause.
4. Click an evidence row — it names the artifact it came from.
5. **Ask for a different fix**, type a constraint, watch a different proposal come back.
   This is the line that proves the fix isn't hardcoded.
6. **Approve**. Checks appear one at a time.
7. Switch the role dropdown to **Viewer** — the deploy button locks. Back to **SRE**.
8. **Deploy this fix** → **Replay these events** → counters move, signals turn green.
9. **Reset the demo**.

## What the backend has to return

`GET /incidents` returns `IncidentSummary[]`, `GET /incidents/{id}` returns `Incident`.
Both shapes are in `src/lib/types.ts`. These all return the updated `Incident`:

| Method | Path | Sent |
|---|---|---|
| GET | `/incidents` | — |
| GET | `/incidents/{id}` | — |
| POST | `/incidents/{id}/review` | `{ action, edited_diff?, constraints? }` |
| POST | `/incidents/{id}/validate` | — |
| POST | `/incidents/{id}/deploy` | — |
| POST | `/incidents/{id}/replay` | — |
| POST | `/incidents/{id}/reset` | — |

`action` is one of `approve`, `reject`, `edit`, `request_new_fix`.

Return **403** when a role isn't allowed — the UI already shows the right message.

The frontend sends `Authorization: Bearer <token>`. With Cognito configured that's a
real ID token; with the role picker it's the string `demo-token`.

Two things that will otherwise cost you an hour:
- **CORS.** FastAPI must allow `http://localhost:3000` or every request fails in the
  browser with no useful error.
- **Cognito groups.** Role comes from `cognito:groups` in the ID token. Create groups
  named exactly `Admin`, `SRE`, `Developer`, `Viewer` and put the test users in them.

## Where to change things

| Want to change | File |
|---|---|
| The demo incidents, metrics, diffs | `src/lib/mockData.ts` |
| Anything network-related | `src/lib/api.ts` |
| Sign-in behaviour, role mapping | `src/lib/auth.tsx` |
| Who can review / who can deploy | `CAN_REVIEW` in `RemediationPanel.tsx`, `CAN_DEPLOY` in `DeployGate.tsx` |
| Colours and fonts | `src/app/globals.css` |
| Landing page copy | `src/app/page.tsx` |

Role checks here are for the interface only. The real enforcement is the 403 from
FastAPI — say that out loud during the demo, because judges will ask.
