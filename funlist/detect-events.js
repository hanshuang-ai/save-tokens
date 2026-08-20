#!/usr/bin/env node

/**
 * ============================================================================
 * detect-events.js
 * 代理日志事件检测器：上下文压缩 / 系统提示词切换 / 子Agent调用 / 异常请求
 * ============================================================================
 *
 * 背景：
 *   Claude Code 在对话超出上下文窗口时会触发 compaction（上下文压缩），
 *   清空消息历史并用摘要替代。proxy.mjs 记录的 HTTP 层日志中没有显式的
 *   compaction 字段，但可以通过多个间接信号可靠检测。
 *
 *   当安装了 context-mode 插件时，系统提示词会在"完整版"（~29000 字符）
 *   和"精简版"（~3000-5000 字符）之间反复切换，这是该插件的核心行为特征。
 *
 * 检测方法：
 *
 * 1. 上下文压缩（Compaction）—— 需满足以下信号中的 ≥2 个：
 *    a. MSG_DROP     : messages 数量相比上一个正常请求骤降（降幅 >50%）
 *    b. SYS_SHRINK   : system 总字符数相比上一个正常请求骤降（降幅 >50%）
 *    c. BODY_DROP    : body_size 相比上一个正常请求骤降（降幅 >50%）
 *    d. MARKER       : 首条 user 消息包含特征文本
 *                       "This session is being continued from a previous conversation"
 *
 * 2. 系统提示词切换（System Prompt Switch）—— context-mode 插件特有：
 *    a. SYS_RESTORE   : system 字符数从精简（<10000）恢复到完整（≥10000）
 *    b. SYS_ABBREVIATE: system 字符数从完整（≥10000）切换到精简（<10000）
 *
 * 3. 子Agent调用（Sub-Agent Call）：
 *    在 messages 中查找 role=assistant 且 content 含 type=tool_use、name=Agent
 *    的 block。由于 messages 是累积的，同一个 tool_use block 会在后续请求中
 *    重复出现，因此通过 tool_use 的 id 字段去重，只统计首次出现。
 *
 * 4. 异常请求（Abnormal Request）：
 *    a. COUNT_TOKENS : URL 含 /v1/messages/count_tokens
 *    b. HTTP_ERROR   : summary 中 status 为 400 或 404
 *
 * 用法：
 *   node detect-events.js <日志目录路径>          # 单场景检测
 *   node detect-events.js --all                   # 扫描全部 10 个场景
 *   node detect-events.js --all --html            # 同时输出 HTML 报告
 *
 * 示例：
 *   node detect-events.js ../test-scenarios/with-context-mode/scenario-1-日志分析/日志
 *   node detect-events.js --all --html
 *
 * 作为模块：
 *   const { detectEvents, detectAllScenarios } = require('./detect-events');
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================================
// 常量
// ============================================================================

/** 系统提示词"完整版"阈值（字符数），≥此值视为完整 system prompt */
const SYS_FULL_THRESHOLD = 10000;

/** 系统提示词"精简版"阈值（字符数），<此值视为精简 system prompt */
// （即 < SYS_FULL_THRESHOLD 即为精简）

/** 骤降比例阈值：相比上一个正常请求降幅超过此比例视为"骤降" */
const DROP_RATIO = 0.5;

/** compaction 标记文本 */
const COMPACTION_MARKER = 'This session is being continued from a previous conversation';

/** count_tokens 请求的 URL 特征 */
const COUNT_TOKENS_URL = '/v1/messages/count_tokens';

// ============================================================================
// 工具函数（复用 analyze-round-tokens.js 的模式）
// ============================================================================

/**
 * 在目录中查找匹配前缀的文件
 * @param {string} dirPath - 目录路径
 * @param {string} prefix - 文件名前缀
 * @param {string} suffix - 文件名后缀
 * @returns {string|null}
 */
function findFile(dirPath, prefix, suffix = '') {
    if (!fs.existsSync(dirPath)) return null;
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
 * 读取 JSONL 文件
 * @param {string} filePath
 * @returns {Array<Object>}
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
            if (obj.id !== undefined) result.push(obj);
        } catch (_) { /* 忽略 */ }
    }
    return result;
}

