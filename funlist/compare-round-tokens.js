#!/usr/bin/env node

/**
 * ============================================================================
 * compare-round-tokens.js
 * 多场景对比分析：Token 用量 + 提示词组成 + 可视化图表
 * ============================================================================
 *
 * 功能：
 *   对多个日志目录的逐轮分析结果进行横向对比，输出带图表的 HTML 报告。
 *   图表使用 Chart.js（CDN 加载），无需本地安装依赖。
 *
 * 用法：
 *   node compare-round-tokens.js <目录1> <目录2> [目录3 ...]
 *   示例：
 *     node compare-round-tokens.js \
 *       ../test-scenarios/without-context-mode/scenario-1-日志分析/日志 \
 *       ../test-scenarios/with-context-mode/scenario-1-日志分析/日志
 *
 * 依赖：
 *   analyze-round-tokens.js（同目录下的 analyzeScenario 函数）
 *
 * 输出文件：
 *   funlist/compare-report.html
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 复用 analyze-round-tokens 的分析函数
const { analyzeScenario, fmtNum, fmtPct, fmtTime } = require('./analyze-round-tokens');

// ============================================================================
// 图表颜色调色板
// ============================================================================

/**
 * 场景颜色序列（用于区分不同场景的柱状图/折线图）
 * 每个场景分配一个主色和对应的半透明色
 */
const SCENARIO_COLORS = [
    { main: 'rgba(9, 132, 227, 0.85)',  light: 'rgba(9, 132, 227, 0.2)' },   // 蓝
    { main: 'rgba(0, 184, 148, 0.85)',  light: 'rgba(0, 184, 148, 0.2)' },   // 绿
    { main: 'rgba(225, 112, 85, 0.85)',  light: 'rgba(225, 112, 85, 0.2)' },  // 红
    { main: 'rgba(253, 203, 110, 0.85)', light: 'rgba(253, 203, 110, 0.2)' }, // 黄
    { main: 'rgba(108, 92, 231, 0.85)',  light: 'rgba(108, 92, 231, 0.2)' },  // 紫
    { main: 'rgba(99, 110, 114, 0.85)',  light: 'rgba(99, 110, 114, 0.2)' },  // 灰
];

/**
 * 提示词组成部分的颜色（用于堆叠柱状图/饼图）
 */
const PROMPT_PART_COLORS = {
    system:      { main: 'rgba(108, 92, 231, 0.8)',  label: '系统提示' },
    user:        { main: 'rgba(9, 132, 227, 0.8)',   label: '用户输入' },
    thinking:    { main: 'rgba(253, 203, 110, 0.8)', label: '思考' },
    assistant:   { main: 'rgba(0, 184, 148, 0.8)',   label: '输出文本' },
    tool_use:    { main: 'rgba(225, 112, 85, 0.8)',  label: '工具调用' },
    tool_result: { main: 'rgba(214, 48, 49, 0.8)',   label: '工具结果' },
};

/**
 * Token 类型颜色
 */
const TOKEN_COLORS = {
    input:       { main: 'rgba(9, 132, 227, 0.8)',  label: '新输入' },
    cache_read:  { main: 'rgba(0, 184, 148, 0.8)',  label: '缓存读取' },
    output:      { main: 'rgba(253, 203, 110, 0.8)', label: '输出' },
};

// ============================================================================
// 数据准备
// ============================================================================

/**
 * 为每个场景生成去重标签
 * 从完整路径中提取模式+场景名作为短标签
 *
 * @param {Array<Object>} scenarios - 场景分析结果数组
 * @returns {Array<string>} 标签数组
 */
function makeLabels(scenarios) {
    return scenarios.map(s => {
        const p = s.dirPath;
        // 提取 with-context-mode 或 without-context-mode
        const modeMatch = p.match(/(with|without)-context-mode/);
        const mode = modeMatch ? (modeMatch[1] === 'with' ? '有插件' : '无插件') : '';
        // 提取场景名
        const scenarioMatch = p.match(/scenario-\d+-([^\/\\]+)/);
        const name = scenarioMatch ? scenarioMatch[1] : path.basename(p);
        return mode ? `${mode} — ${name}` : name;
    });
}

/**
 * 准备 Token 对比数据（汇总 + 平均每轮）
 * 柱状图使用平均每轮数据，避免轮数不同导致对比失真
 *
 * @param {Array<Object>} scenarios - 场景分析结果数组
 * @returns {Object} 各指标数组
 */
function prepareTokenData(scenarios) {
    const data = {
        labels: makeLabels(scenarios),
        // 汇总值（用于对比表格）
        totalTokens: scenarios.map(s => s.summary.totalAllTokens),
        inputTokens: scenarios.map(s => s.summary.totalInputTokens),
        cacheReadTokens: scenarios.map(s => s.summary.totalCacheRead),
        outputTokens: scenarios.map(s => s.summary.totalOutputTokens),
        cacheHitRates: scenarios.map(s => {
            const total = s.summary.totalInputTokens + s.summary.totalCacheRead;
            return total > 0 ? (s.summary.totalCacheRead / total * 100) : 0;
        }),
        durations: scenarios.map(s => s.summary.totalDuration),
        roundCounts: scenarios.map(s => s.summary.validRounds),
        // 平均每轮值（用于柱状图对比，公平比较不同轮数的场景）
        avgInputTokens: scenarios.map(s => {
            const n = s.summary.validRounds || 1;
            return Math.round(s.summary.totalInputTokens / n);
        }),
        avgCacheReadTokens: scenarios.map(s => {
            const n = s.summary.validRounds || 1;
            return Math.round(s.summary.totalCacheRead / n);
        }),
        avgOutputTokens: scenarios.map(s => {
            const n = s.summary.validRounds || 1;
            return Math.round(s.summary.totalOutputTokens / n);
        }),
        avgTotalTokens: scenarios.map(s => {
            const n = s.summary.validRounds || 1;
            return Math.round(s.summary.totalAllTokens / n);
        }),
    };
    return data;
}

