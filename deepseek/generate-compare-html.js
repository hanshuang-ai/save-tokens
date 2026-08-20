#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================================
// 配置
// ============================================================================
const FUNLIST_DIR = path.resolve(__dirname, '..', 'funlist');
const OUTPUT_FILE = path.resolve(__dirname, 'compare-scenarios.html');

const SCENARIOS = [
  { id: 1, name: '日志分析', label: '场景1：日志分析', prompt: `作为系统运维专家，请分析车载设备的日志包：
文件路径：D:\\wxwork\\WXWork\\1688854746330792\\Cache\\File\\2026-08\\log_1787057770338_LS6ANE2R3SK200031.zip

这是一个车机设备的诊断日志包，包含 177 个文件，约 103MB。主要包含：
- vehiclelog：车辆通信日志
- main_log：Android 系统日志（gzip 压缩）
- mem_*.txt：内存快照
- cpuinfo_*：CPU 使用记录
- kernel_log：内核日志

请完成：
1. 解压并读取关键日志文件
2. 识别异常模式（内存泄漏、CPU 飙高、频繁重启等）
3. 关联分析不同日志之间的因果关系
4. 生成专业的诊断报告，包含：
   - 问题摘要（Top 3 关键问题）
   - 时间线分析（关键事件发生顺序）
   - 根因分析
   - 修复建议优先级排序
   - 预防措施
5. 把包名是 com.wtcl.electronicdirections 的日志单独提取到一个文件，并分析这个应用可能存在的问题` },
  { id: 2, name: '代码优化', label: '场景2：代码优化', prompt: `请优化智慧加油小程序项目中 pages/detail/detail.vue 文件：
项目在 taro_refuel_6_A_新主线 这个目录下

这个文件是项目中最大的单文件组件，职责过多，难以维护。请：
1. 分析组件结构，识别可拆分的子组件
2. 在新目录 E:\\WT\\save-tokens\\refactored-detail 下实现重构后的代码
3. 将其拆分为 3-5 个子组件
4. 提取业务逻辑到独立的 composables/hooks
5. 保持功能不变，提升代码可维护性

注意：不要修改原始项目代码，所有重构代码放在新目录中。` },
  { id: 3, name: '2048游戏', label: '场景3：2048游戏', prompt: `从0开发一个 2048 数字游戏：先写 PRD（必须带 Mermaid 流程图），再实现为单个 HTML 文件（纯前端，支持键盘和触屏，有音效和动画，UI 美观，最高分用 LocalStorage 保存）。` },
  { id: 4, name: '书籍分析', label: '场景4：书籍分析', prompt: `请深度分析 AI-Agents-in-Depth-zh-CN.epub

【第1轮】书籍结构概览：梳理全书 10 章的结构和逻辑关系，识别核心概念和关键术语，输出章节结构图 + 核心概念清单
【第2轮】技术体系分析：重点分析第一部分"如何构建 Agent"（第1-6章），总结 Agent 架构模式（ReAct、Harness、工具系统等），分析提示工程的核心原则，输出技术架构图 + 提示工程最佳实践
【第3轮】工程实践分析：重点分析第二部分"训练 Agent"（第7-9章），分析评估方法论（LLM-as-a-Judge、自动化评估等），总结模型训练策略（SFT、RL），输出评估框架 + 训练流程
【第4轮】案例与应用分析：识别书中提到的实际案例和代码示例，分析 Coding Agent 的实现方式，总结 Agent 安全边界的处理方法，输出案例汇总 + 实践建议
【第5轮】综合评价与建议：评估本书的优缺点，与同类书籍对比，针对不同读者群体的阅读建议，提出可以深入研究的方向，输出书评 + 学习路线图

把之前的输出都写到本地文档里` },
  { id: 5, name: '项目逆向分析', label: '场景5：项目逆向分析', prompt: `请全面分析智慧加油小程序项目，逆向生成完整的产品需求文档和测试用例：
项目在 taro_refuel_6_A_新主线 这个目录下

## 第一部分：产品需求文档（PRD）
1. 项目概述：分析项目整体结构，理解产品定位，识别目标用户和使用场景，梳理核心功能模块
2. 功能清单：逐一分析 src/pages/index1/、src/pages/detail/、src/pages/order/、src/pages/ucenter/、src/pages/oilCashback/、src/pages/activity/、src/component/ 等页面
3. 业务流程图（必须包含 Mermaid 流程图）：用户加油完整流程、订单创建流程、支付流程、用户登录/注册流程、返现领取流程
4. 数据模型：分析 API 接口定义，推导数据模型结构，列出关键数据实体
5. 页面交互说明：每个页面的交互逻辑、页面间跳转关系、异常处理流程

## 第二部分：详细测试用例
为每个功能模块编写测试用例（格式：用例编号、模块、标题、前置条件、测试步骤、预期结果、优先级、测试类型），覆盖首页模块（10+）、加油详情页（15+）、订单模块（15+）、个人中心（10+）、支付流程（10+）、异常场景（10+）、边界测试、兼容性测试

## 第三部分：输出要求
1. 生成完整的 PRD 文档（Markdown 格式）
2. 生成完整的测试用例表格（Markdown 格式）
3. 所有流程图使用 Mermaid 语法
4. 输出目录：E:\\WT\\save-tokens\\project-docs\\
5. 文件命名：PRD.md、test-cases.md、data-model.md、flow-diagrams.md` },
];

function htmlPath(mode, scenario) {
  const prefix = mode === 'with'
    ? `round-tokens-test-scenarios-with-context-mode-scenario-${scenario.id}-${scenario.name}`
    : `round-tokens-test-scenarios-without-context-mode-scenario-${scenario.id}-${scenario.name}`;
  return path.join(FUNLIST_DIR, prefix + '-日志.html');
}