/**
 * 计算 system 字段的总字符数
 * system 可能是 string 或 [{ type, text }, ...]
 * @param {string|Array|undefined} system
 * @returns {number}
 */
function getSystemLength(system) {
    if (typeof system === 'string') return system.length;
    if (Array.isArray(system)) {
        return system.reduce((sum, block) => {
            if (block && typeof block.text === 'string') return sum + block.text.length;
            return sum;
        }, 0);
    }
    return 0;
}

/**
 * 从首条 user 消息中提取纯文本
 * @param {Array} messages
 * @returns {string}
 */
function getFirstUserText(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return '';
    const first = messages[0];
    if (first.role !== 'user') return '';
    const content = first.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter(b => b && typeof b.text === 'string')
            .map(b => b.text)
            .join('\n');
    }
    return '';
}

/**
 * 从所有 assistant 消息中提取 tool_use blocks
 * @param {Array} messages
 * @returns {Array<Object>} tool_use blocks
 */
function extractToolUseBlocks(messages) {
    const blocks = [];
    if (!Array.isArray(messages)) return blocks;
    for (const msg of messages) {
        if (msg.role !== 'assistant') continue;
        const content = msg.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
            if (block && block.type === 'tool_use') {
                blocks.push(block);
            }
        }
    }
    return blocks;
}

// ============================================================================
// 核心检测层
// ============================================================================

/**
 * 检测单个日志目录中的事件
 *
 * @param {string} dirPath - 日志目录路径
 * @param {string} [scenarioName] - 场景名称（用于报告显示）
 * @returns {Object} 检测结果 { scenario, summary, events, timeline }
 */
