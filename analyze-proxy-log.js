#!/usr/bin/env node
/**
 * analyze-proxy-log.js — 分析 proxy.mjs 产出的分流日志，生成 HTML 报告
 *
 * 用法:
 *   node analyze-proxy-log.js <日志目录或文件>
 *   输出到终端，重定向到文件: node analyze-proxy-log.js proxy-logs/ > report.html
 *   生成可点击详情页: node analyze-proxy-log.js proxy-logs/ --out proxy-report
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

async function loadSession(target) {
  let st;
  try {
    st = fs.statSync(target);
  } catch {
    console.error(`错误: 路径不存在 "${target}"`);
    process.exit(1);
  }

  const files = [];
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(target)) {
      if (f.endsWith('.jsonl') && !f.startsWith('summary-')) files.push(path.join(target, f));
    }
  } else {
    files.push(target);
  }
  files.sort();

  const reqById = new Map();
  const respById = new Map();
  const errorById = new Map();
  const parseErrors = [];
  let lineCount = 0;

  for (const f of files) {
    const rl = readline.createInterface({
      input: fs.createReadStream(f, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    let lineNo = 0;
    for await (const line of rl) {
      lineNo++;
      if (!line.trim()) continue;
      lineCount++;
      let j;
      try {
        j = JSON.parse(line);
      } catch (err) {
        parseErrors.push({ file: f, line: lineNo, error: err.message });
        continue;
      }
      if (j.phase === 'request') {
        reqById.set(String(j.id), j);
      } else if (j.phase === 'response') {
        respById.set(String(j.id), j);
      } else if (j.phase === 'error') {
        errorById.set(String(j.id), j);
      } else if (j.request && j.response) {
        reqById.set(String(j.id), j);
        respById.set(String(j.id), j);
      } else if (j.response) {
        respById.set(String(j.id), j);
      } else if (j.request) {
        reqById.set(String(j.id), j);
      }
    }
  }

  const ids = new Set([...reqById.keys(), ...respById.keys(), ...errorById.keys()]);
  const rows = [...ids].map(id => ({
    id,
    req: reqById.get(id) || null,
    resp: respById.get(id) || null,
    error: errorById.get(id) || null,
  }));
  rows.sort((a, b) => compareIds(a.id, b.id));

  return { rows, files, parseErrors, lineCount };
}

function compareIds(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b), 'zh-CN', { numeric: true });
}

function getRequestBody(reqLine) {
  const body = reqLine?.request?.body;
  return body && typeof body === 'object' ? body : {};
}

function getUsage(resp) {
  return resp?.response?.usage || resp?.usage || {};
}

function hasUsage(resp) {
  const u = getUsage(resp);
  return u.input_tokens !== undefined;
}

function getTiming(resp) {
  return resp?.timing || resp?.response?.timing || {};
}

function normalizeTextBlock(text) {
  let t = String(text || '').trim();
  if (!t) return '';
  if (t.startsWith('<system-reminder>') || t.startsWith('<system-')) return '';
  const sm = t.match(/<session>\s*\n*\s*(.+?)\s*\n*\s*<\/session>/s);
  if (sm) t = sm[1].trim();
  if (/write the title in the predominant language/i.test(t)) return '';
  if (/the user stepped away and is coming back|recap in under/i.test(t)) return '';
  return t;
}

function flattenContentText(content) {
  if (typeof content === 'string') return normalizeTextBlock(content);
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const b of content) {
    if (b?.type === 'text' && b.text) {
      const t = normalizeTextBlock(b.text);
      if (t) parts.push(t);
    }
  }
  return parts.join('\n');
}

function renderContent(content) {
  if (typeof content === 'string') return esc(normalizeTextBlock(content));
  if (!Array.isArray(content)) return esc(String(content ?? ''));

  const items = [];
  for (const b of content) {
    if (!b || typeof b !== 'object') {
      items.push(esc(String(b)));
    } else if (b.type === 'text' && b.text) {
      const t = normalizeTextBlock(b.text);
      if (t) items.push(esc(t));
    } else if (b.type === 'tool_result') {
      items.push(`[tool_result:${fmtNum(estimateToolResultChars(b))} chars]`);
    } else if (b.type === 'tool_use') {
      items.push('[tool_use:' + esc(b.name || '?') + ']');
    } else if (b.type === 'thinking' || b.type === 'redacted_thinking') {
      items.push('[thinking]');
    } else {
      items.push('[' + esc(b.type || '?') + ']');
    }
  }
  return items.join(' | ');
}

function getTopLevelSystemText(reqLine) {
  const body = getRequestBody(reqLine);
  const system = body.system ?? reqLine?.request?.system_preview;
  if (typeof system === 'string') return normalizeTextBlock(system);
  if (Array.isArray(system)) return flattenContentText(system);
  if (system && typeof system === 'object') return JSON.stringify(system, null, 2);
  return '';
}

/** 提取最后一次真实用户输入（跳过 system-reminder、tool_result、标题生成指令） */
function lastUserPrompt(reqLine) {
  const msgs = getRequestBody(reqLine).messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== 'user') continue;
    const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content || '') }];
    if (blocks.some(b => b.type === 'tool_result')) continue;
    const text = flattenContentText(m.content);
    if (text) return text;
  }
  return '(无 user 消息)';
}

/** 按角色拆分请求消息，返回 HTML 片段（完整内容，不截断） */
function messagesByRole(reqLine) {
  const msgs = getRequestBody(reqLine).messages || [];
  const groups = { user: [], system: [], assistant: [] };
  const topSystem = getTopLevelSystemText(reqLine);
  if (topSystem) groups.system.push(esc(topSystem));

  for (const m of msgs) {
    const role = m.role;
    if (!groups[role]) continue;
    const desc = renderContent(m.content);
    if (desc) groups[role].push(desc);
  }
  return {
    user: groups.user.join('<br>') || '-',
    system: groups.system.join('<br>') || '-',
    assistant: groups.assistant.join('<br>') || '-',
  };
}

