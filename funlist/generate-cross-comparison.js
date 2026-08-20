#!/usr/bin/env node
/**
 * 从10个单场景分析HTML中提取数据，按场景配对生成with-vs-without对比报告
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FUNLIST_DIR = __dirname;

// 场景定义：编号 -> 中文名
const SCENARIOS = [
  { id: 1, name: '日志分析' },
  { id: 2, name: '代码优化' },
  { id: 3, name: '2048游戏' },
  { id: 4, name: '书籍分析' },
  { id: 5, name: '项目逆向分析' },
];

// ============================================================
// HTML 解析工具
// ============================================================

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').trim();
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

function cleanText(str) {
  return decodeEntities(stripTags(str)).replace(/\s+/g, ' ').trim();
}

// 提取所有 <table> 的行数据
function extractTables(html) {
  const tables = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/g;
  let match;
  while ((match = tableRegex.exec(html)) !== null) {
    const tableHtml = match[1];
    const rows = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const cells = [];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(cleanText(cellMatch[1]));
      }
      if (cells.length > 0) rows.push(cells);
    }
    tables.push(rows);
  }
  return tables;
}

// 提取汇总卡片
function extractSummaryCards(html) {
  const cards = [];
  // 普通卡片 + highlight卡片
  const cardRegex = /<div class="card(?: card-highlight)?"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  // 更精确：匹配 label/value/sub 结构
  const blockRegex = /<div class="label">([\s\S]*?)<\/div>\s*<div class="value[^"]*">([\s\S]*?)<\/div>(?:\s*<div class="sub">([\s\S]*?)<\/div>)?/g;
  let m;
  while ((m = blockRegex.exec(html)) !== null) {
    cards.push({
      label: cleanText(m[1]),
      value: cleanText(m[2]),
      sub: m[3] ? cleanText(m[3]) : '',
    });
  }
  return cards;
}

// 从单场景HTML提取全部数据
function extractScenarioData(filePath) {
  const html = fs.readFileSync(filePath, 'utf-8');
  const tables = extractTables(html);
  const cards = extractSummaryCards(html);

  // tables[0] = 提示词成分汇总表
  // tables[1] = 工具调用表（如果有的话）
  const promptTable = tables[0] || [];
  const toolTable = tables[1] || [];

  return { cards, promptTable, toolTable };
}

// ============================================================
// 找到文件
// ============================================================

function findHtmlFile(mode, scenarioId, scenarioName) {
  const pattern = new RegExp(
    `round-tokens-test-scenarios-${mode}-scenario-${scenarioId}-${scenarioName}-日志\\.html`
  );
  const files = fs.readdirSync(FUNLIST_DIR).filter(f => pattern.test(f));
  return files.length > 0 ? path.join(FUNLIST_DIR, files[0]) : null;
}

// ============================================================
// HTML 渲染
// ============================================================

function renderComparisonTable(title, withoutData, withData, columns) {
  // columns: [{ label, getValue(data) => text }]
  let html = `<div class="cmp-section">
    <h3 class="cmp-title">${title}</h3>
    <div class="cmp-table-wrap">
    <table class="cmp-table">
      <thead><tr>
        <th class="col-label">指标</th>
        <th class="col-without">无插件</th>
        <th class="col-with">有插件</th>
      </tr></thead>
      <tbody>`;

  for (const col of columns) {
    const withoutVal = col.getValue(withoutData) || '-';
    const withVal = col.getValue(withData) || '-';
    html += `<tr>
      <td class="col-label">${col.label}</td>
      <td class="col-without">${withoutVal}</td>
      <td class="col-with">${withVal}</td>
    </tr>`;
  }

  html += `</tbody></table></div></div>`;
  return html;
}

function renderPromptComparison(withoutTable, withTable) {
  // 提示词成分表：行=成分，列=字符数/占比
  // 表格结构: [成分, 字符数, 占比]
  const withoutMap = {};
  for (let i = 1; i < withoutTable.length - 1; i++) {
    const row = withoutTable[i];
    if (row.length >= 3) withoutMap[row[0]] = { chars: row[1], pct: row[2] };
  }
  const withMap = {};
  for (let i = 1; i < withTable.length - 1; i++) {
    const row = withTable[i];
    if (row.length >= 3) withMap[row[0]] = { chars: row[1], pct: row[2] };
  }

  const allKeys = [...new Set([...Object.keys(withoutMap), ...Object.keys(withMap)])];

  let html = `<div class="cmp-section">
    <h3 class="cmp-title">提示词成分对比</h3>
    <div class="cmp-table-wrap">
    <table class="cmp-table cmp-wide">
      <thead><tr>
        <th class="col-label" rowspan="2">成分</th>
        <th colspan="2" class="col-without">无插件</th>
        <th colspan="2" class="col-with">有插件</th>
      </tr>
      <tr>
        <th class="col-without">字符数</th>
        <th class="col-without">占比</th>
        <th class="col-with">字符数</th>
        <th class="col-with">占比</th>
      </tr></thead>
      <tbody>`;

  for (const key of allKeys) {
    const w = withoutMap[key] || { chars: '-', pct: '-' };
    const ww = withMap[key] || { chars: '-', pct: '-' };
    html += `<tr>
      <td class="col-label">${key}</td>
      <td>${w.chars}</td>
      <td>${w.pct}</td>
      <td>${ww.chars}</td>
      <td>${ww.pct}</td>
    </tr>`;
  }

  // 合计行
  const wTotal = withoutTable.length > 0 ? withoutTable[withoutTable.length - 1] : null;
  const wwTotal = withTable.length > 0 ? withTable[withTable.length - 1] : null;
  if (wTotal || wwTotal) {
    html += `<tr class="row-total">
      <td class="col-label">合计</td>
      <td>${wTotal ? wTotal[1] : '-'}</td>
      <td>${wTotal ? wTotal[2] : '-'}</td>
      <td>${wwTotal ? wwTotal[1] : '-'}</td>
      <td>${wwTotal ? wwTotal[2] : '-'}</td>
    </tr>`;
  }

  html += `</tbody></table></div></div>`;
  return html;
}

function renderToolComparison(withoutTable, withTable) {
  // 工具调用表：[工具名, 调用次数, 占比]
  const withoutMap = {};
  for (let i = 1; i < withoutTable.length - 1; i++) {
    const row = withoutTable[i];
    if (row.length >= 2) withoutMap[row[0]] = { count: row[1], pct: row[2] || '' };
  }
  const withMap = {};
  for (let i = 1; i < withTable.length - 1; i++) {
    const row = withTable[i];
    if (row.length >= 2) withMap[row[0]] = { count: row[1], pct: row[2] || '' };
  }

  // 合并所有工具名，按有插件的调用次数排序
  const allTools = [...new Set([...Object.keys(withMap), ...Object.keys(withoutMap)])];
  allTools.sort((a, b) => {
    const ac = parseInt((withMap[a] || withoutMap[a] || {}).count) || 0;
    const bc = parseInt((withMap[b] || withoutMap[b] || {}).count) || 0;
    return bc - ac;
  });

  let html = `<div class="cmp-section">
    <h3 class="cmp-title">工具调用对比</h3>
    <div class="cmp-table-wrap">
    <table class="cmp-table cmp-wide">
      <thead><tr>
        <th class="col-label" rowspan="2">工具名</th>
        <th colspan="2" class="col-without">无插件</th>
        <th colspan="2" class="col-with">有插件</th>
      </tr>
      <tr>
        <th class="col-without">调用次数</th>
        <th class="col-without">占比</th>
        <th class="col-with">调用次数</th>
        <th class="col-with">占比</th>
      </tr></thead>
      <tbody>`;

  for (const tool of allTools) {
    const w = withoutMap[tool] || { count: '-', pct: '-' };
    const ww = withMap[tool] || { count: '-', pct: '-' };
    const isCtxTool = tool.includes('context-mode') || tool.includes('ctx_');
    html += `<tr${isCtxTool ? ' class="row-ctx"' : ''}>
      <td class="col-label tool-name">${tool}</td>
      <td>${w.count}</td>
      <td>${w.pct}</td>
      <td>${ww.count}</td>
      <td>${ww.pct}</td>
    </tr>`;
  }

  // 合计
  const wTotal = withoutTable.length > 0 ? withoutTable[withoutTable.length - 1] : null;
  const wwTotal = withTable.length > 0 ? withTable[withTable.length - 1] : null;
  if (wTotal || wwTotal) {
    html += `<tr class="row-total">
      <td class="col-label">合计</td>
      <td>${wTotal ? wTotal[1] : '-'}</td>
      <td>${wTotal && wTotal[2] ? wTotal[2] : ''}</td>
      <td>${wwTotal ? wwTotal[1] : '-'}</td>
      <td>${wwTotal && wwTotal[2] ? wwTotal[2] : ''}</td>
    </tr>`;
  }

  html += `</tbody></table></div></div>`;
  return html;
}

function renderScenarioBlock(scenario, withoutData, withData) {
  // 从卡片中提取指标
  const cardMap = {};
  for (const c of withoutData.cards) cardMap['without_' + c.label] = c;
  for (const c of withData.cards) cardMap['with_' + c.label] = c;

  // 汇总指标对比
  const summaryColumns = [];
  const allLabels = [...new Set([
    ...withoutData.cards.map(c => c.label),
    ...withData.cards.map(c => c.label),
  ])];

  for (const label of allLabels) {
    const w = withoutData.cards.find(c => c.label === label);
    const ww = withData.cards.find(c => c.label === label);
    summaryColumns.push({
      label,
      getValue: (data) => {
        const card = data.cards.find(c => c.label === label);
        if (!card) return '-';
        let text = `<span class="metric-value">${card.value}</span>`;
        if (card.sub) text += `<div class="metric-sub">${card.sub}</div>`;
        return text;
      },
    });
  }

  // 渲染汇总指标表（自定义渲染，因为需要HTML内容）
  let summaryHtml = `<div class="cmp-section">
    <h3 class="cmp-title">汇总指标对比</h3>
    <div class="cmp-table-wrap">
    <table class="cmp-table">
      <thead><tr>
        <th class="col-label">指标</th>
        <th class="col-without">无插件</th>
        <th class="col-with">有插件</th>
      </tr></thead>
      <tbody>`;

  for (const label of allLabels) {
    const w = withoutData.cards.find(c => c.label === label);
    const ww = withData.cards.find(c => c.label === label);
    const wText = w ? `<span class="metric-value">${w.value}</span>${w.sub ? `<div class="metric-sub">${w.sub}</div>` : ''}` : '-';
    const wwText = ww ? `<span class="metric-value">${ww.value}</span>${ww.sub ? `<div class="metric-sub">${ww.sub}</div>` : ''}` : '-';
    summaryHtml += `<tr>
      <td class="col-label">${label}</td>
      <td class="col-without">${wText}</td>
      <td class="col-with">${wwText}</td>
    </tr>`;
  }
  summaryHtml += `</tbody></table></div></div>`;

  // 提示词成分
  const promptHtml = renderPromptComparison(withoutData.promptTable, withData.promptTable);

  // 工具调用
  const toolHtml = renderToolComparison(withoutData.toolTable, withData.toolTable);

  return `<div class="scenario-block" id="scenario-${scenario.id}">
    <h2 class="scenario-title">
      <span class="scenario-num">场景 ${scenario.id}</span>
      ${scenario.name}
    </h2>
    ${summaryHtml}
    ${promptHtml}
    ${toolHtml}
  </div>`;
}

function renderFullHTML(scenarioBlocks) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Context Mode 对比分析报告</title>
<style>
:root {
  --bg: #f1f5f9;
  --card-bg: #ffffff;
  --text: #0f172a;
  --text-secondary: #64748b;
  --border: #e2e8f0;
  --without-color: #64748b;
  --without-bg: #f8fafc;
  --with-color: #3b82f6;
  --with-bg: #eff6ff;
  --ctx-color: #8b5cf6;
  --radius: 12px;
  --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  padding-bottom: 60px;
}

/* 头部 */
.header {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
  color: #fff;
  padding: 32px 40px;
}
.header h1 { font-size: 24px; font-weight: 700; margin-bottom: 6px; }
.header .meta { font-size: 13px; opacity: 0.7; }

