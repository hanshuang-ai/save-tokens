#!/usr/bin/env node

/**
 * ============================================================================
 * analyze-round-tokens.js
 * 逐轮分析：Token 组成/用量 + 提示词组成/用量
 * ============================================================================
 *
 * 功能：
 *   对指定日志目录的每一轮 API 请求，分析其 token 和 prompt 的组成与用量，
 *   输出可视化 HTML 报告（含汇总表 + Chart.js 图表）：
 *     - 提示词成分汇总表
 *     - 图表 A：逐轮 Token 用量（堆叠柱状图）
 *     - 图表 B：逐轮提示词构成 — 当前轮全量（堆叠柱状图）
 *     - 图表 C：对照图 — 提示词构成（柱状，上图） × Token 用量（输入/输出，折线，下图）
 *     - 工具扫描：注册工具列表 + 调用次数统计（水平柱状图 + 表格）
 *
 *   图表使用 Chart.js（CDN 加载），无需本地安装依赖。
 *
 * 数据来源：
 *   summary.jsonl  → token 用量（usage 字段，每轮独立，无需差分）
 *   request.jsonl  → 提示词组成（messages 滚动携带历史，需差分得到新增量）
 *   response.jsonl → timing 耗时（补充参考）
 *
 * 关键概念：
 *   - Token 相关：
 *       input_tokens            : 本轮新输入的 token（未命中缓存的部分）
 *       output_tokens           : 本轮模型输出的 token
 *       cache_read_input_tokens : 本轮从缓存中读取的 token（已缓存，不消耗计算）
 *       cache_creation_input_tokens : 本轮写入缓存的 token
 *       总输入 token = input_tokens + cache_read_input_tokens + cache_creation_input_tokens（模型实际"看到"的全部输入）
 *       缓存命中率 = cache_read / 总输入
 *
 *   - 提示词相关：
 *       request.jsonl 的 messages 是滚动携带的（每轮请求包含当前对话历史），
 *       因此"当前轮的提示词"有两层含义：
 *         1. 当前轮全量 = 该轮请求中 messages+system 的全部字符数，
 *            即模型本轮实际看到的完整 prompt 大小。
 *            注意：它不是单调递增的"历史累计总量"——Claude Code 压缩/裁剪
 *            上下文（compaction）后该值会骤降。
 *         2. 新增量 = 本轮相比上一轮新增的内容（差分值）
 *       本工具同时输出两者。
 *
 *   - 提示词组成部分（按 Anthropic Messages API 的 content block 类型划分）：
 *       系统提示  (system)   : request.system 字段，包含 CLAUDE.md、skills 等
 *       工具定义  (tools)    : request.tools_available 字段，工具名+描述（不进 messages 但计入 input_tokens）
 *       用户输入  (user)     : role=user 的 text 内容
 *       思考      (thinking) : role=assistant 的 thinking 内容（模型内部推理）
 *       输出文本  (assistant) : role=assistant 的 text 内容（模型可见输出）
 *       工具调用  (tool_use) : role=assistant 的 tool_use 内容（JSON input 的字符数）
 *       工具结果  (tool_result) : role=user 的 tool_result 内容（工具执行返回值）
 *
 * 用法：
 *   node analyze-round-tokens.js <日志目录路径>
 *   示例：node analyze-round-tokens.js ../test-scenarios/with-context-mode/scenario-1-日志分析/日志
 *
 *   作为模块：
 *   const { analyzeScenario } = require('./analyze-round-tokens');
 *
 * 输出文件：
 *   与输入目录同名的 .html 文件，生成在 funlist/ 目录下
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 数字格式化：添加千分位分隔符
 * @param {number} n - 数字
 * @returns {string} 格式化后的字符串，如 "1,234,567"
 */
function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return n.toLocaleString('zh-CN');
}

/**
 * 百分比格式化：保留一位小数
 * @param {number} numerator - 分子
 * @param {number} denominator - 分母
 * @returns {string} 百分比字符串，如 "87.5%"
 */
function fmtPct(numerator, denominator) {
    if (!denominator || denominator === 0) return '0.0%';
    return ((numerator / denominator) * 100).toFixed(1) + '%';
}

/**
 * 毫秒格式化：小于 1 秒显示毫秒，否则显示秒或分钟
 * @param {number} ms - 毫秒数
 * @returns {string} 格式化后的时间字符串
 */
function fmtTime(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '-';
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + '秒';
    return (ms / 60000).toFixed(1) + '分钟';
}

// ============================================================================
// 数据读取层
// ============================================================================

/**
 * 在目录中查找匹配前缀的文件
 * 文件名格式：{prefix}-{timestamp}.jsonl
 *
 * @param {string} dirPath - 目录路径
 * @param {string} prefix - 文件名前缀，如 'summary'、'proxy'
 * @param {string} suffix - 文件名后缀，如 '-request'、'-response'、''
 * @returns {string|null} 文件路径，未找到则返回 null
 */
