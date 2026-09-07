import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Content Library is backed by content and publish records", async () => {
  const component = await read("app/workspace/ContentLibraryCenter.tsx");
  assert.match(component, /\/content`/);
  assert.match(component, /\/publish`/);
  assert.match(component, /verificationStatus === "verified"/);
  assert.match(component, /content\.versions\.filter/);
  assert.doesNotMatch(component, /AI面试|AI 面试|236/);
});

test("Content Library exposes the complete asset management workflow", async () => {
  const component = await read("app/workspace/ContentLibraryCenter.tsx");
  for (const label of ["全部内容", "草稿", "待审核", "待发布", "已发布", "检查通过", "回收站", "内容类型分布", "平台分布", "热门主题 Top 10"])
    assert.match(component, new RegExp(label));
  assert.match(component, /exportCsv/);
  assert.match(component, /高级筛选/);
  assert.match(component, /view === "grid"/);
});

test("Content Library keeps honest empty and responsive states", async () => {
  const [component, css] = await Promise.all([
    read("app/workspace/ContentLibraryCenter.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(component, /暂无内容资产/);
  assert.match(component, /流量待接入/);
  assert.match(component, /生成内容后展示类型分布/);
  assert.match(css, /@media\(max-width:1320px\).*content-library-v2-layout/s);
  assert.match(css, /@media\(max-width:900px\).*content-library-v2-grid/s);
});

test("workspace routes Content Library to the redesigned center", async () => {
  const [page,hub] = await Promise.all([read("app/workspace/page.tsx"),read("app/workspace/ContentHub.tsx")]);
  assert.match(page, /import ContentHub/);
  assert.match(page, /contentRoutes\.includes\(active\)/);
  assert.match(hub, /<ContentLibraryCenter/);
  assert.match(hub, /"内容库":"内容资产"/);
});