/**
 * 准备提示词组成对比数据（汇总 + 平均每轮）
 * 柱状图使用平均每轮数据，避免轮数不同导致对比失真
 *
 * @param {Array<Object>} scenarios - 场景分析结果数组
 * @returns {Object} 各部分数据数组
 */
function preparePromptData(scenarios) {
    const parts = ['system', 'user', 'thinking', 'assistant', 'tool_use', 'tool_result'];
    const data = { labels: makeLabels(scenarios) };

    for (const part of parts) {
        // 汇总值（用于对比表格）
        data[part] = scenarios.map(s => {
            return s.rows
                .filter(r => r.hasUsage && r.cum_total !== null)
                .reduce((sum, r) => sum + (r['cum_' + part] || 0), 0);
        });
        // 平均每轮值（用于柱状图对比）
        data['avg_' + part] = scenarios.map((s, i) => {
            const n = s.summary.validRounds || 1;
            return Math.round(data[part][i] / n);
        });
    }

    return data;
}

/**
 * 准备逐轮 token 趋势数据（用于折线图）
 * 每个场景生成一条累积 token 趋势线
 *
 * @param {Array<Object>} scenarios - 场景分析结果数组
 * @returns {Object} { datasets: [{ label, data: [{x, y}] }] }
 */
function prepareTrendData(scenarios) {
    const labels = makeLabels(scenarios);
    const datasets = [];

    for (let i = 0; i < scenarios.length; i++) {
        const s = scenarios[i];
        const color = SCENARIO_COLORS[i % SCENARIO_COLORS.length];

        // 累积 token：每轮的总输入 token 累积
        let cumTotal = 0;
        const points = [];
        for (const r of s.rows) {
            if (!r.hasUsage) continue;
            cumTotal += r.total_input; // 累加每轮的总输入
            points.push({ x: r.id, y: cumTotal });
        }

        datasets.push({
            label: labels[i],
            data: points,
            borderColor: color.main,
            backgroundColor: color.light,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
            tension: 0.1,
            fill: false,
        });
    }

    return datasets;
}

/**
 * 准备逐轮缓存命中率趋势数据（用于折线图）
 * @param {Array<Object>} scenarios - 场景分析结果数组
 * @returns {Array<Object>} datasets 数组
 */
function prepareCacheRateTrendData(scenarios) {
    const labels = makeLabels(scenarios);
    const datasets = [];

    for (let i = 0; i < scenarios.length; i++) {
        const s = scenarios[i];
        const color = SCENARIO_COLORS[i % SCENARIO_COLORS.length];

        const points = [];
        for (const r of s.rows) {
            if (!r.hasUsage || r.cache_hit_rate === null) continue;
            points.push({ x: r.id, y: (r.cache_hit_rate * 100).toFixed(1) });
        }

        datasets.push({
            label: labels[i],
            data: points,
            borderColor: color.main,
            backgroundColor: color.light,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
            tension: 0.2,
            fill: false,
        });
    }

    return datasets;
}

/**
 * 准备逐轮新输入 token 趋势数据（非累积，用于折线图）
 * 展示每轮各自消耗的新输入 token（未命中缓存的部分）
 *
 * @param {Array<Object>} scenarios - 场景分析结果数组
 * @returns {Array<Object>} datasets 数组
 */
function preparePerRoundInputData(scenarios) {
    const labels = makeLabels(scenarios);
    const datasets = [];

    for (let i = 0; i < scenarios.length; i++) {
        const s = scenarios[i];
        const color = SCENARIO_COLORS[i % SCENARIO_COLORS.length];

        const points = [];
        for (const r of s.rows) {
            if (!r.hasUsage) continue;
            points.push({ x: r.id, y: r.input_tokens });
        }

        datasets.push({
            label: labels[i],
            data: points,
            borderColor: color.main,
            backgroundColor: color.light,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            fill: false,
        });
    }

    return datasets;
}

/**
 * 将数组补齐到指定长度（不足部分用 null 填充）
 * 逐轮柱状图中不同场景的轮数可能不同，补齐后所有场景的 data 数组长度一致
 * null 值在 Chart.js 中不渲染，对应轮次没有该场景的柱子
 *
 * @param {Array} arr - 原始数组
 * @param {number} len - 目标长度
 * @returns {Array} 补齐后的数组
 */
function padToLength(arr, len) {
    const out = arr.slice();
    while (out.length < len) out.push(null);
    return out;
}

/**
 * 准备逐轮 Token 柱状图数据（分组堆叠柱状图）
 * 用于图表1：X 轴为轮次，每个场景在每个轮次上是一个堆叠柱
 * 堆叠内容 = 新输入 + 缓存读取 + 输出，不同场景的堆叠柱并列
 *
 * 与 prepareTokenData 的区别：
 *   - prepareTokenData 返回汇总值（一个场景一行），用于对比表格
 *   - 本函数返回逐轮数据（一个轮次一组柱子），用于柱状图对比
 *
 * Chart.js 通过 stack 属性实现分组堆叠：同一 stack 值的数据集
 * 堆叠到同一根柱子上，不同 stack 值的数据集并列显示
 *
 * @param {Array<Object>} scenarios - 场景分析结果数组
 * @returns {Object} { roundLabels, datasets }
 */
