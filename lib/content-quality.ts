export type ContentCheck = { key: string; label: string; status: "pass" | "warning"; detail: string };
export function checkContent(body: string, keyword: string, sourceRef: string) {
  const checks: ContentCheck[] = [
    { key: "body", label: "正文完整", status: body.trim().length >= 80 ? "pass" : "warning", detail: "正文至少 80 个字符，避免空白或占位内容" },
    { key: "structure", label: "标题与结构", status: /^#\s+\S.+/m.test(body) && /^##\s+\S.+/m.test(body) ? "pass" : "warning", detail: "正文需要主标题和分节标题" },
    { key: "keyword", label: "目标关键词", status: keyword.trim() && body.toLocaleLowerCase().includes(keyword.trim().toLocaleLowerCase()) ? "pass" : "warning", detail: "正文需覆盖目标关键词" },
    { key: "source", label: "来源声明", status: /^https:\/\/\S+$/.test(sourceRef.trim()) ? "pass" : "warning", detail: "需提供 HTTPS 来源；来源声明不代表事实已核验，提交审核时需人工确认" },
    { key: "safe_markup", label: "正文格式安全", status: /<\/?(?:script|iframe|object|embed|form)\b|javascript\s*:|data\s*:\s*text\/html|EICAR-STANDARD-ANTIVIRUS-TEST-FILE/i.test(body) ? "warning" : "pass", detail: "正文不得包含可执行脚本或嵌入表单" },
  ];
  const passed = checks.filter(c => c.status === "pass").length;
  return { checks, passed, total: checks.length, score: Math.round(passed / checks.length * 100), ready: passed === checks.length };
}
