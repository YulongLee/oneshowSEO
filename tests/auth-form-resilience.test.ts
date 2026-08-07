import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const form = readFileSync("app/auth/AuthForm.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const login = readFileSync("app/api/auth/login/route.ts", "utf8");
const register = readFileSync("app/api/auth/register/route.ts", "utf8");
const service = readFileSync("deploy/oneshowseo.service", "utf8");

test("auth fields use one visible focus frame while preserving container focus", () => {
  assert.match(styles, /\.auth-card form>label>div:focus-within/);
  assert.match(styles, /\.auth-card form>label>div input:focus-visible/);
  assert.match(styles, /outline:none!important/);
});

test("auth forms turn empty or invalid server bodies into a friendly account error", () => {
  assert.match(form, /parseAuthResponse/);
  assert.match(form, /await response\.text\(\)/);
  assert.match(form, /账户服务暂时不可用，请稍后重试/);
  assert.doesNotMatch(form, /await response\.json\(\)/);
});

test("auth routes always return JSON for unexpected service failures", () => {
  for (const route of [login, register]) {
    assert.match(route, /AUTH_SERVICE_UNAVAILABLE/);
    assert.match(route, /NextResponse\.json/);
  }
});

test("production service repairs SQLite ownership before every start", () => {
  assert.match(service, /ExecStartPre=\+\/usr\/bin\/install[^\n]+oneshowseo[^\n]+\/var\/www\/oneshowseo\/data/);
  assert.match(service, /ExecStartPre=\+\/usr\/bin\/chown -R oneshowseo:oneshowseo \/var\/www\/oneshowseo\/data/);
});