function preparePerRoundTokenBarData(scenarios) {
    const labels = makeLabels(scenarios);
    const maxRounds = Math.max(0, ...scenarios.map(s => s.rows.filter(r => r.hasUsage).length));
    const roundLabels = Array.from({ length: maxRounds }, (_, i) => 'R' + (i + 1));

    const datasets = [];
    for (let i = 0; i < scenarios.length; i++) {
        const valid = scenarios[i].rows.filter(r => r.hasUsage);
        const stack = 'scenario-' + i;
        const prefix = labels[i] + ' · ';

        const input = valid.map(r => r.input_tokens);
        const cache = valid.map(r => r.cache_read);
        const output = valid.map(r => r.output_tokens);

        datasets.push(
            { label: prefix + '新输入', data: padToLength(input, maxRounds), stack, backgroundColor: 'rgba(9, 132, 227, 0.7)', borderColor: 'rgba(9, 132, 227, 1)', borderWidth: 1 },
            { label: prefix + '缓存读取', data: padToLength(cache, maxRounds), stack, backgroundColor: 'rgba(0, 184, 148, 0.7)', borderColor: 'rgba(0, 184, 148, 1)', borderWidth: 1 },
            { label: prefix + '输出',    data: padToLength(output, maxRounds), stack, backgroundColor: 'rgba(253, 203, 110, 0.7)', borderColor: 'rgba(253, 203, 110, 1)', borderWidth: 1 },
        );
    }
    return { roundLabels, datasets };
}

/**
 * 准备逐轮提示词柱状图数据（分组堆叠柱状图，使用 delta 每轮新增量）
 * 用于图表4（绝对量）和图表5（占比）：X 轴为轮次，每个场景在每个轮次
 * 上是一个堆叠柱，堆叠 6 类提示词组成
 *
 * 提示词使用 delta_* 字段（每轮新增量），而非 cum_*（当前轮全量，即该轮请求
 * messages+system 的总字符数），这样才能正确反映每轮各自产生的提示词开销
 *
 * @param {Array<Object>} scenarios - 场景分析结果数组
 * @returns {Object} { roundLabels, datasets }
 */
function preparePerRoundPromptBarData(scenarios) {
    const labels = makeLabels(scenarios);
    const maxRounds = Math.max(0, ...scenarios.map(s => s.rows.filter(r => r.hasUsage).length));
    const roundLabels = Array.from({ length: maxRounds }, (_, i) => 'R' + (i + 1));

    const parts = ['system', 'user', 'thinking', 'assistant', 'tool_use', 'tool_result'];
    const partLabels = { system: '系统提示', user: '用户输入', thinking: '思考', assistant: '输出文本', tool_use: '工具调用', tool_result: '工具结果' };
    const partColors = {
        system: 'rgba(108, 92, 231, 0.8)',
        user: 'rgba(9, 132, 227, 0.8)',
        thinking: 'rgba(253, 203, 110, 0.8)',
        assistant: 'rgba(0, 184, 148, 0.8)',
        tool_use: 'rgba(225, 112, 85, 0.8)',
        tool_result: 'rgba(214, 48, 49, 0.8)',
    };

    const datasets = [];
    for (let i = 0; i < scenarios.length; i++) {
        const valid = scenarios[i].rows.filter(r => r.hasUsage);
        const stack = 'scenario-' + i;
        const prefix = labels[i] + ' · ';

        for (const part of parts) {
            const data = valid.map(r => r['delta_' + part] || 0);
            datasets.push({
                label: prefix + partLabels[part],
                data: padToLength(data, maxRounds),
                stack,
                backgroundColor: partColors[part],
            });
        }
    }
    return { roundLabels, datasets };
}

/**
 * 将分组堆叠数据集归一化到百分比（用于 100% 堆叠柱状图）
 * 对同一 stack 组内的数据，每列归一化到 100%
 *
 * @param {Array<Object>} datasets - 原始数据集（有 stack 分组）
 * @returns {Array<Object>} 归一化后的数据集副本
 */
function normalizeStackedDatasets(datasets) {
    // 按 stack 分组
    const groups = {};
    for (const d of datasets) {
        (groups[d.stack] = groups[d.stack] || []).push(d);
    }

    const result = [];
    for (const group of Object.values(groups)) {
        const len = group[0].data.length;
        for (const d of group) {
            result.push({
                ...d,
                data: d.data.map((v, idx) => {
                    const total = group.reduce((s, g) => s + (g.data[idx] || 0), 0);
                    return total > 0 ? parseFloat((v / total * 100).toFixed(2)) : 0;
                }),
            });
        }
    }
    return result;
}

// ============================================================================
// HTML 渲染层
// ============================================================================

/**
 * 生成完整的 HTML 对比报告
 * @param {Array<Object>} scenarios - 场景分析结果数组
 * @returns {string} HTML 字符串
 */
