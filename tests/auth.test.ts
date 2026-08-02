import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, validatePassword, verifyPassword } from "../lib/password";

test("passwords are salted and verify correctly", async () => {
  const password = "Commercial2026!";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.match(first, /^pbkdf2-sha256\$210000\$/);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("WrongPassword2026!", first), false);
});

test("commercial password policy rejects weak credentials", () => {
  assert.equal(validatePassword("short"), "密码至少需要 10 位");
  assert.equal(validatePassword("onlyletterslong"), "密码需要同时包含字母和数字");
  assert.equal(validatePassword("StrongPassword2026!"), null);
});