function analyzeMessages(reqLine) {
  const body = getRequestBody(reqLine);
  const msgs = body.messages || [];
  const stats = {
    messageCount: Array.isArray(msgs) ? msgs.length : 0,
    roleCounts: {},
    blockCounts: {},
    textChars: { user: 0, system: 0, assistant: 0 },
    toolUseHistory: 0,
    toolResultHistory: 0,
    toolUseInputChars: 0,
    toolResultChars: 0,
    topLevelSystemChars: getTopLevelSystemText(reqLine).length,
  };
  if (stats.topLevelSystemChars) {
    stats.roleCounts.system = (stats.roleCounts.system || 0) + 1;
    stats.textChars.system += stats.topLevelSystemChars;
  }

  for (const m of msgs) {
    const role = m.role || '?';
    stats.roleCounts[role] = (stats.roleCounts[role] || 0) + 1;
    const blocks = Array.isArray(m.content) ? m.content : [{ type: 'string', text: m.content }];
    for (const b of blocks) {
      const type = b?.type || '?';
      stats.blockCounts[type] = (stats.blockCounts[type] || 0) + 1;
      if (type === 'text') {
        stats.textChars[role] = (stats.textChars[role] || 0) + normalizeTextBlock(b.text).length;
      } else if (type === 'string') {
        stats.textChars[role] = (stats.textChars[role] || 0) + normalizeTextBlock(b.text).length;
      } else if (type === 'tool_use') {
        stats.toolUseHistory++;
        stats.toolUseInputChars += JSON.stringify(b.input || {}).length;
      } else if (type === 'tool_result') {
        stats.toolResultHistory++;
        stats.toolResultChars += estimateToolResultChars(b);
      }
    }
  }
  return stats;
}

function estimateToolResultChars(block) {
  if (!block) return 0;
  const c = block.content;
  if (typeof c === 'string') return c.length;
  if (Array.isArray(c)) {
    return c.reduce((n, item) => {
      if (typeof item === 'string') return n + item.length;
      if (item?.text) return n + String(item.text).length;
      return n + JSON.stringify(item || {}).length;
    }, 0);
  }
  return JSON.stringify(c ?? '').length;
}

/** 从响应中提取完整文本回复（不截断） */
function fullResponseText(resp) {
  if (!resp) return '-';
  const events = resp?.response?.sse_events || resp?.sse_events || [];
  let text = '';
  for (const e of events) {
    if (e.type === 'content_block_delta' && e.data?.delta?.type === 'text_delta') {
      text += e.data.delta.text || '';
    }
  }
  if (text) return text;

  const body = resp?.response?.body;
  if (body && typeof body === 'object' && Array.isArray(body.content)) {
    return body.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text)
      .join('\n') || '-';
  }
  return '-';
}

function isTitleRequest(reqLine) {
  const msgs = getRequestBody(reqLine).messages || [];
  if (msgs.length > 2) return false; // 标题请求通常只有 1-2 条消息
  for (const m of msgs) {
    const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content || '') }];
    for (const c of blocks) {
      if (c.type === 'text' && c.text && /write the title in the predominant language/i.test(c.text)) {
        return true;
      }
    }
  }
  return false;
}

function analyzeSse(resp) {
  const events = resp?.response?.sse_events || resp?.sse_events || [];
  const out = {
    eventCounts: {},
    deltaCounts: {},
    blockCounts: {},
    textChars: 0,
    thinkingChars: 0,
    toolJsonChars: 0,
    signatureChars: 0,
    firstTextMs: null,
    firstThinkingMs: null,
    firstToolMs: null,
    stopReason: '-',
  };

  for (const e of events) {
    const type = e.type || '?';
    out.eventCounts[type] = (out.eventCounts[type] || 0) + 1;

    const cb = e.data?.content_block;
    if (e.type === 'content_block_start' && cb?.type) {
      out.blockCounts[cb.type] = (out.blockCounts[cb.type] || 0) + 1;
      if (cb.type === 'text' && out.firstTextMs == null) out.firstTextMs = e.t_ms ?? null;
      if ((cb.type === 'thinking' || cb.type === 'redacted_thinking') && out.firstThinkingMs == null) out.firstThinkingMs = e.t_ms ?? null;
      if (cb.type === 'tool_use' && out.firstToolMs == null) out.firstToolMs = e.t_ms ?? null;
    }

    const delta = e.data?.delta;
    if (delta?.type) {
      out.deltaCounts[delta.type] = (out.deltaCounts[delta.type] || 0) + 1;
      if (delta.type === 'text_delta') {
        if (out.firstTextMs == null) out.firstTextMs = e.t_ms ?? null;
        out.textChars += String(delta.text || '').length;
      } else if (delta.type === 'thinking_delta') {
        if (out.firstThinkingMs == null) out.firstThinkingMs = e.t_ms ?? null;
        out.thinkingChars += String(delta.thinking || '').length;
      } else if (delta.type === 'input_json_delta') {
        if (out.firstToolMs == null) out.firstToolMs = e.t_ms ?? null;
        out.toolJsonChars += String(delta.partial_json || '').length;
      } else if (delta.type === 'signature_delta') {
        out.signatureChars += String(delta.signature || '').length;
      }
      if (delta.stop_reason) out.stopReason = delta.stop_reason;
    }

    if (e.data?.message?.stop_reason) out.stopReason = e.data.message.stop_reason;
  }

  const body = resp?.response?.body;
  if (body && typeof body === 'object' && body.stop_reason) out.stopReason = body.stop_reason;
  return out;
}

function getAvailableTools(reqLine) {
  const fromLog = reqLine?.request?.tools_available;
  if (Array.isArray(fromLog)) return fromLog.filter(Boolean);
  const bodyTools = getRequestBody(reqLine).tools || [];
  return bodyTools.map(t => t?.name).filter(Boolean);
}