function detectEvents(dirPath, scenarioName) {
    const name = scenarioName || path.basename(path.dirname(dirPath));

    const requestFile = findFile(dirPath, 'proxy', '-request');
    const summaryFile = findFile(dirPath, 'summary');

    if (!requestFile) {
        return {
            scenario: name,
            error: '未找到 request 日志文件',
            summary: {},
            events: [],
            timeline: []
        };
    }

    const requests = readJsonl(requestFile);
    const summaries = summaryFile ? readJsonl(summaryFile) : [];

    // 构建 summary 查找表 { id: summary }
    const summaryMap = {};
    for (const s of summaries) {
        summaryMap[s.id] = s;
    }

    const events = [];       // 检测到的事件列表
    const timeline = [];     // 每条请求的概要信息

    // 跟踪上一个"正常请求"（非 count_tokens、有 messages）的状态
    let prevNormal = null;   // { msgCount, sysLen, bodySize }
    // 跟踪上一个 system 长度（用于检测切换）
    let prevSysLen = null;
    // 已见过的 tool_use id 集合（用于 Agent 去重）
    const seenToolUseIds = new Set();

    for (let i = 0; i < requests.length; i++) {
        const entry = requests[i];
        const req = entry.request || {};
        const rid = entry.id || (i + 1);
        const url = req.url || '';
        const messages = req.messages || [];
        const system = req.system;
        const bodySize = req.body_size || 0;

        const msgCount = messages.length;
        const sysLen = getSystemLength(system);
        const isCountTokens = url.includes(COUNT_TOKENS_URL);

        // summary 信息
        const summ = summaryMap[rid] || {};
        const status = summ.status || null;
        const isError = status === 400 || status === 404;

        // ---- timeline 记录 ----
        timeline.push({
            id: rid,
            url: url,
            isCountTokens,
            status,
            isError,
            msgCount,
            sysLen,
            bodySize,
        });

        // ================================================================
        // 检测 1: 异常请求
        // ================================================================
        if (isCountTokens) {
            events.push({
                id: rid,
                type: 'COUNT_TOKENS',
                severity: 'info',
                description: `count_tokens 请求（body_size=${bodySize}）`,
                details: { bodySize }
            });
        }

        if (isError && !isCountTokens) {
            events.push({
                id: rid,
                type: 'HTTP_ERROR',
                severity: 'warn',
                description: `HTTP ${status} 错误`,
                details: { status, url }
            });
        }

        // count_tokens 请求不参与后续检测（它没有正常的 messages/system）
        if (isCountTokens) continue;

        // ================================================================
        // 检测 2: 上下文压缩（Compaction）
        // ================================================================
        if (prevNormal) {
            const signals = [];

            // 信号 a: MSG_DROP
            if (prevNormal.msgCount > 2 && msgCount < prevNormal.msgCount * DROP_RATIO) {
                signals.push({
                    signal: 'MSG_DROP',
                    from: prevNormal.msgCount,
                    to: msgCount,
                });
            }

            // 信号 b: SYS_SHRINK
            if (prevNormal.sysLen > SYS_FULL_THRESHOLD && sysLen < prevNormal.sysLen * DROP_RATIO) {
                signals.push({
                    signal: 'SYS_SHRINK',
                    from: prevNormal.sysLen,
                    to: sysLen,
                });
            }

            // 信号 c: BODY_DROP
            if (prevNormal.bodySize > 10000 && bodySize < prevNormal.bodySize * DROP_RATIO) {
                signals.push({
                    signal: 'BODY_DROP',
                    from: prevNormal.bodySize,
                    to: bodySize,
                });
            }

            // 信号 d: COMPACTION_MARKER
            const firstUserText = getFirstUserText(messages);
            if (firstUserText.includes(COMPACTION_MARKER)) {
                signals.push({
                    signal: 'MARKER',
                    text: firstUserText.substring(0, 120) + (firstUserText.length > 120 ? '...' : ''),
                });
            }

            // 需 ≥2 个信号才确认 compaction（MARKER 单独即可确认）
            const hasMarker = signals.some(s => s.signal === 'MARKER');
            if (hasMarker || signals.length >= 2) {
                events.push({
                    id: rid,
                    type: 'COMPACTION',
                    severity: 'critical',
                    description: `上下文压缩触发（${signals.length} 个信号: ${signals.map(s => s.signal).join(', ')}）`,
                    details: {
                        signals,
                        prevMsgCount: prevNormal.msgCount,
                        prevSysLen: prevNormal.sysLen,
                        prevBodySize: prevNormal.bodySize,
                        curMsgCount: msgCount,
                        curSysLen: sysLen,
                        curBodySize: bodySize,
                    }
                });
            }
        }

        // ================================================================
        // 检测 3: 系统提示词切换（System Prompt Switch）
        // ================================================================
        if (prevSysLen !== null && !isError) {
            const wasFull = prevSysLen >= SYS_FULL_THRESHOLD;
            const isFull = sysLen >= SYS_FULL_THRESHOLD;

            if (wasFull && !isFull) {
                events.push({
                    id: rid,
                    type: 'SYS_ABBREVIATE',
                    severity: 'info',
                    description: `系统提示词切换为精简版（${prevSysLen} → ${sysLen} 字符）`,
                    details: { from: prevSysLen, to: sysLen }
                });
            } else if (!wasFull && isFull) {
                events.push({
                    id: rid,
                    type: 'SYS_RESTORE',
                    severity: 'info',
                    description: `系统提示词恢复为完整版（${prevSysLen} → ${sysLen} 字符）`,
                    details: { from: prevSysLen, to: sysLen }
                });
            }
        }

        // ================================================================
        // 检测 4: 子Agent调用（Sub-Agent Call）
        // ================================================================
        const toolUseBlocks = extractToolUseBlocks(messages);
        for (const block of toolUseBlocks) {
            if (block.name !== 'Agent') continue;

            // 去重：通过 tool_use id
            const blockId = block.id;
            if (blockId && seenToolUseIds.has(blockId)) continue;
            if (blockId) seenToolUseIds.add(blockId);

            const input = block.input || {};
            events.push({
                id: rid,
                type: 'AGENT_CALL',
                severity: 'info',
                description: `子Agent调用: ${input.subagent_type || '?'} - ${input.description || '?'}`,
                details: {
                    subagentType: input.subagent_type || null,
                    description: input.description || null,
                    runInBackground: input.run_in_background || false,
                    promptPreview: input.prompt
                        ? input.prompt.substring(0, 100) + (input.prompt.length > 100 ? '...' : '')
                        : null,
                    toolUseId: blockId || null,
                }
            });
        }

        // ---- 更新 prevNormal ----
        // 只有有 messages 的正常请求才更新 prevNormal
        if (msgCount > 0 && !isError) {
            prevNormal = { msgCount, sysLen, bodySize };
        }
        prevSysLen = sysLen;
    }

    // ---- 汇总统计 ----
    const compactionEvents = events.filter(e => e.type === 'COMPACTION');
    const agentEvents = events.filter(e => e.type === 'AGENT_CALL');
    const sysSwitchEvents = events.filter(e => e.type === 'SYS_ABBREVIATE' || e.type === 'SYS_RESTORE');
    const countTokensEvents = events.filter(e => e.type === 'COUNT_TOKENS');
    const errorEvents = events.filter(e => e.type === 'HTTP_ERROR');

    const summary = {
        totalRequests: requests.length,
        compactionCount: compactionEvents.length,
        agentCallCount: agentEvents.length,
        sysSwitchCount: sysSwitchEvents.length,
        sysRestoreCount: events.filter(e => e.type === 'SYS_RESTORE').length,
        sysAbbreviateCount: events.filter(e => e.type === 'SYS_ABBREVIATE').length,
        countTokensCount: countTokensEvents.length,
        errorCount: errorEvents.length,
    };

    return {
        scenario: name,
        summary,
        events,
        timeline,
    };
}

