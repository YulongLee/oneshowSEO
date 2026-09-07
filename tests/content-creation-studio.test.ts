import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Content Creation is a dedicated workspace destination", async () => {
  const page = await read("app/workspace/page.tsx");
  assert.match(page, /\[NotePencil, "内容创作", "内容创作"\]/);
  assert.match(page, /active === "内容创作"/);
  assert.match(page, /<ContentCreationStudio/);
});

test("Content Creation exposes the brief, editor, checks, score and platform workflow", async () => {
  const studio = await read("app/workspace/ContentCreationStudio.tsx");
  for (const label of ["内容概览", "编辑器", "多平台版本", "SEO / GEO 检查", "内容评分"])
    assert.match(studio, new RegExp(label.replace("/", "\\/")));
  assert.match(studio, /内容简报/);
  assert.match(studio, /内容正文编辑器/);
  assert.match(studio, /AI 助手/);
  assert.match(studio, /提交审核/);
  assert.match(studio, /20 Credits/);
  assert.doesNotMatch(studio, /AI 面试助手真的有用吗/);
});

test("saved drafts are durable versions scoped to the current project and run", async () => {
  const route = await read("app/api/projects/[id]/content/route.ts");
  const versions = await read("lib/content-versions.ts");
  assert.match(versions, /CREATE TABLE IF NOT EXISTS content_versions/);
  assert.match(versions, /organization_id TEXT NOT NULL/);
  assert.match(versions, /project_id TEXT NOT NULL/);
  assert.match(versions, /run_id TEXT NOT NULL/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /content_version_saved/);
  assert.match(route, /permissions\.contentCreate/);
  assert.match(await read("lib/content-studio.ts"), /kind='content_draft'/);
});

test("Content Creation keeps responsive editing and honest unavailable states", async () => {
  const [studio, css] = await Promise.all([
    read("app/workspace/ContentCreationStudio.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(studio, /还没有可编辑的内容/);
  assert.match(studio, /素材库尚未接入/);
  assert.match(studio, /待生成平台版本/);
  assert.match(css, /@media\(max-width:1120px\).*content-creation-layout/s);
  assert.match(css, /@media\(max-width:800px\).*content-creation-layout/s);
});