function getCalledTools(resp) {
  return (resp?.response?.tool_calls || resp?.tool_calls || [])
    .map(t => String(t).replace(/\(.*/, ''))
    .filter(Boolean);
}

function noTokenReason(row) {
  if (row.error) return `代理错误: ${row.error.error || 'unknown'}`;
  if (!row.resp) return '无响应';
  const status = row.resp?.response?.status;
  const method = row.req?.request?.method || row.error?.request?.method || '-';
  const url = row.req?.request?.url || row.error?.request?.url || '-';
  const nMsgs = getRequestBody(row.req).messages?.length ?? 0;
  if (status && status !== 200) return `HTTP ${status}`;
  if (method === 'HEAD') return '健康检查/探测请求';
  if (url.includes('/count_tokens')) return 'count_tokens 请求';
  if (status === 200 && nMsgs === 0) return '初始化/预检请求（无消息体）';
  return '响应无 usage 字段';
}

function normalizeRows(rows) {
  return rows.map(row => {
    const reqBody = getRequestBody(row.req);
    const usage = getUsage(row.resp);
    const timing = getTiming(row.resp);
    const msgStats = analyzeMessages(row.req);
    const sse = analyzeSse(row.resp);
    const prompt = lastUserPrompt(row.req);
    const toolsAvailable = getAvailableTools(row.req);
    const toolsCalled = getCalledTools(row.resp);
    const method = row.req?.request?.method || row.error?.request?.method || '-';
    const url = row.req?.request?.url || row.error?.request?.url || row.resp?.url || '-';
    const status = row.resp?.response?.status || (row.error ? 'ERR' : '-');
    const inT = usage.input_tokens ?? 0;
    const outT = usage.output_tokens ?? 0;
    const cr = usage.cache_read_input_tokens ?? 0;
    const cc = usage.cache_creation_input_tokens ?? 0;
    const reqSize = row.req?.request?.body_size ?? 0;
    const respSize = row.resp?.response?.body_size ?? 0;

    return {
      ...row,
      title: isTitleRequest(row.req),
      hasUsage: hasUsage(row.resp),
      id: row.id,
      method,
      url,
      endpoint: `${method} ${url}`,
      status,
      model: row.req?.request?.model || row.resp?.model || reqBody.model || '-',
      stream: row.req?.request?.stream ?? row.resp?.response?.is_streaming ?? false,
      durationMs: row.resp?.duration_ms ?? timing.total_ms ?? 0,
      reqSize,
      respSize,
      sseCount: row.resp?.response?.sse_event_count ?? 0,
      usage,
      inT,
      outT,
      cr,
      cc,
      totalT: usage.total_tokens ?? (inT + outT),
      cacheHitRatio: inT ? cr / inT : 0,
      cacheCreateRatio: inT ? cc / inT : 0,
      timing: {
        ttfb: timing.ttfb_ms ?? null,
        thinking: timing.thinking_ms ?? null,
        output: timing.output_ms ?? null,
        firstToken: timing.first_token_ms ?? null,
        total: timing.total_ms ?? row.resp?.duration_ms ?? null,
      },
      msgStats,
      sse,
      prompt,
      promptHash: hashText(prompt),
      promptPreview: previewText(prompt, 80),
      messages: messagesByRole(row.req),
      responseText: fullResponseText(row.resp),
      toolsAvailable,
      toolsCalled,
      noTokenReason: '',
      cumIn: row.resp?.cumulative?.in ?? 0,
      cumOut: row.resp?.cumulative?.out ?? 0,
    };
  }).map(r => {
    if (!r.hasUsage && !r.title) r.noTokenReason = noTokenReason(r);
    return r;
  });
}

function summarize(rows, meta) {
  const usable = rows.filter(r => !r.title && r.hasUsage);
  const analyzed = rows.filter(r => !r.title);
  const skipped = rows.filter(r => !r.title && !r.hasUsage);
  const titleSkipped = rows.filter(r => r.title).length;
  const s = {
    rows,
    usable,
    skipped,
    titleSkipped,
    meta,
    n: usable.length,
    allN: rows.length,
    analyzedN: analyzed.length,
    inT: sum(usable, 'inT'),
    outT: sum(usable, 'outT'),
    crT: sum(usable, 'cr'),
    ccT: sum(usable, 'cc'),
    reqBytes: sum(usable, 'reqSize'),
    respBytes: sum(usable, 'respSize'),
    sseEvents: sum(usable, 'sseCount'),
    toolHistoryUse: usable.reduce((n, r) => n + r.msgStats.toolUseHistory, 0),
    toolHistoryResult: usable.reduce((n, r) => n + r.msgStats.toolResultHistory, 0),
    toolHistoryResultChars: usable.reduce((n, r) => n + r.msgStats.toolResultChars, 0),
    toolHistoryInputChars: usable.reduce((n, r) => n + r.msgStats.toolUseInputChars, 0),
    topLevelSystemRows: usable.filter(r => r.msgStats.topLevelSystemChars > 0).length,
    topLevelSystemChars: usable.reduce((n, r) => n + r.msgStats.topLevelSystemChars, 0),
  };

  s.avgIn = avg(usable.map(r => r.inT));
  s.avgOut = avg(usable.map(r => r.outT));
  s.cacheHitRatio = s.inT ? s.crT / s.inT : 0;
  s.cacheCreateRatio = s.inT ? s.ccT / s.inT : 0;
  s.bytesPerInputToken = s.inT ? s.reqBytes / s.inT : 0;

  s.latency = {
    duration: describe(usable.map(r => r.durationMs)),
    ttfb: describe(usable.map(r => r.timing.ttfb).filter(isNumber)),
    firstToken: describe(usable.map(r => r.timing.firstToken).filter(isNumber)),
    thinking: describe(usable.map(r => r.timing.thinking).filter(isNumber)),
    output: describe(usable.map(r => r.timing.output).filter(isNumber)),
  };

  s.endpointRows = groupRows(analyzed, r => r.endpoint).map(([key, g]) => ({
    key,
    n: g.length,
    ok: g.filter(r => r.status === 200).length,
    statuses: countsToText(countBy(g, r => r.status)),
    inT: sum(g, 'inT'),
    outT: sum(g, 'outT'),
    avgMs: avg(g.map(r => r.durationMs).filter(Boolean)),
    noUsage: g.filter(r => !r.hasUsage).length,
  })).sort((a, b) => b.n - a.n || b.inT - a.inT);

  s.modelRows = groupRows(usable, r => r.model).map(([key, g]) => ({
    key,
    n: g.length,
    inT: sum(g, 'inT'),
    outT: sum(g, 'outT'),
    avgMs: avg(g.map(r => r.durationMs)),
    cacheRatio: sum(g, 'inT') ? sum(g, 'cr') / sum(g, 'inT') : 0,
  })).sort((a, b) => b.inT - a.inT);

  s.tools = summarizeTools(usable);
  s.sse = summarizeSse(usable);
  s.promptRows = summarizePrompts(usable);
  s.topInput = topN(usable, r => r.inT, 12);
  s.topDuration = topN(usable, r => r.durationMs, 12);
  s.topCacheRead = topN(usable, r => r.cr, 12);
  s.topToolHistory = topN(usable, r => r.msgStats.toolResultChars + r.msgStats.toolUseInputChars, 12);
  return s;
}

function summarizeTools(rows) {
  const available = {};
  const called = {};
  const cooccur = {};
  let ctxReqs = 0;
  for (const r of rows) {
    const availableSet = new Set(r.toolsAvailable);
    const calledSet = new Set(r.toolsCalled);
    for (const name of availableSet) available[name] = (available[name] || 0) + 1;
    for (const name of r.toolsCalled) called[name] = (called[name] || 0) + 1;
    for (const name of calledSet) cooccur[name] = (cooccur[name] || 0) + 1;
    if ([...calledSet].some(name => name.includes('context-mode'))) ctxReqs++;
  }
  const names = new Set([...Object.keys(available), ...Object.keys(called)]);
  const rowsOut = [...names].map(name => ({
    name,
    available: available[name] || 0,
    called: called[name] || 0,
    requestUsed: cooccur[name] || 0,
    callRate: available[name] ? (cooccur[name] || 0) / available[name] : null,
  })).sort((a, b) => b.called - a.called || b.available - a.available || a.name.localeCompare(b.name));
  return { rows: rowsOut, ctxReqs };
}

function summarizeSse(rows) {
  const eventCounts = {};
  const deltaCounts = {};
  const blockCounts = {};
  const stopReasons = {};
  let textChars = 0;
  let thinkingChars = 0;
  let toolJsonChars = 0;
  let signatureChars = 0;
  for (const r of rows) {
    addCounts(eventCounts, r.sse.eventCounts);
    addCounts(deltaCounts, r.sse.deltaCounts);
    addCounts(blockCounts, r.sse.blockCounts);
    stopReasons[r.sse.stopReason] = (stopReasons[r.sse.stopReason] || 0) + 1;
    textChars += r.sse.textChars;
    thinkingChars += r.sse.thinkingChars;
    toolJsonChars += r.sse.toolJsonChars;
    signatureChars += r.sse.signatureChars;
  }
  return { eventCounts, deltaCounts, blockCounts, stopReasons, textChars, thinkingChars, toolJsonChars, signatureChars };
}

function summarizePrompts(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.promptHash;
    if (!groups.has(key)) groups.set(key, { hash: key, prompt: r.prompt, preview: r.promptPreview, ids: [], n: 0, inT: 0, outT: 0, cr: 0, ms: [] });
    const g = groups.get(key);
    g.ids.push(r.id);
    g.n++;
    g.inT += r.inT;
    g.outT += r.outT;
    g.cr += r.cr;
    g.ms.push(r.durationMs);
  }
  return [...groups.values()].map(g => ({
    ...g,
    avgMs: avg(g.ms),
  })).sort((a, b) => (b.inT + b.outT) - (a.inT + a.outT));
}