/* 导航 */
.nav {
  background: var(--card-bg);
  border-bottom: 1px solid var(--border);
  padding: 12px 40px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.nav-links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 1400px;
  margin: 0 auto;
}
.nav-links a {
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 20px;
  transition: all 0.2s;
}
.nav-links a:hover {
  background: var(--with-bg);
  color: var(--with-color);
}

/* 容器 */
.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 28px 40px;
}

/* 场景块 */
.scenario-block {
  margin-bottom: 48px;
}
.scenario-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 3px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
}
.scenario-num {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 20px;
}

/* 对比 section */
.cmp-section {
  margin-bottom: 24px;
}
.cmp-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--text);
  padding-left: 10px;
  border-left: 4px solid var(--with-color);
}

/* 表格 */
.cmp-table-wrap {
  overflow-x: auto;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}
.cmp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.cmp-table thead th {
  background: linear-gradient(135deg, #475569, #334155);
  color: #fff;
  padding: 11px 16px;
  text-align: center;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.3px;
}
.cmp-table thead th.col-without {
  background: linear-gradient(135deg, #64748b, #475569);
}
.cmp-table thead th.col-with {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}
.cmp-table tbody td {
  padding: 10px 16px;
  text-align: center;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.cmp-table tbody td.col-label {
  text-align: left;
  font-weight: 600;
  color: var(--text-secondary);
  background: rgba(241,245,249,0.5);
  white-space: nowrap;
}
.cmp-table tbody td.col-without {
  background: var(--without-bg);
}
.cmp-table tbody td.col-with {
  background: var(--with-bg);
}
.cmp-table tbody tr:hover td {
  filter: brightness(0.97);
}
.cmp-table tbody tr.row-total td {
  font-weight: 700;
  background: #f0f4f8;
  border-top: 2px solid var(--border);
}
.cmp-table tbody tr.row-ctx td {
  background: rgba(139, 92, 246, 0.05);
}
.cmp-table tbody tr.row-ctx td.col-label {
  color: var(--ctx-color);
}

/* 指标值 */
.metric-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
}
.col-without .metric-value { color: var(--without-color); }
.col-with .metric-value { color: var(--with-color); }
.metric-sub {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 3px;
  line-height: 1.4;
}

/* 工具名 */
.tool-name {
  font-family: "SF Mono", "Consolas", "Monaco", monospace;
  font-size: 11px;
  font-weight: 500;
}

/* 宽表 */
.cmp-wide {
  min-width: 600px;
}

/* 页脚 */
.footer {
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 24px;
  border-top: 1px solid var(--border);
  margin-top: 48px;
}

/* 响应式 */
@media (max-width: 768px) {
  .header { padding: 20px 24px; }
  .header h1 { font-size: 18px; }
  .nav { padding: 10px 24px; }
  .container { padding: 16px; }
  .cmp-table { font-size: 12px; }
  .cmp-table thead th, .cmp-table tbody td { padding: 8px 10px; }
  .metric-value { font-size: 15px; }
}
</style>
</head>
<body>

<div class="header">
  <h1>Context Mode 对比分析报告</h1>
  <div class="meta">5 个场景 × 2 种模式（无插件 vs 有插件）横向对比</div>
</div>

<div class="nav">
  <div class="nav-links">
    ${SCENARIOS.map(s => `<a href="#scenario-${s.id}">${s.id}. ${s.name}</a>`).join('')}
  </div>
</div>

<div class="container">
  ${scenarioBlocks.join('')}
</div>

<div class="footer">
  数据来源：funlist 目录下 10 个单场景分析 HTML · 生成时间：${new Date().toLocaleString('zh-CN')}
</div>

</body>
</html>`;
}

// ============================================================
// 主函数
// ============================================================

function main() {
  console.log('开始提取数据...\n');

  const scenarioBlocks = [];

  for (const scenario of SCENARIOS) {
    console.log(`场景 ${scenario.id}: ${scenario.name}`);

    const withoutFile = findHtmlFile('without-context-mode', scenario.id, scenario.name);
    const withFile = findHtmlFile('with-context-mode', scenario.id, scenario.name);

    if (!withoutFile) {
      console.log(`  ⚠ 未找到无插件 HTML`);
      continue;
    }
    if (!withFile) {
      console.log(`  ⚠ 未找到有插件 HTML`);
      continue;
    }

    console.log(`  无插件: ${path.basename(withoutFile)}`);
    console.log(`  有插件: ${path.basename(withFile)}`);

    const withoutData = extractScenarioData(withoutFile);
    const withData = extractScenarioData(withFile);

    console.log(`  无插件: ${withoutData.cards.length} 卡片, ${withoutData.promptTable.length} 行成分, ${withoutData.toolTable.length} 行工具`);
    console.log(`  有插件: ${withData.cards.length} 卡片, ${withData.promptTable.length} 行成分, ${withData.toolTable.length} 行工具`);

    const block = renderScenarioBlock(scenario, withoutData, withData);
    scenarioBlocks.push(block);
    console.log(`  ✓ 已生成对比块\n`);
  }

  const fullHtml = renderFullHTML(scenarioBlocks);
  const outputPath = path.join(FUNLIST_DIR, 'cross-comparison-report.html');
  fs.writeFileSync(outputPath, fullHtml, 'utf-8');

  console.log(`\n✅ 对比报告已生成: ${outputPath}`);
  console.log(`   文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

main();
