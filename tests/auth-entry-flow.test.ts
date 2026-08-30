import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("app/page.tsx", "utf8");
const pricing = readFileSync("app/pricing/page.tsx", "utf8");
const form = readFileSync("app/auth/AuthForm.tsx", "utf8");
const loginPage = readFileSync("app/login/page.tsx", "utf8");
const registerPage = readFileSync("app/register/page.tsx", "utf8");

test("public product entry points open login before registration", () => {
  assert.match(home, /href="\/login"/);
  assert.doesNotMatch(home, /href="\/register"/);
  assert.match(pricing, /<Link href="\/login">/);
  assert.doesNotMatch(pricing, /href=\{[^}]*\/register/);
});

test("login presents registration as the secondary path and preserves returnTo", () => {
  assert.match(form, /还没有账号？/);
  assert.match(form, /免费注册/);
  assert.match(form, /`\/register\?returnTo=\$\{encodeURIComponent\(returnTo\)\}`/);
  assert.match(form, /`\/login\?returnTo=\$\{encodeURIComponent\(returnTo\)\}`/);
});

test("signed-in users do not see authentication screens again", () => {
  for (const page of [loginPage, registerPage]) {
    assert.match(page, /await getCurrentUser\(\)/);
    assert.match(page, /redirect\("\/workspace"\)/);
  }
});
