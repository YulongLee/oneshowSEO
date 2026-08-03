import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type AuditFinding = { category: string; severity: "critical" | "high" | "medium" | "low"; title: string; description: string; evidence?: string; url: string };
export type AuditedPage = { url: string; statusCode: number; title: string; description: string; canonical: string; h1Count: number; imagesWithoutAlt: number; findings: AuditFinding[] };

function privateAddress(address: string): boolean {
  if (address === "::1" || address === "::" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) || (parts[0] >= 224);
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port && !["80", "443"].includes(url.port)) throw new Error("UNSAFE_URL");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("UNSAFE_URL");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) throw new Error("UNSAFE_URL");
}

async function safeFetch(input: string): Promise<Response> {
  let current = new URL(input);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "OneShowSEO-Audit/1.0 (+https://oneshowseo.com)" },
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    current = new URL(location, current);
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

function tagContent(html: string, pattern: RegExp): string {
  return html.match(pattern)?.[1]?.replace(/\s+/g, " ").trim() || "";
}

function metaContent(html: string, name: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find((candidate) => new RegExp(`(?:name|property)=["']${name}["']`, "i").test(candidate));
  return tag?.match(/content=["']([^"']*)["']/i)?.[1]?.trim() || "";
}

function linkHref(html: string, rel: string): string {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const tag = tags.find((candidate) => new RegExp(`rel=["'][^"']*${rel}[^"']*["']`, "i").test(candidate));
  return tag?.match(/href=["']([^"']*)["']/i)?.[1]?.trim() || "";
}

async function readHtml(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 2_000_000) throw new Error("PAGE_TOO_LARGE");
  return (await response.text()).slice(0, 2_000_000);
}

async function auditPage(url: string): Promise<AuditedPage> {
  const response = await safeFetch(url);
  const contentType = response.headers.get("content-type") || "";
  const html = contentType.includes("text/html") ? await readHtml(response) : "";
  const title = tagContent(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const description = metaContent(html, "description");
  const canonical = linkHref(html, "canonical");
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const images = html.match(/<img\b[^>]*>/gi) || [];
  const imagesWithoutAlt = images.filter((tag) => !/\balt=["'][^"']*["']/i.test(tag)).length;
  const robots = metaContent(html, "robots").toLowerCase();
  const findings: AuditFinding[] = [];
  const add = (severity: AuditFinding["severity"], category: string, findingTitle: string, findingDescription: string, evidence?: string) => findings.push({ severity, category, title: findingTitle, description: findingDescription, evidence, url });
  if (response.status >= 500) add("critical", "crawl", "页面返回服务器错误", "搜索引擎与用户无法稳定访问该页面。", `HTTP ${response.status}`);
  else if (response.status >= 400) add("high", "crawl", "页面返回客户端错误", "该 URL 当前不可访问。", `HTTP ${response.status}`);
  if (!html) add("high", "crawl", "页面不是可分析的 HTML", "未检测到 HTML 内容，无法执行页面级 SEO 检查。", contentType || "unknown content type");
  if (html && !title) add("high", "metadata", "缺少页面标题", "添加唯一且描述准确的 title。", "<title> missing");
  else if (title.length < 20 || title.length > 65) add("medium", "metadata", "页面标题长度需要优化", "建议标题清晰表达搜索意图，避免过短或截断。", `${title.length} characters`);
  if (html && !description) add("medium", "metadata", "缺少 Meta Description", "补充与页面意图一致的摘要。", "meta description missing");
  if (html && h1Count !== 1) add("medium", "content", h1Count ? "存在多个 H1" : "缺少 H1", "每个主要页面应有一个清晰的主标题。", `${h1Count} H1 elements`);
  if (html && !canonical) add("low", "indexing", "缺少 Canonical", "声明首选 URL，降低重复页面信号冲突。", "canonical missing");
  if (robots.includes("noindex")) add("high", "indexing", "页面被设置为 noindex", "确认该页面是否应该从搜索结果中排除。", robots);
  if (imagesWithoutAlt) add("low", "images", "图片缺少 Alt", "为有信息价值的图片补充替代文本。", `${imagesWithoutAlt} images`);
  if (html && !/application\/ld\+json/i.test(html)) add("low", "structured_data", "未检测到结构化数据", "根据页面真实内容评估 Organization、WebSite、SoftwareApplication 或 Article Schema。", "JSON-LD missing");
  return { url, statusCode: response.status, title, description, canonical, h1Count, imagesWithoutAlt, findings };
}

async function sitemapUrls(siteUrl: string, maximum: number): Promise<string[]> {
  try {
    const origin = new URL(siteUrl).origin;
    const response = await safeFetch(`${origin}/sitemap.xml`);
    if (!response.ok) return [];
    const xml = (await response.text()).slice(0, 2_000_000);
    return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
      .map((match) => match[1].replace(/&amp;/g, "&").trim())
      .filter((candidate) => { try { return new URL(candidate).origin === origin; } catch { return false; } })
      .slice(0, maximum);
  } catch { return []; }
}

export async function runSiteAudit(siteUrl: string, maximumPages: number): Promise<{ pages: AuditedPage[]; score: number; findings: AuditFinding[] }> {
  const targets = [siteUrl, ...(await sitemapUrls(siteUrl, maximumPages - 1))];
  const unique = [...new Set(targets)].slice(0, maximumPages);
  const pages: AuditedPage[] = [];
  for (const url of unique) {
    try { pages.push(await auditPage(url)); }
    catch (error) {
      pages.push({ url, statusCode: 0, title: "", description: "", canonical: "", h1Count: 0, imagesWithoutAlt: 0, findings: [{ category: "crawl", severity: "critical", title: "页面抓取失败", description: "OneShowSEO 无法安全访问该 URL。", evidence: error instanceof Error ? error.message : "FETCH_FAILED", url }] });
    }
  }
  const findings = pages.flatMap((page) => page.findings);
  const penalty = findings.reduce((total, finding) => total + ({ critical: 20, high: 10, medium: 4, low: 1 }[finding.severity]), 0);
  return { pages, findings, score: Math.max(0, Math.min(100, 100 - penalty)) };
}
