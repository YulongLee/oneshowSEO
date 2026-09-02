import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../app/workspace/SettingsCenter.tsx", import.meta.url);
const pagePath = new URL("../app/workspace/page.tsx", import.meta.url);
const notificationPath = new URL("../lib/notifications.ts", import.meta.url);

test("settings center exposes the requested commercial configuration areas", async () => {
  const source = await readFile(componentPath, "utf8");
  for (const label of ["项目设置", "数据源", "发布渠道", "AI & Agent", "团队与权限", "通知设置", "系统设置"]) {
    assert.match(source, new RegExp(label.replace("&", "&")));
  }
  assert.match(source, /\/api\/integrations\?projectId=/);
  assert.match(source, /\/api\/agents\/schedules\?projectId=/);
  assert.match(source, /\/api\/notifications\/preferences/);
  assert.match(source, /\/api\/projects\/\$\{encodeURIComponent\(project\.id\)\}\/team/);
  assert.match(source, /method: "PATCH"/);
});

test("workspace uses the new settings center without prototype identities", async () => {
  const [component, page] = await Promise.all([readFile(componentPath, "utf8"), readFile(pagePath, "utf8")]);
  assert.match(page, /<SettingsCenter/);
  for (const fake of ["面试稳", "GPT-4o", "运营A", "运营B", "小红书官方", "微博官方"]) {
    assert.doesNotMatch(component, new RegExp(fake));
  }
  assert.match(component, /品牌资料上传能力尚未开放/);
  assert.match(component, /不会展示虚构资料/);
});

test("notification preferences remain usable without the optional recovery-link secret", async () => {
  const source = await readFile(notificationPath, "utf8");
  assert.match(source, /secret\?new RecoveryLinkSigner\(secret\):null/);
  assert.doesNotMatch(source, /if\(!secret\)throw new Error\("NOTIFICATION_RECOVERY_NOT_CONFIGURED"\)/);
});
