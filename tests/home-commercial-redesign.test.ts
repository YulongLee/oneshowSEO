import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const styles = readFileSync("app/home.css", "utf8");

test("commercial homepage tells a complete and truthful conversion story", () => {
  for (const section of [
    "growth-hero", "growth-intro", "growth-workflow", "growth-agent-system",
    "growth-capabilities", "growth-integrations", "growth-commercial",
    "growth-security", "growth-faq", "growth-final",
  ]) assert.match(page, new RegExp(section));
  assert.match(page, /在线支付尚未启用/);
  assert.match(page, /高风险操作保留人工审批/);
  assert.doesNotMatch(page, /自动增长|完整功能试用|自动扣款成功/);
});

test("homepage keeps primary conversion paths and locale-specific copy", () => {
  assert.match(page, /href="\/register"/);
  assert.match(page, /href="\/login"/);
  assert.match(page, /href="\/pricing"/);
  assert.match(page, /copy\.en/);
  assert.match(page, /copy\.zh/);
  assert.match(page, /data-no-translate/);
});

test("homepage uses the generated hero asset and responsive accessible controls", () => {
  assert.ok(existsSync("public/marketing/oneshowseo-data-spectrum.png"));
  assert.match(page, /oneshowseo-data-spectrum\.png/);
  assert.match(page, /aria-expanded/);
  assert.match(styles, /@media\s*\(max-width:\s*760px\)/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(styles, /linear-gradient|radial-gradient/);
});

test("hero data spectrum has restrained motion with an accessible static fallback", () => {
  assert.match(page, /growth-spectrum-stage/);
  assert.match(page, /growth-spectrum-left/);
  assert.match(page, /growth-spectrum-right/);
  assert.match(styles, /@keyframes growth-spectrum-breathe/);
  assert.match(styles, /@keyframes growth-spectrum-left/);
  assert.match(styles, /@keyframes growth-spectrum-right/);
  assert.match(styles, /\.growth-spectrum\s*\{[\s\S]*?animation:\s*none\s*!important;[\s\S]*?transform:\s*none\s*!important;/);
});
