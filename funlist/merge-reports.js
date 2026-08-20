// 把 10 个 round-tokens 报告（with/without × 5 场景）按 test-scenarios 分类，
// 真正"合成一个" HTML：同一份 DOM，每个场景 开启(左) / 关闭(右) 左右对齐、整页一起滚动。
// 处理要点：① 前缀化每个报告的 canvas id 与 getElementById 引用，避免图表 ID 撞车；
//          ② 把每个报告的图表脚本用 IIFE 包起来，隔离 var/函数声明；
//          ③ 样式与 Chart.js CDN 只在 head 引入一次。

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const FILE_RE = /^round-tokens-test-scenarios-(with|without)-context-mode-scenario-(\d)-(.*)-日志\.html$/;

const reports = [];
for (const fn of fs.readdirSync(dir)) {
  const m = fn.match(FILE_RE);
  if (!m) continue;
  reports.push({
    fn,
    mode: m[1],            // with | without
    num: parseInt(m[2], 10),
    name: m[3],
    html: fs.readFileSync(path.join(dir, fn), 'utf8'),
  });
}

function extractStyle(html) {
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return m ? m[1] : '';
}
function extractBody(html) {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : '';
}

// 前缀化 canvas id + 对应 getElementById 引用，并把图表脚本用 IIFE 隔离
function prefixBody(body, prefix) {
  const ids = [...new Set([...body.matchAll(/id=["']([^"']+)["']/g)].map((x) => x[1]))];
  for (const id of ids) {
    body = body.split(`id="${id}"`).join(`id="${prefix}${id}"`);
    body = body.split(`getElementById('${id}')`).join(`getElementById('${prefix}${id}')`);
    body = body.split(`getElementById("${id}")`).join(`getElementById("${prefix}${id}")`);
  }
  // 仅处理没有 src 的内联 <script>（图表脚本），用 IIFE 包住，隔离 var/函数声明
  body = body.replace(/<script>([\s\S]*?)<\/script>/g, (_m, inner) => `<script>(function(){\n${inner}\n})();</script>`);
  return body;
}

const style = extractStyle(reports[0].html);

// 按场景 1..5 配对
const scenarios = [];
for (let n = 1; n <= 5; n++) {
  const withR = reports.find((r) => r.num === n && r.mode === 'with');
  const withoutR = reports.find((r) => r.num === n && r.mode === 'without');
  scenarios.push({
    n,
    name: (withR || withoutR).name,
    withBody: withR ? prefixBody(extractBody(withR.html), `w${n}_`) : '',
    withoutBody: withoutR ? prefixBody(extractBody(withoutR.html), `wo${n}_`) : '',
  });
}

const sections = scenarios
  .map((s) => {
    const hasWith = s.withBody ? '' : '（缺 with 报告）';
    const hasWithout = s.withoutBody ? '' : '（缺 without 报告）';
    return `
  <section class="scenario">
    <h2 class="scenario-title">场景 ${s.n} · ${s.name}</h2>
    <div class="compare-row">
      <div class="col col-on">
        <div class="col-label label-on">开启 context-mode ${hasWith}</div>
        ${s.withBody}
      </div>
      <div class="col col-off">
        <div class="col-label label-off">关闭 context-mode ${hasWithout}</div>
        ${s.withoutBody}
      </div>
    </div>
  </section>`;
  })
  .join('\n');

const out = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>context-mode 对比 · 开启 vs 关闭（逐场景并排）</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
${style}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f1f5f9;color:#1e293b;}
.topbar{position:sticky;top:0;z-index:10;background:#0f172a;color:#fff;padding:14px 24px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;box-shadow:0 2px 8px rgba(0,0,0,.15);}
.topbar h1{font-size:18px;margin:0;font-weight:600;}
.legend{display:flex;gap:16px;font-size:13px;margin-left:auto;}
.legend span{display:inline-flex;align-items:center;gap:6px;}
.dot{width:10px;height:10px;border-radius:2px;display:inline-block;}
.dot-on{background:#00b894;}
.dot-off{background:#94a3b8;}
.scenario{max-width:1700px;margin:24px auto;padding:0 16px;}
.scenario-title{font-size:16px;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #cbd5e1;color:#0f172a;}
.compare-row{display:flex;gap:16px;align-items:flex-start;}
.col{flex:1 1 0;min-width:0;background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);}
.col-on{border-top:3px solid #00b894;}
.col-off{border-top:3px solid #94a3b8;}
.col-label{font-size:13px;font-weight:600;padding:6px 10px;border-radius:6px;margin-bottom:14px;display:inline-block;}
.label-on{background:#e6fbf3;color:#047857;}
.label-off{background:#f1f5f9;color:#475569;}
/* 让报告内部自带的大标题低调一些，避免和场景标题重复喧宾夺主 */
.col h1{font-size:15px !important;margin:0 0 14px !important;color:#334155 !important;padding-bottom:8px;border-bottom:1px solid #e2e8f0;}
.col canvas{max-width:100% !important;height:auto !important;}
</style>
</head>
<body>
<div class="topbar">
  <h1>context-mode 对比 · 开启 vs 关闭</h1>
  <div class="legend">
    <span><i class="dot dot-on"></i>开启 context-mode（左）</span>
    <span><i class="dot dot-off"></i>关闭 context-mode（右）</span>
  </div>
</div>
${sections}
</body>
</html>`;

const outPath = path.join(dir, 'context-mode-merged.html');
fs.writeFileSync(outPath, out, 'utf8');
console.log('已生成:', outPath, '大小:', fs.statSync(outPath).size, '字节');