function renderHTML(scenarios) {
    const labels = makeLabels(scenarios);
    const tokenData = prepareTokenData(scenarios);
    const promptData = preparePromptData(scenarios);
    const trendDatasets = prepareTrendData(scenarios);
    const cacheRateDatasets = prepareCacheRateTrendData(scenarios);
    const perRoundInputDatasets = preparePerRoundInputData(scenarios);
    const tokenBarData = preparePerRoundTokenBarData(scenarios);
    const promptBarData = preparePerRoundPromptBarData(scenarios);
    const promptPctDatasets = normalizeStackedDatasets(promptBarData.datasets);
    const barChartMinWidth = Math.max(600, tokenBarData.roundLabels.length * 22); // 逐轮柱状图最小宽度：每轮 22px

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>多场景对比分析报告</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
/* ================================================================
   基础样式
   ================================================================ */
:root {
    --bg: #f5f6fa;
    --card-bg: #ffffff;
    --text: #2d3436;
    --text-secondary: #636e72;
    --border: #e0e4e8;
    --accent: #0984e3;
    --accent-light: #d6eaf8;
    --green: #00b894;
    --red: #e17055;
    --header-bg: #2d3436;
    --header-text: #ffffff;
    --radius: 8px;
    --shadow: 0 1px 3px rgba(0,0,0,0.08);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                 "Microsoft YaHei", sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding-bottom: 40px;
}

/* ================================================================
   头部
   ================================================================ */
.header {
    background: var(--header-bg);
    color: var(--header-text);
    padding: 24px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
}
.header h1 { font-size: 20px; font-weight: 600; }
.header .meta { font-size: 13px; opacity: 0.75; }

/* ================================================================
   容器与布局
   ================================================================ */
.container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px 24px;
}

/* 图表网格：两个图表并行 */
.chart-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 24px;
}
.chart-grid .chart-card {
    background: var(--card-bg);
    border-radius: var(--radius);
    padding: 20px;
    box-shadow: var(--shadow);
}
.chart-grid .chart-card h3 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--text);
}
.chart-grid .chart-card canvas {
    width: 100% !important;
    max-height: 220px;
}

/* 单图表卡片（占满宽） */
.chart-full {
    background: var(--card-bg);
    border-radius: var(--radius);
    padding: 20px;
    box-shadow: var(--shadow);
    margin-bottom: 24px;
}
	/* 逐轮柱状图滚动容器：轮次多时柱子会密，需要水平滚动 */
	.chart-scroll {
	    overflow-x: auto;
	    overflow-y: hidden;
	}
	.chart-scroll-inner {
		height: 240px;
	}
.chart-full h3 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 12px;
}
.chart-full canvas {
    width: 100% !important;
}
.chart-full .chart-box {
    position: relative;
    height: 240px;
}

/* 场景标签颜色条 */
.scenario-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 20px;
    padding: 12px 16px;
    background: var(--card-bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
}
.scenario-legend .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
}
.scenario-legend .legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 3px;
}

/* ================================================================
   对比表格
   ================================================================ */
.section {
    margin-bottom: 32px;
}
.section-title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--accent);
}

