import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { normalizeProjectUrl, pageLimit, projectLimit } from "../lib/product";
import { runSiteAudit } from "../lib/site-audit";
import type { AppUser } from "../lib/auth";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "oneshowseo-product-")), "test.sqlite");

const user = (plan: AppUser["plan"]): AppUser => ({ id:"user",email:"u@example.test",name:"User",role:"user",status:"active",plan,trialEndsAt:null,emailVerifiedAt:1,createdAt:1 });

test("project URLs are canonicalized and credentials are rejected", () => {
  assert.deepEqual(normalizeProjectUrl("Example.COM/path?q=1"), { siteUrl:"https://example.com/", host:"example.com" });
  assert.throws(() => normalizeProjectUrl("https://user:pass@example.com"), /INVALID_SITE_URL/);
  assert.throws(() => normalizeProjectUrl("ftp://example.com"), /INVALID_SITE_URL/);
});

test("commercial limits vary by plan", () => {
  assert.equal(projectLimit(user("trial")), 1); assert.equal(pageLimit(user("trial")), 10);
  assert.equal(projectLimit(user("business")), 100); assert.equal(pageLimit(user("business")), 1000);
});

test("site audit refuses private network targets", async () => {
  const result = await runSiteAudit("http://127.0.0.1/", 1);
  assert.equal(result.pages.length, 1); assert.equal(result.pages[0].statusCode, 0);
  assert.equal(result.findings[0].severity, "critical"); assert.match(result.findings[0].evidence || "", /UNSAFE_URL/);
  assert.equal(result.summary.total, 1); assert.equal(result.summary.failed, 1);
  assert.equal(result.checks[0].status, "fail"); assert.equal(result.checks[0].confidence, "confirmed");
  assert.equal(result.categoryScores.find((item) => item.category === "technical")?.score, 0);
});
