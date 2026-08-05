import assert from "node:assert/strict";
import test from "node:test";
import { translateText } from "../app/i18n";

const acceptanceMessages = [
  "请输入有效的邮箱地址",
  "邮箱验证码错误或已过期",
  "邮箱或密码错误",
  "账号已暂停，请联系管理员",
  "当前组织不可用，请联系组织管理员",
  "组织必须保留至少一位有效 Owner",
  "项目不存在或无权访问",
  "项目已被其他成员更新，请刷新后重试",
  "只有活跃项目可以修改设置",
  "团队席位已用完，请升级套餐或取消待处理邀请",
  "该邮箱已是成员或已有待处理邀请",
  "邀请链接无效、已过期或已使用",
  "成员不存在或状态未变化",
] as const;

test("commercial identity and governance states have English UI copy", () => {
  for (const message of acceptanceMessages) {
    const translated = translateText(message);
    assert.notEqual(translated, message, message);
    assert.match(translated, /[A-Za-z]/, message);
  }
});

test("dynamic team and limit states translate without changing their values", () => {
  assert.equal(translateText("3 位成员"), "3 members");
  assert.equal(translateText("显示 2 / 3 位成员"), "Showing 2 of 3 members");
  assert.equal(translateText("2 / 5 个套餐额度"), "2 / 5 plan capacity");
});
