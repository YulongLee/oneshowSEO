import test from "node:test";import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";import {tmpdir} from "node:os";import {join} from "node:path";
import { approvalDeadline,approvalRisk,ensureApprovalSchema } from "../lib/approvals";import { getDatabase } from "../lib/auth";
process.env.DATABASE_PATH=join(mkdtempSync(join(tmpdir(),"oneshowseo-approvals-")),"test.sqlite");
test("approval center creates an auditable decision store",async()=>{await ensureApprovalSchema();const table=getDatabase().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='approval_decisions'").first<{name:string}>();assert.equal(table?.name,"approval_decisions");assert.equal(approvalRisk(100),"high");assert.equal(approvalRisk(60),"medium");assert.equal(approvalRisk(20),"low");assert.equal(approvalDeadline(100),100+7*86400)});
