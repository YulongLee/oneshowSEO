import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getEnabledDataSourceConfig } from "./data-sources";

export type CheckStatus = "pass" | "warning" | "fail" | "unknown" | "skipped";
export type CheckSeverity = "critical" | "high" | "medium" | "low" | "info";
export type CheckConfidence = "confirmed" | "likely" | "hypothesis";
export type AuditCheck = {
  category: string;
  key: string;
  status: CheckStatus;
  severity: CheckSeverity;
  confidence: CheckConfidence;
  title: string;
  description: string;
  evidence?: string;
  impact?: string;
  recommendation?: string;
  url?: string;
};
export type AuditFinding = { category: string; severity: "critical" | "high" | "medium" | "low"; title: string; description: string; evidence?: string; url: string };
export type AuditedPage = { url: string; statusCode: number; title: string; description: string; canonical: string; h1Count: number; imagesWithoutAlt: number; findings: AuditFinding[] };
export type AuditCategoryScore = { category: string; score: number | null; confidence: "high" | "medium" | "low"; checksTotal: number; checksKnown: number };
export type SiteAuditResult = {
  pages: AuditedPage[];
  findings: AuditFinding[];
  checks: AuditCheck[];
  categoryScores: AuditCategoryScore[];
  score: number;
  urlsDiscovered: number;
  summary: { total: number; passed: number; warning: number; failed: number; unknown: number; skipped: number };
};

type FetchResult = { response: Response; finalUrl: string; redirects: string[] };
type PageInternal = AuditedPage & { checks: AuditCheck[]; internalLinks: string[]; externalLinks: string[]; headers: Headers; html: string; contentText: string };

const categoryWeights: Record<string, number> = {
  technical: 25,
  content: 20,
  on_page: 15,
  structured_data: 15,
  performance: 10,
  images: 10,
  ai_search: 5,
};

function privateAddress(address: string): boolean {
  if (address === "::1" || address === "::" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) || (parts[0] >= 224);
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error("UNSAFE_URL");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("UNSAFE_URL");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) throw new Error("UNSAFE_URL");
}

async function safeFetch(input: string, timeout = 15_000): Promise<FetchResult> {
  let current = new URL(input);
  const redirects: string[] = [];
  for (let count = 0; count <= 4; count += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
      headers: { "user-agent": "OneShowSEO-Audit/2.0 (+https://oneshowseo.com)" },
    });
    if (response.status < 300 || response.status >= 400) return { response, finalUrl: current.toString(), redirects };
    const location = response.headers.get("location");
    if (!location) return { response, finalUrl: current.toString(), redirects };
    current = new URL(location, current);
    redirects.push(current.toString());
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

function tagContent(html: string, pattern: RegExp): string {
  return html.match(pattern)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "";
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

function check(input: Omit<AuditCheck, "confidence"> & { confidence?: CheckConfidence }): AuditCheck {
  return { confidence: "confirmed", ...input };
}

function issueStatus(condition: boolean, severity: CheckSeverity = "medium"): { status: CheckStatus; severity: CheckSeverity } {
  return condition ? { status: "pass", severity: "info" } : { status: severity === "critical" || severity === "high" ? "fail" : "warning", severity };
}

async function readHtml(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 2_000_000) throw new Error("PAGE_TOO_LARGE");
  return (await response.text()).slice(0, 2_000_000);
}

export type PublicRobotsPolicy={available:boolean;allowed:(url:string)=>boolean;crawlDelaySeconds:number|null};
export async function publicRobotsPolicy(siteUrl:string):Promise<PublicRobotsPolicy>{
  const origin=new URL(siteUrl).origin;try{const fetched=await safeFetch(`${origin}/robots.txt`,10_000);if(!fetched.response.ok)return{available:false,allowed:()=>true,crawlDelaySeconds:null};const text=(await fetched.response.text()).slice(0,250_000),groups=text.split(/(?=^\s*user-agent\s*:)/gim),group=groups.find(value=>/^\s*user-agent\s*:\s*(?:\*|OneShowSEO)/im.test(value))||"",disallows=[...group.matchAll(/^\s*disallow\s*:\s*([^#\r\n]*)/gim)].map(match=>match[1].trim()).filter(Boolean),delay=Number(group.match(/^\s*crawl-delay\s*:\s*([0-9.]+)/im)?.[1]);return{available:true,crawlDelaySeconds:Number.isFinite(delay)&&delay>0?Math.min(delay,30):null,allowed:(value:string)=>{const path=new URL(value).pathname;return!disallows.some(rule=>rule==="/"||path.startsWith(rule.replace(/\*.*$/,"")));}};}catch{return{available:false,allowed:()=>true,crawlDelaySeconds:null};}
}

function visibleText(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}

function internalLinks(html: string, pageUrl: string, origin: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    try {
      const url = new URL(match[1], pageUrl);
      if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) continue;
      url.hash = "";
      links.push(url.toString());
    } catch {}
  }
  return [...new Set(links)];
}

function externalLinks(html: string, pageUrl: string, origin: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    try {
      const url = new URL(match[1], pageUrl);
      if (url.origin !== origin && ['http:','https:'].includes(url.protocol)) links.push(url.toString());
    } catch {}
  }
  return [...new Set(links)];
}

function schemaState(html: string): { blocks: number; valid: number; types: string[]; errors: string[]; deprecated: string[]; restricted: string[]; missingRequired: string[] } {
  const blocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let valid = 0;
  const types = new Set<string>();
  const errors: string[] = [], deprecated = new Set<string>(), restricted = new Set<string>(), missingRequired = new Set<string>();
  const deprecatedTypes = new Set(["HowTo","SpecialAnnouncement","CourseInfo","EstimatedSalary","LearningVideo","ClaimReview","VehicleListing","PracticeProblem","Dataset"]);
  const required:Record<string,string[]>={Organization:["name","url"],WebSite:["name","url"],SoftwareApplication:["name","applicationCategory"],WebApplication:["name","applicationCategory"],Product:["name","image"],Article:["headline","author","datePublished"],BlogPosting:["headline","author","datePublished"],LocalBusiness:["name","address"],BreadcrumbList:["itemListElement"]};
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const nodes = Array.isArray(parsed) ? parsed : parsed?.['@graph'] || [parsed];
      for (const node of nodes) {
        if (node?.['@context'] && !String(node['@context']).includes("schema.org")) errors.push("@context 不是 schema.org");
        const value = node?.['@type'];
        for (const rawType of Array.isArray(value) ? value : value ? [value] : []) {
          const type=String(rawType); types.add(type);
          if(deprecatedTypes.has(type))deprecated.add(type);
          if(type==="FAQPage")restricted.add(type);
          for(const property of required[type]||[])if(node?.[property]===undefined)missingRequired.add(`${type}.${property}`);
        }
      }
      valid += 1;
    } catch { errors.push("JSON 语法错误"); }
  }
  return { blocks: blocks.length, valid, types:[...types], errors, deprecated:[...deprecated], restricted:[...restricted], missingRequired:[...missingRequired] };
}

