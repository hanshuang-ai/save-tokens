#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================================
// 配置
// ============================================================================
const BASE = path.resolve(__dirname, '..', 'test-scenarios');
const OUTPUT = path.resolve(__dirname, 'compare-scenarios.html');

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

// ============================================================================
// 从 JSONL 读取数据
// ============================================================================

function loadScenario(mode, scenario) {
  const modeDir = mode === 'with' ? 'with-context-mode' : 'without-context-mode';
  const logDir = path.join(BASE, modeDir, `scenario-${scenario.id}-${scenario.name}`, '日志');

  // 读取 summary JSONL
  const summaryFiles = fs.readdirSync(logDir).filter(f => f.startsWith('summary-'));
  if (summaryFiles.length === 0) return null;
  const summaryLines = fs.readFileSync(path.join(logDir, summaryFiles[0]), 'utf-8').trim().split('\n').map(JSON.parse);

  // 读取 request JSONL
  const reqFiles = fs.readdirSync(logDir).filter(f => f.startsWith('proxy-') && f.includes('request'));
  let reqLines = [];
  if (reqFiles.length > 0) {
    reqLines = fs.readFileSync(path.join(logDir, reqFiles[0]), 'utf-8').trim().split('\n').map(JSON.parse);
  }

  // --- 基本统计 ---
  let totalRounds = summaryLines.length;
  let validRounds = 0;
  let totalInputTokens = 0, totalOutputTokens = 0, totalCacheRead = 0, totalCacheWrite = 0;
  let firstTs = null, lastTs = null;
  let outOfOrder = 0, prevId = 0;

  // 逐轮数据
  const perRound = [];

  for (const d of summaryLines) {
    if (!firstTs) firstTs = new Date(d.timestamp);
    lastTs = new Date(d.timestamp);
    if (d.id < prevId) outOfOrder++;
    prevId = d.id;

    if (d.usage) {
      validRounds++;
      totalInputTokens += d.usage.input_tokens || 0;
      totalOutputTokens += d.usage.output_tokens || 0;
      totalCacheRead += d.usage.cache_read_input_tokens || 0;
      totalCacheWrite += d.usage.cache_creation_input_tokens || 0;

      perRound.push({
        id: d.id,
        input: d.usage.input_tokens || 0,
        output: d.usage.output_tokens || 0,
        cacheRead: d.usage.cache_read_input_tokens || 0,
        cacheWrite: d.usage.cache_creation_input_tokens || 0,
        bodySize: d.request_body_size || 0,
        durationMs: d.duration_ms || 0,
      });
    }
  }

  const wallTimeSec = (lastTs - firstTs) / 1000;
  const totalTokens = totalInputTokens + totalOutputTokens + totalCacheRead + totalCacheWrite;
  const totalInputAll = totalInputTokens + totalCacheRead + totalCacheWrite;
  const cacheHitRate = totalInputAll > 0 ? (totalCacheRead / totalInputAll * 100) : 0;

  // --- 工具调用统计（从 request JSONL） ---
  const toolCounts = {};
  let ctxToolCalls = 0;

  for (const d of reqLines) {
    const req = d.request;
    if (!req || !req.messages) continue;
    for (const msg of req.messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            const name = block.name || '';
            toolCounts[name] = (toolCounts[name] || 0) + 1;
            if (name.includes('ctx_') || name.includes('context-mode')) ctxToolCalls++;
          }
        }
      }
    }
  }

  return {
    totalRounds,
    validRounds,
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    totalCacheRead,
    totalCacheWrite,
    cacheHitRate,
    wallTimeSec,
    outOfOrder,
    perRound,
    toolCounts,
    ctxToolCalls,
  };
}

// ============================================================================
// 格式化
// ============================================================================

function fmtNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return String(n);
}

function fmtTime(sec) {
  if (sec < 60) return sec.toFixed(0) + '秒';
  return (sec / 60).toFixed(1) + '分钟';
}