// ==================== HTML 渲染 ====================

function renderOverview(s) {
  let html = `<h2>汇总统计</h2>\n`;
  html += `<table>\n<tbody>\n`;
  html += row2('日志行数', fmtNum(s.meta.lineCount));
  html += row2('请求总数', `${fmtNum(s.allN)}（有效 ${fmtNum(s.n)}，标题生成跳过 ${fmtNum(s.titleSkipped)}，无 token ${fmtNum(s.skipped.length)}）`);
  html += row2('输入 Token 合计', fmtNum(s.inT));
  html += row2('输出 Token 合计', fmtNum(s.outT));
  html += row2('平均输入/请求', fmtNum(s.avgIn));
  html += row2('平均输出/请求', fmtNum(s.avgOut));
  html += row2('缓存读 Token', `${fmtNum(s.crT)}（${pctText(s.cacheHitRatio)} of input）`);
  html += row2('缓存创建 Token', `${fmtNum(s.ccT)}（${pctText(s.cacheCreateRatio)} of input）`);
  html += row2('请求体 / 响应体', `${fmtSize(s.reqBytes)} / ${fmtSize(s.respBytes)}`);
  html += row2('请求字节 / 输入 token', s.bytesPerInputToken ? s.bytesPerInputToken.toFixed(1) : '-');
  html += row2('带 top-level system 的轮次', `${fmtNum(s.topLevelSystemRows)} / ${fmtNum(s.n)}，合计 ${fmtNum(s.topLevelSystemChars)} chars`);
  html += row2('历史 tool_use / tool_result', `${fmtNum(s.toolHistoryUse)} / ${fmtNum(s.toolHistoryResult)}，结果约 ${fmtNum(s.toolHistoryResultChars)} chars`);
  html += row2('使用 ctx_* 工具的轮次', `${fmtNum(s.tools.ctxReqs)} / ${fmtNum(s.n)}`);
  html += `</tbody>\n</table>\n`;

  html += `<h3>延迟分布</h3>\n`;
  html += `<table>\n<thead><tr><th>指标</th><th>平均</th><th>P50</th><th>P95</th><th>最大</th></tr></thead>\n<tbody>\n`;
  html += latencyRow('总耗时', s.latency.duration);
  html += latencyRow('TTFB', s.latency.ttfb);
  html += latencyRow('首内容 token', s.latency.firstToken);
  html += latencyRow('思维链', s.latency.thinking);
  html += latencyRow('输出/工具生成', s.latency.output);
  html += `</tbody>\n</table>\n`;
  return html;
}

function renderEndpointAndModels(s) {
  let html = `<h2>接口 / 模型</h2>\n`;
  html += `<div class="table-wrap"><table>\n<thead><tr><th>Endpoint</th><th>请求数</th><th>成功</th><th>状态</th><th>无 token</th><th>输入 Token</th><th>输出 Token</th><th>均耗时</th></tr></thead>\n<tbody>\n`;
  for (const r of s.endpointRows) {
    html += `<tr><td class="left">${esc(r.key)}</td><td>${r.n}</td><td>${r.ok}</td><td>${esc(r.statuses)}</td><td>${r.noUsage}</td><td>${fmtNum(r.inT)}</td><td>${fmtNum(r.outT)}</td><td>${fmtMs(r.avgMs)}</td></tr>\n`;
  }
  html += `</tbody>\n</table></div>\n`;

  html += `<table>\n<thead><tr><th>模型</th><th>请求数</th><th>输入 Token</th><th>输出 Token</th><th>均耗时</th><th>缓存命中率</th></tr></thead>\n<tbody>\n`;
  for (const r of s.modelRows) {
    html += `<tr><td class="left">${esc(r.key)}</td><td>${r.n}</td><td>${fmtNum(r.inT)}</td><td>${fmtNum(r.outT)}</td><td>${fmtMs(r.avgMs)}</td><td>${pctText(r.cacheRatio)}</td></tr>\n`;
  }
  html += `</tbody>\n</table>\n`;
  return html;
}

function renderTools(s) {
  let html = `<h2>工具分析</h2>\n`;
  html += `<p>可用工具来自请求体 tools_available，调用工具来自模型响应 tool_calls；调用率按“出现过调用的请求数 / 可用请求数”估算。</p>\n`;
  html += `<div class="table-wrap"><table>\n<thead><tr><th>工具</th><th>可用轮次</th><th>调用次数</th><th>调用轮次</th><th>调用率</th></tr></thead>\n<tbody>\n`;
  for (const r of s.tools.rows) {
    const cls = r.available && !r.called ? 'muted' : '';
    html += `<tr class="${cls}"><td class="left">${esc(r.name)}</td><td>${r.available}</td><td>${r.called}</td><td>${r.requestUsed}</td><td>${r.callRate == null ? '-' : pctText(r.callRate)}</td></tr>\n`;
  }
  html += `</tbody>\n</table></div>\n`;

  html += `<h3>历史工具结果膨胀 Top</h3>\n`;
  html += renderTopRows(s.topToolHistory, [
    ['#', r => r.id],
    ['用户提示词', r => collapsibleText(r.prompt, 80)],
    ['tool_use', r => fmtNum(r.msgStats.toolUseHistory)],
    ['tool_result', r => fmtNum(r.msgStats.toolResultHistory)],
    ['工具参数 chars', r => fmtNum(r.msgStats.toolUseInputChars)],
    ['工具结果 chars', r => fmtNum(r.msgStats.toolResultChars)],
    ['输入 Token', r => fmtNum(r.inT)],
  ]);
  return html;
}

