import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const styles = readFileSync("app/home.css", "utf8");

test("commercial homepage tells a complete and truthful conversion story", () => {
  for (const section of [
    "visibility-hero", "visibility-daily", "visibility-journey",
    "visibility-evidence", "visibility-why", "visibility-pricing",
    "visibility-faq", "visibility-final",
  ]) assert.match(page, new RegExp(section));
  assert.match(page, /公开试用不会自动扣费/);
  assert.match(page, /关键动作默认保留人工审批/);
  assert.match(page, /让每一个好产品/);
  assert.doesNotMatch(page, /自动增长|完整功能试用|自动扣款成功/);
});

test("homepage keeps primary conversion paths and locale-specific copy", () => {
  assert.match(page, /href="\/login"/);
  assert.doesNotMatch(page, /href="\/register"/);
  assert.match(page, /href="\/pricing"/);
  assert.match(page, /copy\.en/);
  assert.match(page, /copy\.zh/);
  assert.match(page, /data-no-translate/);
});

test("homepage uses the generated hero asset and responsive accessible controls", () => {
  assert.ok(existsSync("public/marketing/visibility-journey.png"));
  assert.match(page, /visibility-journey\.png/);
  assert.match(page, /aria-expanded/);
  assert.match(styles, /@media\s*\(max-width:\s*860px\)/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(styles, /linear-gradient|radial-gradient/);
});

test("homepage communicates the visibility journey with a motion-safe fallback", () => {
  assert.match(page, /visibility-hero-art/);
  assert.match(page, /visibility-state state-\$\{index\+1\}/);
  assert.match(page, /visibilityStates\.map/);
  assert.match(styles, /@keyframes\s+visibility-breathe/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.visibility-hero-art\s*>\s*img\s*\{\s*animation:\s*none/);
});