.table-wrap {
    overflow-x: auto;
    background: var(--card-bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    margin-bottom: 20px;
}

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    white-space: nowrap;
}
thead th {
    background: #636e72;
    color: #fff;
    padding: 10px 14px;
    text-align: right;
    font-weight: 500;
    font-size: 12px;
}
thead th:first-child { text-align: left; }
tbody td {
    padding: 9px 14px;
    text-align: right;
    border-bottom: 1px solid var(--border);
}
tbody td:first-child { text-align: left; font-weight: 600; }
tbody tr:nth-child(even) { background: #f8f9fa; }
tbody tr:hover { background: var(--accent-light); }

/* 差值颜色 */
.diff-better { color: var(--green); font-weight: 600; }
.diff-worse { color: var(--red); font-weight: 600; }
.diff-neutral { color: var(--text-secondary); }

/* ================================================================
   页脚
   ================================================================ */
.footer {
    text-align: center;
    color: var(--text-secondary);
    font-size: 12px;
    padding: 20px;
    border-top: 1px solid var(--border);
    margin-top: 40px;
}

/* ================================================================
   响应式
   ================================================================ */
@media (max-width: 900px) {
    .chart-grid { grid-template-columns: 1fr; }
    .container { padding: 12px; }
    .header { padding: 16px 20px; }
}
</style>
</head>
<body>

<!-- ================================================================
     头部
     ================================================================ -->
<div class="header">
    <div>
        <h1>多场景对比分析报告</h1>
        <div class="meta">${scenarios.length} 个场景对比</div>
    </div>
    <div class="meta">生成时间：${new Date().toLocaleString('zh-CN')}</div>
</div>

<div class="container">

<!-- ================================================================
     场景图例
     ================================================================ -->
<div class="scenario-legend">
    ${labels.map((l, i) => {
        const c = SCENARIO_COLORS[i % SCENARIO_COLORS.length];
        return `<div class="legend-item"><span class="legend-dot" style="background:${c.main}"></span>${escapeHtml(l)}</div>`;
    }).join('')}
</div>

<!-- ================================================================
     核心指标对比表格
     ================================================================ -->
<div class="section">
    <div class="section-title">核心指标对比</div>
    ${renderComparisonTable(scenarios, labels)}
</div>

<!-- ================================================================
    图表1：逐轮 Token 用量对比（分组堆叠柱状图）
     ================================================================ -->
<div class="chart-full">
    <h3>逐轮 Token 用量对比</h3>
    <div style="font-size:12px;color:#636e72;margin-bottom:8px;">
        每个轮次展示各场景的 token 组成（新输入 + 缓存读取 + 输出），不同场景的柱子并列
    </div>
    <div class="chart-scroll"><div class="chart-scroll-inner" style="min-width: ${barChartMinWidth}px"><canvas id="chartToken"></canvas></div></div>
</div>

<!-- ================================================================
     图表2+3：缓存命中率 + 轮数对比（并行）
     ================================================================ -->
<div class="chart-grid">
    <div class="chart-card">
        <h3>缓存命中率对比</h3>
        <canvas id="chartCacheRate"></canvas>
    </div>
    <div class="chart-card">
        <h3>有效轮数 & 总耗时对比</h3>
        <canvas id="chartRoundsDuration"></canvas>
    </div>
</div>

<!-- ================================================================
    图表4：逐轮提示词组成对比（分组堆叠柱状图）
     ================================================================ -->
<div class="chart-full">
    <h3>逐轮提示词组成对比（字符数）</h3>
    <div style="font-size:12px;color:#636e72;margin-bottom:8px;">
        每个轮次展示各场景提示词组成的绝对量（delta 新增量），不同场景的堆叠柱并列
    </div>
    <div class="chart-scroll"><div class="chart-scroll-inner" style="min-width: ${barChartMinWidth}px"><canvas id="chartPromptStacked"></canvas></div></div>
</div>

<!-- ================================================================
    图表5：逐轮提示词组成占比对比（分组堆叠百分比柱状图）
     ================================================================ -->
<div class="chart-full">
    <h3>逐轮提示词组成占比对比（%）</h3>
    <div style="font-size:12px;color:#636e72;margin-bottom:8px;">
        每个轮次展示各场景提示词组成的占比（归一化到 100%），不同场景的堆叠柱并列
    </div>
    <div class="chart-scroll"><div class="chart-scroll-inner" style="min-width: ${barChartMinWidth}px"><canvas id="chartPromptPct"></canvas></div></div>
</div>

<!-- ================================================================
     图表6：每轮新输入 Token 趋势（折线图，非累积）
     ================================================================ -->
<div class="chart-full">
    <h3>每轮新输入 Token（非累积，未命中缓存部分）</h3>
    <div style="font-size:12px;color:#636e72;margin-bottom:8px;">
        展示每轮各自消耗的新输入 token 数量，反映上下文变化的节奏
    </div>
    <div class="chart-box">
        <canvas id="chartPerRoundInput"></canvas>
    </div>
</div>

<!-- ================================================================
     图表7：累积输入 Token 增长趋势（折线图）
     ================================================================ -->
<div class="chart-full">
    <h3>累积输入 Token 增长趋势</h3>
    <div class="chart-box">
        <canvas id="chartTrend"></canvas>
    </div>
</div>

<!-- ================================================================
     图表8：逐轮缓存命中率趋势（折线图）
     ================================================================ -->
<div class="chart-full">
    <h3>逐轮缓存命中率趋势</h3>
    <div class="chart-box">
        <canvas id="chartCacheTrend"></canvas>
    </div>
</div>

<!-- ================================================================
     提示词组成对比表格
     ================================================================ -->
<div class="section">
    <div class="section-title">提示词组成明细对比</div>
    ${renderPromptTable(scenarios, labels)}
</div>

</div><!-- .container -->

<div class="footer">
    由 compare-round-tokens.js 生成 · ${new Date().toISOString()}
</div>

<!-- ================================================================
     Chart.js 图表初始化
     ================================================================ -->
<script>
// 场景颜色
const colors = ${JSON.stringify(SCENARIO_COLORS.map(c => c.main))};
const lightColors = ${JSON.stringify(SCENARIO_COLORS.map(c => c.light))};
const labels = ${JSON.stringify(labels)};

// 通用配置
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
Chart.defaults.font.size = 12;

// Y 轴刻度回调：格式化大数字（用于 tick callback，参数是裸值）
function bigNumTick(value) {
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
    return value;
}

// Tooltip 回调：格式化大数字（用于 tooltip callback，参数是 context 对象）
function bigNumTooltip(ctx) {
    let val = ctx.parsed?.y !== undefined ? ctx.parsed.y : ctx.parsed;
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(0) + 'K';
    return val;
}

// ================================================================
// 图表1：逐轮 Token 用量对比（分组堆叠柱状图）
// 每个场景在每个轮次上是一个堆叠柱（新输入 + 缓存读取 + 输出）
// 不同场景通过 stack 属性分组：同一 stack 的堆叠到一根柱子，不同 stack 并列
// ================================================================
new Chart(document.getElementById('chartToken'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify(tokenBarData.roundLabels)},
        datasets: ${JSON.stringify(tokenBarData.datasets)},
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
                stacked: true,
                title: { display: true, text: 'Token 数' },
                ticks: { callback: bigNumTick },
            }
        },
        plugins: {
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString() } },
            legend: { position: 'bottom' },
        }
    }
});

// ================================================================
// 图表2：缓存命中率对比（柱状图）
// ================================================================
new Chart(document.getElementById('chartCacheRate'), {
    type: 'bar',
    data: {
        labels: labels,
        datasets: [{
            label: '缓存命中率',
            data: ${JSON.stringify(tokenData.cacheHitRates.map(v => parseFloat(v.toFixed(1))))},
            backgroundColor: colors.map((c, i) => {
                const rate = ${JSON.stringify(tokenData.cacheHitRates)}[i];
                return rate >= 90 ? 'rgba(0,184,148,0.7)' : rate >= 80 ? 'rgba(253,203,110,0.7)' : 'rgba(225,112,85,0.7)';
            }),
            borderColor: colors,
            borderWidth: 1,
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                min: 0, max: 100,
                title: { display: true, text: '缓存命中率 (%)' },
                ticks: { callback: v => v + '%' },
            }
        },
        plugins: {
            tooltip: { callbacks: { label: ctx => ctx.parsed.y.toFixed(1) + '%' } },
            legend: { display: false },
        }
    }
});