async function auditPage(url: string, origin: string): Promise<PageInternal> {
  const fetched = await safeFetch(url);
  const response = fetched.response;
  const contentType = response.headers.get("content-type") || "";
  const html = contentType.includes("text/html") ? await readHtml(response) : "";
  const title = tagContent(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const description = metaContent(html, "description");
  const canonical = linkHref(html, "canonical");
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const h2Count = (html.match(/<h2\b/gi) || []).length;
  const images = html.match(/<img\b[^>]*>/gi) || [];
  const imagesWithoutAlt = images.filter((tag) => !/\balt=["'][^"']*["']/i.test(tag)).length;
  const lazyImages = images.filter((tag) => /\bloading=["']lazy["']/i.test(tag)).length;
  const robots = metaContent(html, "robots").toLowerCase();
  const viewport = metaContent(html, "viewport");
  const language = html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1] || "";
  const links = internalLinks(html, fetched.finalUrl, origin);
  const outbound = externalLinks(html, fetched.finalUrl, origin);
  const text = visibleText(html);
  const latinWords = text.match(/[\p{L}\p{N}]+/gu)?.length || 0;
  const chineseCharacters = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const contentUnits = Math.max(latinWords, chineseCharacters);
  const schema = schemaState(html);
  const checks: AuditCheck[] = [];
  const add = (value: AuditCheck) => checks.push({ ...value, url });

  add(check({ category:"technical", key:"http_status", ...issueStatus(response.status >= 200 && response.status < 400, response.status >= 500 ? "critical" : "high"), title:"页面可访问性", description:"页面应稳定返回可索引的成功状态。", evidence:`HTTP ${response.status}`, impact:"错误状态会阻止抓取或浪费抓取预算。", recommendation:"修复服务器错误、失效 URL 或不必要的跳转。" }));
  add(check({ category:"technical", key:"redirect_chain", status:fetched.redirects.length <= 1 ? "pass" : "warning", severity:fetched.redirects.length <= 1 ? "info" : "medium", title:"重定向链", description:"入口 URL 应直接到达最终页面。", evidence:fetched.redirects.length ? `${fetched.redirects.length} 次跳转：${fetched.redirects.join(" → ")}` : "无重定向", impact:"过长跳转链增加延迟并削弱抓取效率。", recommendation:"将入口 URL 直接重定向到最终规范地址。" }));
  add(check({ category:"technical", key:"html_document", ...issueStatus(Boolean(html), "high"), title:"HTML 文档", description:"页面需要返回可分析的 HTML。", evidence:contentType || "Content-Type 缺失", impact:"非 HTML 或空响应无法完成页面级索引分析。", recommendation:"确保页面返回 text/html，并对搜索引擎输出核心内容。" }));
  if (html) {
    add(check({ category:"on_page", key:"title_presence", ...issueStatus(Boolean(title), "high"), title:"页面标题", description:"每个可索引页面应具有唯一标题。", evidence:title || "<title> 缺失", impact:"标题直接影响主题理解和搜索结果点击率。", recommendation:"编写准确、唯一且匹配搜索意图的标题。" }));
    add(check({ category:"on_page", key:"title_length", ...issueStatus(title.length >= 20 && title.length <= 65, "medium"), title:"标题长度", description:"建议保持在 20–65 个字符。", evidence:`${title.length} 个字符`, impact:"过短表达不足，过长可能在结果页被截断。", recommendation:"在自然表达的前提下调整标题长度。" }));
    add(check({ category:"on_page", key:"description_presence", ...issueStatus(Boolean(description), "medium"), title:"Meta Description", description:"页面应提供与意图一致的搜索摘要。", evidence:description || "meta description 缺失", impact:"缺失会降低搜索摘要的可控性和点击率。", recommendation:"补充独特、清晰并包含价值主张的描述。" }));
    add(check({ category:"on_page", key:"description_length", ...issueStatus(description.length >= 70 && description.length <= 170, "low"), title:"Description 长度", description:"建议保持在 70–170 个字符。", evidence:`${description.length} 个字符`, impact:"过短信息不足，过长可能被截断。", recommendation:"压缩或补充摘要，突出页面价值。" }));
    add(check({ category:"on_page", key:"h1_structure", ...issueStatus(h1Count === 1, "medium"), title:"H1 结构", description:"主要页面应有且仅有一个清晰 H1。", evidence:`${h1Count} 个 H1`, impact:"混乱的主标题会弱化页面主题层级。", recommendation:"保留一个描述主要主题的 H1。" }));
    add(check({ category:"content", key:"subheading_structure", status:h2Count > 0 || contentUnits < 300 ? "pass" : "warning", severity:h2Count > 0 || contentUnits < 300 ? "info" : "low", title:"内容层级", description:"较长内容应使用 H2/H3 组织结构。", evidence:`${h2Count} 个 H2，约 ${contentUnits} 个内容单位`, impact:"清晰结构有助于阅读、理解和答案抽取。", recommendation:"为主要子主题添加描述性小标题。" }));
    add(check({ category:"technical", key:"canonical", ...issueStatus(Boolean(canonical), "medium"), title:"Canonical", description:"可索引页面应声明规范 URL。", evidence:canonical || "canonical 缺失", impact:"缺失可能造成重复 URL 信号分散。", recommendation:"添加指向首选公开 URL 的 canonical。" }));
    add(check({ category:"technical", key:"indexability", ...issueStatus(!robots.includes("noindex"), "high"), title:"页面索引指令", description:"目标页面不应意外设置 noindex。", evidence:robots || "未设置限制性 meta robots", impact:"noindex 会直接阻止页面进入搜索结果。", recommendation:"确认业务意图后移除非预期 noindex。" }));
    add(check({ category:"technical", key:"viewport", ...issueStatus(/width\s*=\s*device-width/i.test(viewport), "medium"), title:"移动端 Viewport", description:"页面应声明响应式 viewport。", evidence:viewport || "viewport 缺失", impact:"移动端呈现异常会影响体验和移动优先索引评估。", recommendation:"设置 width=device-width, initial-scale=1。" }));
    add(check({ category:"technical", key:"html_language", ...issueStatus(Boolean(language), "low"), title:"页面语言声明", description:"HTML 应声明主要语言。", evidence:language || "html lang 缺失", impact:"语言声明帮助搜索引擎与辅助技术理解内容。", recommendation:"为 html 元素添加正确的 lang 属性。" }));
    const parsedUrl=new URL(url);
    const cleanUrl=parsedUrl.pathname.length<=115&&!/[A-Z\s]/.test(parsedUrl.pathname)&&parsedUrl.searchParams.size<=5;
    add(check({category:"technical",key:"url_hygiene",...issueStatus(cleanUrl,"low"),title:"URL 规范性",description:"URL 应简短、稳定、可读并避免过多参数。",evidence:`路径 ${parsedUrl.pathname.length} 字符，${parsedUrl.searchParams.size} 个参数`,impact:"复杂 URL 会增加重复抓取、分享和规范化成本。",recommendation:"使用小写、描述性路径，并规范化非必要参数。"}));
    const mixed=[...html.matchAll(/(?:src|href)=["'](http:\/\/[^"']+)["']/gi)].map(match=>match[1]).slice(0,5);
    add(check({category:"technical",key:"mixed_content",...issueStatus(parsedUrl.protocol!=="https:"||mixed.length===0,"high"),title:"HTTPS 混合内容",description:"HTTPS 页面不应加载 HTTP 资源。",evidence:mixed.length?`${mixed.length} 个示例：${mixed.join(", ")}`:"未发现 HTTP 子资源",impact:"混合内容会导致资源被拦截并削弱安全信任。",recommendation:"将所有资源迁移到 HTTPS。"}));
    const hreflangs=[...html.matchAll(/<link\b[^>]*rel=["'][^"']*alternate[^"']*["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi)];
    const invalidHreflang=hreflangs.filter(match=>!/^([a-z]{2,3})(-[A-Z]{2})?$|^x-default$/i.test(match[1])||!/^https?:\/\//i.test(match[2]));
    add(check({category:"technical",key:"hreflang",status:hreflangs.length?invalidHreflang.length?"fail":"pass":"skipped",severity:invalidHreflang.length?"high":"info",title:"hreflang 国际化",description:"多语言页面的 hreflang 语言代码和目标 URL 应有效。",evidence:hreflangs.length?`${hreflangs.length} 个声明，${invalidHreflang.length} 个格式异常`:"未检测到 hreflang；单语言站点可忽略",impact:"错误 hreflang 会导致错误地区或语言页面出现在搜索结果。",recommendation:"使用有效语言/地区代码、绝对 URL、互相回指和 x-default。"}));
    const domElements=(html.match(/<[a-z][^>]*>/gi)||[]).length;
    add(check({category:"performance",key:"dom_size",status:domElements<=1500?"pass":"warning",severity:domElements<=1500?"info":"medium",title:"DOM 规模",description:"页面 DOM 规模应控制在合理范围。",evidence:`约 ${domElements} 个元素`,impact:"过大的 DOM 会增加样式计算、布局和交互延迟。",recommendation:"减少无效嵌套、隐藏组件和重复节点。"}));
    const compression=response.headers.get("content-encoding");
    add(check({category:"performance",key:"compression",...issueStatus(Boolean(compression),"medium"),title:"文本压缩",description:"HTML 与文本资源应启用 Brotli 或 Gzip。",evidence:compression||"Content-Encoding 缺失",impact:"未压缩响应增加传输时间并拖慢首屏。",recommendation:"在 CDN 或服务器启用 Brotli/Gzip。"}));
    add(check({ category:"content", key:"content_depth", ...issueStatus(contentUnits >= 200, "medium"), title:"内容深度", description:"核心落地页需要足够的独特可见内容表达主题和价值。", evidence:`约 ${contentUnits} 个内容单位`, impact:"内容过薄难以覆盖搜索意图，也不利于建立主题相关性。", recommendation:"补充用户问题、产品价值、流程、案例和可信证据。", confidence:"likely" }));
    add(check({ category:"content", key:"internal_links", ...issueStatus(links.length >= 2, "medium"), title:"内部链接", description:"页面应连接到相关的重要内容。", evidence:`发现 ${links.length} 个站内链接`, impact:"内链帮助发现页面、传递权重并建立信息架构。", recommendation:"增加指向相关主题页和转化页的描述性内链。" }));
    add(check({ category:"images", key:"alt_text", ...issueStatus(imagesWithoutAlt === 0, "medium"), title:"图片替代文本", description:"有信息价值的图片应具有替代文本。", evidence:`${images.length} 张图片，${imagesWithoutAlt} 张缺少 Alt`, impact:"缺失 Alt 会降低图片搜索和无障碍语义。", recommendation:"为内容图片补充准确 Alt，装饰图片使用空 Alt。" }));
    add(check({ category:"images", key:"lazy_loading", status:images.length < 3 || lazyImages > 0 ? "pass" : "warning", severity:images.length < 3 || lazyImages > 0 ? "info" : "low", title:"图片延迟加载", description:"非首屏图片宜使用原生或等效延迟加载。", evidence:`${images.length} 张图片，${lazyImages} 张声明 lazy`, impact:"未延迟加载可能增加首屏网络与渲染成本。", recommendation:"为非首屏图片启用 loading=lazy，并保留首屏关键图片优先级。" }));
    const undimensioned=images.filter(tag=>!(/\bwidth=["']?\d+/i.test(tag)&&/\bheight=["']?\d+/i.test(tag))).length;
    add(check({category:"images",key:"image_dimensions",...issueStatus(undimensioned===0,"medium"),title:"图片尺寸声明",description:"图片应声明宽高或等效纵横比。",evidence:`${undimensioned}/${images.length} 张图片缺少显式宽高`,impact:"缺少尺寸会导致布局偏移并影响 CLS。",recommendation:"为图片设置 width/height 或 CSS aspect-ratio。"}));
    add(check({ category:"structured_data", key:"json_ld_presence", ...issueStatus(schema.blocks > 0, "medium"), title:"JSON-LD 结构化数据", description:"根据真实页面类型提供合规 JSON-LD。", evidence:schema.blocks ? `${schema.blocks} 个区块；类型：${schema.types.join(", ") || "未声明"}` : "未检测到 JSON-LD", impact:"缺失会减少机器理解和富媒体结果资格机会。", recommendation:"按页面真实内容添加 Organization、WebSite、SoftwareApplication、Article 等适用类型。" }));
    add(check({ category:"structured_data", key:"json_ld_validity", status:schema.blocks === 0 ? "skipped" : schema.valid === schema.blocks ? "pass" : "fail", severity:schema.blocks === 0 || schema.valid === schema.blocks ? "info" : "high", title:"JSON-LD 语法", description:"所有 JSON-LD 区块应为有效 JSON。", evidence:schema.blocks === 0 ? "无结构化数据可验证" : `${schema.valid}/${schema.blocks} 个区块可解析`, impact:"无效语法会导致结构化数据被忽略。", recommendation:"修复 JSON 语法并使用 Schema/Rich Results 工具验证。" }));
    add(check({category:"structured_data",key:"schema_required_properties",status:schema.blocks===0?"skipped":schema.missingRequired.length?"warning":"pass",severity:schema.missingRequired.length?"medium":"info",title:"Schema 必填属性",description:"主要 Schema 类型应包含对应核心属性。",evidence:schema.missingRequired.length?`缺少：${schema.missingRequired.join(", ")}`:"未发现核心属性缺失",impact:"属性不完整会降低结构化数据资格和机器理解质量。",recommendation:"按 Schema 类型补齐真实、可见且一致的核心属性。"}));
    add(check({category:"structured_data",key:"deprecated_schema",status:schema.deprecated.length?"fail":"pass",severity:schema.deprecated.length?"high":"info",title:"废弃 Schema 类型",description:"不应继续使用已退出富媒体结果的类型。",evidence:schema.deprecated.length?schema.deprecated.join(", "):"未发现已知废弃类型",impact:"废弃类型不会产生预期富媒体结果并增加维护误导。",recommendation:"删除废弃类型并迁移到当前受支持的 Schema。"}));
    add(check({category:"structured_data",key:"restricted_schema",status:schema.restricted.length?"warning":"pass",severity:schema.restricted.length?"medium":"info",confidence:schema.restricted.length?"likely":"confirmed",title:"受限 Schema 类型",description:"FAQPage 仅适用于政府和医疗权威站点的富媒体结果。",evidence:schema.restricted.length?schema.restricted.join(", "):"未发现受限类型",impact:"商业网站使用受限类型通常无法获得富媒体结果。",recommendation:"除非符合资格，否则不要将 FAQPage 作为富媒体结果策略。"}));
    const socialPresent = Boolean(metaContent(html,"og:title") && metaContent(html,"og:description") && metaContent(html,"og:image"));
    add(check({ category:"on_page", key:"open_graph", ...issueStatus(socialPresent, "low"), title:"Open Graph", description:"分享页面应提供标题、描述和图片。", evidence:socialPresent ? "og:title、og:description、og:image 完整" : "Open Graph 核心字段不完整", impact:"社交摘要不完整会降低分享点击表现。", recommendation:"补齐 og:title、og:description、og:image 和 og:url。" }));
    add(check({ category:"on_page", key:"twitter_card", ...issueStatus(Boolean(metaContent(html,"twitter:card")), "low"), title:"Twitter/X Card", description:"页面应声明 Twitter Card。", evidence:metaContent(html,"twitter:card") || "twitter:card 缺失", impact:"缺失会降低部分平台分享摘要的可控性。", recommendation:"添加 summary_large_image 或适合页面的卡片类型。" }));
    const answerSignals = h2Count >= 2 || /<(ul|ol|table)\b/i.test(html);
    add(check({ category:"ai_search", key:"answer_structure", status:answerSignals ? "pass" : "warning", severity:answerSignals ? "info" : "low", confidence:"likely", title:"AI 答案可提取结构", description:"清晰小标题、列表和表格有助于答案引擎理解和引用。", evidence:`${h2Count} 个 H2；${/<(ul|ol|table)\b/i.test(html) ? "存在列表或表格" : "未发现列表或表格"}`, impact:"缺乏结构化表达会降低内容被答案引擎准确提取的概率。", recommendation:"围绕用户问题使用直接答案、小标题、列表、表格和可验证事实。" }));
  }
  const findings = checks.filter((item) => ["warning","fail"].includes(item.status)).map((item) => ({ category:item.category, severity:item.severity === "info" ? "low" : item.severity, title:item.title, description:item.recommendation || item.description, evidence:item.evidence, url })) as AuditFinding[];
  return { url, statusCode:response.status, title, description, canonical, h1Count, imagesWithoutAlt, findings, checks, internalLinks:links, externalLinks:outbound, headers:response.headers, html, contentText:text };
}

async function textResource(url: string): Promise<{ status: number; text: string }> {
  try {
    const result = await safeFetch(url);
    const text = (await result.response.text()).slice(0, 2_000_000);
    return { status:result.response.status, text };
  } catch { return { status:0, text:"" }; }
}

async function sitemapDiscovery(origin: string, maximum: number): Promise<{ urls: string[]; checks: AuditCheck[] }> {
  const checks: AuditCheck[] = [];
  const resource = await textResource(`${origin}/sitemap.xml`);
  checks.push(check({ category:"technical", key:"sitemap_availability", ...issueStatus(resource.status >= 200 && resource.status < 300, "medium"), title:"XML Sitemap", description:"站点应提供可访问的 Sitemap。", evidence:resource.status ? `HTTP ${resource.status}` : "无法访问 /sitemap.xml", impact:"Sitemap 帮助搜索引擎发现和更新重要页面。", recommendation:"生成有效 Sitemap，并在 robots.txt 和搜索平台提交。", url:`${origin}/sitemap.xml` }));
  if (resource.status < 200 || resource.status >= 300) return { urls:[], checks };
  const initial = [...resource.text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => match[1].replace(/&amp;/g,"&").trim());
  const nested = initial.filter((url) => /\.xml(?:\?|$)/i.test(url)).slice(0,5);
  const candidates = initial.filter((url) => !/\.xml(?:\?|$)/i.test(url));
  for (const sitemap of nested) {
    const child = await textResource(sitemap);
    if (child.status >= 200 && child.status < 300) candidates.push(...[...child.text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => match[1].replace(/&amp;/g,"&").trim()));
  }
  const valid = [...new Set(candidates)].filter((candidate) => { try { return new URL(candidate).origin === origin; } catch { return false; } });
  checks.push(check({ category:"technical", key:"sitemap_urls", status:valid.length ? "pass" : "warning", severity:valid.length ? "info" : "medium", title:"Sitemap URL 清单", description:"Sitemap 应包含站内规范页面。", evidence:`发现 ${valid.length} 个站内 URL`, impact:"空或无效 Sitemap 无法提供有效发现信号。", recommendation:"将所有重要规范页面加入 Sitemap，并排除错误和 noindex URL。", url:`${origin}/sitemap.xml` }));
  return { urls:valid.slice(0, Math.max(maximum * 3, maximum)), checks };
}

async function siteLevelChecks(origin: string, homepage?: PageInternal): Promise<AuditCheck[]> {
  const checks: AuditCheck[] = [];
  const robots = await textResource(`${origin}/robots.txt`);
  const robotsOk = robots.status >= 200 && robots.status < 300;
  checks.push(check({ category:"technical", key:"robots_availability", ...issueStatus(robotsOk, "medium"), title:"robots.txt", description:"站点应提供明确的爬虫访问规则。", evidence:robots.status ? `HTTP ${robots.status}` : "无法访问 robots.txt", impact:"缺失或错误规则会影响抓取控制和 Sitemap 发现。", recommendation:"提供有效 robots.txt，并声明 Sitemap 地址。", url:`${origin}/robots.txt` }));
  const blocksAll = /user-agent\s*:\s*\*[\s\S]{0,500}?disallow\s*:\s*\/(?:\s|$)/i.test(robots.text);
  checks.push(check({ category:"technical", key:"robots_global_block", status:robotsOk ? blocksAll ? "fail" : "pass" : "unknown", severity:blocksAll ? "critical" : "info", title:"全站抓取限制", description:"公开站点不应意外禁止所有通用爬虫。", evidence:robotsOk ? blocksAll ? "User-agent: * 存在 Disallow: /" : "未发现全站禁止规则" : "robots.txt 不可用，无法确认", impact:"全站禁止会阻止搜索引擎抓取。", recommendation:"若非刻意下线，移除全站 Disallow: /。", url:`${origin}/robots.txt` }));
  const aiBots = ["GPTBot","ClaudeBot","PerplexityBot","Applebot-Extended","Google-Extended","Bytespider","CCBot"];
  const managed = aiBots.filter((bot) => new RegExp(`user-agent\\s*:\\s*${bot}`,"i").test(robots.text));
  checks.push(check({ category:"ai_search", key:"ai_crawler_policy", status:managed.length >= 3 ? "pass" : "warning", severity:managed.length >= 3 ? "info" : "low", confidence:"likely", title:"AI 爬虫策略", description:"应根据内容授权策略明确管理主要 AI 爬虫。", evidence:managed.length ? `已明确：${managed.join(", ")}` : "未发现主要 AI 爬虫专属规则", impact:"缺少明确策略会使 AI 内容使用边界不透明。", recommendation:"评估并在 robots.txt 中明确 GPTBot、ClaudeBot、PerplexityBot、Google-Extended 等策略。", url:`${origin}/robots.txt` }));
  const llms = await textResource(`${origin}/llms.txt`);
  checks.push(check({ category:"ai_search", key:"llms_txt", status:llms.status >= 200 && llms.status < 300 ? "pass" : "warning", severity:llms.status >= 200 && llms.status < 300 ? "info" : "low", confidence:"likely", title:"llms.txt", description:"可选的 llms.txt 可向 AI 系统提供站点内容入口。", evidence:llms.status ? `HTTP ${llms.status}` : "未检测到 llms.txt", impact:"缺失不是传统 SEO 错误，但会减少面向 AI 系统的显式内容导航。", recommendation:"为核心产品、文档和权威内容提供简洁 llms.txt。", url:`${origin}/llms.txt` }));
  if (homepage) {
    const headers = homepage.headers;
    for (const item of [
      ["strict-transport-security","HSTS","启用 HTTPS 强制策略","high"],
      ["content-security-policy","Content Security Policy","限制页面资源执行来源","medium"],
      ["x-content-type-options","X-Content-Type-Options","防止 MIME 类型嗅探","low"],
      ["referrer-policy","Referrer-Policy","控制来源信息泄露","low"],
    ] as const) {
      const value = headers.get(item[0]);
      checks.push(check({ category:"technical", key:`header_${item[0]}`, ...issueStatus(Boolean(value), item[3]), title:`安全响应头：${item[1]}`, description:item[2], evidence:value || `${item[0]} 缺失`, impact:"安全与可信交付是稳定抓取和用户信任的基础。", recommendation:`配置合适的 ${item[1]} 响应头。`, url:homepage.url }));
    }
  }
  checks.push(check({ category:"technical", key:"gsc_index_coverage", status:"unknown", severity:"info", confidence:"hypothesis", title:"搜索引擎收录状态", description:"需要搜索平台数据确认已发现、已抓取和已索引状态。", evidence:"本次审计未取得搜索平台覆盖数据", impact:"仅抓取公开 HTML 无法证明搜索引擎已经收录页面。", recommendation:"平台数据能力就绪后自动补充收录与覆盖率分析。", url:origin }));
  return checks;
}

async function pageSpeedChecks(url: string): Promise<AuditCheck[]> {
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url",url);
  endpoint.searchParams.set("strategy","mobile");
  endpoint.searchParams.append("category","performance");
  const platformConfig=await getEnabledDataSourceConfig("pagespeed");
  const apiKey=platformConfig?.apiKey||process.env.PAGESPEED_API_KEY;
  if (apiKey) endpoint.searchParams.set("key",apiKey);
  try {
    const result = await safeFetch(endpoint.toString(), 25_000);
    if (!result.response.ok) throw new Error(`HTTP ${result.response.status}`);
    const json = await result.response.json() as { lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string,{numericValue?:number;displayValue?:string}> } };
    const audits = json.lighthouseResult?.audits || {};
    const definitions = [
      ["largest-contentful-paint","LCP",2500,4000,"ms"],
      ["cumulative-layout-shift","CLS",0.1,0.25,""],
      ["interaction-to-next-paint","INP",200,500,"ms"],
    ] as const;
    const checks: AuditCheck[] = [];
    const performanceScore = json.lighthouseResult?.categories?.performance?.score;
    checks.push(check({ category:"performance", key:"lighthouse_score", status:typeof performanceScore === "number" ? performanceScore >= .9 ? "pass" : performanceScore >= .5 ? "warning" : "fail" : "unknown", severity:typeof performanceScore === "number" && performanceScore < .5 ? "high" : typeof performanceScore === "number" && performanceScore < .9 ? "medium" : "info", title:"移动端 Lighthouse 性能", description:"使用 PageSpeed Insights 测量移动端实验室性能。", evidence:typeof performanceScore === "number" ? `${Math.round(performanceScore*100)} 分` : "未返回性能分", impact:"性能影响用户体验、转化和页面体验信号。", recommendation:"根据机会项优化首屏资源、主线程任务、缓存和图片。", url }));
    for (const [key,title,good,poor,unit] of definitions) {
      const metric = audits[key] || (key === "interaction-to-next-paint" ? audits["experimental-interaction-to-next-paint"] : undefined);
      const value = metric?.numericValue;
      checks.push(check({ category:"performance", key:key.replaceAll("-","_"), status:typeof value !== "number" ? "unknown" : value <= good ? "pass" : value <= poor ? "warning" : "fail", severity:typeof value === "number" && value > poor ? "high" : typeof value === "number" && value > good ? "medium" : "info", title:`Core Web Vitals：${title}`, description:`移动端实验室 ${title} 指标。`, evidence:typeof value === "number" ? `${value.toFixed(key === "cumulative-layout-shift" ? 3 : 0)} ${unit}`.trim() : "本次 Lighthouse 未返回该指标", impact:"较差指标会降低页面体验和转化效率。", recommendation:`按 ${title} 诊断项优化并结合真实用户 CrUX 数据验证。`, url }));
    }
    return checks;
  } catch (error) {
    return [check({ category:"performance", key:"pagespeed", status:"unknown", severity:"info", confidence:"hypothesis", title:"移动端性能数据", description:"本次未能取得移动端性能测量。", evidence:error instanceof Error ? error.message : "PERFORMANCE_DATA_UNAVAILABLE", impact:"缺少性能数据时不能判断 LCP、INP 和 CLS 是否达标。", recommendation:"平台性能数据能力就绪后重试，并结合真实用户数据验证。", url })];
  }
}

function scoreCategories(checks: AuditCheck[]): { scores: AuditCategoryScore[]; score: number } {
  const scores = Object.keys(categoryWeights).map((category) => {
    const items = checks.filter((item) => item.category === category);
    const known = items.filter((item) => !["unknown","skipped"].includes(item.status));
    const points = known.reduce((total,item) => total + (item.status === "pass" ? 100 : item.status === "warning" ? 55 : 0),0);
    const score = known.length ? Math.round(points / known.length) : null;
    return { category, score, confidence:known.length >= 5 ? "high" : known.length >= 2 ? "medium" : "low", checksTotal:items.length, checksKnown:known.length } as AuditCategoryScore;
  });
  let weighted = 0;
  let usedWeight = 0;
  for (const item of scores) if (item.score !== null) { weighted += item.score * categoryWeights[item.category]; usedWeight += categoryWeights[item.category]; }
  return { scores, score:usedWeight ? Math.round(weighted / usedWeight) : 0 };
}

export async function runSiteAudit(siteUrl: string, maximumPages: number): Promise<SiteAuditResult> {
  try { await assertPublicUrl(new URL(siteUrl)); }
  catch (error) {
    const evidence = error instanceof Error ? error.message : "UNSAFE_URL";
    const failed = check({ category:"technical", key:"fetch_failure", status:"fail", severity:"critical", title:"页面抓取失败", description:"OneShowSEO 无法安全访问该 URL。", evidence, impact:"无法抓取意味着无法验证页面的搜索可见性。", recommendation:"检查地址、DNS、访问限制和服务器安全策略。", url:siteUrl });
    const finding: AuditFinding = { category:"technical",severity:"critical",title:failed.title,description:failed.recommendation!,evidence,url:siteUrl };
    return { pages:[{url:siteUrl,statusCode:0,title:"",description:"",canonical:"",h1Count:0,imagesWithoutAlt:0,findings:[finding]}],findings:[finding],checks:[failed],categoryScores:scoreCategories([failed]).scores,score:0,urlsDiscovered:1,summary:{total:1,passed:0,warning:0,failed:1,unknown:0,skipped:0} };
  }
  const origin = new URL(siteUrl).origin;
  const sitemap = await sitemapDiscovery(origin, maximumPages);
  const queue = [...new Set([siteUrl, ...sitemap.urls])];
  const discovered = new Set(queue);
  const pages: PageInternal[] = [];
  while (queue.length && pages.length < maximumPages) {
    const url = queue.shift()!;
    try {
      const page = await auditPage(url, origin);
      pages.push(page);
      for (const link of page.internalLinks) {
        if (!discovered.has(link)) { discovered.add(link); queue.push(link); }
      }
    } catch (error) {
      const evidence = error instanceof Error ? error.message : "FETCH_FAILED";
      const failedCheck = check({ category:"technical", key:"fetch_failure", status:"fail", severity:"critical", title:"页面抓取失败", description:"OneShowSEO 无法安全访问该 URL。", evidence, impact:"无法抓取意味着无法验证页面的搜索可见性。", recommendation:"检查 DNS、访问限制、状态码及服务器安全策略。", url });
      pages.push({ url, statusCode:0, title:"", description:"", canonical:"", h1Count:0, imagesWithoutAlt:0, findings:[{category:"technical",severity:"critical",title:failedCheck.title,description:failedCheck.recommendation!,evidence,url}], checks:[failedCheck], internalLinks:[], externalLinks:[], headers:new Headers(), html:"", contentText:"" });
    }
  }
  const checks = [...sitemap.checks, ...(await siteLevelChecks(origin,pages[0])), ...pages.flatMap((page) => page.checks), ...(await pageSpeedChecks(siteUrl))];
  const titleGroups = new Map<string,string[]>();
  const descriptionGroups = new Map<string,string[]>();
  for (const page of pages) {
    if (page.title) titleGroups.set(page.title,[...(titleGroups.get(page.title)||[]),page.url]);
    if (page.description) descriptionGroups.set(page.description,[...(descriptionGroups.get(page.description)||[]),page.url]);
  }
  const duplicateTitles = [...titleGroups.entries()].filter(([,urls]) => urls.length > 1);
  const duplicateDescriptions = [...descriptionGroups.entries()].filter(([,urls]) => urls.length > 1);
  checks.push(check({ category:"on_page", key:"unique_titles", ...issueStatus(!duplicateTitles.length,"high"), title:"标题唯一性", description:"不同页面应使用唯一 title。", evidence:duplicateTitles.length ? `${duplicateTitles.length} 组重复标题` : `${pages.length} 个页面未发现重复标题`, impact:"重复标题会模糊页面定位并造成搜索结果竞争。", recommendation:"为每个页面编写对应搜索意图的独特标题。", url:origin }));
  checks.push(check({ category:"on_page", key:"unique_descriptions", ...issueStatus(!duplicateDescriptions.length,"medium"), title:"Description 唯一性", description:"重要页面应使用不同的搜索摘要。", evidence:duplicateDescriptions.length ? `${duplicateDescriptions.length} 组重复描述` : `${pages.length} 个页面未发现重复描述`, impact:"重复描述降低搜索摘要的页面区分度。", recommendation:"根据每页价值和意图编写独特描述。", url:origin }));
  const contentGroups=new Map<string,string[]>();
  for(const page of pages){const fingerprint=page.contentText.toLowerCase().replace(/\s+/g," ").slice(0,1500);if(fingerprint.length>200)contentGroups.set(fingerprint,[...(contentGroups.get(fingerprint)||[]),page.url]);}
  const duplicateBodies=[...contentGroups.values()].filter(urls=>urls.length>1);
  checks.push(check({category:"content",key:"duplicate_content",...issueStatus(!duplicateBodies.length,"high"),confidence:duplicateBodies.length?"likely":"confirmed",title:"重复正文",description:"重要页面应提供独特且符合各自意图的正文。",evidence:duplicateBodies.length?`${duplicateBodies.length} 组高度相似正文`:`${pages.length} 个页面未发现完全相同的主要正文`,impact:"重复正文会造成页面竞争并降低独特价值。",recommendation:"合并重复页面、设置规范 URL，或重写为独特内容。",url:origin}));
  const inbound=new Map<string,number>();for(const page of pages)for(const link of page.internalLinks)inbound.set(link,(inbound.get(link)||0)+1);
  const orphans=pages.filter((page,index)=>index>0&&!inbound.get(page.url));
  checks.push(check({category:"content",key:"orphan_pages",...issueStatus(!orphans.length,"high"),title:"孤立页面",description:"除入口页外的重要页面应至少获得一个站内链接。",evidence:orphans.length?`${orphans.length} 个疑似孤立页面：${orphans.slice(0,5).map(page=>page.url).join(", ")}`:"已抓取页面均有站内入口",impact:"孤立页面难以被发现、获得内部权重和稳定抓取。",recommendation:"从相关导航、主题页或正文建立描述性内链。",url:origin}));
  const allHtml=pages.map(page=>page.html).join(" "),allUrls=[...discovered].map(value=>new URL(value).pathname.toLowerCase());
  const trustSignals=[["隐私政策",allUrls.some(path=>/privacy|隐私/.test(path))],["服务条款",allUrls.some(path=>/terms|agreement|条款/.test(path))],["联系我们",allUrls.some(path=>/contact|联系我们/.test(path))],["关于页面",allUrls.some(path=>/about|关于/.test(path))]] as const;
  const trustCount=trustSignals.filter(([,present])=>present).length;
  checks.push(check({category:"content",key:"eeat_trust",status:trustCount>=3?"pass":"warning",severity:trustCount>=3?"info":"medium",confidence:"likely",title:"E-E-A-T 信任信号",description:"站点应清晰提供主体、联系、隐私和服务条款信息。",evidence:trustSignals.map(([name,present])=>`${name}:${present?"有":"无"}`).join("；"),impact:"透明度和可验证主体信息是信任评估基础。",recommendation:"补齐关于、联系、隐私、条款及真实主体信息。",url:origin}));
  const authorSignal=/\b(author|byline|作者|主编|审核)\b/i.test(allHtml)||/"@type"\s*:\s*"Person"/i.test(allHtml);
  checks.push(check({category:"content",key:"eeat_authorship",status:authorSignal?"pass":"warning",severity:authorSignal?"info":"medium",confidence:"likely",title:"作者与专业身份",description:"知识型内容应明确作者、审核者和相关资历。",evidence:authorSignal?"发现作者/Person/审核相关信号":"未发现明确作者或审核者信号",impact:"匿名内容难以建立经验、专业性和责任归属。",recommendation:"展示作者姓名、简介、资历、审核流程和作者页。",url:origin}));
  const externalCount=pages.reduce((total,page)=>total+page.externalLinks.length,0);
  checks.push(check({category:"content",key:"source_citations",status:externalCount>0?"pass":"warning",severity:externalCount>0?"info":"low",confidence:"likely",title:"来源与外部引用",description:"事实与专业主张宜引用可验证的一手或权威来源。",evidence:`发现 ${externalCount} 个不同页面级外部链接`,impact:"缺少来源会降低专业内容的可验证性和引用价值。",recommendation:"对重要事实、标准和数据添加权威来源链接。",url:origin}));
  const framework=/__NEXT_DATA__|__next_f|data-reactroot|nuxt|ng-version|svelte/i.test(allHtml);
  checks.push(check({category:"technical",key:"javascript_rendering",status:framework?"unknown":"pass",severity:"info",confidence:framework?"hypothesis":"confirmed",title:"JavaScript 渲染差异",description:"客户端渲染站点需要比较原始 HTML 与渲染后 DOM。",evidence:framework?"检测到前端框架信号；当前运行未执行渲染后 DOM 对比":"未发现明显客户端框架依赖",impact:"仅在浏览器渲染后出现的内容和元数据可能影响索引判断。",recommendation:"启用浏览器渲染审计并比较标题、正文、链接和 Schema。",url:origin}));
  for(const [key,title,description] of [["ga4_behavior","用户与转化数据","需要行为数据验证自然流量参与度和转化。"],["rank_tracking","关键词排名与 SERP","需要排名数据验证目标词、SERP 和竞品差距。"],["backlink_profile","外链与权威度","需要外链数据验证引用域、质量和风险。"]]) checks.push(check({category:key==="ga4_behavior"?"content":"ai_search",key,status:"unknown",severity:"info",confidence:"hypothesis",title,description,evidence:"本次审计未取得该项扩展数据",impact:"公开抓取无法得出真实流量、排名或外链结论。",recommendation:"平台扩展能力就绪后自动补全该项结论。",url:origin}));
  if (pages.length >= maximumPages && discovered.size > maximumPages) checks.push(check({ category:"technical", key:"crawl_limit", status:"skipped", severity:"info", confidence:"confirmed", title:"套餐抓取上限", description:"仍有已发现 URL 未在本次抓取。", evidence:`发现 ${discovered.size} 个 URL，本次上限 ${maximumPages} 页`, impact:"未抓取页面没有纳入本次结论。", recommendation:"提高套餐页面上限或分批审计。", url:origin }));
  const findings = checks.filter((item) => ["warning","fail"].includes(item.status) && item.severity !== "info").map((item) => ({ category:item.category, severity:item.severity as AuditFinding["severity"], title:item.title, description:item.recommendation || item.description, evidence:item.evidence, url:item.url || origin }));
  const summary = {
    total:checks.length,
    passed:checks.filter((item) => item.status === "pass").length,
    warning:checks.filter((item) => item.status === "warning").length,
    failed:checks.filter((item) => item.status === "fail").length,
    unknown:checks.filter((item) => item.status === "unknown").length,
    skipped:checks.filter((item) => item.status === "skipped").length,
  };
  const scored = scoreCategories(checks);
  return { pages:pages.map((page) => ({ url:page.url,statusCode:page.statusCode,title:page.title,description:page.description,canonical:page.canonical,h1Count:page.h1Count,imagesWithoutAlt:page.imagesWithoutAlt,findings:page.findings })), findings, checks, categoryScores:scored.scores, score:scored.score, urlsDiscovered:discovered.size, summary };
}
