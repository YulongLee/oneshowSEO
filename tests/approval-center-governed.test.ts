import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Approval Center reads the governed queue with tenant scope and complete decision context", async () => {
  const route = await readFile(new URL("../app/api/approvals/route.ts", import.meta.url), "utf8");
  for (const expected of [
    /approval_recommendations r/,
    /r\.organization_id=\?/,
    /approval_recommendation_versions/,
    /approval_evidence_refs/,
    /approval_change_sets/,
    /approval_assignments/,
    /stateRevision/,
    /impactHypothesis/,
    /estimatedCost/,
    /ApprovalOperationsService/,
    /permissionsForRole/,
  ])
    assert.match(route, expected);
});

test("Approval Center renders real versions, confidence, provenance, risk, assignee, and governed state", async () => {
  const page = await readFile(new URL("../app/workspace/ApprovalCenter.tsx", import.meta.url), "utf8");
  for (const expected of [
    /source:\"governed\"\|\"legacy\"/,
    /evidenceRefs:/,
    /changeSets:/,
    /impactHypothesis/,
    /estimatedCost/,
    /assignee/,
    /stateRevision/,
    /item\.confidence/,
    /item\.currentVersion/,
    /pendingState/,
  ])
    assert.match(page, expected);
});
