import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedRequestOrigin } from "../lib/auth";

test("logout accepts every explicitly configured trusted domain alias", () => {
  const previousAppUrl = process.env.APP_URL;
  const previousAllowedOrigins = process.env.AUTH_ALLOWED_ORIGINS;
  process.env.APP_URL = "https://gameforcast.top";
  process.env.AUTH_ALLOWED_ORIGINS =
    "https://gameforcast.top,https://www.gameforcast.top";

  try {
    assert.equal(
      isTrustedRequestOrigin(
        new Request("https://www.gameforcast.top/api/auth/logout", {
          method: "POST",
          headers: { origin: "https://gameforcast.top" },
        }),
      ),
      true,
    );
    assert.equal(
      isTrustedRequestOrigin(
        new Request("https://gameforcast.top/api/auth/logout", {
          method: "POST",
          headers: { origin: "https://www.gameforcast.top" },
        }),
      ),
      true,
    );
    assert.equal(
      isTrustedRequestOrigin(
        new Request("https://gameforcast.top/api/auth/logout", {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
      ),
      false,
    );
  } finally {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
    if (previousAllowedOrigins === undefined)
      delete process.env.AUTH_ALLOWED_ORIGINS;
    else process.env.AUTH_ALLOWED_ORIGINS = previousAllowedOrigins;
  }
});

test("logout accepts requests without a browser Origin header", () => {
  assert.equal(
    isTrustedRequestOrigin(
      new Request("https://gameforcast.top/api/auth/logout", {
        method: "POST",
      }),
    ),
    true,
  );
});