// ============================================================================
// 解析函数
// ============================================================================

function extractSummary(html) {
  // 提取 summary-cards 区域，找到下一个 div.section 为止
  const idx = html.indexOf('<div class="summary-cards">');
  if (idx === -1) return null;
  const after = html.substring(idx);
  const endIdx = after.indexOf('<div class="section">');
  if (endIdx === -1) return null;
  const block = after.substring(0, endIdx);

  const getCard = (label) => {
    const re = new RegExp(
      `<div class="card[^"]*">\\s*<div class="label">${label}</div>\\s*<div class="value[^"]*">([^<]+)</div>\\s*(?:<div class="sub">([^<]*)</div>)?`,
      'i'
    );
    const m = block.match(re);
    return m ? { value: m[1].trim(), sub: (m[2] || '').trim() } : null;
  };

  const rounds = getCard('有效轮次');
  const cache = getCard('缓存命中率');
  const tokens = getCard('总 Token');
  const time = getCard('总耗时');

  return {
    rounds: rounds ? rounds.value : '',
    roundsSub: rounds ? rounds.sub : '',
    cacheRate: cache ? cache.value : '',
    cacheSub: cache ? cache.sub : '',
    totalTokens: tokens ? tokens.value : '',
    tokensSub: tokens ? tokens.sub : '',
    totalTime: time ? time.value : '',
    timeSub: time ? time.sub : '',
  };
}