function changePct(a, b) {
  if (b === 0) return '—';
  const pct = ((a - b) / b * 100).toFixed(1);
  return (pct > 0 ? '+' : '') + pct + '%';
}

function changeClass(a, b, lowerIsBetter) {
  if (b === 0) return 'neutral';
  const pct = (a - b) / b;
  if (lowerIsBetter) return pct < -0.01 ? 'good' : pct > 0.01 ? 'bad' : 'neutral';
  return pct > 0.01 ? 'good' : pct < -0.01 ? 'bad' : 'neutral';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================================
// 主流程
// ============================================================================

function loadAll() {
  const data = {};
  for (const mode of ['with', 'without']) {
    for (const s of SCENARIOS) {
      const key = mode + '-' + s.id;
      data[key] = loadScenario(mode, s);
      const d = data[key];
      if (d) {
        console.log(mode + ' | S' + s.id + ' | ' + d.totalRounds + '轮/' + d.validRounds + '有效 | ' +
          fmtTime(d.wallTimeSec) + ' | ' + fmtNum(d.totalTokens) + ' tokens | ctx工具:' + d.ctxToolCalls + ' | ID乱序:' + d.outOfOrder);
      }
    }
  }
  return data;
}

// ============================================================================
// HTML 生成
// ============================================================================

function buildCSS() {
  return `
:root {
    --bg: #f1f5f9; --card-bg: #ffffff; --text: #0f172a; --text-secondary: #64748b;
    --border: #e2e8f0; --accent: #3b82f6; --accent-light: #eff6ff;
    --green: #10b981; --green-bg: #ecfdf5; --red: #ef4444; --red-bg: #fef2f2;
    --yellow: #f59e0b; --sidebar-w: 240px;
    --radius: 14px; --radius-sm: 8px;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
    --shadow: 0 4px 6px -1px rgba(0,0,0,0.07);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.6;
}
.header {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
    color: #fff; padding: 20px 28px; display: flex; justify-content: space-between;
    align-items: center; flex-wrap: wrap; gap: 12px; position: sticky; top: 0; z-index: 100;
}
.header h1 { font-size: 20px; font-weight: 700; }
.header .meta { font-size: 12px; opacity: 0.7; }

.layout { display: flex; min-height: calc(100vh - 68px); }

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

.main { flex: 1; padding: 24px 28px; overflow-y: auto; min-width: 0; }
.panel { display: none; }
.panel.active { display: block; }

.section { margin-bottom: 40px; }
.section-title {
    font-size: 18px; font-weight: 700; margin-bottom: 16px; padding-bottom: 10px;
    border-bottom: 2px solid var(--border); color: var(--text);
}

/* 汇总卡片 */
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
    background: #fff; border: none; white-space: pre-wrap; word-break: break-word;
    max-height: 300px; overflow-y: auto;
}
.prompt-box.collapsed .prompt-text { display: none; }
.prompt-box.collapsed .prompt-toggle::after { content: '（已折叠）'; }
.prompt-box .prompt-toggle::after { content: '（已展开）'; }

/* 表格 */
.master-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; background: var(--card-bg); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); }
.master-table th, .master-table td { padding: 10px 12px; text-align: right; border-bottom: 1px solid var(--border); }
.master-table th { background: #334155; color: #fff; font-weight: 600; white-space: nowrap; }
.master-table th:first-child, .master-table td:first-child { text-align: left; font-weight: 600; }
.master-table .mode-row td { background: #f8fafc; font-weight: 500; }
.master-table .change { font-size: 11px; font-weight: 700; }
.master-table .sep td { border-top: 2px solid #cbd5e1; }

.compare-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
.compare-table th, .compare-table td { padding: 8px 14px; text-align: center; border-bottom: 1px solid var(--border); }
.compare-table th { background: #f1f5f9; font-weight: 600; }
.compare-table th:first-child, .compare-table td:first-child { text-align: left; font-weight: 500; }
.compare-table .sub { font-size: 11px; color: var(--text-secondary); display: block; }
.compare-table .diff { font-weight: 600; }

.tool-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.tool-table th, .tool-table td { padding: 6px 10px; text-align: right; border-bottom: 1px solid var(--border); }
.tool-table th { background: #334155; color: #fff; font-weight: 600; white-space: nowrap; }
.tool-table th:first-child, .tool-table td:first-child { text-align: left; font-family: monospace; }
.tool-table .with-col { background: rgba(59,130,246,0.05); }
.tool-table .without-col { background: rgba(239,68,68,0.03); }

/* 图表 */
.scenario-section { background: var(--card-bg); border-radius: var(--radius); padding: 24px; margin-bottom: 32px; box-shadow: var(--shadow-sm); border: 1px solid var(--border); }
.scenario-section h2 { font-size: 20px; margin-bottom: 20px; }
.chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.chart-full { margin-bottom: 20px; }
.chart-box { background: #f8fafc; border-radius: var(--radius-sm); padding: 16px; border: 1px solid var(--border); }
.chart-box h4 { font-size: 13px; color: var(--text-secondary); margin-bottom: 10px; }
.chart-box .canvas-wrap { position: relative; height: 300px; }
.chart-box .canvas-wrap.tall { height: 360px; }

.good { color: var(--green); }
.bad { color: var(--red); }
.neutral { color: var(--text-secondary); }

.note { font-size: 12px; color: var(--text-secondary); margin-top: 12px; padding: 10px 14px; background: #fffbeb; border-radius: 6px; border-left: 3px solid var(--yellow); }

@media (max-width: 900px) {
    .sidebar { width: 180px; min-width: 180px; }
    .chart-row { grid-template-columns: 1fr; }
    .main { padding: 12px; }
    .summary-cards { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
    .layout { flex-direction: column; }
    .sidebar { width: 100%; min-width: 100%; height: auto; position: static;
               display: flex; flex-wrap: wrap; padding: 8px; gap: 4px; }
    .sidebar .nav-group-title { display: none; }
    .sidebar .nav-item { font-size: 11px; padding: 6px 10px; white-space: nowrap; }
    .summary-cards { grid-template-columns: 1fr 1fr; }
}
`;
}

function buildMasterTable(data) {
  let rows = '';
  for (const s of SCENARIOS) {
    const w = data['with-' + s.id];
    const wo = data['without-' + s.id];
    if (!w || !wo) continue;

    const wallW = fmtTime(w.wallTimeSec);
    const wallWo = fmtTime(wo.wallTimeSec);

    rows += `<tr class="sep">
  <td rowspan="2" style="vertical-align:middle;">${s.label}</td>
  <td class="mode-row">有插件</td>
  <td>${w.totalRounds} (${w.validRounds}有效)</td>
  <td>${fmtNum(w.totalTokens)}</td>
  <td>${fmtNum(w.totalInputTokens)}</td>
  <td>${fmtNum(w.totalOutputTokens)}</td>
  <td>${w.cacheHitRate.toFixed(1)}%</td>
  <td>${wallW}</td>
  <td>${w.ctxToolCalls}次</td>
</tr>
<tr>
  <td class="mode-row">无插件</td>
  <td>${wo.totalRounds} (${wo.validRounds}有效)</td>
  <td>${fmtNum(wo.totalTokens)}</td>
  <td>${fmtNum(wo.totalInputTokens)}</td>
  <td>${fmtNum(wo.totalOutputTokens)}</td>
  <td>${wo.cacheHitRate.toFixed(1)}%</td>
  <td>${wallWo}</td>
  <td>${wo.ctxToolCalls}次</td>
</tr>
<tr style="font-size:11px;color:#64748b;">
  <td colspan="2" style="text-align:right;font-weight:600;">变化</td>
  <td class="change ${changeClass(w.totalRounds, wo.totalRounds, true)}">${changePct(w.totalRounds, wo.totalRounds)}</td>
  <td class="change ${changeClass(w.totalTokens, wo.totalTokens, true)}">${changePct(w.totalTokens, wo.totalTokens)}</td>
  <td class="change ${changeClass(w.totalInputTokens, wo.totalInputTokens, true)}">${changePct(w.totalInputTokens, wo.totalInputTokens)}</td>
  <td class="change ${changeClass(w.totalOutputTokens, wo.totalOutputTokens, true)}">${changePct(w.totalOutputTokens, wo.totalOutputTokens)}</td>
  <td class="change ${changeClass(w.cacheHitRate, wo.cacheHitRate, false)}">${(w.cacheHitRate - wo.cacheHitRate >= 0 ? '+' : '') + (w.cacheHitRate - wo.cacheHitRate).toFixed(1)}pp</td>
  <td class="change ${changeClass(w.wallTimeSec, wo.wallTimeSec, true)}">${changePct(w.wallTimeSec, wo.wallTimeSec)}</td>
  <td></td>
</tr>`;
  }

  return `<div class="section">
<div class="section-title">核心指标对比总表（耗时 = 墙上时间）</div>
<div style="overflow-x:auto;">
<table class="master-table">
<thead>
<tr>
  <th>场景</th><th>模式</th><th>轮数</th><th>总 Token</th><th>输入 Token</th><th>输出 Token</th><th>缓存命中率</th><th>耗时</th><th>ctx工具调用</th>
</tr>
</thead>
<tbody>${rows}</tbody>
</table></div></div>`;
}

function buildScenarioPanel(data, idx) {
  const s = SCENARIOS[idx];
  const w = data['with-' + s.id];
  const wo = data['without-' + s.id];
  if (!w || !wo) return '';

  const wallW = fmtTime(w.wallTimeSec);
  const wallWo = fmtTime(wo.wallTimeSec);

  let html = `<div class="scenario-section">
<h2>${s.label}</h2>

<!-- 提示词 -->
<div class="prompt-box">
  <div class="prompt-header" onclick="this.parentElement.classList.toggle('collapsed')">
    <span>📝 提示词</span>
    <span class="prompt-toggle"></span>
  </div>
  <pre class="prompt-text">${escapeHtml(s.prompt)}</pre>
</div>

<!-- 汇总卡片 -->
<div class="summary-cards">
  <div class="sum-card">
    <div class="sum-label">总轮数（有效）</div>
    <div class="sum-values">
      <div class="sum-val"><span class="tag with">有</span>${w.totalRounds}(${w.validRounds})</div>
      <div class="sum-val"><span class="tag without">无</span>${wo.totalRounds}(${wo.validRounds})</div>
    </div>
    <div class="sum-diff ${changeClass(w.totalRounds, wo.totalRounds, true)}">${changePct(w.totalRounds, wo.totalRounds)}</div>
  </div>
  <div class="sum-card">
    <div class="sum-label">总 Token</div>
    <div class="sum-values">
      <div class="sum-val"><span class="tag with">有</span>${fmtNum(w.totalTokens)}</div>
      <div class="sum-val"><span class="tag without">无</span>${fmtNum(wo.totalTokens)}</div>
    </div>
    <div class="sum-diff ${changeClass(w.totalTokens, wo.totalTokens, true)}">${changePct(w.totalTokens, wo.totalTokens)}</div>
  </div>
  <div class="sum-card">
    <div class="sum-label">缓存命中率</div>
    <div class="sum-values">
      <div class="sum-val"><span class="tag with">有</span>${w.cacheHitRate.toFixed(1)}%</div>
      <div class="sum-val"><span class="tag without">无</span>${wo.cacheHitRate.toFixed(1)}%</div>
    </div>
    <div class="sum-diff ${changeClass(w.cacheHitRate, wo.cacheHitRate, false)}">${(w.cacheHitRate - wo.cacheHitRate >= 0 ? '+' : '') + (w.cacheHitRate - wo.cacheHitRate).toFixed(1)}pp</div>
  </div>
  <div class="sum-card">
    <div class="sum-label">耗时（墙上时间）</div>
    <div class="sum-values">
      <div class="sum-val"><span class="tag with">有</span>${wallW}</div>
      <div class="sum-val"><span class="tag without">无</span>${wallWo}</div>
    </div>
    <div class="sum-diff ${changeClass(w.wallTimeSec, wo.wallTimeSec, true)}">${changePct(w.wallTimeSec, wo.wallTimeSec)}</div>
  </div>
</div>`;

  // 并发警告
  if (w.outOfOrder > 2 || wo.outOfOrder > 2) {
    html += `<div class="note">⚠ 检测到并发请求：有插件 ID 乱序 ${w.outOfOrder} 次，无插件 ID 乱序 ${wo.outOfOrder} 次。墙上时间已排除并发重叠。</div>`;
  }

  // 指标对比小表
  html += `<table class="compare-table">
<thead><tr><th>指标</th><th>有插件</th><th>无插件</th><th>差值</th></tr></thead>
<tbody>
<tr><td>总轮数</td><td>${w.totalRounds}（${w.validRounds}有效）</td><td>${wo.totalRounds}（${wo.validRounds}有效）</td><td class="diff ${changeClass(w.totalRounds, wo.totalRounds, true)}">${changePct(w.totalRounds, wo.totalRounds)}</td></tr>
<tr><td>总 Token</td><td>${fmtNum(w.totalTokens)}</td><td>${fmtNum(wo.totalTokens)}</td><td class="diff ${changeClass(w.totalTokens, wo.totalTokens, true)}">${changePct(w.totalTokens, wo.totalTokens)}</td></tr>
<tr><td>输入 Token</td><td>${fmtNum(w.totalInputTokens)}</td><td>${fmtNum(wo.totalInputTokens)}</td><td class="diff ${changeClass(w.totalInputTokens, wo.totalInputTokens, true)}">${changePct(w.totalInputTokens, wo.totalInputTokens)}</td></tr>
<tr><td>输出 Token</td><td>${fmtNum(w.totalOutputTokens)}</td><td>${fmtNum(wo.totalOutputTokens)}</td><td class="diff ${changeClass(w.totalOutputTokens, wo.totalOutputTokens, true)}">${changePct(w.totalOutputTokens, wo.totalOutputTokens)}</td></tr>
<tr><td>缓存读取</td><td>${fmtNum(w.totalCacheRead)}</td><td>${fmtNum(wo.totalCacheRead)}</td><td class="diff ${changeClass(w.totalCacheRead, wo.totalCacheRead, false)}">${changePct(w.totalCacheRead, wo.totalCacheRead)}</td></tr>
<tr><td>缓存命中率</td><td>${w.cacheHitRate.toFixed(1)}%</td><td>${wo.cacheHitRate.toFixed(1)}%</td><td class="diff ${changeClass(w.cacheHitRate, wo.cacheHitRate, false)}">${(w.cacheHitRate - wo.cacheHitRate >= 0 ? '+' : '') + (w.cacheHitRate - wo.cacheHitRate).toFixed(1)}pp</td></tr>
<tr><td>耗时（墙上时间）</td><td>${wallW}</td><td>${wallWo}</td><td class="diff ${changeClass(w.wallTimeSec, wo.wallTimeSec, true)}">${changePct(w.wallTimeSec, wo.wallTimeSec)}</td></tr>
<tr><td>ctx 工具调用</td><td>${w.ctxToolCalls}次</td><td>${wo.ctxToolCalls}次</td><td>—</td></tr>
</tbody></table>`;

  // 逐轮 Token 对比图
  html += `<div class="chart-full">
  <div class="chart-box">
    <h4>逐轮 Token 用量对比（堆叠 = 新输入 + 缓存读取 + 输出）</h4>
    <div class="canvas-wrap tall"><canvas id="chartToken-${s.id}"></canvas></div>
  </div>
</div>`;

  // 缓存命中率趋势
  html += `<div class="chart-full">
  <div class="chart-box">
    <h4>逐轮缓存命中率趋势对比</h4>
    <div class="canvas-wrap"><canvas id="chartCache-${s.id}"></canvas></div>
  </div>
</div>`;

  // 工具调用对比
  html += `<div class="section">
  <div class="section-title">工具调用次数对比</div>
  ${buildToolTable(w, wo)}
</div>
</div>`;

  return html;
}

function buildToolTable(w, wo) {
  const allTools = new Set();
  if (w.toolCounts) Object.keys(w.toolCounts).forEach(t => allTools.add(t));
  if (wo.toolCounts) Object.keys(wo.toolCounts).forEach(t => allTools.add(t));

  const tools = Array.from(allTools).sort((a, b) => {
    const aCtx = a.includes('ctx_') || a.includes('context-mode');
    const bCtx = b.includes('ctx_') || b.includes('context-mode');
    if (aCtx && !bCtx) return -1;
    if (!aCtx && bCtx) return 1;
    return a.localeCompare(b);
  });

  if (tools.length === 0) return '<p>无工具调用数据</p>';

  let html = `<table class="tool-table">
<thead><tr><th>工具</th><th class="with-col">有插件</th><th class="without-col">无插件</th></tr></thead>
<tbody>`;
  for (const tool of tools) {
    const wc = (w.toolCounts && w.toolCounts[tool] !== undefined) ? w.toolCounts[tool] : '—';
    const woc = (wo.toolCounts && wo.toolCounts[tool] !== undefined) ? wo.toolCounts[tool] : '—';
    html += `<tr><td>${tool}</td><td class="with-col">${wc}</td><td class="without-col">${woc}</td></tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

function buildConclusion(data) {
  let html = `<div class="section">
<h2>结论摘要</h2>
<ul style="font-size:14px;">`;

  for (const s of SCENARIOS) {
    const w = data['with-' + s.id];
    const wo = data['without-' + s.id];
    if (!w || !wo) continue;

    const tokenChg = ((w.totalTokens - wo.totalTokens) / wo.totalTokens * 100).toFixed(1);
    const timeChg = ((w.wallTimeSec - wo.wallTimeSec) / wo.wallTimeSec * 100).toFixed(1);
    const cacheDiff = (w.cacheHitRate - wo.cacheHitRate).toFixed(1);

    let assessment = '';
    if (w.ctxToolCalls > 50 && parseFloat(tokenChg) < -10) {
      assessment = '插件充分发挥，ctx批量操作替代了单独Bash/Read调用';
    } else if (w.ctxToolCalls < 30) {
      assessment = '插件几乎未使用（ctx调用<' + w.ctxToolCalls + '次），模型未充分利用插件能力';
    } else if (w.totalRounds > wo.totalRounds * 1.5) {
      assessment = '插件被调用但模型跑了更多轮（' + w.totalRounds + ' vs ' + wo.totalRounds + '），行为漂移';
    } else {
      assessment = '插件有调用但效果不显著';
    }

    html += `<li><strong>${s.label}：</strong>有插件 Token ${tokenChg > 0 ? '+' : ''}${tokenChg}%，耗时 ${timeChg > 0 ? '+' : ''}${timeChg}%，缓存命中率 ${cacheDiff > 0 ? '+' : ''}${cacheDiff}pp，ctx工具调用 ${w.ctxToolCalls} 次。${assessment}</li>`;
  }

  html += `</ul>
<p class="note" style="margin-top:16px;">⚠ 耗时采用墙上时间（首条请求到末条请求的时间戳差值），避免 duration_ms 并发重叠导致的虚高问题。S5 有插件因 Agent 并发请求，duration_ms 累加 22.0 分钟但墙上仅 11.7 分钟。</p>
</div>`;
  return html;
}

function buildChartJS(data) {
  let js = 'const chartInited = {};\n\n';

  for (const s of SCENARIOS) {
    const w = data['with-' + s.id];
    const wo = data['without-' + s.id];
    if (!w || !wo) continue;

    js += `function initCharts_s${s.id}() {
  if (chartInited['s${s.id}']) return;
  chartInited['s${s.id}'] = true;\n`;

    // Token 用量对比图
    const wInput = w.perRound.map(r => r.input);
    const wCache = w.perRound.map(r => r.cacheRead);
    const wOutput = w.perRound.map(r => r.output);
    const woInput = wo.perRound.map(r => r.input);
    const woCache = wo.perRound.map(r => r.cacheRead);
    const woOutput = wo.perRound.map(r => r.output);

    const maxR = Math.max(w.perRound.length, wo.perRound.length);
    const labels = [];
    for (let i = 0; i < maxR; i++) labels.push('R' + (i + 1));

    js += `
  (function() {
    var ctx = document.getElementById('chartToken-${s.id}');
    if (!ctx) return;
    new Chart(ctx, {
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
        responsive: true, maintainAspectRatio: false, animation: false,
        scales: {
          x: { stacked: true, ticks: { maxTicksLimit: 20, font: { size: 10 } } },
          y: { stacked: true, title: { display: true, text: 'Tokens' }, ticks: { callback: function(v) { return v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v; } } }
        },
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } } }
      }
    });
  })();`;

    // 缓存命中率趋势
    const wRates = w.perRound.map(r => (r.input + r.cacheRead) > 0 ? parseFloat((r.cacheRead / (r.input + r.cacheRead) * 100).toFixed(1)) : 0);
    const woRates = wo.perRound.map(r => (r.input + r.cacheRead) > 0 ? parseFloat((r.cacheRead / (r.input + r.cacheRead) * 100).toFixed(1)) : 0);
    const maxLen = Math.max(wRates.length, woRates.length);
    const cacheLabels = [];
    for (let i = 0; i < maxLen; i++) cacheLabels.push('R' + (i + 1));

    js += `
  (function() {
    var ctx = document.getElementById('chartCache-${s.id}');
    if (!ctx) return;
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(cacheLabels)},
        datasets: [
          { label: '有插件', data: ${JSON.stringify(wRates)}, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
          { label: '无插件', data: ${JSON.stringify(woRates)}, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        scales: { y: { min: 0, max: 100, title: { display: true, text: '%' }, ticks: { callback: function(v) { return v + '%'; } } } },
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } } }
      }
    });
  })();`;

    js += `\n}\n`;
  }

  js += `