function renderSse(s) {
  let html = `<h2>SSE / 内容块</h2>\n`;
  html += `<table>\n<tbody>\n`;
  html += row2('SSE 事件总数', fmtNum(s.sseEvents));
  html += row2('文本输出 chars', fmtNum(s.sse.textChars));
  html += row2('thinking chars', fmtNum(s.sse.thinkingChars));
  html += row2('工具 JSON chars', fmtNum(s.sse.toolJsonChars));
  html += row2('signature chars', fmtNum(s.sse.signatureChars));
  html += `</tbody>\n</table>\n`;
  html += renderCountTable('事件类型', s.sse.eventCounts);
  html += renderCountTable('Delta 类型', s.sse.deltaCounts);
  html += renderCountTable('Content block 类型', s.sse.blockCounts);
  html += renderCountTable('Stop reason', s.sse.stopReasons);
  return html;
}

function renderOutliers(s) {
  let html = `<h2>异常与 Top 请求</h2>\n`;
  html += `<h3>输入 Token Top</h3>\n`;
  html += renderTopRows(s.topInput, [
    ['#', r => r.id],
    ['Endpoint', r => esc(r.endpoint)],
    ['用户提示词', r => collapsibleText(r.prompt, 80)],
    ['输入', r => fmtNum(r.inT)],
    ['缓存读', r => fmtNum(r.cr)],
    ['缓存率', r => pctText(r.cacheHitRatio)],
    ['消息数', r => fmtNum(r.msgStats.messageCount)],
  ]);

  html += `<h3>慢请求 Top</h3>\n`;
  html += renderTopRows(s.topDuration, [
    ['#', r => r.id],
    ['Endpoint', r => esc(r.endpoint)],
    ['用户提示词', r => collapsibleText(r.prompt, 80)],
    ['总耗时', r => fmtMs(r.durationMs)],
    ['TTFB', r => fmtMaybeMs(r.timing.ttfb)],
    ['首 token', r => fmtMaybeMs(r.timing.firstToken)],
    ['思维链', r => fmtMaybeMs(r.timing.thinking)],
    ['输出', r => fmtMaybeMs(r.timing.output)],
  ]);

  html += `<h3>缓存读 Top</h3>\n`;
  html += renderTopRows(s.topCacheRead, [
    ['#', r => r.id],
    ['用户提示词', r => collapsibleText(r.prompt, 80)],
    ['输入', r => fmtNum(r.inT)],
    ['缓存读', r => fmtNum(r.cr)],
    ['缓存率', r => pctText(r.cacheHitRatio)],
    ['缓存创建', r => fmtNum(r.cc)],
  ]);

  if (s.skipped.length) {
    html += `<h3>无 Token / 错误请求</h3>\n`;
    html += `<div class="table-wrap"><table>\n<thead><tr><th>#</th><th>Method</th><th>URL</th><th>模型</th><th>耗时</th><th>状态码</th><th>消息数</th><th>请求体</th><th>响应体</th><th>原因</th></tr></thead>\n<tbody>\n`;
    for (const r of s.skipped) {
      html += `<tr><td>${esc(r.id)}</td><td>${esc(r.method)}</td><td class="left">${esc(r.url)}</td><td>${esc(r.model)}</td><td>${fmtMs(r.durationMs)}</td><td>${esc(r.status)}</td><td>${fmtNum(r.msgStats.messageCount)}</td><td>${fmtSize(r.reqSize)}</td><td>${fmtSize(r.respSize)}</td><td class="left">${esc(r.noTokenReason)}</td></tr>\n`;
    }
    html += `</tbody>\n</table></div>\n`;
  }

  if (s.meta.parseErrors.length) {
    html += `<h3>JSONL 解析错误</h3>\n`;
    html += `<table>\n<thead><tr><th>文件</th><th>行号</th><th>错误</th></tr></thead>\n<tbody>\n`;
    for (const e of s.meta.parseErrors.slice(0, 50)) {
      html += `<tr><td class="left">${esc(path.basename(e.file))}</td><td>${e.line}</td><td class="left">${esc(e.error)}</td></tr>\n`;
    }
    html += `</tbody>\n</table>\n`;
  }
  return html;
}

