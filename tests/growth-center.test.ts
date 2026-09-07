import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("Growth Center turns verified product data into a navigable action flow",async()=>{
  const [center,page]=await Promise.all([read("app/workspace/GrowthCenter.tsx"),read("app/workspace/page.tsx")]);
  for(const label of ["增长总览","SEO 研究","技术审计","关键词","竞品分析"])assert.match(page,new RegExp(label));
  for(const label of ["SEO 健康分","开放问题","增长机会","待审批行动","优先行动","建议下一步","数据可信度"])assert.match(center,new RegExp(label));
  assert.match(center,/run\.checksFailed\+run\.checksWarning/);
  assert.match(center,/research\?\.opportunities/);
  assert.match(center,/tasks\.filter\(item=>item\.status==="proposed"\)/);
  assert.match(center,/"04","执行增长","创建内容或修复任务",ClipboardText,"任务中心"/);
  assert.doesNotMatch(center,/128\.6K|96\.8%|演示数据|模拟数据/);
});

test("Research and competitor menu entries open distinct views",async()=>{
  const page=await read("app/workspace/page.tsx");
  assert.match(page,/initialTab=\{active === "竞品分析" \? "竞品情报" : "研究总览"\}/);
  assert.match(page,/\[Brain, "SEO 研究", "SEO研究"\]/);
  assert.match(page,/\[Target, "竞品分析", "竞品分析"\]/);
});