function switchPanel(panelId, el) {
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  document.getElementById(panelId).classList.add('active');
  el.classList.add('active');

  var scenarioMap = { 'panel-s1': 's1', 'panel-s2': 's2', 'panel-s3': 's3', 'panel-s4': 's4', 'panel-s5': 's5' };
  var sid = scenarioMap[panelId];
  if (sid && typeof window['initCharts_' + sid] === 'function') {
    setTimeout(function() { window['initCharts_' + sid](); }, 50);
  }
}

setTimeout(function() { if (typeof initCharts_s1 === 'function') initCharts_s1(); }, 100);
`;

  return js;
}

// ============================================================================
// 生成 HTML
// ============================================================================

function generateHTML(data) {
  return `<!DOCTYPE html>
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
  <div class="meta">数据来源：summary.jsonl + proxy-request.jsonl | 耗时 = 墙上时间</div>
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
      ${buildMasterTable(data)}
      ${buildConclusion(data)}
    </div>
    <div class="panel" id="panel-s1">${buildScenarioPanel(data, 0)}</div>
    <div class="panel" id="panel-s2">${buildScenarioPanel(data, 1)}</div>
    <div class="panel" id="panel-s3">${buildScenarioPanel(data, 2)}</div>
    <div class="panel" id="panel-s4">${buildScenarioPanel(data, 3)}</div>
    <div class="panel" id="panel-s5">${buildScenarioPanel(data, 4)}</div>
  </div>
</div>
<script>
${buildChartJS(data)}
<\/script>
</body>
</html>`;
}

// ============================================================================
// 执行
// ============================================================================

const data = loadAll();
const html = generateHTML(data);
fs.writeFileSync(OUTPUT, html, 'utf-8');
console.log('\n输出: ' + OUTPUT + ' (' + (fs.statSync(OUTPUT).size / 1024).toFixed(1) + ' KB)');