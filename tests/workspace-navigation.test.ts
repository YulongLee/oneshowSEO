import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("active workspace navigation groups remain user-collapsible", async () => {
  const source = await readFile(
    new URL("../app/workspace/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /closedNavGroups\[group\.title\] \? " closed" : ""/,
  );
  assert.match(
    source,
    /aria-expanded=\{!closedNavGroups\[group\.title\]\}/,
  );
  assert.doesNotMatch(
    source,
    /closedNavGroups\[group\.title\].*group\.items\.some/,
  );
});