function renderDetail(rows) {
  const valid = rows.filter(r => !r.title && r.hasUsage);
  let html = `<h2>逐条明细（${valid.length} 条）</h2>\n`;
  html += `<p>请求行展示的是本轮发给模型的上下文历史；其中“请求 assistant 历史”里的 [thinking] 是历史 assistant 内容。响应行的“响应块”展示本轮新产生的 thinking/text/tool_json 统计，不展开 thinking 原文。</p>\n`;
  html += `<div class="table-wrap"><table>\n<thead>
  <tr>
    <th>#</th><th>模型</th><th>Endpoint</th><th>状态</th><th>流式</th><th>耗时</th><th>TTFB</th><th>首 token</th><th>方向</th>
    <th>Token</th><th>缓存读</th><th>缓存率</th><th>缓存创建</th><th>Body</th><th>SSE</th><th>消息</th><th>工具</th><th>内容摘要</th><th>详情</th>
    <th class="sep"></th>
    <th class="prompt">请求 user</th><th class="prompt">请求 system</th><th class="prompt">请求 assistant 历史</th><th class="response">当前响应文本</th>
  </tr>
  </thead>\n<tbody>\n`;

  for (const r of valid) {
    html += `<tr class="req-row">
      <td rowspan="2" class="shared">${esc(r.id)}</td>
      <td rowspan="2" class="shared">${esc(r.model)}</td>
      <td rowspan="2" class="shared left">${esc(r.endpoint)}</td>
      <td rowspan="2" class="shared">${esc(r.status)}</td>
      <td rowspan="2" class="shared">${r.stream ? 'Y' : 'N'}</td>
      <td rowspan="2" class="shared">${fmtMs(r.durationMs)}</td>
      <td rowspan="2" class="shared">${fmtMaybeMs(r.timing.ttfb)}</td>
      <td rowspan="2" class="shared">${fmtMaybeMs(r.timing.firstToken)}</td>
      <td class="dir">请求</td>
      <td>${fmtNum(r.inT)}</td><td>-</td><td>-</td><td>-</td><td>${fmtSize(r.reqSize)}</td><td>-</td><td>${fmtNum(r.msgStats.messageCount)}</td>
      <td>available:${fmtNum(r.toolsAvailable.length)}<br>hist:${fmtNum(r.msgStats.toolUseHistory)}/${fmtNum(r.msgStats.toolResultHistory)}</td>
      <td class="left">${collapsibleText(r.prompt, 80)}</td><td>${detailLink(r, 'request')}</td>
      <td class="sep"></td>
      <td class="prompt left">${collapsibleCell(r.messages.user)}</td>
      <td class="prompt left">${collapsibleCell(r.messages.system)}</td>
      <td class="prompt left">${collapsibleCell(r.messages.assistant)}</td>
      <td class="response left">-</td>
    </tr>\n`;
    html += `<tr class="resp-row">
      <td class="dir">响应</td>
      <td>${fmtNum(r.outT)}</td><td>${fmtNum(r.cr)}</td><td>${pctText(r.cacheHitRatio)}</td><td>${fmtNum(r.cc)}</td><td>${fmtSize(r.respSize)}</td><td>${fmtNum(r.sseCount)}</td><td>-</td>
      <td class="left">${esc(r.toolsCalled.join(', ') || '-')}</td><td class="left">${responseBlockSummary(r)}</td><td>${detailLink(r, 'response')}</td>
      <td class="sep"></td>
      <td></td><td></td><td></td>
      <td class="response left">${collapsibleText(r.responseText, 120)}</td>
    </tr>\n`;
  }
  html += `</tbody>\n</table></div>\n`;
  return html;
}

function detailLink(r, section) {
  if (!r.detailHref) return '-';
  return `<a href="${esc(r.detailHref)}#${esc(section)}">详情</a>`;
}

function responseBlockSummary(r) {
  const parts = [];
  if (r.sse.thinkingChars) parts.push(`thinking:${fmtNum(r.sse.thinkingChars)} chars${r.sse.firstThinkingMs != null ? '@' + fmtMs(r.sse.firstThinkingMs) : ''}`);
  if (r.sse.textChars) parts.push(`text:${fmtNum(r.sse.textChars)} chars${r.sse.firstTextMs != null ? '@' + fmtMs(r.sse.firstTextMs) : ''}`);
  if (r.sse.toolJsonChars) parts.push(`tool_json:${fmtNum(r.sse.toolJsonChars)} chars${r.sse.firstToolMs != null ? '@' + fmtMs(r.sse.firstToolMs) : ''}`);
  if (r.sse.signatureChars) parts.push(`signature:${fmtNum(r.sse.signatureChars)} chars`);
  if (!parts.length && r.responseText && r.responseText !== '-') parts.push(`text:${fmtNum(r.responseText.length)} chars`);
  return parts.length ? esc(parts.join(' | ')) : '-';
}