function findFile(dirPath, prefix, suffix = '') {
    if (!fs.existsSync(dirPath)) return null;
    // 匹配格式：prefix-YYYY-MM-DD_HH-MM-SS-xxx[-suffix].jsonl
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}-\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}-\\d{3}`);
    const files = fs.readdirSync(dirPath).filter(f => {
        if (!f.endsWith('.jsonl')) return false;
        if (suffix) {
            const baseName = f.replace(/\.jsonl$/, '');
            return pattern.test(baseName) && baseName.endsWith(suffix);
        }
        return pattern.test(f);
    });
    if (files.length === 0) return null;
    return path.join(dirPath, files[0]);
}

/**
 * 读取 JSONL 文件，每行解析为 JSON 对象
 * @param {string} filePath - 文件路径
 * @returns {Array<Object>} 解析后的对象数组
 */
function readJsonl(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = [];
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const obj = JSON.parse(trimmed);
            if (obj.id !== undefined) {
                result.push(obj);
            }
        } catch (_) { /* 忽略解析失败的行 */ }
    }
    return result;
}

// ============================================================================
// 核心分析层
// ============================================================================

/**
 * 从 summary.jsonl 提取逐轮 token 数据
 *
 * summary 每一行就是一个独立的 API 请求轮次，usage 字段是每轮独立的，
 * 不需要做差分。但部分轮次没有 usage（如 400/404 错误），需要标记。
 *
 * @param {string} dirPath - 日志目录路径
 * @returns {Array<Object>} 每轮 token 数据数组
 */
function extractTokenRows(dirPath) {
    const summaryFile = findFile(dirPath, 'summary');
    if (!summaryFile) return [];

    const summaries = readJsonl(summaryFile);
    if (summaries.length === 0) return [];

    return summaries.map(r => {
        const usage = r.usage;
        const hasUsage = usage && typeof usage.input_tokens === 'number';

        // 各 token 字段（无 usage 时置为 null）
        const inputTokens = hasUsage ? (usage.input_tokens || 0) : null;
        const outputTokens = hasUsage ? (usage.output_tokens || 0) : null;
        const cacheRead = hasUsage ? (usage.cache_read_input_tokens || 0) : null;
        const cacheCreation = hasUsage ? (usage.cache_creation_input_tokens || 0) : null;

        // 总输入 token = 新输入 + 缓存读取 + 缓存写入（模型实际"看到"的全部输入量）
        const totalInput = hasUsage ? inputTokens + cacheRead + cacheCreation : null;
        // 总 token = 总输入 + 输出
        const totalAll = hasUsage ? totalInput + outputTokens : null;

        return {
            id: r.id,
            status: r.status || null,
            model: r.model || null,
            duration_ms: r.duration_ms || 0,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cache_read: cacheRead,
            cache_creation: cacheCreation,
            total_input: totalInput,
            total_all: totalAll,
            cache_hit_rate: hasUsage && totalInput > 0
                ? cacheRead / totalInput
                : null,
            hasUsage: hasUsage
        };
    });
}

/**
 * 从 request.jsonl 提取逐轮提示词组成数据
 *
 * 注意：request.jsonl 的 messages 是累积的（每轮包含历史所有消息），
 * 因此需要先计算累积量，再差分得到每轮新增量。
 *
 * 提示词组成部分（7 类）：
 *   1. system      — 系统提示词（request.system 字段，不在 messages 中）
 *   2. tools       — 工具定义（request.tools_available，工具名+描述，不进 messages 但计入 input_tokens）
 *   3. user        — 用户输入文本（role=user, type=text 或 type=string）
 *   4. thinking    — 模型思考（role=assistant, type=thinking）
 *   5. assistant   — 模型输出文本（role=assistant, type=text）
 *   6. tool_use    — 工具调用（role=assistant, type=tool_use，计 input JSON 字符数）
 *   7. tool_result — 工具结果（role=user, type=tool_result，计 content 字符数）
 *
 * @param {string} dirPath - 日志目录路径
 * @returns {Array<Object>} 每轮提示词数据数组
 */
function extractPromptRows(dirPath) {
    const requestFile = findFile(dirPath, 'proxy', '-request');
    if (!requestFile) return [];

    const requests = readJsonl(requestFile);
    if (requests.length === 0) return [];

    /**
     * 对单条请求，统计其累积提示词各部分的字符数
     * @param {Object} req - 单条请求对象
     * @returns {Object} { system, user, thinking, assistant, tool_use, tool_result, body_size }
     */
    function countCumulative(req) {
        let systemLen = 0;
        let userLen = 0;
        let thinkingLen = 0;
        let assistantLen = 0;
        let toolUseLen = 0;
        let toolResultLen = 0;
        let toolsLen = 0;

        // ---- 工具定义（tools_available）----
        // 代理记录的工具可用列表，每轮请求携带，包含 name + description
        const toolsAvail = req.request?.tools_available;
        if (Array.isArray(toolsAvail) && toolsAvail.length > 0) {
            toolsLen = JSON.stringify(toolsAvail).length;
        }

        // ---- 系统提示词 ----
        // request.system 是独立字段，格式：[{ type: "text", text: "..." }, ...]
        const system = req.request?.system;
        if (Array.isArray(system)) {
            for (const block of system) {
                if (block.text) systemLen += block.text.length;
            }
        }

        // ---- 消息列表 ----
        // request.messages 是累积的，包含从对话开始到当前轮的所有消息
        const messages = req.request?.messages;
        if (!Array.isArray(messages)) {
            return { system: systemLen, user: userLen, thinking: thinkingLen,
                     assistant: assistantLen, tool_use: toolUseLen, tool_result: toolResultLen,
                     tools: toolsLen, body_size: req.request?.body_size || 0 };
        }

        for (const msg of messages) {
            const content = msg.content;

            // content 是字符串（早期消息格式，仅 role=user 时出现）
            if (typeof content === 'string') {
                if (msg.role === 'user') userLen += content.length;
                else assistantLen += content.length;
                continue;
            }

            if (!Array.isArray(content)) continue;

            // content 是数组（标准 Anthropic Messages API 格式）
            for (const block of content) {
                switch (block.type) {
                    case 'text':
                        // 文本内容：由 msg.role 决定是 user 输入还是 assistant 输出
                        if (msg.role === 'user') userLen += (block.text || '').length;
                        else assistantLen += (block.text || '').length;
                        break;
                    case 'thinking':
                        // 思考内容：仅 role=assistant 时出现（extended thinking）
                        thinkingLen += (block.thinking || '').length;
                        break;
                    case 'tool_use':
                        // 工具调用：计 input JSON 的字符数（工具参数）
                        toolUseLen += JSON.stringify(block.input || {}).length;
                        break;
                    case 'tool_result':
                        // 工具结果：content 可能是字符串或数组
                        if (typeof block.content === 'string') {
                            toolResultLen += block.content.length;
                        } else if (Array.isArray(block.content)) {
                            for (const c of block.content) {
                                if (c.text) toolResultLen += c.text.length;
                            }
                        }
                        break;
                }
            }
        }

        return {
            system: systemLen, user: userLen, thinking: thinkingLen,
            assistant: assistantLen, tool_use: toolUseLen, tool_result: toolResultLen,
            tools: toolsLen, body_size: req.request?.body_size || 0
        };
    }

    // 计算所有请求的累积量
    const cumulatives = [];
    for (const req of requests) {
        if (!req.request) { cumulatives.push(null); continue; }
        cumulatives.push(countCumulative(req));
    }

    /**
     * 判断请求是否为错误/非标准请求
     * 规则：无 system prompt 且无 tool_use 且无 tool_result 的请求，
     * 通常是非标准端点（如 /v1/messages/count_tokens），不应参与差分计算。
     */
    function isErrorRequest(cum) {
        if (!cum) return true;
        return cum.system === 0 && cum.tool_use === 0 && cum.tool_result === 0;
    }

    // 差分得到每轮新增量
    const rows = [];
    let prevCum = null; // 上一个有效请求的累积量（差分基线）

    for (let i = 0; i < cumulatives.length; i++) {
        const cum = cumulatives[i];
        const req = requests[i];

        if (!cum) {
            rows.push({ id: req.id, cumulative: null, delta: null, isError: true });
            prevCum = null;
            continue;
        }

        const isError = isErrorRequest(cum);

        // 差分计算：cur - prev，确保结果非负
        const diff = (curVal, prevVal, field) => {
            if (!prevVal) return curVal[field];
            return Math.max(0, curVal[field] - prevVal[field]);
        };

        const delta = {
            system: diff(cum, prevCum, 'system'),
            user: diff(cum, prevCum, 'user'),
            thinking: diff(cum, prevCum, 'thinking'),
            assistant: diff(cum, prevCum, 'assistant'),
            tool_use: diff(cum, prevCum, 'tool_use'),
            tool_result: diff(cum, prevCum, 'tool_result'),
            tools: diff(cum, prevCum, 'tools'),
            total: 0
        };
        delta.total = delta.system + delta.user + delta.thinking
                     + delta.assistant + delta.tool_use + delta.tool_result
                     + delta.tools;

        const cumulative = {
            ...cum,
            total: cum.system + cum.user + cum.thinking
                 + cum.assistant + cum.tool_use + cum.tool_result
                 + cum.tools
        };

        rows.push({ id: req.id, cumulative, delta, isError });
        if (!isError) prevCum = cum;
    }

    return rows;
}

/**
 * 从 response.jsonl 提取逐轮 timing 耗时数据
 * 字段说明：
 *   ttfb_ms       : Time To First Byte，首字节到达时间
 *   thinking_ms   : 模型思考阶段耗时
 *   output_ms     : 模型输出阶段耗时（不含思考）
 *   first_token_ms: 首个 token 生成时间
 *   total_ms      : 总耗时
 *
 * @param {string} dirPath - 日志目录路径
 * @returns {Map<number, Object>} id -> timing 对象的映射
 */
function extractTimingMap(dirPath) {
    const responseFile = findFile(dirPath, 'proxy', '-response');
    if (!responseFile) return new Map();

    const responses = readJsonl(responseFile);
    const map = new Map();
    for (const r of responses) {
        if (r.timing) map.set(r.id, r.timing);
    }
    return map;
}

/**
 * 从 request.jsonl 提取工具扫描数据
 * - 注册工具：tools_available 中声明的工具（取第一个非空数组）
 * - 使用工具：扫描所有 messages 中 type=tool_use 的 block，按 name 计数
 *
 * @param {string} dirPath - 日志目录路径
 * @returns {Object} { registered: [{name, description}], used: [{name, count}], totalCalls, usedCount }
 */
function extractToolStats(dirPath) {
    const requestFile = findFile(dirPath, 'proxy', '-request');
    if (!requestFile) return { registered: [], used: [], totalCalls: 0, usedCount: 0 };

    const requests = readJsonl(requestFile);
    if (requests.length === 0) return { registered: [], used: [], totalCalls: 0, usedCount: 0 };

    // 注册工具：取第一个非空 tools_available
    let registered = [];
    for (const req of requests) {
        const ta = req.request?.tools_available;
        if (Array.isArray(ta) && ta.length > 0) {
            registered = ta.map(t => ({ name: t.name || 'unknown', description: t.description || '' }));
            break;
        }
    }

    // 使用工具：扫描所有 messages 中的 tool_use block
    const useCount = {};
    for (const req of requests) {
        const messages = req.request?.messages;
        if (!Array.isArray(messages)) continue;
        for (const msg of messages) {
            if (msg.role !== 'assistant') continue;
            const content = msg.content;
            if (!Array.isArray(content)) continue;
            for (const block of content) {
                if (block.type === 'tool_use' && block.name) {
                    useCount[block.name] = (useCount[block.name] || 0) + 1;
                }
            }
        }
    }

    const used = Object.entries(useCount)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    const totalCalls = used.reduce((s, t) => s + t.count, 0);

    return { registered, used, totalCalls, usedCount: used.length };
}

// ============================================================================
// 场景分析层
// ============================================================================

/**
 * 分析单个日志目录，整合 token 数据和提示词数据
 *
 * 将 summary 的 token 数据、request 的提示词数据、response 的 timing 数据
 * 按 id 合并为统一的行数据。
 *
 * @param {string} dirPath - 日志目录路径（包含 summary.jsonl、request.jsonl、response.jsonl）
 * @param {string} label - 场景标签
 * @returns {Object} { label, rows, summary, dirPath }
 */
function analyzeScenario(dirPath, label) {
    const tokenRows = extractTokenRows(dirPath);
    const promptRows = extractPromptRows(dirPath);
    const timingMap = extractTimingMap(dirPath);
    const toolStats = extractToolStats(dirPath);

    // 将 promptRows 转为 id -> promptRow 的映射
    const promptMap = new Map();
    for (const p of promptRows) {
        promptMap.set(p.id, p);
    }

    // 以 tokenRows（summary）为基准，按 id 合并
    const rows = [];
    for (const tokenRow of tokenRows) {
        const promptRow = promptMap.get(tokenRow.id);
        const timing = timingMap.get(tokenRow.id);

        rows.push({
            id: tokenRow.id,
            status: tokenRow.status,
            model: tokenRow.model,
            duration_ms: tokenRow.duration_ms,
            hasUsage: tokenRow.hasUsage,
            input_tokens: tokenRow.input_tokens,
            output_tokens: tokenRow.output_tokens,
            cache_read: tokenRow.cache_read,
            cache_creation: tokenRow.cache_creation,
            total_input: tokenRow.total_input,
            total_all: tokenRow.total_all,
            cache_hit_rate: tokenRow.cache_hit_rate,
            // 提示词 — 累积量
            cum_system: promptRow?.cumulative?.system ?? null,
            cum_user: promptRow?.cumulative?.user ?? null,
            cum_thinking: promptRow?.cumulative?.thinking ?? null,
            cum_assistant: promptRow?.cumulative?.assistant ?? null,
            cum_tool_use: promptRow?.cumulative?.tool_use ?? null,
            cum_tool_result: promptRow?.cumulative?.tool_result ?? null,
            cum_tools: promptRow?.cumulative?.tools ?? null,
            cum_total: promptRow?.cumulative?.total ?? null,
            cum_body_size: promptRow?.cumulative?.body_size ?? null,
            // 提示词 — 新增量
            delta_system: promptRow?.delta?.system ?? null,
            delta_user: promptRow?.delta?.user ?? null,
            delta_thinking: promptRow?.delta?.thinking ?? null,
            delta_assistant: promptRow?.delta?.assistant ?? null,
            delta_tool_use: promptRow?.delta?.tool_use ?? null,
            delta_tool_result: promptRow?.delta?.tool_result ?? null,
            delta_tools: promptRow?.delta?.tools ?? null,
            delta_total: promptRow?.delta?.total ?? null,
            isError: promptRow?.isError ?? false,
            // Timing
            timing_ttfb: timing?.ttfb_ms ?? null,
            timing_thinking: timing?.thinking_ms ?? null,
            timing_output: timing?.output_ms ?? null,
            timing_first_token: timing?.first_token_ms ?? null
        });
    }

    // 汇总统计（仅统计有 usage 的有效轮次）
    const validRows = rows.filter(r => r.hasUsage);

    const summary = {
        totalRounds: rows.length,
        validRounds: validRows.length,
        errorRounds: rows.length - validRows.length,
        totalInputTokens: validRows.reduce((s, r) => s + r.input_tokens, 0),
        totalOutputTokens: validRows.reduce((s, r) => s + r.output_tokens, 0),
        totalCacheRead: validRows.reduce((s, r) => s + r.cache_read, 0),
        totalCacheCreation: validRows.reduce((s, r) => s + r.cache_creation, 0),
        totalAllTokens: validRows.reduce((s, r) => s + r.total_all, 0),
        totalDuration: rows.reduce((s, r) => s + (r.duration_ms || 0), 0),
        totalThinkingMs: validRows.reduce((s, r) => s + (r.timing_thinking || 0), 0),
        totalOutputMs: validRows.reduce((s, r) => s + (r.timing_output || 0), 0),
        statusDist: {}
    };

    for (const r of rows) {
        const s = r.status || 'unknown';
        summary.statusDist[s] = (summary.statusDist[s] || 0) + 1;
    }

    // 按轮次统计提示词累积量各部分汇总（用于饼图/对比）
    const validPromptRows = validRows.filter(r => r.cum_total !== null);
    summary.promptCumTotals = {
        system: validPromptRows.reduce((s, r) => s + (r.cum_system || 0), 0),
        tools: validPromptRows.reduce((s, r) => s + (r.cum_tools || 0), 0),
        user: validPromptRows.reduce((s, r) => s + (r.cum_user || 0), 0),
        thinking: validPromptRows.reduce((s, r) => s + (r.cum_thinking || 0), 0),
        assistant: validPromptRows.reduce((s, r) => s + (r.cum_assistant || 0), 0),
        tool_use: validPromptRows.reduce((s, r) => s + (r.cum_tool_use || 0), 0),
        tool_result: validPromptRows.reduce((s, r) => s + (r.cum_tool_result || 0), 0),
    };
    summary.promptCumTotals.all = Object.values(summary.promptCumTotals).reduce((a, b) => a + b, 0);

    return { label, rows, summary, dirPath, toolStats };
}

// ============================================================================
// HTML 渲染层
// ============================================================================

/**
 * 生成完整的 HTML 页面
 * @param {Object} scenario - analyzeScenario 的返回结果
 * @returns {string} HTML 字符串
 */
function renderHTML(scenario) {
    const { label, rows, summary, toolStats } = scenario;
    const dirName = path.basename(path.dirname(scenario.dirPath));
    const scenarioName = path.basename(scenario.dirPath);
    const cacheRate = summary.totalCacheRead
        / (summary.totalInputTokens + summary.totalCacheRead + summary.totalCacheCreation);

    // 判断是否是完整场景目录（有父级 scenario 目录）
    const parentDir = path.basename(path.dirname(path.dirname(scenario.dirPath)));
    const fullLabel = parentDir.startsWith('scenario-')
        ? `${parentDir} / ${scenarioName}`
        : scenarioName;

    // ============================================================
    // 图表数据准备（与 compare-round-tokens.js 保持同色系）
    // ============================================================

    // 提示词 7 类组成部分的中文名与颜色（与对比报告一致）
    const promptParts = ['system', 'tools', 'user', 'thinking', 'assistant', 'tool_use', 'tool_result'];
    const promptPartLabels = { system: '系统提示', tools: '工具定义', user: '用户输入', thinking: '思考',
                               assistant: '输出文本', tool_use: '工具调用', tool_result: '工具结果' };
    const promptPartColors = {
        system: 'rgba(108, 92, 231, 0.8)',
        tools: 'rgba(0, 206, 201, 0.8)',
        user: 'rgba(9, 132, 227, 0.8)',
        thinking: 'rgba(253, 203, 110, 0.8)',
        assistant: 'rgba(0, 184, 148, 0.8)',
        tool_use: 'rgba(225, 112, 85, 0.8)',
        tool_result: 'rgba(214, 48, 49, 0.8)',
    };

    // ---- 图表 A：逐轮 Token 用量（堆叠柱状图，仅有效轮次） ----
    const tokenRowsForChart = rows.filter(r => r.hasUsage);
    const tokenChartLabels = tokenRowsForChart.map(r => 'R' + r.id);
    const tokenChartDatasets = [
        { label: '新输入',   data: tokenRowsForChart.map(r => r.input_tokens),   stack: 'token', backgroundColor: 'rgba(9, 132, 227, 0.7)',  borderColor: 'rgba(9, 132, 227, 1)',  borderWidth: 1 },
        { label: '缓存读取', data: tokenRowsForChart.map(r => r.cache_read),     stack: 'token', backgroundColor: 'rgba(0, 184, 148, 0.7)',  borderColor: 'rgba(0, 184, 148, 1)',  borderWidth: 1 },
        { label: '缓存写入', data: tokenRowsForChart.map(r => r.cache_creation), stack: 'token', backgroundColor: 'rgba(108, 92, 231, 0.7)', borderColor: 'rgba(108, 92, 231, 1)', borderWidth: 1 },
        { label: '输出',     data: tokenRowsForChart.map(r => r.output_tokens),  stack: 'token', backgroundColor: 'rgba(253, 203, 110, 0.7)', borderColor: 'rgba(253, 203, 110, 1)', borderWidth: 1 },
    ];
    // 堆叠高度 = 总输入 + 缓存写入 + 输出 = 表格中的"总计"列

    // ---- 图表 B：逐轮提示词构成（当前轮全量，堆叠柱状图） ----
    // "当前轮全量" = 该轮请求 messages+system 的全部字符数（模型本轮实际看到的 prompt 大小）。
    // messages 滚动携带历史，但 Claude Code 压缩/裁剪上下文（compaction）后该值会骤降，
    // 因此曲线不是单调递增的"历史累计总量"。
    // 仅展示有 usage 的有效轮次
    const cumRowsForChart = rows.filter(r => r.hasUsage && r.cum_total !== null && r.cum_total > 0);
    const cumChartLabels = cumRowsForChart.map(r => 'R' + r.id);
    const cumChartDatasets = promptParts.map(p => ({
        label: promptPartLabels[p],
        data: cumRowsForChart.map(r => r['cum_' + p] || 0),
        stack: 'cum',
        backgroundColor: promptPartColors[p],
    }));

    // 逐轮柱状图最小宽度：每轮 22px，不足 600px 时用 600px（与对比报告一致）
    const tokenChartMinWidth = Math.max(600, tokenChartLabels.length * 22);
    const cumChartMinWidth = Math.max(600, cumChartLabels.length * 22);

    // ---- 对照图（提示词构成柱状 + Token 用量折线，上下两个独立图表） ----
    // X 轴与图表 B 对齐（仅含有效轮次）
    // 上图柱状 = 7 类提示词成分（当前轮全量，单轴，堆叠）
    // 下图折线 = Token 用量（单轴 / Token 数）：
    //   输入（深灰 #1e293b，实线）= 新输入 + 缓存读取 + 缓存写入（表格"总输入"列）
    //   输出（品红 #e84393，虚线）= output_tokens
    const mixBarDatasets = cumChartDatasets.map(ds => ({ ...ds }));
    const mixLineDatasets = [
        {
            label: '输入',
            data: cumRowsForChart.map(r => r.total_input),
            borderColor: '#1e293b',
            backgroundColor: '#1e293b',
            borderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#1e293b',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: 0.3,
            fill: false,
            spanGaps: false,
        },
        {
            label: '输出',
            data: cumRowsForChart.map(r => r.output_tokens),
            borderColor: '#e84393',
            backgroundColor: '#e84393',
            borderWidth: 2,
            borderDash: [6, 3],
            pointRadius: 3.5,
            pointHoverRadius: 5,
            pointBackgroundColor: '#e84393',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: 0.3,
            fill: false,
            spanGaps: false,
        },
    ];
    const mixChartMinWidth = Math.max(600, cumChartLabels.length * 22);

    // ---- 工具扫描图表数据 ----
    const toolUsedNames = toolStats.used.map(t => t.name);
    const toolUsedCounts = toolStats.used.map(t => t.count);
    const toolChartHeight = Math.max(200, toolStats.used.length * 28);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>逐轮分析报告 — ${escapeHtml(fullLabel)}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
/* ================================================================
   基础样式
   ================================================================ */
:root {
    --bg: #f1f5f9;
    --card-bg: #ffffff;
    --text: #0f172a;
    --text-secondary: #64748b;
    --text-muted: #94a3b8;
    --border: #e2e8f0;
    --border-light: #f1f5f9;
    --accent: #3b82f6;
    --accent-light: #eff6ff;
    --accent-dark: #2563eb;
    --accent-gradient: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
    --green: #10b981;
    --green-bg: #ecfdf5;
    --yellow: #f59e0b;
    --yellow-bg: #fffbeb;
    --red: #ef4444;
    --red-bg: #fef2f2;
    --purple: #8b5cf6;
    --header-bg: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
    --header-text: #ffffff;
    --table-stripe: #f8fafc;
    --table-header-bg: linear-gradient(135deg, #475569 0%, #334155 100%);
    --radius: 14px;
    --radius-sm: 8px;
    --shadow-xs: 0 1px 2px rgba(0,0,0,0.04);
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    --shadow: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05);
    --shadow-md: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.05);
    --shadow-lg: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05);
    --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html { scroll-behavior: smooth; }

body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                 "Microsoft YaHei", "Helvetica Neue", sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding-bottom: 40px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

/* 自定义滚动条 */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* ================================================================
   头部
   ================================================================ */
.header {
    background: var(--header-bg);
    color: var(--header-text);
    padding: 28px 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    position: relative;
    overflow: hidden;
}
.header::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: radial-gradient(circle at 20% 50%, rgba(59,130,246,0.15) 0%, transparent 50%),
                radial-gradient(circle at 80% 50%, rgba(139,92,246,0.1) 0%, transparent 50%);
    pointer-events: none;
}
.header > * { position: relative; z-index: 1; }
.header h1 {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.3px;
}
.header .meta {
    font-size: 13px;
    opacity: 0.7;
}

/* ================================================================
   容器
   ================================================================ */
.container {
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px;
}

/* ================================================================
   汇总卡片
   ================================================================ */
.summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 18px;
    margin-bottom: 28px;
}
.card {
    background: var(--card-bg);
    border-radius: var(--radius);
    padding: 22px 20px;
    box-shadow: var(--shadow-sm);
    text-align: center;
    transition: var(--transition);
    border: 1px solid var(--border-light);
    position: relative;
    overflow: hidden;
}
.card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: var(--accent);
    opacity: 0;
    transition: var(--transition);
}
.card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
    border-color: var(--border);
}
.card:hover::before { opacity: 1; }
.card .label {
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
    font-weight: 600;
}
.card .value {
    font-size: 30px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: -0.5px;
    line-height: 1.2;
}
.card .value.green { color: var(--green); }
.card .value.yellow { color: var(--yellow); }
.card .value.red { color: var(--red); }
.card .sub {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 6px;
}

/* 缓存命中率大卡片 */
.card-highlight {
    grid-column: span 2;
    background: var(--accent-gradient);
    color: #fff;
    border: none;
}
.card-highlight::before { background: rgba(255,255,255,0.3); opacity: 1; }
.card-highlight .label { color: rgba(255,255,255,0.8); }
.card-highlight .value { color: #fff; font-size: 40px; text-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.card-highlight .sub { color: rgba(255,255,255,0.75); }
.card-highlight:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); }

/* ================================================================
   章节标题
   ================================================================ */
.section {
    margin-bottom: 36px;
}
.section-title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 2px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
    position: relative;
    color: var(--text);
}
.section-title::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    width: 60px;
    height: 2px;
    background: var(--accent-gradient);
    border-radius: 1px;
}
.section-title .icon {
    font-size: 20px;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
}
.section-desc {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 18px;
    padding: 12px 16px;
    background: var(--accent-light);
    border-radius: var(--radius-sm);
    border-left: 4px solid var(--accent);
    line-height: 1.7;
}

/* ================================================================
   表格包装器（横向滚动）
   ================================================================ */
.table-wrap {
    overflow-x: auto;
    background: var(--card-bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    margin-bottom: 22px;
    border: 1px solid var(--border-light);
}

/* ================================================================
   图表卡片
   ================================================================ */
.chart-full {
    background: var(--card-bg);
    border-radius: var(--radius);
    padding: 22px;
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--border-light);
    transition: var(--transition);
}
.chart-full:hover {
    box-shadow: var(--shadow);
}
.chart-full h3 {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 6px;
    color: var(--text);
}
.chart-full .chart-desc {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 14px;
    line-height: 1.6;
}
.chart-full canvas {
    width: 100% !important;
}
/* 逐轮柱状图滚动容器 */
.chart-scroll {
    overflow-x: auto;
    overflow-y: hidden;
    border-radius: var(--radius-sm);
}
.chart-scroll-inner {
    height: 280px;
}

/* ================================================================
   表格样式
   ================================================================ */
table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    white-space: nowrap;
}
thead {
    position: sticky;
    top: 0;
    z-index: 2;
}
thead th {
    background: var(--table-header-bg);
    color: #fff;
    padding: 11px 14px;
    text-align: right;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.3px;
    white-space: nowrap;
}
thead th:first-child { text-align: center; }
thead th.col-left { text-align: left; }

tbody td {
    padding: 9px 14px;
    text-align: right;
    border-bottom: 1px solid var(--border-light);
    transition: background 0.15s ease;
}
tbody td:first-child {
    text-align: center;
    font-weight: 700;
    color: var(--text-secondary);
    background: rgba(241,245,249,0.5);
}
tbody td.col-left { text-align: left; }

/* 斑马条纹 */
tbody tr:nth-child(even) { background: var(--table-stripe); }
tbody tr:hover { background: var(--accent-light) !important; }
tbody tr:hover td:first-child { background: rgba(59,130,246,0.1); color: var(--accent-dark); }

/* 错误行灰色 */
tr.row-error { opacity: 0.45; background: #f8fafc !important; }
tr.row-error td { color: var(--text-muted); }
tr.row-error td:first-child { color: var(--text-muted); background: transparent; }

/* 缓存命中率颜色 */
.rate-high { color: var(--green); font-weight: 700; }
.rate-mid { color: var(--yellow); font-weight: 700; }
.rate-low { color: var(--red); font-weight: 700; }

/* 占比进度条 */
.pct-bar-wrap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.pct-bar {
    width: 44px;
    height: 6px;
    background: #e2e8f0;
    border-radius: 3px;
    overflow: hidden;
    display: inline-block;
    vertical-align: middle;
}
.pct-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
}
.pct-bar-fill.sys { background: #8b5cf6; }
.pct-bar-fill.tools { background: #00cec9; }
.pct-bar-fill.user { background: var(--accent); }
.pct-bar-fill.think { background: var(--yellow); }
.pct-bar-fill.assist { background: var(--green); }
.pct-bar-fill.tool { background: #f97316; }
.pct-bar-fill.result { background: var(--red); }

/* ================================================================
   可折叠区域
   ================================================================ */
.collapse-toggle {
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    border-radius: var(--radius-sm);
    transition: var(--transition);
}
.collapse-toggle:hover { background: var(--border-light); }
.collapse-toggle::before {
    content: '▸';
    display: inline-block;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    font-size: 12px;
    width: 16px;
    color: var(--text-secondary);
}
.collapse-toggle.open::before {
    transform: rotate(90deg);
}
.collapse-content {
    overflow: hidden;
    transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.collapse-content.collapsed {
    max-height: 0 !important;
}

/* ================================================================
   页脚
   ================================================================ */
.footer {
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
    padding: 24px;
    border-top: 1px solid var(--border);
    margin-top: 48px;
}

/* ================================================================
   响应式
   ================================================================ */
@media (max-width: 768px) {
    .container { padding: 14px 16px; }
    .summary-cards { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .card-highlight { grid-column: span 2; }
    .header { padding: 20px 24px; }
    .header h1 { font-size: 17px; }
    .card { padding: 16px 14px; }
    .card .value { font-size: 24px; }
    .card-highlight .value { font-size: 32px; }
    table { font-size: 11px; }
    thead th, tbody td { padding: 7px 10px; }
    .chart-full { padding: 16px; }
    .chart-scroll-inner { height: 240px; }
}
</style>
</head>
<body>

<!-- ================================================================
     头部
     ================================================================ -->
<div class="header">
    <div>
        <h1>逐轮分析报告：Token 组成/用量 + 提示词组成/用量</h1>
        <div class="meta">${escapeHtml(fullLabel)}</div>
    </div>
    <div class="meta">生成时间：${new Date().toLocaleString('zh-CN')}</div>
</div>

<div class="container">

<!-- ================================================================
     汇总卡片
     ================================================================ -->
<div class="summary-cards">
    <div class="card">
        <div class="label">有效轮次</div>
        <div class="value">${summary.validRounds}</div>
        <div class="sub">共 ${summary.totalRounds} 轮，${summary.errorRounds} 轮无效</div>
    </div>
    <div class="card card-highlight">
        <div class="label">缓存命中率</div>
        <div class="value">${fmtPct(summary.totalCacheRead, summary.totalInputTokens + summary.totalCacheRead + summary.totalCacheCreation)}</div>
        <div class="sub">缓存读取 ${fmtNum(summary.totalCacheRead)} / 总输入 ${fmtNum(summary.totalInputTokens + summary.totalCacheRead + summary.totalCacheCreation)}</div>
    </div>
    <div class="card">
        <div class="label">总 Token</div>
        <div class="value">${fmtNum(summary.totalAllTokens)}</div>
        <div class="sub">输入 ${fmtNum(summary.totalInputTokens)} + 输出 ${fmtNum(summary.totalOutputTokens)}</div>
    </div>
    <div class="card">
        <div class="label">总耗时</div>
        <div class="value">${fmtTime(summary.totalDuration)}</div>
        <div class="sub">平均 ${fmtTime(Math.round(summary.totalDuration / summary.validRounds))}/轮</div>
    </div>
</div>

<!-- ================================================================
     提示词成分汇总（第二位）
     ================================================================ -->
<div class="section">
    <div class="section-title"><span class="icon">📋</span> 提示词成分汇总（当前轮全量）</div>
    <div class="section-desc">
        各成分按轮次求和后的字符数及占比。<strong>工具定义</strong>每轮随请求发送（不进 messages 但计入 input_tokens）。
    </div>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th class="col-left">成分</th>
                    <th>字符数</th>
                    <th>占比</th>
                </tr>
            </thead>
            <tbody>
                    <tr>
                        <td class="col-left">系统提示</td>
                        <td>${fmtNum(summary.promptCumTotals.system)}</td>
                        <td>${fmtPct(summary.promptCumTotals.system, summary.promptCumTotals.all)}</td>
                    </tr>
                    <tr>
                        <td class="col-left">工具定义</td>
                        <td>${fmtNum(summary.promptCumTotals.tools)}</td>
                        <td>${fmtPct(summary.promptCumTotals.tools, summary.promptCumTotals.all)}</td>
                    </tr>
                    <tr>
                        <td class="col-left">用户输入</td>
                        <td>${fmtNum(summary.promptCumTotals.user)}</td>
                        <td>${fmtPct(summary.promptCumTotals.user, summary.promptCumTotals.all)}</td>
                    </tr>
                    <tr>
                        <td class="col-left">思考</td>
                        <td>${fmtNum(summary.promptCumTotals.thinking)}</td>
                        <td>${fmtPct(summary.promptCumTotals.thinking, summary.promptCumTotals.all)}</td>
                    </tr>
                    <tr>
                        <td class="col-left">输出文本</td>
                        <td>${fmtNum(summary.promptCumTotals.assistant)}</td>
                        <td>${fmtPct(summary.promptCumTotals.assistant, summary.promptCumTotals.all)}</td>
                    </tr>
                    <tr>
                        <td class="col-left">工具调用</td>
                        <td>${fmtNum(summary.promptCumTotals.tool_use)}</td>
                        <td>${fmtPct(summary.promptCumTotals.tool_use, summary.promptCumTotals.all)}</td>
                    </tr>
                    <tr>
                        <td class="col-left">工具结果</td>
                        <td>${fmtNum(summary.promptCumTotals.tool_result)}</td>
                        <td>${fmtPct(summary.promptCumTotals.tool_result, summary.promptCumTotals.all)}</td>
                    </tr>
                    <tr style="font-weight:700;background:#f0f0f0;">
                        <td class="col-left">合计</td>
                        <td>${fmtNum(summary.promptCumTotals.all)}</td>
                        <td>100%</td>
                    </tr>
            </tbody>
        </table>
    </div>
</div>

<!-- ================================================================
     图表 A：逐轮 Token 用量（堆叠柱状图）
     ================================================================ -->
<div class="section">
    <div class="section-title"><span class="icon">📊</span> 逐轮 Token 用量（堆叠柱状图）</div>
    <div class="section-desc">
        每轮一根柱子，堆叠 = 新输入 + 缓存读取 + 缓存写入 + 输出。仅展示有 usage 的有效轮次。
    </div>
    <div class="chart-full">
        <div class="chart-scroll"><div class="chart-scroll-inner" style="min-width:${tokenChartMinWidth}px"><canvas id="chartTokenBar"></canvas></div></div>
    </div>
</div>

<!-- ================================================================
     图表 B：逐轮提示词构成 — 当前轮全量（堆叠柱状图）
     ================================================================ -->
<div class="section">
    <div class="section-title"><span class="icon">📝</span> 逐轮提示词构成 — 当前轮全量（堆叠柱状图）</div>
    <div class="section-desc">
        每轮一根柱子，堆叠 = 该轮请求中 7 类提示词成分，Y 轴为请求体大小。柱子骤降 = 上下文被压缩或重置。
    </div>
    <div class="chart-full">
        <div class="chart-scroll"><div class="chart-scroll-inner" style="min-width:${cumChartMinWidth}px"><canvas id="chartCumBar"></canvas></div></div>
    </div>
</div>

<!-- ================================================================
     对照图：提示词构成（柱状） + Token 用量（折线），上下两个独立图表
     ================================================================ -->
<div class="section">
    <div class="section-title"><span class="icon">🔀</span> 逐轮提示词构成 × Token 用量（对照图）</div>
    <div class="section-desc">
        上下两个图表 X 轴轮次对齐，各自独立 Y 轴：<strong>上图</strong> = 提示词构成（7 类成分堆叠）；
        <strong>下图</strong> = Token 用量（<strong>输入</strong>深灰实线 = 新输入 + 缓存读取 + 缓存写入，<strong>输出</strong>品红虚线 = output_tokens）。
    </div>
    <div class="chart-full">
        <h3>🔀 提示词构成 — 当前轮全量（堆叠柱状图）</h3>
        <div class="chart-scroll"><div class="chart-scroll-inner" style="min-width:${mixChartMinWidth}px"><canvas id="chartMixBar"></canvas></div></div>
    </div>
    <div style="height:16px"></div>
    <div class="chart-full">
        <h3>🔀 Token 用量（折线图）</h3>
        <div class="chart-scroll"><div class="chart-scroll-inner" style="min-width:${mixChartMinWidth}px"><canvas id="chartMixLine"></canvas></div></div>
    </div>
</div>

<!-- ================================================================
     工具扫描
     ================================================================ -->
<div class="section">
    <div class="section-title"><span class="icon">🔧</span> 工具扫描</div>
    <div class="section-desc">
        共注册 <strong>${toolStats.registered.length}</strong> 个工具，其中 <strong>${toolStats.usedCount}</strong> 个被使用，累计调用 <strong>${toolStats.totalCalls}</strong> 次。
    </div>
    ${toolStats.used.length > 0 ? `
    <div class="chart-full">
        <h3>🔧 工具调用次数</h3>
        <div style="height:${toolChartHeight}px;"><canvas id="chartToolUse"></canvas></div>
    </div>` : ''}
    ${renderToolScan(toolStats)}
</div>

</div><!-- .container -->

<div class="footer">
    由 analyze-round-tokens.js 生成 · ${new Date().toISOString()}
</div>

<!-- ================================================================
     Chart.js 图表初始化
     ================================================================ -->
<script>
// 通用配置（与 compare-round-tokens.js 保持一致）
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
Chart.defaults.font.size = 12;

// Y 轴刻度回调：格式化大数字
function bigNumTick(value) {
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
    return value;
}

// ================================================================
// 图表 A：逐轮 Token 用量（堆叠柱状图）
// 堆叠 = 新输入 + 缓存读取 + 缓存写入 + 输出（对应表格"总计"列）
// ================================================================
new Chart(document.getElementById('chartTokenBar'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify(tokenChartLabels)},
        datasets: ${JSON.stringify(tokenChartDatasets)},
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
            tooltip: {
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                titleFont: { weight: '600' },
                bodyFont: { size: 12 },
                padding: 12,
                cornerRadius: 8,
                displayColors: true,
                boxPadding: 4,
                callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString() + ' Token' }
            },
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 12 } } },
        }
    }
});

// ================================================================
// 图表 B：逐轮提示词构成 — 当前轮全量（堆叠柱状图）
// Y 轴 = 请求体大小
// ================================================================
new Chart(document.getElementById('chartCumBar'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify(cumChartLabels)},
        datasets: ${JSON.stringify(cumChartDatasets)},
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
                stacked: true,
                title: { display: true, text: '请求体大小', font: { weight: '600' } },
                ticks: { callback: bigNumTick, beginAtZero: true },
            }
        },
        plugins: {
            tooltip: {
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                titleFont: { weight: '600' },
                bodyFont: { size: 12 },
                padding: 12,
                cornerRadius: 8,
                displayColors: true,
                boxPadding: 4,
                callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString() }
            },
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 12 } } },
        }
    }
});

// ================================================================
// 图表 D-1：对照图上半部分 — 提示词构成柱状（单 Y 轴，字符数）
// ================================================================
new Chart(document.getElementById('chartMixBar'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify(cumChartLabels)},
        datasets: ${JSON.stringify(mixBarDatasets)},
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
                stacked: true,
                title: { display: true, text: '字符数', font: { weight: '600' } },
                ticks: { callback: bigNumTick, beginAtZero: true },
            }
        },
        plugins: {
            tooltip: {
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                titleFont: { weight: '600' },
                bodyFont: { size: 12 },
                padding: 12,
                cornerRadius: 8,
                displayColors: true,
                boxPadding: 4,
                callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString() + ' 字符' }
            },
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 12 } } },
        }
    }
});

// ================================================================
// 图表 D-2：对照图下半部分 — Token 用量折线（单 Y 轴，Token 数）
// ================================================================
new Chart(document.getElementById('chartMixLine'), {
    type: 'line',
    data: {
        labels: ${JSON.stringify(cumChartLabels)},
        datasets: ${JSON.stringify(mixLineDatasets)},
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { grid: { display: false } },
            y: {
                title: { display: true, text: 'Token 数', font: { weight: '600' } },
                ticks: { callback: bigNumTick, beginAtZero: true },
            }
        },
        plugins: {
            tooltip: {
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                titleFont: { weight: '600' },
                bodyFont: { size: 12 },
                padding: 12,
                cornerRadius: 8,
                displayColors: true,
                boxPadding: 4,
                callbacks: {
                    label: function(ctx) {
                        var v = ctx.parsed && ctx.parsed.y;
                        return ctx.dataset.label + ': ' + (v == null ? '无数据' : v.toLocaleString() + ' Token');
                    }
                }
            },
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 12 } } },
        }
    }
});

// ================================================================
// 工具扫描：工具调用次数（水平柱状图）
// ================================================================
${toolStats.used.length > 0 ? `
new Chart(document.getElementById('chartToolUse'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify(toolUsedNames)},
        datasets: [{
            label: '调用次数',
            data: ${JSON.stringify(toolUsedCounts)},
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: 'rgba(59, 130, 246, 1)',
            borderWidth: 1,
        }]
    },
    options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { precision: 0 } },
            y: { grid: { display: false } }
        },
        plugins: {
            tooltip: {
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                titleFont: { weight: '600' },
                padding: 12,
                cornerRadius: 8,
                callbacks: { label: ctx => '调用 ' + ctx.parsed.x + ' 次' }
            },
            legend: { display: false }
        }
    }
});
` : ''}
</script>

</body>
</html>`;
}