function extractTokenArrays(html) {
  // 提取 token 用量堆叠图的数据（新输入 + 缓存读取 + 缓存写入 + 输出）
  // 匹配 datasets: [{"label":"新输入","data":[...], ...}]
  const dsMatch = html.match(/datasets:\s*\[(\{"label":"新输入","data":\[[\s\S]*?\})\]/);
  if (!dsMatch) return null;

  const dsStr = dsMatch[1];
  const result = {};

  const labels = ['新输入', '缓存读取', '缓存写入', '输出'];
  for (const label of labels) {
    const dataRe = new RegExp(`"label":"${label}","data":\\[([^\\]]+)\\]`);
    const m = dsStr.match(dataRe);
    if (m) {
      result[label] = m[1].split(',').map(Number);
    }
  }

  return result;
}

function extractPromptComposition(html) {
  // 提取提示词成分堆叠图数据（系统提示 工具定义 用户输入 思考 输出文本 工具调用 工具结果）
  // 匹配第二个 datasets 块（提示词成分汇总图）
  const allDs = html.match(/datasets:\s*\[(\{"label":"系统提示","data":\[[\s\S]*?\})\]/g);
  if (!allDs || allDs.length < 2) return null;

  const dsStr = allDs[1];
  const result = {};

  const labels = ['系统提示', '工具定义', '用户输入', '思考', '输出文本', '工具调用', '工具结果'];
  for (const label of labels) {
    const dataRe = new RegExp(`"label":"${label}","data":\\[([^\\]]+)\\]`);
    const m = dsStr.match(dataRe);
    if (m) {
      result[label] = m[1].split(',').map(Number);
    }
  }

  return result;
}

function extractToolCalls(html) {
  // 提取工具调用表格
  const tableMatch = html.match(/<h3>[^<]*工具调用次数[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  if (!tableMatch) return null;

  const rows = tableMatch[1].match(/<tr>[\s\S]*?<\/tr>/g);
  if (!rows) return null;

  const result = {};
  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
    if (!cells || cells.length < 2) continue;

    const name = cells[0].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
    const count = cells[1].replace(/<[^>]+>/g, '').trim();
    if (name && count) {
      result[name] = parseInt(count, 10) || 0;
    }
  }

  return result;
}

function extractCacheRateArray(html) {
  // 从 token 数据数组计算每轮缓存命中率
  const tokens = extractTokenArrays(html);
  if (!tokens) return null;

  const newInput = tokens['新输入'] || [];
  const cacheRead = tokens['缓存读取'] || [];
  const rates = [];
  const len = Math.max(newInput.length, cacheRead.length);
  for (let i = 0; i < len; i++) {
    const ni = newInput[i] || 0;
    const cr = cacheRead[i] || 0;
    const total = ni + cr;
    rates.push(total > 0 ? parseFloat(((cr / total) * 100).toFixed(1)) : 0);
  }
  return rates;
}

function parseNumber(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[^\d.]/g, '');
  return parseFloat(cleaned) || 0;
}

function parseTimeToSeconds(str) {
  // "5.0分钟" or "13.6分钟" or "1.1分钟"
  const m = str.match(/([\d.]+)\s*分/);
  if (m) return parseFloat(m[1]) * 60;
  return 0;
}

// ============================================================================
// 主流程：解析所有 HTML
// ============================================================================

function parseAll() {
  const results = {};

  for (const mode of ['with', 'without']) {
    for (const scenario of SCENARIOS) {
      const key = `${mode}-${scenario.id}`;
      const filePath = htmlPath(mode, scenario);

      if (!fs.existsSync(filePath)) {
        console.error(`文件不存在: ${filePath}`);
        continue;
      }

      const html = fs.readFileSync(filePath, 'utf-8');

      results[key] = {
        mode,
        scenario,
        summary: extractSummary(html),
        tokens: extractTokenArrays(html),
        promptComp: extractPromptComposition(html),
        toolCalls: extractToolCalls(html),
        cacheRates: extractCacheRateArray(html),
      };

      console.log(`解析完成: ${key} (${results[key].summary ? '✓' : '✗'})`);
    }
  }

  return results;
}

// ============================================================================
// HTML 生成
// ============================================================================

function fmtNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return String(n);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function changePct(a, b) {
  if (b === 0) return '—';
  const pct = ((a - b) / b * 100).toFixed(1);
  const sign = pct > 0 ? '+' : '';
  return sign + pct + '%';
}

function changeClass(a, b, lowerIsBetter) {
  // 对于 token/耗时/轮数，lower is better；对于缓存命中率，higher is better
  if (b === 0) return 'neutral';
  const pct = (a - b) / b;
  if (lowerIsBetter) {
    return pct < -0.01 ? 'good' : pct > 0.01 ? 'bad' : 'neutral';
  } else {
    return pct > 0.01 ? 'good' : pct < -0.01 ? 'bad' : 'neutral';
  }
}

function generateHTML(data) {
  const css = fs.readFileSync(__filename, 'utf-8').match(/\/\/ ==CSS_START==([\s\S]*?)\/\/ ==CSS_END==/);
  const styles = css ? css[1] : '';

  // 计算汇总数据
  const rows = [];
  for (const s of SCENARIOS) {
    const w = data[`with-${s.id}`];
    const wo = data[`without-${s.id}`];
    if (!w || !wo) continue;

    const wSum = w.summary;
    const woSum = wo.summary;

    const wTokens = parseNumber(wSum.totalTokens);
    const woTokens = parseNumber(woSum.totalTokens);
    const wCache = parseFloat(wSum.cacheRate);
    const woCache = parseFloat(woSum.cacheRate);
    const wTime = parseTimeToSeconds(wSum.totalTime);
    const woTime = parseTimeToSeconds(woSum.totalTime);
    const wRounds = parseInt(wSum.rounds);
    const woRounds = parseInt(woSum.rounds);

    // 从 sub 提取 input/output
    const wInputMatch = wSum.tokensSub.match(/输入\s*([\d,]+)/);
    const woInputMatch = woSum.tokensSub.match(/输入\s*([\d,]+)/);
    const wOutputMatch = wSum.tokensSub.match(/输出\s*([\d,]+)/);
    const woOutputMatch = woSum.tokensSub.match(/输出\s*([\d,]+)/);

    const wInput = wInputMatch ? parseInt(wInputMatch[1].replace(/,/g, '')) : 0;
    const woInput = woInputMatch ? parseInt(woInputMatch[1].replace(/,/g, '')) : 0;
    const wOutput = wOutputMatch ? parseInt(wOutputMatch[1].replace(/,/g, '')) : 0;
    const woOutput = woOutputMatch ? parseInt(woOutputMatch[1].replace(/,/g, '')) : 0;

    rows.push({
      scenario: s,
      with: { rounds: wRounds, tokens: wTokens, input: wInput, output: wOutput, cache: wCache, time: wTime, label: wSum },
      without: { rounds: woRounds, tokens: woTokens, input: woInput, output: woOutput, cache: woCache, time: woTime, label: woSum },
    });
  }

  // 生成 HTML
  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Context Mode 插件 — 5 场景对比分析</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<style>
${buildCSS()}
<\/style>
</head>
<body>
<div class="header">
  <h1>Context Mode 插件 — 5 场景对比分析</h1>
  <div class="meta">有插件 (with-context-mode) vs 无插件 (without-context-mode)</div>
</div>
<div class="layout">
  <nav class="sidebar">
    <div class="nav-group">
      <div class="nav-group-title">总览</div>
      <div class="nav-item active" data-panel="panel-master" onclick="switchPanel('panel-master', this)">
        <span class="dot all"></span> 核心指标总表
      </div>
    </div>
    <div class="nav-group">
      <div class="nav-group-title">场景对比</div>
      <div class="nav-item" data-panel="panel-s1" onclick="switchPanel('panel-s1', this)">
        <span class="dot s1"></span> 场景1：日志分析
      </div>
      <div class="nav-item" data-panel="panel-s2" onclick="switchPanel('panel-s2', this)">
        <span class="dot s2"></span> 场景2：代码优化
      </div>
      <div class="nav-item" data-panel="panel-s3" onclick="switchPanel('panel-s3', this)">
        <span class="dot s3"></span> 场景3：2048游戏
      </div>
      <div class="nav-item" data-panel="panel-s4" onclick="switchPanel('panel-s4', this)">
        <span class="dot s4"></span> 场景4：书籍分析
      </div>
      <div class="nav-item" data-panel="panel-s5" onclick="switchPanel('panel-s5', this)">
        <span class="dot s5"></span> 场景5：项目逆向分析
      </div>
    </div>
  </nav>
  <div class="main">
    <div class="panel active" id="panel-master">
      ${buildSummaryTable(rows)}
      ${buildConclusion(rows)}
    </div>
    <div class="panel" id="panel-s1">${buildScenarioPanel(data, rows, 0)}</div>
    <div class="panel" id="panel-s2">${buildScenarioPanel(data, rows, 1)}</div>
    <div class="panel" id="panel-s3">${buildScenarioPanel(data, rows, 2)}</div>
    <div class="panel" id="panel-s4">${buildScenarioPanel(data, rows, 3)}</div>
    <div class="panel" id="panel-s5">${buildScenarioPanel(data, rows, 4)}</div>
  </div>
</div>
<script>
${buildChartJS(data, rows)}
<\/script>
</body>
</html>`;

  return html;
}

function buildCSS() {
  return `
:root {
    --bg: #f1f5f9; --card-bg: #ffffff; --text: #0f172a; --text-secondary: #64748b;
    --border: #e2e8f0; --accent: #3b82f6; --accent-light: #eff6ff;
    --green: #10b981; --green-bg: #ecfdf5; --red: #ef4444; --red-bg: #fef2f2;
    --yellow: #f59e0b; --yellow-bg: #fffbeb; --purple: #8b5cf6;
    --header-bg: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
    --sidebar-w: 240px;
    --radius: 14px; --radius-sm: 8px;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    --shadow: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.6;
}
.header {
    background: var(--header-bg); color: #fff; padding: 20px 28px;
    display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
    position: sticky; top: 0; z-index: 100;
}
.header h1 { font-size: 20px; font-weight: 700; }
.header .meta { font-size: 12px; opacity: 0.7; }

/* 布局 */
.layout { display: flex; min-height: calc(100vh - 68px); }

/* 左侧导航 */
.sidebar {
    width: var(--sidebar-w); min-width: var(--sidebar-w);
    background: #fff; border-right: 1px solid var(--border);
    padding: 16px 0; position: sticky; top: 68px;
    height: calc(100vh - 68px); overflow-y: auto;
}
.sidebar .nav-group { padding: 0 12px; margin-bottom: 8px; }
.sidebar .nav-group-title {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
    color: var(--text-secondary); padding: 8px 12px 4px; font-weight: 600;
}
.sidebar .nav-item {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; margin: 2px 0; border-radius: 8px;
    cursor: pointer; font-size: 13px; font-weight: 500; color: var(--text);
    transition: all 0.15s; border: 1px solid transparent; user-select: none;
}
.sidebar .nav-item:hover { background: #f1f5f9; }
.sidebar .nav-item.active { background: var(--accent-light); color: var(--accent); border-color: var(--accent); font-weight: 600; }
.sidebar .nav-item .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.sidebar .nav-item .dot.s1 { background: #3b82f6; }
.sidebar .nav-item .dot.s2 { background: #8b5cf6; }
.sidebar .nav-item .dot.s3 { background: #10b981; }
.sidebar .nav-item .dot.s4 { background: #f59e0b; }
.sidebar .nav-item .dot.s5 { background: #ef4444; }
.sidebar .nav-item .dot.all { background: #64748b; }

/* 主内容区 */
.main { flex: 1; padding: 24px 28px; overflow-y: auto; min-width: 0; }
.panel { display: none; }
.panel.active { display: block; }

.section { margin-bottom: 40px; }
.section-title {
    font-size: 18px; font-weight: 700; margin-bottom: 16px; padding-bottom: 10px;
    border-bottom: 2px solid var(--border); color: var(--text);
}

/* 场景汇总卡片 */
.summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
.sum-card {
    background: var(--card-bg); border-radius: var(--radius); padding: 16px 18px;
    box-shadow: var(--shadow-sm); border: 1px solid var(--border); text-align: center;
}
.sum-label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px; font-weight: 600; }
.sum-values { display: flex; justify-content: center; gap: 12px; margin-bottom: 6px; }
.sum-val { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 5px; }
.sum-diff { font-size: 12px; font-weight: 600; }
.tag { font-size: 10px; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
.tag.with { background: #dbeafe; color: #2563eb; }
.tag.without { background: #fecaca; color: #dc2626; }

/* 提示词 */
.prompt-box { margin-bottom: 24px; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
.prompt-header {
    background: #f8fafc; padding: 10px 16px; cursor: pointer;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 13px; font-weight: 600; user-select: none;
}
.prompt-header:hover { background: #f1f5f9; }
.prompt-toggle { font-size: 11px; color: var(--text-muted); font-weight: 400; }
.prompt-text {
    margin: 0; padding: 14px 18px; font-size: 12px; line-height: 1.7;
    background: #fff; border: none; border-radius: 0; white-space: pre-wrap; word-break: break-word;
    max-height: 300px; overflow-y: auto;
}
.prompt-box.collapsed .prompt-text { display: none; }
.prompt-box.collapsed .prompt-toggle::after { content: '（已折叠）'; }
.prompt-box .prompt-toggle::after { content: '（已展开）'; }

/* 汇总表 */
.master-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; background: var(--card-bg); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); }
.master-table th, .master-table td { padding: 10px 12px; text-align: right; border-bottom: 1px solid var(--border); }
.master-table th { background: #334155; color: #fff; font-weight: 600; white-space: nowrap; position: sticky; top: 0; }
.master-table th:first-child, .master-table td:first-child { text-align: left; font-weight: 600; }
.master-table .mode-row td { background: #f8fafc; font-weight: 500; }
.master-table .change { font-size: 11px; font-weight: 700; }
.master-table .change.good { color: var(--green); }
.master-table .change.bad { color: var(--red); }
.master-table .change.neutral { color: var(--text-secondary); }
.master-table .sep td { border-top: 2px solid #cbd5e1; }

/* 场景 Section */
.scenario-section { background: var(--card-bg); border-radius: var(--radius); padding: 24px; margin-bottom: 32px; box-shadow: var(--shadow-sm); border: 1px solid var(--border); }
.scenario-section h2 { font-size: 20px; margin-bottom: 20px; color: var(--text); display: flex; align-items: center; gap: 10px; }
.scenario-section h2 .badge { font-size: 12px; padding: 3px 10px; border-radius: 20px; font-weight: 600; }
.scenario-section h2 .badge.with { background: var(--accent-light); color: var(--accent); }
.scenario-section h2 .badge.without { background: var(--red-bg); color: var(--red); }

/* 场景内对比小表 */
.compare-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
.compare-table th, .compare-table td { padding: 8px 14px; text-align: center; border-bottom: 1px solid var(--border); }
.compare-table th { background: #f1f5f9; font-weight: 600; }
.compare-table th:first-child { text-align: left; }
.compare-table td:first-child { text-align: left; font-weight: 500; }
.compare-table .diff { font-weight: 600; }
.compare-table .diff.good { color: var(--green); }
.compare-table .diff.bad { color: var(--red); }

/* 图表容器 */
.chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.chart-full { margin-bottom: 20px; }
.chart-box { background: #f8fafc; border-radius: var(--radius-sm); padding: 16px; border: 1px solid var(--border); }
.chart-box h4 { font-size: 13px; color: var(--text-secondary); margin-bottom: 10px; }
.chart-box .canvas-wrap { position: relative; height: 300px; }
.chart-box .canvas-wrap.tall { height: 360px; }

/* 工具调用表 */
.tool-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.tool-table th, .tool-table td { padding: 6px 10px; text-align: right; border-bottom: 1px solid var(--border); }
.tool-table th { background: #334155; color: #fff; font-weight: 600; white-space: nowrap; }
.tool-table th:first-child, .tool-table td:first-child { text-align: left; font-family: monospace; }
.tool-table .mode-header { background: #475569; font-size: 11px; }
.tool-table .with-col { background: rgba(59,130,246,0.05); }
.tool-table .without-col { background: rgba(239,68,68,0.03); }

/* 结论 */
.conclusion { background: var(--card-bg); border-radius: var(--radius); padding: 24px; box-shadow: var(--shadow-sm); }
.conclusion h2 { font-size: 18px; margin-bottom: 16px; }
.conclusion li { margin: 6px 0; font-size: 14px; }

.good { color: var(--green); }
.bad { color: var(--red); }
.neutral { color: var(--text-secondary); }

@media (max-width: 900px) {
    .sidebar { width: 180px; min-width: 180px; }
    .chart-row { grid-template-columns: 1fr; }
    .main { padding: 12px; }
    .master-table { font-size: 11px; }
    .master-table th, .master-table td { padding: 6px 8px; }
    .summary-cards { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
    .layout { flex-direction: column; }
    .sidebar { width: 100%; min-width: 100%; height: auto; position: static;
               display: flex; flex-wrap: wrap; padding: 8px; gap: 4px; }
    .sidebar .nav-group { margin: 0; padding: 0; }
    .sidebar .nav-group-title { display: none; }
    .sidebar .nav-item { font-size: 11px; padding: 6px 10px; white-space: nowrap; }
    .summary-cards { grid-template-columns: 1fr 1fr; }
}
`;
}

function buildSummaryTable(rows) {
  let html = `<div class="section">
<div class="section-title">核心指标对比总表</div>
<div style="overflow-x:auto;">
<table class="master-table">
<thead>
<tr>
  <th>场景</th>
  <th>模式</th>
  <th>有效轮数</th>
  <th>总 Token</th>
  <th>新输入 Token</th>
  <th>输出 Token</th>
  <th>缓存命中率</th>
  <th>总耗时</th>
</tr>
</thead>
<tbody>`;

  for (const row of rows) {
    const w = row.with;
    const wo = row.without;

    html += `<tr class="sep">
  <td rowspan="2" style="vertical-align:middle;">${row.scenario.label}</td>
  <td class="mode-row">有插件</td>
  <td>${w.rounds}</td>
  <td>${fmtNum(w.tokens)}</td>
  <td>${fmtNum(w.input)}</td>
  <td>${fmtNum(w.output)}</td>
  <td>${w.cache}%</td>
  <td>${w.label.totalTime}</td>
</tr>
<tr>
  <td class="mode-row">无插件</td>
  <td>${wo.rounds}</td>
  <td>${fmtNum(wo.tokens)}</td>
  <td>${fmtNum(wo.input)}</td>
  <td>${fmtNum(wo.output)}</td>
  <td>${wo.cache}%</td>
  <td>${wo.label.totalTime}</td>
</tr>`;

    // 变化率行
    const tokenChg = changePct(w.tokens, wo.tokens);
    const inputChg = changePct(w.input, wo.input);
    const outputChg = changePct(w.output, wo.output);
    const roundsChg = changePct(w.rounds, wo.rounds);
    const timeChg = changePct(w.time, wo.time);
    const cacheDiff = (w.cache - wo.cache).toFixed(1);
    const cacheSign = cacheDiff > 0 ? '+' : '';

    html += `<tr style="font-size:11px;color:#64748b;">
  <td colspan="2" style="text-align:right;font-weight:600;">变化</td>
  <td class="change ${changeClass(w.rounds, wo.rounds, true)}">${roundsChg}</td>
  <td class="change ${changeClass(w.tokens, wo.tokens, true)}">${tokenChg}</td>
  <td class="change ${changeClass(w.input, wo.input, true)}">${inputChg}</td>
  <td class="change ${changeClass(w.output, wo.output, true)}">${outputChg}</td>
  <td class="change ${changeClass(w.cache, wo.cache, false)}">${cacheSign}${cacheDiff}pp</td>
  <td class="change ${changeClass(w.time, wo.time, true)}">${timeChg}</td>
</tr>`;
  }

  html += `</tbody></table></div></div>`;
  return html;
}

function buildScenarioPanel(data, rows, idx) {
  const row = rows[idx];
  const s = row.scenario;
  const w = data[`with-${s.id}`];
  const wo = data[`without-${s.id}`];
  const wSum = row.with.label;
  const woSum = row.without.label;

  let html = `<div class="scenario-section">
<h2>${s.label}</h2>

<!-- 提示词 -->
<div class="prompt-box">
  <div class="prompt-header" onclick="this.parentElement.classList.toggle('collapsed')">
    <span>📝 提示词</span>
    <span class="prompt-toggle">点击折叠/展开</span>
  </div>
  <pre class="prompt-text">${escapeHtml(s.prompt)}</pre>
</div>

<!-- 汇总卡片 -->
<div class="summary-cards">
  <div class="sum-card">
    <div class="sum-label">有效轮次</div>
    <div class="sum-values">
      <div class="sum-val"><span class="tag with">有</span>${row.with.rounds}</div>
      <div class="sum-val"><span class="tag without">无</span>${row.without.rounds}</div>
    </div>
    <div class="sum-diff ${changeClass(row.with.rounds, row.without.rounds, true)}">${changePct(row.with.rounds, row.without.rounds)}</div>
  </div>
  <div class="sum-card">
    <div class="sum-label">总 Token</div>
    <div class="sum-values">
      <div class="sum-val"><span class="tag with">有</span>${fmtNum(row.with.tokens)}</div>
      <div class="sum-val"><span class="tag without">无</span>${fmtNum(row.without.tokens)}</div>
    </div>
    <div class="sum-diff ${changeClass(row.with.tokens, row.without.tokens, true)}">${changePct(row.with.tokens, row.without.tokens)}</div>
  </div>
  <div class="sum-card">
    <div class="sum-label">缓存命中率</div>
    <div class="sum-values">
      <div class="sum-val"><span class="tag with">有</span>${row.with.cache}%</div>
      <div class="sum-val"><span class="tag without">无</span>${row.without.cache}%</div>
    </div>
    <div class="sum-diff ${changeClass(row.with.cache, row.without.cache, false)}">${(row.with.cache - row.without.cache >= 0 ? '+' : '') + (row.with.cache - row.without.cache).toFixed(1)}pp</div>
  </div>
  <div class="sum-card">
    <div class="sum-label">总耗时</div>
    <div class="sum-values">
      <div class="sum-val"><span class="tag with">有</span>${wSum.totalTime}</div>
      <div class="sum-val"><span class="tag without">无</span>${woSum.totalTime}</div>
    </div>
    <div class="sum-diff ${changeClass(row.with.time, row.without.time, true)}">${changePct(row.with.time, row.without.time)}</div>
  </div>
</div>

<!-- 指标对比小表 -->
<table class="compare-table">
<thead>
<tr><th>指标</th><th>有插件</th><th>无插件</th><th>差值</th></tr>
</thead>
<tbody>
<tr>
  <td>有效轮数</td>
  <td>${row.with.rounds} <span class="sub">${wSum.roundsSub}</span></td>
  <td>${row.without.rounds} <span class="sub">${woSum.roundsSub}</span></td>
  <td class="diff ${changeClass(row.with.rounds, row.without.rounds, true)}">${changePct(row.with.rounds, row.without.rounds)}</td>
</tr>
<tr>
  <td>总 Token</td>
  <td>${fmtNum(row.with.tokens)} <span class="sub">${wSum.tokensSub}</span></td>
  <td>${fmtNum(row.without.tokens)} <span class="sub">${woSum.tokensSub}</span></td>
  <td class="diff ${changeClass(row.with.tokens, row.without.tokens, true)}">${changePct(row.with.tokens, row.without.tokens)}</td>
</tr>
<tr>
  <td>新输入 Token</td>
  <td>${fmtNum(row.with.input)}</td>
  <td>${fmtNum(row.without.input)}</td>
  <td class="diff ${changeClass(row.with.input, row.without.input, true)}">${changePct(row.with.input, row.without.input)}</td>
</tr>
<tr>
  <td>输出 Token</td>
  <td>${fmtNum(row.with.output)}</td>
  <td>${fmtNum(row.without.output)}</td>
  <td class="diff ${changeClass(row.with.output, row.without.output, true)}">${changePct(row.with.output, row.without.output)}</td>
</tr>
<tr>
  <td>缓存命中率</td>
  <td>${row.with.cache}%</td>
  <td>${row.without.cache}%</td>
  <td class="diff ${changeClass(row.with.cache, row.without.cache, false)}">${(row.with.cache - row.without.cache >= 0 ? '+' : '') + (row.with.cache - row.without.cache).toFixed(1)}pp</td>
</tr>
<tr>
  <td>总耗时</td>
  <td>${wSum.totalTime} <span class="sub">${wSum.timeSub}</span></td>
  <td>${woSum.totalTime} <span class="sub">${woSum.timeSub}</span></td>
  <td class="diff ${changeClass(row.with.time, row.without.time, true)}">${changePct(row.with.time, row.without.time)}</td>
</tr>
</tbody>
</table>

<!-- 逐轮 Token 对比图 -->
<div class="chart-full">
  <div class="chart-box">
    <h4>逐轮 Token 用量对比（堆叠 = 新输入 + 缓存读取 + 输出）</h4>
    <div class="canvas-wrap tall"><canvas id="chartToken-${s.id}"></canvas></div>
  </div>
</div>

<!-- 缓存命中率趋势 -->
<div class="chart-full">
  <div class="chart-box">
    <h4>逐轮缓存命中率趋势对比</h4>
    <div class="canvas-wrap"><canvas id="chartCache-${s.id}"></canvas></div>
  </div>
</div>

<!-- 提示词成分占比 -->
<div class="chart-row">
  <div class="chart-box">
    <h4>提示词成分占比 — 有插件</h4>
    <div class="canvas-wrap"><canvas id="chartPromptWith-${s.id}"></canvas></div>
  </div>
  <div class="chart-box">
    <h4>提示词成分占比 — 无插件</h4>
    <div class="canvas-wrap"><canvas id="chartPromptWithout-${s.id}"></canvas></div>
  </div>
</div>

<!-- 工具调用对比 -->
<div class="section">
  <div class="section-title">工具调用次数对比</div>
  ${buildScenarioToolTable(data, s.id)}
</div>

</div>`;

  return html;
}

function buildScenarioToolTable(data, scenarioId) {
  const w = data[`with-${scenarioId}`];
  const wo = data[`without-${scenarioId}`];

  const allTools = new Set();
  if (w && w.toolCalls) Object.keys(w.toolCalls).forEach(t => allTools.add(t));
  if (wo && wo.toolCalls) Object.keys(wo.toolCalls).forEach(t => allTools.add(t));

  const tools = Array.from(allTools).sort((a, b) => {
    const aCtx = a.startsWith('ctx_') || a.startsWith('mcp__');
    const bCtx = b.startsWith('ctx_') || b.startsWith('mcp__');
    if (aCtx && !bCtx) return -1;
    if (!aCtx && bCtx) return 1;
    return a.localeCompare(b);
  });

  if (tools.length === 0) return '<p>无工具调用数据</p>';

  let html = `<table class="tool-table">
<thead>
<tr><th>工具</th><th class="with-col">有插件</th><th class="without-col">无插件</th></tr>
</thead>
<tbody>`;

  for (const tool of tools) {
    const wc = (w && w.toolCalls && w.toolCalls[tool] !== undefined) ? w.toolCalls[tool] : '—';
    const woc = (wo && wo.toolCalls && wo.toolCalls[tool] !== undefined) ? wo.toolCalls[tool] : '—';
    html += `<tr><td>${tool}</td><td class="with-col">${wc}</td><td class="without-col">${woc}</td></tr>`;
  }

  html += `</tbody></table>`;
  return html;
}

function buildToolComparison(data) {
  // 收集所有工具名
  const allTools = new Set();
  for (const s of SCENARIOS) {
    for (const mode of ['with', 'without']) {
      const d = data[`${mode}-${s.id}`];
      if (d && d.toolCalls) {
        Object.keys(d.toolCalls).forEach(t => allTools.add(t));
      }
    }
  }

  const tools = Array.from(allTools).sort((a, b) => {
    // context-mode 工具排前面
    const aCtx = a.startsWith('ctx_') || a.startsWith('mcp__');
    const bCtx = b.startsWith('ctx_') || b.startsWith('mcp__');
    if (aCtx && !bCtx) return -1;
    if (!aCtx && bCtx) return 1;
    return a.localeCompare(b);
  });

  let html = `<div class="section">
<div class="section-title">工具调用次数对比</div>
<div style="overflow-x:auto;">
<table class="tool-table">
<thead>
<tr>
  <th>工具</th>`;

  for (const s of SCENARIOS) {
    html += `<th class="with-col">${s.name}<br>有插件</th><th class="without-col">${s.name}<br>无插件</th>`;
  }

  html += `</tr>
</thead>
<tbody>`;

  for (const tool of tools) {
    html += `<tr><td>${tool}</td>`;
    for (const s of SCENARIOS) {
      const w = data[`with-${s.id}`];
      const wo = data[`without-${s.id}`];
      const wc = (w && w.toolCalls && w.toolCalls[tool]) ? w.toolCalls[tool] : '—';
      const woc = (wo && wo.toolCalls && wo.toolCalls[tool]) ? wo.toolCalls[tool] : '—';
      html += `<td class="with-col">${wc}</td><td class="without-col">${woc}</td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table></div></div>`;
  return html;
}

function buildConclusion(rows) {
  let html = `<div class="section conclusion">
<h2>结论摘要</h2>
<ul>`;

  for (const row of rows) {
    const w = row.with;
    const wo = row.without;
    const tokenChg = ((w.tokens - wo.tokens) / wo.tokens * 100).toFixed(1);
    const timeChg = ((w.time - wo.time) / wo.time * 100).toFixed(1);
    const cacheDiff = (w.cache - wo.cache).toFixed(1);

    let assessment = '';
    if (parseFloat(tokenChg) < -10 && parseFloat(timeChg) < -10) {
      assessment = '有插件显著更优';
    } else if (parseFloat(tokenChg) > 10 && parseFloat(timeChg) > 10) {
      assessment = '无插件更优（注意：两次运行任务量不同，非直接可比）';
    } else {
      assessment = '差异不显著（两次运行任务量不同，非直接可比）';
    }

    html += `<li><strong>${row.scenario.label}：</strong>有插件 Token ${tokenChg > 0 ? '+' : ''}${tokenChg}%，耗时 ${timeChg > 0 ? '+' : ''}${timeChg}%，缓存命中率 ${cacheDiff > 0 ? '+' : ''}${cacheDiff}pp。${assessment}</li>`;
  }

  html += `</ul>
<p style="margin-top:12px;font-size:13px;color:var(--text-secondary);">
⚠ 注意：场景 2-5 中，有插件和无插件的运行轮数不同，说明两次独立运行的任务执行路径不同，对比数据仅反映两次实际运行的差异，不能简单归因于插件效果。场景 1 的两次运行任务量接近，更具参考价值。
</p>
</div>`;

  return html;
}

function buildChartJS(data, rows) {
  let js = 'const chartInstances = {};\nconst chartInited = {};\n\n';

  // 场景图表初始化函数
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const s = row.scenario;
    const w = data[`with-${s.id}`];
    const wo = data[`without-${s.id}`];

    js += `function initCharts_s${s.id}() {
  if (chartInited['s${s.id}']) return;
  chartInited['s${s.id}'] = true;\n`;

    // === Token 用量对比图 ===
    if (w.tokens && wo.tokens) {
      const wInput = w.tokens['新输入'] || [];
      const wCache = w.tokens['缓存读取'] || [];
      const wOutput = w.tokens['输出'] || [];
      const woInput = wo.tokens['新输入'] || [];
      const woCache = wo.tokens['缓存读取'] || [];
      const woOutput = wo.tokens['输出'] || [];

      const maxRounds = Math.max(wInput.length, woInput.length);
      const labels = [];
      for (let i = 0; i < maxRounds; i++) labels.push(`R${i + 1}`);

      js += `
  (function() {
    const ctx = document.getElementById('chartToken-${s.id}');
    if (!ctx) return;
    chartInstances['chartToken-${s.id}'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [
          { label: '有-新输入', data: ${JSON.stringify(wInput)}, stack: 'with', backgroundColor: 'rgba(59,130,246,0.7)', borderColor: 'rgba(59,130,246,1)', borderWidth: 1 },
          { label: '有-缓存读取', data: ${JSON.stringify(wCache)}, stack: 'with', backgroundColor: 'rgba(0,184,148,0.7)', borderColor: 'rgba(0,184,148,1)', borderWidth: 1 },
          { label: '有-输出', data: ${JSON.stringify(wOutput)}, stack: 'with', backgroundColor: 'rgba(253,203,110,0.7)', borderColor: 'rgba(253,203,110,1)', borderWidth: 1 },
          { label: '无-新输入', data: ${JSON.stringify(woInput)}, stack: 'without', backgroundColor: 'rgba(239,68,68,0.5)', borderColor: 'rgba(239,68,68,1)', borderWidth: 1 },
          { label: '无-缓存读取', data: ${JSON.stringify(woCache)}, stack: 'without', backgroundColor: 'rgba(16,185,129,0.5)', borderColor: 'rgba(16,185,129,1)', borderWidth: 1 },
          { label: '无-输出', data: ${JSON.stringify(woOutput)}, stack: 'without', backgroundColor: 'rgba(245,158,11,0.5)', borderColor: 'rgba(245,158,11,1)', borderWidth: 1 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false,
        scales: {
          x: { stacked: true, ticks: { maxTicksLimit: 20, font: { size: 10 } } },
          y: { stacked: true, title: { display: true, text: 'Tokens' }, ticks: { callback: v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v } }
        },
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } } }
      }
    });
  })();`;

      // === 缓存命中率趋势 ===
      if (w.cacheRates && wo.cacheRates) {
        const wr = w.cacheRates;
        const wor = wo.cacheRates;
        const maxLen = Math.max(wr.length, wor.length);
        const cacheLabels = [];
        for (let i = 0; i < maxLen; i++) cacheLabels.push(`R${i + 1}`);

        js += `
  (function() {
    const ctx = document.getElementById('chartCache-${s.id}');
    if (!ctx) return;
    chartInstances['chartCache-${s.id}'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(cacheLabels)},
        datasets: [
          { label: '有插件', data: ${JSON.stringify(wr)}, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
          { label: '无插件', data: ${JSON.stringify(wor)}, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false,
        scales: { y: { min: 0, max: 100, title: { display: true, text: '%' }, ticks: { callback: v => v + '%' } } },
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } } }
      }
    });
  })();`;
      }

      // === 提示词成分占比（环形图） ===
      if (w.promptComp && wo.promptComp) {
        const compLabels = ['系统提示', '工具定义', '用户输入', '思考', '输出文本', '工具调用', '工具结果'];
        const compColors = ['#6c5ce7', '#00cec9', '#0984e3', '#fdcb6e', '#00b894', '#e17055', '#d63031'];

        for (const mode of ['with', 'without']) {
          const d = mode === 'with' ? w : wo;
          const compData = compLabels.map(l => {
            const arr = d.promptComp[l] || [];
            return arr.length > 0 ? arr[arr.length - 1] : 0;
          });

          js += `
  (function() {
    const ctx = document.getElementById('chartPrompt${mode === 'with' ? 'With' : 'Without'}-${s.id}');
    if (!ctx) return;
    chartInstances['chartPrompt${mode === 'with' ? 'With' : 'Without'}-${s.id}'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ${JSON.stringify(compLabels)},
        datasets: [{ data: ${JSON.stringify(compData)}, backgroundColor: ${JSON.stringify(compColors)} }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 }, padding: 8 } },
          tooltip: { callbacks: { label: ctx => ctx.label + ': ' + (ctx.raw >= 1000000 ? (ctx.raw/1000000).toFixed(1)+'M' : ctx.raw >= 1000 ? (ctx.raw/1000).toFixed(0)+'K' : ctx.raw) + ' chars' } }
        }
      }
    });
  })();`;
        }
      }
    }

    js += `}\n`;
  }

  // 切换面板时初始化图表
  js += `
function switchPanel(panelId, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');
  el.classList.add('active');

  // 初始化对应场景的图表
  const scenarioMap = { 'panel-s1': 's1', 'panel-s2': 's2', 'panel-s3': 's3', 'panel-s4': 's4', 'panel-s5': 's5' };
  const sid = scenarioMap[panelId];
  if (sid && typeof window['initCharts_' + sid] === 'function') {
    setTimeout(function() { window['initCharts_' + sid](); }, 50);
  }
}

// 页面加载时初始化默认面板的图表
setTimeout(function() { if (typeof initCharts_s1 === 'function') initCharts_s1(); }, 100);
`;

  return js;
}

// ============================================================================
// 执行
// ============================================================================

const data = parseAll();
const html = generateHTML(data);
fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');
console.log(`\n输出文件: ${OUTPUT_FILE}`);
console.log(`文件大小: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`);