function detailFileName(r) {
  const id = String(r.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const n = Number(id);
  return Number.isFinite(n) ? `${String(n).padStart(4, '0')}.html` : `${id}.html`;
}

function renderDetailPage(r, sourceName) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>请求 #${esc(r.id)} 详情 — ${esc(sourceName)}</title>
<style>
  body { font-family: -apple-system, "Microsoft YaHei", sans-serif; margin: 0 auto; padding: 20px; color: #333; max-width: 1280px; }
  h1 { border-bottom: 2px solid #1a73e8; padding-bottom: 8px; }
  h2 { margin-top: 28px; color: #1a73e8; }
  h3 { margin-top: 18px; color: #365f91; }
  a { color: #06f; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
  th, td { padding: 6px 10px; border: 1px solid #ddd; vertical-align: top; }
  th { background: #f0f4f8; text-align: left; width: 180px; }
  pre { white-space: pre-wrap; word-break: break-word; background: #f7f7f7; border: 1px solid #ddd; padding: 12px; overflow-x: auto; }
  .message { border: 1px solid #ddd; margin: 12px 0; padding: 10px; background: #fbfdff; }
  .role { font-weight: 700; color: #365f91; margin-bottom: 8px; }
  .block { margin: 8px 0; }
  .label { color: #666; font-size: 13px; margin-bottom: 4px; }
  .redacted { color: #777; background: #f2f2f2; border: 1px dashed #bbb; padding: 10px; }
  details summary { cursor: pointer; color: #06f; }
</style>
</head>
<body>
<p><a href="../report.html">返回报表</a></p>
<h1>请求 #${esc(r.id)} 详情</h1>
${renderDetailSummary(r)}
<h2 id="request">请求全文</h2>
${renderRequestFull(r)}
<h2 id="response">响应全文</h2>
${renderResponseFull(r)}
<h2>原始日志 JSON</h2>
<p>这里保留原始结构用于排查；thinking/signature 原文会折叠为长度标记。</p>
<details><summary>request JSON</summary><pre>${esc(jsonForDetail(r.req))}</pre></details>
<details><summary>response JSON</summary><pre>${esc(jsonForDetail(r.resp))}</pre></details>
<details><summary>error JSON</summary><pre>${esc(jsonForDetail(r.error))}</pre></details>
</body>
</html>`;
}

function renderDetailSummary(r) {
  return `<table>
<tbody>
${row2('模型', esc(r.model))}
${row2('Endpoint', esc(r.endpoint))}
${row2('状态 / 流式', `${esc(r.status)} / ${r.stream ? 'Y' : 'N'}`)}
${row2('耗时', `${fmtMs(r.durationMs)}，TTFB ${fmtMaybeMs(r.timing.ttfb)}，首 token ${fmtMaybeMs(r.timing.firstToken)}`)}
${row2('Token', `input ${fmtNum(r.inT)} / output ${fmtNum(r.outT)} / cache read ${fmtNum(r.cr)} / cache create ${fmtNum(r.cc)}`)}
${row2('Body / SSE', `request ${fmtSize(r.reqSize)} / response ${fmtSize(r.respSize)} / SSE ${fmtNum(r.sseCount)}`)}
${row2('响应块', responseBlockSummary(r))}
</tbody>
</table>`;
}

function renderRequestFull(r) {
  const body = getRequestBody(r.req);
  let html = '';
  const topSystem = getTopLevelSystemText(r.req);
  if (topSystem) html += `<h3>top-level system</h3><pre>${esc(topSystem)}</pre>\n`;
  if (r.toolsAvailable.length) {
    html += `<h3>可用工具（${fmtNum(r.toolsAvailable.length)}）</h3><pre>${esc(r.toolsAvailable.join('\n'))}</pre>\n`;
  }
  html += `<h3>messages</h3>\n`;
  const msgs = body.messages || [];
  if (!msgs.length) return html + '<p>无 messages</p>\n';
  msgs.forEach((m, i) => {
    html += `<div class="message"><div class="role">#${i + 1} ${esc(m.role || '?')}</div>${renderBlocksFull(m.content)}</div>\n`;
  });
  return html;
}

function renderResponseFull(r) {
  let html = `<h3>响应块</h3><pre>${responseBlockSummary(r)}</pre>\n`;
  if (r.toolsCalled.length) html += `<h3>调用工具</h3><pre>${esc(r.toolsCalled.join('\n'))}</pre>\n`;
  const toolJsonBlocks = fullResponseToolJson(r.resp);
  if (toolJsonBlocks.length) {
    html += `<h3>工具参数 JSON</h3>\n`;
    for (const b of toolJsonBlocks) {
      html += `<div class="block"><div class="label">${esc(b.name)} ${esc(b.id || '')}</div><pre>${esc(b.json || '{}')}</pre></div>\n`;
    }
  }
  html += `<h3>当前响应文本</h3><pre>${esc(r.responseText || '-')}</pre>\n`;
  return html;
}

function renderBlocksFull(content) {
  if (typeof content === 'string') return `<pre>${esc(normalizeTextBlock(content))}</pre>`;
  if (!Array.isArray(content)) return `<pre>${esc(JSON.stringify(content, null, 2))}</pre>`;
  let html = '';
  for (const b of content) {
    if (!b || typeof b !== 'object') {
      html += `<pre>${esc(String(b))}</pre>`;
    } else if (b.type === 'text') {
      html += `<div class="block"><div class="label">text</div><pre>${esc(normalizeTextBlock(b.text))}</pre></div>\n`;
    } else if (b.type === 'tool_use') {
      html += `<div class="block"><div class="label">tool_use: ${esc(b.name || '?')}</div><pre>${esc(JSON.stringify(b, null, 2))}</pre></div>\n`;
    } else if (b.type === 'tool_result') {
      html += `<div class="block"><div class="label">tool_result ${fmtNum(estimateToolResultChars(b))} chars</div><pre>${esc(toolResultText(b))}</pre></div>\n`;
    } else if (b.type === 'thinking' || b.type === 'redacted_thinking') {
      html += `<div class="redacted">[${esc(b.type)}:${fmtNum(estimateThinkingChars(b))} chars]</div>\n`;
    } else {
      html += `<div class="block"><div class="label">${esc(b.type || '?')}</div><pre>${esc(JSON.stringify(b, null, 2))}</pre></div>\n`;
    }
  }
  return html || '<p>-</p>';
}

function toolResultText(block) {
  const c = block?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map(item => {
      if (typeof item === 'string') return item;
      if (item?.text) return String(item.text);
      return JSON.stringify(item, null, 2);
    }).join('\n');
  }
  return JSON.stringify(c ?? '', null, 2);
}

function estimateThinkingChars(block) {
  return String(block?.thinking || block?.text || block?.data || '').length;
}

function fullResponseToolJson(resp) {
  const events = resp?.response?.sse_events || resp?.sse_events || [];
  const blocks = [];
  let current = null;
  for (const e of events) {
    const cb = e.data?.content_block;
    if (e.type === 'content_block_start' && cb?.type === 'tool_use') {
      current = { name: cb.name || '?', id: cb.id || '', json: '' };
      blocks.push(current);
    } else if (e.type === 'content_block_delta' && e.data?.delta?.type === 'input_json_delta') {
      if (!current) {
        current = { name: '?', id: '', json: '' };
        blocks.push(current);
      }
      current.json += e.data.delta.partial_json || '';
    } else if (e.type === 'content_block_stop') {
      current = null;
    }
  }
  return blocks;
}

function jsonForDetail(obj) {
  if (!obj) return '-';
  return JSON.stringify(obj, (key, value) => {
    if ((key === 'thinking' || key === 'redacted_thinking') && typeof value === 'string') {
      return `[redacted ${key}:${value.length} chars]`;
    }
    if (key === 'signature' && typeof value === 'string') {
      return `[signature:${value.length} chars]`;
    }
    return value;
  }, 2);
}

function renderByPrompt(s) {
  let html = '<h2>按用户提示词分组</h2>\n';
  html += `<div class="table-wrap"><table>\n<thead><tr><th>Hash</th><th>用户提示词</th><th>轮次</th><th>请求 ID</th><th>输入 Token</th><th>输出 Token</th><th>缓存读</th><th>均耗时</th></tr></thead>\n<tbody>\n`;
  for (const g of s.promptRows) {
    html += `<tr><td>${esc(g.hash)}</td><td class="left">${collapsibleText(g.prompt, 100)}</td><td>${g.n}</td><td class="left">${esc(g.ids.join(', '))}</td><td>${fmtNum(g.inT)}</td><td>${fmtNum(g.outT)}</td><td>${fmtNum(g.cr)}</td><td>${fmtMs(g.avgMs)}</td></tr>\n`;
  }
  html += `</tbody>\n</table></div>\n`;
  return html;
}

function renderTopRows(rows, columns) {
  if (!rows.length) return '<p>无数据</p>\n';
  let html = `<div class="table-wrap"><table>\n<thead><tr>${columns.map(([h]) => `<th>${esc(h)}</th>`).join('')}</tr></thead>\n<tbody>\n`;
  for (const r of rows) {
    html += `<tr>${columns.map(([, fn], i) => `<td${i === 1 ? ' class="left"' : ''}>${fn(r)}</td>`).join('')}</tr>\n`;
  }
  html += `</tbody>\n</table></div>\n`;
  return html;
}

function renderCountTable(title, counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '';
  let html = `<h3>${esc(title)}</h3>\n<table>\n<thead><tr><th>类型</th><th>次数</th></tr></thead>\n<tbody>\n`;
  for (const [k, v] of entries) html += `<tr><td class="left">${esc(k)}</td><td>${fmtNum(v)}</td></tr>\n`;
  html += `</tbody>\n</table>\n`;
  return html;
}

function latencyRow(label, d) {
  return `<tr><td class="left">${esc(label)}</td><td>${fmtMaybeMs(d.avg)}</td><td>${fmtMaybeMs(d.p50)}</td><td>${fmtMaybeMs(d.p95)}</td><td>${fmtMaybeMs(d.max)}</td></tr>\n`;
}

function row2(k, v) {
  return `<tr><td class="left">${esc(k)}</td><td>${v}</td></tr>\n`;
}

// ==================== 通用工具 ====================

function sum(rows, key) {
  return rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);
}

function avg(values) {
  const xs = values.filter(isNumber);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
}

function describe(values) {
  const xs = values.filter(isNumber).sort((a, b) => a - b);
  if (!xs.length) return { avg: null, p50: null, p95: null, max: null };
  return {
    avg: avg(xs),
    p50: percentile(xs, 0.5),
    p95: percentile(xs, 0.95),
    max: xs[xs.length - 1],
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function isNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function topN(rows, fn, n) {
  return [...rows].sort((a, b) => fn(b) - fn(a)).slice(0, n);
}

function groupRows(rows, fn) {
  const groups = new Map();
  for (const r of rows) {
    const key = fn(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.entries()];
}

function countBy(rows, fn) {
  const counts = {};
  for (const r of rows) {
    const key = fn(r);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function countsToText(counts) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
}

function addCounts(target, source) {
  for (const [k, v] of Object.entries(source || {})) target[k] = (target[k] || 0) + v;
}

function hashText(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex').slice(0, 10);
}

function previewText(text, maxLen = 80) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > maxLen ? t.slice(0, maxLen) + '...' : t;
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString();
}

function fmtMs(n) {
  return isNumber(n) ? `${Math.round(n)}ms` : '-';
}

function fmtMaybeMs(n) {
  return isNumber(n) ? `${Math.round(n)}ms` : '-';
}

function fmtSize(n) {
  n = Number(n || 0);
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

function pctText(n) {
  return isNumber(n) ? `${(n * 100).toFixed(1)}%` : '-';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 如果内容超过阈值，包装为可折叠的 details/summary */
function collapsibleCell(html, maxLen = 100) {
  const plain = html.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= maxLen) return html;
  const preview = esc(plain.slice(0, maxLen) + '...');
  return `<details class="cell-details"><summary>${preview}</summary><div class="cell-full">${html}</div></details>`;
}

function collapsibleText(text, maxLen = 100) {
  return collapsibleCell(esc(String(text ?? '')).replace(/\n/g, '<br>'), maxLen);
}

function parseArgs(argv) {
  const out = { target: null, outDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      out.outDir = argv[++i];
      if (!out.outDir) usageAndExit('错误: --out 需要一个输出目录');
    } else if (a === '-h' || a === '--help') {
      usageAndExit(null, 0);
    } else if (a.startsWith('--')) {
      usageAndExit(`错误: 未知参数 ${a}`);
    } else if (!out.target) {
      out.target = a;
    } else {
      usageAndExit(`错误: 多余参数 ${a}`);
    }
  }
  if (!out.target) usageAndExit();
  return out;
}

function usageAndExit(message, code = 1) {
  if (message) console.error(message);
  console.error('用法: node analyze-proxy-log.js <日志目录或文件> [--out 输出目录]');
  console.error('输出 HTML 到终端，用 > 重定向到文件后在浏览器打开');
  console.error('示例: node analyze-proxy-log.js proxy-logs/ > report.html');
  console.error('示例: node analyze-proxy-log.js proxy-logs/ --out proxy-report');
  process.exit(code);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const session = await loadSession(args.target);
  const rows = normalizeRows(session.rows);
  if (args.outDir) {
    for (const r of rows) r.detailHref = `details/${detailFileName(r)}`;
  }
  const s = summarize(rows, session);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>代理日志分析 — ${esc(path.basename(args.target))}</title>
<style>
  body { font-family: -apple-system, "Microsoft YaHei", sans-serif; margin: 0 auto; padding: 20px; color: #333; }
  h1 { border-bottom: 2px solid #1a73e8; padding-bottom: 8px; }
  h2 { margin-top: 32px; color: #1a73e8; }
  h3 { margin-top: 22px; color: #365f91; }
  .table-wrap { overflow-x: auto; margin-bottom: 16px; }
  table { border-collapse: collapse; width: max-content; min-width: 100%; margin-bottom: 16px; }
  th, td { padding: 6px 12px; border: 1px solid #ddd; text-align: right; white-space: nowrap; vertical-align: top; }
  th { background: #f0f4f8; font-weight: 600; }
  td.left { text-align: left; white-space: normal; word-break: break-word; }
  td.prompt { background: #e3f2fd; white-space: normal; word-break: break-word; min-width: 180px; max-width: 420px; }
  td.response { background: #e8f5e9; white-space: normal; word-break: break-word; min-width: 220px; max-width: 520px; }
  th.prompt { background: #bbdefb; }
  th.response { background: #c8e6c9; }
  td.sep, th.sep { background: #fff; border-left: 3px solid #bbb; border-right: 3px solid #bbb; padding: 0; width: 4px; }
  tbody tr:hover { background: #fafbfc; }
  tr.req-row td { background: #e3f2fd; }
  tr.resp-row td { background: #e8f5e9; }
  tr.req-row td.shared { background: #f5f5f5; }
  tr.req-row td.sep, tr.resp-row td.sep { background: #fff; }
  td.dir { font-weight: 700; text-align: center; }
  tr.muted { color: #888; }
  p { color: #666; max-width: 980px; }
  .meta { color: #888; font-size: 14px; margin-bottom: 24px; }
  details.cell-details { display: block; }
  details.cell-details summary { cursor: pointer; color: #1a73e8; outline: none; user-select: none; }
  details.cell-details summary:hover { text-decoration: underline; }
  details.cell-details summary::marker { font-size: 12px; }
  .cell-full { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #ccc; }
</style>
</head>
<body>
<h1>代理日志分析 — ${esc(path.basename(args.target))}</h1>
<p class="meta">分析时间: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} | 共 ${fmtNum(s.allN)} 条请求 | 文件 ${session.files.map(f => esc(path.basename(f))).join(', ')}</p>
${renderOverview(s)}
${renderEndpointAndModels(s)}
${renderTools(s)}
${renderSse(s)}
${renderOutliers(s)}
${renderDetail(rows)}
${renderByPrompt(s)}
</body>
</html>`;

  if (args.outDir) {
    const outDir = path.resolve(args.outDir);
    const detailsDir = path.join(outDir, 'details');
    fs.mkdirSync(detailsDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'report.html'), html, 'utf8');
    for (const r of rows) {
      fs.writeFileSync(path.join(detailsDir, detailFileName(r)), renderDetailPage(r, path.basename(args.target)), 'utf8');
    }
    console.error(`已生成: ${path.join(outDir, 'report.html')}`);
    console.error(`详情页: ${detailsDir}`);
  } else {
    console.log(html);
  }
}

main().catch(err => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