// ================================================================
// 图表3：有效轮数 + 总耗时（双轴图）
// ================================================================
new Chart(document.getElementById('chartRoundsDuration'), {
    type: 'bar',
    data: {
        labels: labels,
        datasets: [
            {
                label: '有效轮数',
                data: ${JSON.stringify(tokenData.roundCounts)},
                backgroundColor: 'rgba(9, 132, 227, 0.7)',
                borderColor: 'rgba(9, 132, 227, 1)',
                borderWidth: 1,
                yAxisID: 'y',
            },
            {
                label: '总耗时 (秒)',
                data: ${JSON.stringify(tokenData.durations.map(d => parseFloat((d / 1000).toFixed(1))))},
                backgroundColor: 'rgba(225, 112, 85, 0.7)',
                borderColor: 'rgba(225, 112, 85, 1)',
                borderWidth: 1,
                yAxisID: 'y1',
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                type: 'linear',
                position: 'left',
                title: { display: true, text: '轮数' },
                grid: { display: false },
            },
            y1: {
                type: 'linear',
                position: 'right',
                title: { display: true, text: '秒' },
                grid: { display: false },
            }
        },
        plugins: {
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y } },
            legend: { position: 'bottom' },
        }
    }
});

// ================================================================
// 图表4：逐轮提示词组成对比（分组堆叠柱状图，绝对量）
// 使用 delta 每轮新增量，每个场景在每个轮次上是一个堆叠柱
// ================================================================
new Chart(document.getElementById('chartPromptStacked'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify(promptBarData.roundLabels)},
        datasets: ${JSON.stringify(promptBarData.datasets)},
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
                stacked: true,
                title: { display: true, text: '字符数' },
                ticks: { callback: bigNumTick },
            }
        },
        plugins: {
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString() + ' 字符' } },
            legend: { position: 'bottom' },
        }
    }
});

// ================================================================
// 图表5：逐轮提示词组成占比（分组堆叠百分比柱状图）
// 数据已预归一化（每个场景每轮内部归一化到 100%），通过 stack 属性分组
// ================================================================
new Chart(document.getElementById('chartPromptPct'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify(promptBarData.roundLabels)},
        datasets: ${JSON.stringify(promptPctDatasets)},
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
                stacked: true,
                min: 0, max: 100,
                title: { display: true, text: '占比 (%)' },
                ticks: { callback: v => v + '%' },
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(ctx) {
                        return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%';
                    }
                }
            },
            legend: { position: 'bottom' },
        }
    }
});

// ================================================================
// 图表6：每轮新输入 Token 趋势（折线图，非累积）
// ================================================================
new Chart(document.getElementById('chartPerRoundInput'), {
    type: 'scatter',
    data: { datasets: ${JSON.stringify(perRoundInputDatasets)} },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        showLine: true,
        scales: {
            x: {
                type: 'linear',
                title: { display: true, text: '轮次' },
                ticks: { stepSize: 5 },
            },
            y: {
                title: { display: true, text: '新输入 Token' },
                ticks: { callback: bigNumTick },
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: ctx => ctx.dataset.label + ': 轮次 ' + ctx.parsed.x + ', ' + ctx.parsed.y.toLocaleString() + ' Token'
                }
            },
            legend: { position: 'bottom' },
        }
    }
});

// ================================================================
// 图表7：累积 Token 趋势（折线图）
// ================================================================
new Chart(document.getElementById('chartTrend'), {
    type: 'scatter',
    data: { datasets: ${JSON.stringify(trendDatasets)} },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        showLine: true,
        scales: {
            x: {
                type: 'linear',
                title: { display: true, text: '轮次' },
                ticks: { stepSize: 5 },
            },
            y: {
                title: { display: true, text: '累积输入 Token' },
                ticks: { callback: bigNumTick },
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: ctx => ctx.dataset.label + ': 轮次 ' + ctx.parsed.x + ', 累积 ' + ctx.parsed.y.toLocaleString() + ' Token'
                }
            },
            legend: { position: 'bottom' },
        }
    }
});

// ================================================================
// 图表8：缓存命中率趋势（折线图）
// ================================================================
new Chart(document.getElementById('chartCacheTrend'), {
    type: 'scatter',
    data: { datasets: ${JSON.stringify(cacheRateDatasets)} },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        showLine: true,
        scales: {
            x: {
                type: 'linear',
                title: { display: true, text: '轮次' },
                ticks: { stepSize: 5 },
            },
            y: {
                min: 0, max: 100,
                title: { display: true, text: '缓存命中率 (%)' },
                ticks: { callback: v => v + '%' },
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: ctx => ctx.dataset.label + ': 轮次 ' + ctx.parsed.x + ', 命中率 ' + ctx.parsed.y + '%'
                }
            },
            legend: { position: 'bottom' },
        }
    }
});
</script>