/**
 * 生成工具扫描区块的 HTML（已使用工具表 + 未使用工具标签）
 * @param {Object} toolStats - extractToolStats 的返回值
 * @returns {string} HTML 字符串
 */
function renderToolScan(toolStats) {
    let html = '';

    // 已使用工具表
    if (toolStats.used.length > 0) {
        html += '<div class="table-wrap"><table><thead><tr>';
        html += '<th class="col-left">工具名</th><th>调用次数</th><th>占比</th>';
        html += '</tr></thead><tbody>';
        for (const t of toolStats.used) {
            const pct = toolStats.totalCalls > 0
                ? ((t.count / toolStats.totalCalls) * 100).toFixed(1)
                : '0.0';
            html += `<tr>
                <td class="col-left" style="font-family:monospace;font-size:12px;">${escapeHtml(t.name)}</td>
                <td>${t.count}</td>
                <td>${pctCell(t.count, toolStats.totalCalls, 'sys')}</td>
            </tr>`;
        }
        html += `<tr style="font-weight:700;background:#f0f0f0;">
            <td class="col-left">合计</td>
            <td>${toolStats.totalCalls}</td>
            <td>100%</td>
        </tr>`;
        html += '</tbody></table></div>';
    }

    // 未使用工具
    const usedNames = new Set(toolStats.used.map(t => t.name));
    const unused = toolStats.registered.filter(t => !usedNames.has(t.name));
    if (unused.length > 0) {
        html += `<div style="margin-top:16px;">
            <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">
                未使用工具（${unused.length} 个）
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">`;
        for (const t of unused) {
            html += `<span style="display:inline-block;padding:3px 10px;font-size:12px;font-family:monospace;
                background:#f1f5f9;color:#94a3b8;border-radius:12px;border:1px solid #e2e8f0;"
                title="${escapeHtml(t.description)}">${escapeHtml(t.name)}</span>`;
        }
        html += '</div></div>';
    }

    return html;
}