// ============================================================================
// 多场景扫描
// ============================================================================

/**
 * 自动发现并扫描全部场景
 * @param {string} baseDir - test-scenarios 根目录
 * @returns {Array<Object>} 每个场景的检测结果
 */
function detectAllScenarios(baseDir) {
    const results = [];
    const modes = ['with-context-mode', 'without-context-mode'];

    for (const mode of modes) {
        const modeDir = path.join(baseDir, mode);
        if (!fs.existsSync(modeDir)) continue;

        for (const d of fs.readdirSync(modeDir).sort()) {
            const logDir = path.join(modeDir, d, '日志');
            if (!fs.existsSync(logDir)) continue;

            const scenarioName = `${mode}/${d}`;
            const result = detectEvents(logDir, scenarioName);
            results.push(result);
        }
    }

    return results;
}

// ============================================================================
// 报告输出
// ============================================================================

/**
 * 格式化数字
 */
function fmt(n) {
    if (n === null || n === undefined) return '-';
    return n.toLocaleString('en-US');
}

/**
 * 输出控制台文本报告
 * @param {Array<Object>} results
 */
function printConsoleReport(results) {
    console.log('');
    console.log('═'.repeat(80));
    console.log('  代理日志事件检测报告');
    console.log('═'.repeat(80));

    // ---- 汇总表 ----
    console.log('');
    console.log('  ┌─ 汇总 ──────────────────────────────────────────────────────────────────┐');
    console.log('  │ 场景                              请求  压缩  Agent  系统切换  count_tok  错误  │');
    console.log('  ├────────────────────────────────────────────────────────────────────────────┤');

    let totals = { requests: 0, compaction: 0, agent: 0, sysSwitch: 0, countTokens: 0, errors: 0 };

    for (const r of results) {
        const s = r.summary;
        const name = r.scenario.padEnd(34).substring(0, 34);
        const line = `  │ ${name} ${String(s.totalRequests).padStart(4)}  ${String(s.compactionCount).padStart(4)}  ${String(s.agentCallCount).padStart(5)}  ${String(s.sysSwitchCount).padStart(8)}  ${String(s.countTokensCount).padStart(9)}  ${String(s.errorCount).padStart(4)}  │`;
        console.log(line);

        totals.requests += s.totalRequests || 0;
        totals.compaction += s.compactionCount || 0;
        totals.agent += s.agentCallCount || 0;
        totals.sysSwitch += s.sysSwitchCount || 0;
        totals.countTokens += s.countTokensCount || 0;
        totals.errors += s.errorCount || 0;
    }

    console.log('  ├────────────────────────────────────────────────────────────────────────────┤');
    console.log(`  │ ${'合计'.padEnd(34)} ${String(totals.requests).padStart(4)}  ${String(totals.compaction).padStart(4)}  ${String(totals.agent).padStart(5)}  ${String(totals.sysSwitch).padStart(8)}  ${String(totals.countTokens).padStart(9)}  ${String(totals.errors).padStart(4)}  │`);
    console.log('  └────────────────────────────────────────────────────────────────────────────┘');

    // ---- 每个场景的事件明细 ----
    for (const r of results) {
        if (r.error) {
            console.log(`\n  ✗ ${r.scenario}: ${r.error}`);
            continue;
        }

        const s = r.summary;
        if (s.compactionCount === 0 && s.agentCallCount === 0 && s.sysSwitchCount === 0) {
            console.log(`\n  ○ ${r.scenario} (${s.totalRequests} 请求) — 无压缩/Agent/系统切换事件`);
            continue;
        }

        console.log(`\n  ● ${r.scenario} (${s.totalRequests} 请求)`);
        console.log(`    压缩: ${s.compactionCount}  Agent: ${s.agentCallCount}  系统切换: ${s.sysSwitchCount} (恢复${s.sysRestoreCount}/精简${s.sysAbbreviateCount})  count_tokens: ${s.countTokensCount}  错误: ${s.errorCount}`);

        // 按类型分组打印关键事件
        const compactionEvents = r.events.filter(e => e.type === 'COMPACTION');
        const agentEvents = r.events.filter(e => e.type === 'AGENT_CALL');
        const sysEvents = r.events.filter(e => e.type === 'SYS_RESTORE' || e.type === 'SYS_ABBREVIATE');

        if (compactionEvents.length > 0) {
            console.log(`    ── 上下文压缩 (${compactionEvents.length} 次) ──`);
            for (const e of compactionEvents) {
                const sigs = e.details.signals.map(s => {
                    if (s.from !== undefined) return `${s.signal}(${s.from}→${s.to})`;
                    return s.signal;
                }).join(', ');
                console.log(`      [id=${e.id}] ${sigs}`);
            }
        }

        if (agentEvents.length > 0) {
            console.log(`    ── 子Agent调用 (${agentEvents.length} 次) ──`);
            for (const e of agentEvents) {
                const bg = e.details.runInBackground ? ' [后台]' : '';
                console.log(`      [id=${e.id}] ${e.details.subagentType}${bg}: ${e.details.description}`);
            }
        }

        if (sysEvents.length > 0) {
            console.log(`    ── 系统提示词切换 (${sysEvents.length} 次) ──`);
            // 只打印前10次和后2次，避免输出过长
            const showEvents = sysEvents.length > 12
                ? [...sysEvents.slice(0, 10), ...sysEvents.slice(-2)]
                : sysEvents;
            for (const e of showEvents) {
                const tag = e.type === 'SYS_RESTORE' ? '恢复' : '精简';
                console.log(`      [id=${e.id}] ${tag}: ${e.details.from} → ${e.details.to}`);
            }
            if (sysEvents.length > 12) {
                console.log(`      ... 共 ${sysEvents.length} 次（省略中间部分）`);
            }
        }
    }

    console.log('');
    console.log('═'.repeat(80));
    console.log('');
}