</body>
</html>`;
}

/**
 * 生成核心指标对比表格
 * @param {Array<Object>} scenarios - 场景分析结果数组
 * @param {Array<string>} labels - 场景标签
 * @returns {string} HTML 表格字符串
 */
/**
 * 生成核心指标对比表格
 * 第一个场景为基准，后续场景显示数值和相对基准的变化百分比
 *
 * 变化方向约定：
 *   - Token/轮数/耗时：减少 = 好（绿色），增加 = 差（红色）
 *   - 缓存命中率：增加 = 好（绿色），减少 = 差（红色）
 *
 * @param {Array<Object>} scenarios - 场景分析结果数组
 * @param {Array<string>} labels - 场景标签
 * @returns {string} HTML 表格字符串
 */
function renderComparisonTable(scenarios, labels) {
    if (scenarios.length === 0) return '';

    // 定义每行的指标：label 显示名，getRaw 返回原始数值（用于计算变化），getFmt 返回格式化字符串
    const rows = [
        {
            label: '总轮数',
            betterWhen: 'down', // 轮数越少越好
            getRaw: s => s.summary.validRounds,
            getFmt: s => s.summary.totalRounds + '（' + s.summary.validRounds + ' 有效）',
        },
        {
            label: '总 Token',
            betterWhen: 'down',
            getRaw: s => s.summary.totalAllTokens,
            getFmt: s => fmtNum(s.summary.totalAllTokens),
        },
        {
            label: '新输入 Token',
            betterWhen: 'down',
            getRaw: s => s.summary.totalInputTokens,
            getFmt: s => fmtNum(s.summary.totalInputTokens),
        },
        {
            label: '缓存读取 Token',
            betterWhen: 'down',
            getRaw: s => s.summary.totalCacheRead,
            getFmt: s => fmtNum(s.summary.totalCacheRead),
        },
        {
            label: '输出 Token',
            betterWhen: 'down',
            getRaw: s => s.summary.totalOutputTokens,
            getFmt: s => fmtNum(s.summary.totalOutputTokens),
        },
        {
            label: '缓存命中率',
            betterWhen: 'up', // 命中率越高越好
            getRaw: s => {
                const t = s.summary.totalInputTokens + s.summary.totalCacheRead;
                return t > 0 ? s.summary.totalCacheRead / t : 0;
            },
            getFmt: s => {
                const t = s.summary.totalInputTokens + s.summary.totalCacheRead;
                return fmtPct(s.summary.totalCacheRead, t);
            },
        },
        {
            label: '总耗时',
            betterWhen: 'down',
            getRaw: s => s.summary.totalDuration,
            getFmt: s => fmtTime(s.summary.totalDuration),
        },
        {
            label: '思考耗时',
            betterWhen: 'down',
            getRaw: s => s.summary.totalThinkingMs,
            getFmt: s => fmtTime(s.summary.totalThinkingMs),
        },
        {
            label: '输出耗时',
            betterWhen: 'down',
            getRaw: s => s.summary.totalOutputMs,
            getFmt: s => fmtTime(s.summary.totalOutputMs),
        },
    ];

    /**
     * 计算变化百分比并生成 HTML 类名
     * @param {number} baseVal - 基准值
     * @param {number} curVal - 当前值
     * @param {string} betterWhen - 'up' 或 'down'，表示值增加还是减少是好的
     * @returns {string} HTML 片段
     */
    function renderChange(baseVal, curVal, betterWhen) {
        if (baseVal === 0) return '<span class="diff-neutral">-</span>';
        const pct = ((curVal - baseVal) / baseVal * 100);
        const absPct = Math.abs(pct);
        const sign = pct >= 0 ? '+' : '';
        const label = sign + pct.toFixed(1) + '%';

        // 判断好坏
        let cls = 'diff-neutral';
        if (absPct > 0.5) {
            const isBetter = (betterWhen === 'down' && pct < 0) || (betterWhen === 'up' && pct > 0);
            cls = isBetter ? 'diff-better' : 'diff-worse';
        }

        return `<span class="${cls}">${label}</span>`;
    }

    // 构建表头：基准场景 | 场景2（值 + 变化）| 场景3（值 + 变化）| ...
    let html = '<div class="table-wrap"><table>\n<thead>\n<tr>\n';
    html += '<th>指标</th>\n';
    html += `<th>${escapeHtml(labels[0])}</th>\n`;
    for (let i = 1; i < labels.length; i++) {
        html += `<th>${escapeHtml(labels[i])}</th>\n`;
        html += `<th>变化</th>\n`;
    }
    html += '</tr>\n</thead>\n<tbody>\n';

    for (const row of rows) {
        html += `<tr>\n<td>${row.label}</td>\n`;

        // 基准场景：只显示值
        const baseVal = row.getRaw(scenarios[0]);
        html += `<td>${row.getFmt(scenarios[0])}</td>\n`;

        // 后续场景：显示值 + 变化百分比
        for (let i = 1; i < scenarios.length; i++) {
            const curVal = row.getRaw(scenarios[i]);
            html += `<td>${row.getFmt(scenarios[i])}</td>\n`;
            html += `<td>${renderChange(baseVal, curVal, row.betterWhen)}</td>\n`;
        }

        html += `</tr>\n`;
    }

    html += '</tbody>\n</table>\n</div>';

    // 图例说明
    html += '<div style="margin-top:8px;font-size:12px;color:#636e72;">';
    html += '<span class="diff-better">绿色</span> = 改善，';
    html += '<span class="diff-worse">红色</span> = 退化，';
    html += '<span class="diff-neutral">灰色</span> = 变化小于 0.5%';
    html += '</div>';

    return html;
}

/**
 * 生成提示词组成明细对比表格
 * @param {Array<Object>} scenarios - 场景分析结果数组
 * @param {Array<string>} labels - 场景标签
 * @returns {string} HTML 表格字符串
 */
function renderPromptTable(scenarios, labels) {
    const parts = ['system', 'user', 'thinking', 'assistant', 'tool_use', 'tool_result'];
    const partLabels = { system: '系统提示', user: '用户输入', thinking: '思考',
                         assistant: '输出文本', tool_use: '工具调用', tool_result: '工具结果' };

    // 汇总每个场景的各部分
    const totals = scenarios.map(s => {
        const t = {};
        for (const part of parts) {
            t[part] = s.rows
                .filter(r => r.hasUsage && r.cum_total !== null)
                .reduce((sum, r) => sum + (r['cum_' + part] || 0), 0);
        }
        t.all = Object.values(t).reduce((a, b) => a + b, 0);
        return t;
    });

    let html = '<div class="table-wrap"><table>\n<thead>\n<tr>\n';
    html += '<th>成分</th>\n';
    for (const label of labels) {
        html += `<th>${escapeHtml(label)}（字符数）</th>\n`;
        html += `<th>占比</th>\n`;
    }
    html += '</tr>\n</thead>\n<tbody>\n';

    for (const part of parts) {
        html += `<tr>\n<td>${partLabels[part]}</td>\n`;
        for (let i = 0; i < scenarios.length; i++) {
            const val = totals[i][part];
            const pct = totals[i].all > 0 ? (val / totals[i].all * 100).toFixed(1) : '0.0';
            html += `<td>${fmtNum(val)}</td>\n`;
            html += `<td>${pct}%</td>\n`;
        }
        html += `</tr>\n`;
    }

    // 合计行
    html += `<tr style="font-weight:700;background:#f0f0f0;">\n<td>内容合计</td>\n`;
    for (let i = 0; i < scenarios.length; i++) {
        html += `<td>${fmtNum(totals[i].all)}</td>\n`;
        html += `<td>100%</td>\n`;
    }
    html += `</tr>\n`;

    html += '</tbody>\n</table>\n</div>';
    return html;
}

/**
 * HTML 转义
 * @param {string} str - 原始字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================================================
// 主函数
// ============================================================================

/**
 * 主入口
 *
 * 用法：node compare-round-tokens.js <目录1> <目录2> [目录3 ...]
 * 至少需要 2 个目录路径才能做对比
 */
function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error('用法：node compare-round-tokens.js <目录1> <目录2> [目录3 ...]');
        console.error('');
        console.error('至少需要 2 个日志目录路径才能做对比分析。');
        console.error('');
        console.error('示例：');
        console.error('  node compare-round-tokens.js \\');
        console.error('    ../test-scenarios/without-context-mode/scenario-1-日志分析/日志 \\');
        console.error('    ../test-scenarios/with-context-mode/scenario-1-日志分析/日志');
        console.error('');
        console.error('每个日志目录需包含以下文件：');
        console.error('  - summary-*.jsonl    （token 用量数据）');
        console.error('  - proxy-*-request.jsonl  （提示词组成数据）');
        process.exit(1);
    }

    // 解析输入路径
    const inputDirs = args.map(a => path.resolve(a));

    // 校验所有目录
    for (const dir of inputDirs) {
        if (!fs.existsSync(dir)) {
            console.error(`错误：目录不存在 — ${dir}`);
            process.exit(1);
        }
        if (!fs.statSync(dir).isDirectory()) {
            console.error(`错误：路径不是目录 — ${dir}`);
            process.exit(1);
        }
    }

    console.log(`对比 ${inputDirs.length} 个场景：`);
    for (const dir of inputDirs) {
        console.log(`  - ${dir}`);
    }

    // 分析所有场景
    const scenarios = [];
    for (const dir of inputDirs) {
        // 生成标签
        const modeMatch = dir.match(/(with|without)-context-mode/);
        const mode = modeMatch ? (modeMatch[1] === 'with' ? '有插件' : '无插件') : '';
        const scenarioMatch = dir.match(/scenario-\d+-([^\/\\]+)/);
        const name = scenarioMatch ? scenarioMatch[1] : path.basename(dir);
        const label = mode ? `${mode} — ${name}` : name;

        console.log(`正在分析：${label} ...`);
        const scenario = analyzeScenario(dir, label);
        scenarios.push(scenario);
        console.log(`  完成：${scenario.summary.validRounds} 轮有效数据，`
            + `总 ${scenario.summary.totalAllTokens.toLocaleString('zh-CN')} Token`);
    }

    // 生成 HTML 报告
    const html = renderHTML(scenarios);

    const outputPath = path.join(__dirname, 'compare-report.html');
    fs.writeFileSync(outputPath, html, 'utf-8');

    console.log(`\n对比报告已生成：${outputPath}`);
}

// ============================================================================
// 模块导出
// ============================================================================

module.exports = {
    prepareTokenData,
    preparePromptData,
    prepareTrendData,
    prepareCacheRateTrendData,
    preparePerRoundInputData,
    preparePerRoundTokenBarData,
    preparePerRoundPromptBarData,
    normalizeStackedDatasets,
    renderHTML,
    renderComparisonTable,
    renderPromptTable,
};

// ============================================================================
// 直接运行入口
// ============================================================================

if (require.main === module) {
    main();
}