/**
 * 生成带进度条的占比单元格 HTML
 * @param {number} value - 数值
 * @param {number} total - 总值
 * @param {string} cssClass - 进度条颜色类名
 * @returns {string} HTML 片段
 */
function pctCell(value, total, cssClass) {
    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
    return `<span class="pct-bar-wrap">`
        + `<span class="pct-bar"><span class="pct-bar-fill ${cssClass}" style="width:${pct}%"></span></span>`
        + `${pct}%</span>`;
}

/**
 * HTML 转义：防止 XSS
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
 * 用法：node analyze-round-tokens.js <日志目录路径>
 * 示例：node analyze-round-tokens.js ../test-scenarios/with-context-mode/scenario-1-日志分析/日志
 */
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('用法：node analyze-round-tokens.js <日志目录路径>');
        console.error('示例：node analyze-round-tokens.js ../test-scenarios/with-context-mode/scenario-1-日志分析/日志');
        console.error('');
        console.error('日志目录需包含以下文件：');
        console.error('  - summary-*.jsonl    （token 用量数据）');
        console.error('  - proxy-*-request.jsonl  （提示词组成数据）');
        console.error('  - proxy-*-response.jsonl （timing 耗时数据，可选）');
        process.exit(1);
    }

    // 解析输入路径（支持相对路径和绝对路径）
    const inputDir = path.resolve(args[0]);

    if (!fs.existsSync(inputDir)) {
        console.error(`错误：目录不存在 — ${inputDir}`);
        process.exit(1);
    }

    if (!fs.statSync(inputDir).isDirectory()) {
        console.error(`错误：路径不是目录 — ${inputDir}`);
        process.exit(1);
    }

    // 检查是否有 summary.jsonl（数据完整性校验）
    const summaryFile = findFile(inputDir, 'summary');
    if (!summaryFile) {
        console.error(`错误：目录中未找到 summary-*.jsonl 文件 — ${inputDir}`);
        process.exit(1);
    }

    console.log(`分析目录：${inputDir}`);

    // 生成场景标签：取目录名，如果父目录是 scenario-xxx 则包含
    const dirName = path.basename(inputDir);
    const parentDir = path.basename(path.dirname(inputDir));
    const label = parentDir.startsWith('scenario-')
        ? `${parentDir} / ${dirName}`
        : dirName;

    // 执行分析
    console.log(`正在分析：${label} ...`);
    const scenario = analyzeScenario(inputDir, label);
    console.log(`  完成：${scenario.summary.validRounds} 轮有效数据，`
        + `总 ${scenario.summary.totalAllTokens.toLocaleString('zh-CN')} Token，`
        + `缓存命中率 ${fmtPct(scenario.summary.totalCacheRead, scenario.summary.totalInputTokens + scenario.summary.totalCacheRead + scenario.summary.totalCacheCreation)}`);

    // 生成 HTML 报告
    const html = renderHTML(scenario);

    // 输出文件：与输入目录同名的 .html 文件，放在 funlist/ 目录下
    // 文件名规则：用场景路径生成唯一名称
    // 用输入目录的完整路径生成唯一文件名，避免不同场景覆盖
    // 从项目根目录开始取相对路径
    const relativePath = path.relative(path.resolve(__dirname, '..'), inputDir);
    const safeName = relativePath.replace(/[\/\\<>:"|?*]/g, '-').replace(/\s+/g, '-');
    const outputPath = path.join(__dirname, `round-tokens-${safeName}.html`);
    fs.writeFileSync(outputPath, html, 'utf-8');

    console.log(`报告已生成：${outputPath}`);
}

// ============================================================================
// 模块导出
// ============================================================================

// 作为模块使用时，导出核心函数供其他分析文件复用
module.exports = {
    analyzeScenario,
    extractTokenRows,
    extractPromptRows,
    extractTimingMap,
    extractToolStats,
    findFile,
    readJsonl,
    fmtNum,
    fmtPct,
    fmtTime,
    renderHTML,
    renderToolScan
};

// ============================================================================
// 直接运行入口
// ============================================================================

if (require.main === module) {
    main();
}