/**
 * 生成 HTML 报告
 * @param {Array<Object>} results
 * @param {string} outputPath
 */
function generateHtmlReport(results, outputPath) {
    // 汇总数据
    let totals = { requests: 0, compaction: 0, agent: 0, sysSwitch: 0, countTokens: 0, errors: 0 };
    for (const r of results) {
        const s = r.summary;
        totals.requests += s.totalRequests || 0;
        totals.compaction += s.compactionCount || 0;
        totals.agent += s.agentCallCount || 0;
        totals.sysSwitch += s.sysSwitchCount || 0;
        totals.countTokens += s.countTokensCount || 0;
        totals.errors += s.errorCount || 0;
    }

    // 场景卡片 HTML
    const cardsHtml = results.map(r => {
        const s = r.summary;
        if (r.error) {
            return `<div class="card card-error"><h3>${r.scenario}</h3><p class="error">${r.error}</p></div>`;
        }

        const compactionEvents = r.events.filter(e => e.type === 'COMPACTION');
        const agentEvents = r.events.filter(e => e.type === 'AGENT_CALL');
        const sysEvents = r.events.filter(e => e.type === 'SYS_RESTORE' || e.type === 'SYS_ABBREVIATE');

        let eventsHtml = '';

        if (compactionEvents.length > 0) {
            eventsHtml += `<div class="event-group"><h4>上下文压缩 (${compactionEvents.length})</h4><table><tr><th>ID</th><th>信号</th><th>详情</th></tr>`;
            for (const e of compactionEvents) {
                const sigs = e.details.signals.map(s => {
                    if (s.from !== undefined) return `${s.signal}(${fmt(s.from)}→${fmt(s.to)})`;
                    return s.signal;
                }).join(', ');
                eventsHtml += `<tr><td>${e.id}</td><td class="sev-critical">${sigs}</td><td>msgs ${e.details.prevMsgCount}→${e.details.curMsgCount}, sys ${fmt(e.details.prevSysLen)}→${fmt(e.details.curSysLen)}, body ${fmt(e.details.prevBodySize)}→${fmt(e.details.curBodySize)}</td></tr>`;
            }
            eventsHtml += '</table></div>';
        }

        if (agentEvents.length > 0) {
            eventsHtml += `<div class="event-group"><h4>子Agent调用 (${agentEvents.length})</h4><table><tr><th>ID</th><th>类型</th><th>描述</th><th>后台</th></tr>`;
            for (const e of agentEvents) {
                eventsHtml += `<tr><td>${e.id}</td><td>${e.details.subagentType || '?'}</td><td>${e.details.description || ''}</td><td>${e.details.runInBackground ? '是' : '否'}</td></tr>`;
            }
            eventsHtml += '</table></div>';
        }

        if (sysEvents.length > 0) {
            eventsHtml += `<div class="event-group"><h4>系统提示词切换 (${sysEvents.length})</h4><table><tr><th>ID</th><th>方向</th><th>从</th><th>到</th></tr>`;
            const showEvents = sysEvents.length > 20 ? [...sysEvents.slice(0, 18), ...sysEvents.slice(-2)] : sysEvents;
            for (const e of showEvents) {
                const tag = e.type === 'SYS_RESTORE' ? '恢复完整' : '切换精简';
                const cls = e.type === 'SYS_RESTORE' ? 'sev-info' : 'sev-warn';
                eventsHtml += `<tr><td>${e.id}</td><td class="${cls}">${tag}</td><td>${fmt(e.details.from)}</td><td>${fmt(e.details.to)}</td></tr>`;
            }
            if (sysEvents.length > 20) {
                eventsHtml += `<tr><td colspan="4" class="more">... 共 ${sysEvents.length} 次</td></tr>`;
            }
            eventsHtml += '</table></div>';
        }

        if (!eventsHtml) {
            eventsHtml = '<p class="no-events">无压缩 / Agent / 系统切换事件</p>';
        }

        return `
        <div class="card">
            <h3>${r.scenario}</h3>
            <div class="card-stats">
                <span class="stat">请求: <b>${s.totalRequests}</b></span>
                <span class="stat ${s.compactionCount > 0 ? 'stat-critical' : ''}">压缩: <b>${s.compactionCount}</b></span>
                <span class="stat ${s.agentCallCount > 0 ? 'stat-info' : ''}">Agent: <b>${s.agentCallCount}</b></span>
                <span class="stat ${s.sysSwitchCount > 0 ? 'stat-warn' : ''}">系统切换: <b>${s.sysSwitchCount}</b></span>
                <span class="stat">count_tokens: <b>${s.countTokensCount}</b></span>
                <span class="stat ${s.errorCount > 0 ? 'stat-warn' : ''}">错误: <b>${s.errorCount}</b></span>
            </div>
            ${eventsHtml}
        </div>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>代理日志事件检测报告</title>
<style>
    :root {
        --bg: #1a1a2e; --card: #16213e; --border: #0f3460;
        --text: #e0e0e0; --text-dim: #8892b0;
        --critical: #ff6b6b; --warn: #ffd93d; --info: #6bcb77; --accent: #4d96ff;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        background: var(--bg); color: var(--text);
        font-family: -apple-system, 'Segoe UI', sans-serif;
        padding: 24px; line-height: 1.6;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 18px; color: var(--text-dim); margin-bottom: 16px; font-weight: normal; }
    h3 { font-size: 16px; margin-bottom: 12px; color: var(--accent); }
    h4 { font-size: 13px; margin-bottom: 8px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; }

    .summary-bar {
        display: flex; gap: 16px; flex-wrap: wrap;
        background: var(--card); border: 1px solid var(--border);
        border-radius: 8px; padding: 16px 24px; margin-bottom: 24px;
    }
    .summary-bar .item { text-align: center; }
    .summary-bar .item .num { font-size: 28px; font-weight: bold; }
    .summary-bar .item .label { font-size: 12px; color: var(--text-dim); }
    .summary-bar .item.critical .num { color: var(--critical); }
    .summary-bar .item.info .num { color: var(--info); }
    .summary-bar .item.warn .num { color: var(--warn); }

    .card {
        background: var(--card); border: 1px solid var(--border);
        border-radius: 8px; padding: 20px; margin-bottom: 16px;
    }
    .card-error { border-color: var(--critical); }

    .card-stats {
        display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
    }
    .stat {
        font-size: 13px; padding: 4px 10px; border-radius: 4px;
        background: rgba(255,255,255,0.05);
    }
    .stat b { font-size: 15px; }
    .stat-critical { background: rgba(255,107,107,0.15); color: var(--critical); }
    .stat-info { background: rgba(107,203,119,0.15); color: var(--info); }
    .stat-warn { background: rgba(255,217,61,0.15); color: var(--warn); }

    .event-group { margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 6px 10px; color: var(--text-dim); border-bottom: 1px solid var(--border); }
    td { padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .sev-critical { color: var(--critical); font-weight: bold; }
    .sev-warn { color: var(--warn); }
    .sev-info { color: var(--info); }
    .more { text-align: center; color: var(--text-dim); font-style: italic; }
    .no-events { color: var(--text-dim); font-style: italic; padding: 8px 0; }
    .error { color: var(--critical); }
</style>
</head>
<body>
<h1>代理日志事件检测报告</h1>
<h2>生成时间: ${new Date().toISOString()}</h2>

<div class="summary-bar">
    <div class="item"><div class="num">${totals.requests}</div><div class="label">总请求</div></div>
    <div class="item critical"><div class="num">${totals.compaction}</div><div class="label">上下文压缩</div></div>
    <div class="item info"><div class="num">${totals.agent}</div><div class="label">子Agent调用</div></div>
    <div class="item warn"><div class="num">${totals.sysSwitch}</div><div class="label">系统提示词切换</div></div>
    <div class="item"><div class="num">${totals.countTokens}</div><div class="label">count_tokens</div></div>
    <div class="item warn"><div class="num">${totals.errors}</div><div class="label">HTTP错误</div></div>
</div>

${cardsHtml}
</body>
</html>`;

    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`\n  HTML 报告已生成: ${outputPath}\n`);
}

// ============================================================================
// CLI 入口
// ============================================================================

function main() {
    const args = process.argv.slice(2);
    const allFlag = args.includes('--all');
    const htmlFlag = args.includes('--html');
    const dirArg = args.find(a => !a.startsWith('--'));

    if (!allFlag && !dirArg) {
        console.log('用法:');
        console.log('  node detect-events.js <日志目录路径>          # 单场景检测');
        console.log('  node detect-events.js --all                   # 扫描全部场景');
        console.log('  node detect-events.js --all --html            # 扫描并输出 HTML 报告');
        console.log('');
        console.log('示例:');
        console.log('  node detect-events.js ../test-scenarios/with-context-mode/scenario-1-日志分析/日志');
        process.exit(0);
    }

    let results;

    if (allFlag) {
        // 自动发现 test-scenarios 目录
        const scriptDir = __dirname;
        const baseDir = path.resolve(scriptDir, '..', 'test-scenarios');
        if (!fs.existsSync(baseDir)) {
            console.error(`未找到 test-scenarios 目录: ${baseDir}`);
            process.exit(1);
        }
        results = detectAllScenarios(baseDir);
    } else {
        const dirPath = path.resolve(dirArg);
        if (!fs.existsSync(dirPath)) {
            console.error(`目录不存在: ${dirPath}`);
            process.exit(1);
        }
        results = [detectEvents(dirPath)];
    }

    printConsoleReport(results);

    if (htmlFlag) {
        const outputPath = path.join(__dirname, 'detect-events-report.html');
        generateHtmlReport(results, outputPath);
    }
}

// 模块导出 + CLI
if (require.main === module) {
    main();
}

module.exports = { detectEvents, detectAllScenarios, printConsoleReport, generateHtmlReport };
