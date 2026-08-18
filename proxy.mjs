#!/usr/bin/env node
/**
 * Claude Code 代理服务器 — 全量拦截请求/响应并落盘
 *
 * 用法:
 *   1. 启动代理:   node proxy.mjs
 *   2. 让 Claude Code 走代理（二选一）:
 *      a) 环境变量:  export ANTHROPIC_BASE_URL=http://localhost:8080
 *      b) settings.json: { "env": { "ANTHROPIC_BASE_URL": "http://localhost:8080" } }
 *   3. 正常使用 Claude Code，所有流量记录到 proxy-logs/
 *
 * 配置（环境变量，均有默认值）:
 *   PROXY_TARGET_HOST  目标 API 主机        默认 tokenhub.tencentmaas.com
 *   PROXY_TARGET_PORT  目标端口             默认 443
 *   PROXY_PORT         本地监听端口         默认 8080
 *   PROXY_LOG_DIR      日志目录             默认 ./proxy-logs
 *   PROXY_VERBOSE      1 = 打印每条 SSE 事件
 *
 * 日志产出（JSONL，每行一个完整 JSON，三个文件彻底拆分）:
 *   proxy-*-request.jsonl    请求实时流: 每条请求【到达即写入】phase="request"
 *                            （完整请求头/体/可用工具列表）—— 用 tail -f 即可实时看到请求进来
 *   proxy-*-response.jsonl   响应实时流: 每条响应【结束才写入】phase="response"
 *                            （完整响应/SSE 事件/耗时分解/token/累计）；与 request 文件按 id 配对
 *   summary-*.jsonl          摘要记录: 模型/耗时/状态码/字节/token/累计 token —— 每个响应一条，实时追加
 *
 * 注意:
 *   - 零依赖，只用 Node 内置模块
 *   - 代理会剥离 accept-encoding，让上游返回未压缩内容，便于记录
 *   - 请求头里含 API Key，日志文件请勿外传
 *   - 兼容 Anthropic (input_tokens) 与 OpenAI (prompt_tokens) 两种 usage 格式
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ==================== 配置 ====================

const CONFIG = {
  target: {
    host: process.env.PROXY_TARGET_HOST || 'tokenhub.tencentmaas.com',
    port: parseInt(process.env.PROXY_TARGET_PORT || '443', 10),
  },
  localPort: parseInt(process.env.PROXY_PORT || '8080', 10),
  logDir: process.env.PROXY_LOG_DIR || path.join(process.cwd(), 'proxy-logs'),
  verbose: process.env.PROXY_VERBOSE === '1',
  timeout: 10 * 60 * 1000, // 请求超时 10 分钟（长回复 SSE 需要）
};

// ==================== 初始化 ====================

fs.mkdirSync(CONFIG.logDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
const reqPath = path.join(CONFIG.logDir, `proxy-${stamp}-request.jsonl`);
const respPath = path.join(CONFIG.logDir, `proxy-${stamp}-response.jsonl`);
const summaryPath = path.join(CONFIG.logDir, `summary-${stamp}.jsonl`);

let requestCount = 0;
let totalIn = 0;
let totalOut = 0;
let totalThinkingMs = 0;
let totalOutputMs = 0;
let totalTtfbMs = 0;
let timingCount = 0;
const toolCounts = {};
let toolCallTotal = 0;

// ==================== 工具函数 ====================

function log(msg) {
  const t = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  console.log(`[${t}] ${msg}`);
}

function tryJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}

/** 从响应提取 token 用量，兼容 Anthropic / OpenAI 两种格式 */
function extractUsage(sseEvents, body) {
  let usage = null;
  // Anthropic SSE: message_start 带初始 usage，message_delta 带最终 output_tokens
  for (const evt of sseEvents) {
    if (evt.type === 'message_start' && evt.data?.message?.usage) {
      usage = { ...evt.data.message.usage };
    } else if (evt.type === 'message_delta' && evt.data?.usage) {
      usage = { ...usage, ...evt.data.usage };
    }
  }
  // 非流式 JSON 响应
  if (!usage) {
    const json = typeof body === 'string' ? tryJSON(body) : body;
    const u = json?.usage;
    if (u) {
      if (u.input_tokens !== undefined) usage = u;                            // Anthropic
      else if (u.prompt_tokens !== undefined) {                              // OpenAI
        usage = {
          input_tokens: u.prompt_tokens,
          output_tokens: u.completion_tokens,
          total_tokens: u.total_tokens,
        };
      }
    }
  }
  return usage;
}

/** 解析 SSE 事件流 → [{type, data, t_ms}, ...]，t_ms = 事件完整到达时距请求发出的毫秒数 */
function parseSSETimed(records) {
  const events = [];
  let carry = '';
  const pushBlock = (block, t) => {
    if (!block.trim()) return;
    const evt = { t_ms: t };
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        evt.type = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const s = line.slice(5).trim();
        evt.data = tryJSON(s) || s;
      }
    }
    if (evt.type || evt.data !== undefined) events.push(evt);
  };
  for (const rec of records) {
    carry += rec.b.toString('utf-8');
    const parts = carry.split('\n\n');
    carry = parts.pop(); // 最后一段可能不完整，留到下一 chunk
    for (const block of parts) pushBlock(block, rec.t);
  }
  const lastT = records.length ? records[records.length - 1].t : 0;
  pushBlock(carry, lastT);
  carry = '';
  return events;
}

/** 从带时间戳的 SSE 事件计算耗时分解 */
function computeTiming(events) {
  if (!events.length) return null;
  const ttfb_ms = events[0].t_ms;
  let thinkingStart = null, outputStart = null, endMs = events[events.length - 1].t_ms;
  for (const e of events) {
    const cb = e.data?.content_block;
    if (e.type === 'content_block_start') {
      if ((cb?.type === 'thinking' || cb?.type === 'redacted_thinking') && thinkingStart === null) thinkingStart = e.t_ms;
      if ((cb?.type === 'text' || cb?.type === 'tool_use') && outputStart === null) outputStart = e.t_ms;
    } else if (e.type === 'content_block_delta') {
      const dt = e.data?.delta?.type;
      if (dt === 'thinking_delta' && thinkingStart === null) thinkingStart = e.t_ms;
      if ((dt === 'text_delta' || dt === 'input_json_delta') && outputStart === null) outputStart = e.t_ms;
    } else if (e.type === 'message_stop') {
      endMs = e.t_ms;
    }
  }
  // thinking 结束 = 第一个输出块开始（text 或 tool_use）
  const thinkingEnd = thinkingStart !== null && outputStart !== null ? outputStart : null;
  return {
    ttfb_ms,                                              // 首字节到达（上游排队+模型启动）
    thinking_ms: thinkingStart !== null && thinkingEnd !== null ? thinkingEnd - thinkingStart : 0, // 思维链耗时
    output_ms: outputStart !== null ? endMs - outputStart : 0,    // 正文/工具调用生成耗时
    first_token_ms: (thinkingStart ?? outputStart ?? endMs) - ttfb_ms, // 首个内容 token 相对首字节
    total_ms: endMs,
  };
}

/** 从响应中提取本轮模型调用的工具名列表 */
function extractToolCalls(sseEvents, body) {
  const tools = [];
  // 流式：content_block_start 事件携带 tool_use 块
  for (const evt of sseEvents) {
    const cb = evt.data?.content_block;
    if (evt.type === 'content_block_start' && cb?.type === 'tool_use') {
      tools.push(cb.name + (cb.id ? `(${cb.id.slice(-6)})` : ''));
    }
  }
  // 非流式：content 数组里的 tool_use 块
  if (!tools.length) {
    const json = typeof body === 'string' ? tryJSON(body) : body;
    for (const cb of json?.content || []) {
      if (cb?.type === 'tool_use') tools.push(cb.name + (cb.id ? `(${cb.id.slice(-6)})` : ''));
    }
  }
  return tools;
}

/** 请求消息摘要：每条消息的 role / 内容形态 / 长度（不展开全文） */
function summarizeMessages(messages) {
  if (!Array.isArray(messages)) return null;
  return messages.map(m => {
    const c = m.content;
    if (typeof c === 'string') return { role: m.role, form: 'string', chars: c.length };
    if (Array.isArray(c)) {
      return { role: m.role, form: 'blocks', blocks: c.map(b => b.type || '?') };
    }
    return { role: m.role, form: typeof c };
  });
}

// ==================== 代理服务器 ====================

const server = http.createServer((clientReq, clientRes) => {
  const reqId = ++requestCount;
  const t0 = Date.now();

  const reqChunks = [];
  clientReq.on('data', c => reqChunks.push(c));

  clientReq.on('end', () => {
    const reqBuffer = Buffer.concat(reqChunks);
    const reqText = reqBuffer.toString('utf-8');
    const reqJson = tryJSON(reqText);

    // 转发头：改 host、剥 accept-encoding（避免压缩，便于记录）
    const fwdHeaders = { ...clientReq.headers };
    fwdHeaders['host'] = `${CONFIG.target.host}:${CONFIG.target.port}`;

    const model = reqJson?.model || '-';
    const streaming = reqJson?.stream === true;
    const nMsgs = reqJson?.messages?.length ?? 0;
    log(`#${reqId} >> ${clientReq.method} ${clientReq.url} | ${model} ${streaming ? 'stream' : 'once'} | msgs=${nMsgs} body=${fmtSize(reqBuffer.length)}`);

    // ---- 请求阶段：到达即落盘（实时，写入 request 文件）----
    fs.appendFileSync(reqPath, JSON.stringify({
      id: reqId,
      phase: 'request',
      uuid: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      request: {
        method: clientReq.method,
        url: clientReq.url,
        headers: clientReq.headers,
        model: reqJson?.model || null,
        stream: reqJson?.stream || false,
        messages_summary: summarizeMessages(reqJson?.messages),
        system_preview: reqJson?.system != null
          ? (typeof reqJson.system === 'string'
              ? reqJson.system.slice(0, 500)
              : JSON.stringify(reqJson.system).slice(0, 500))
          : null,
        tools_available: (reqJson?.tools || []).map(t => t?.name).filter(Boolean), // 客户端声明的全部可用工具（含 MCP 插件工具）
        body: reqJson || reqText,   // 解析后的完整请求体
        body_size: reqBuffer.length,
      },
    }) + '\n');

    const proxyReq = https.request(
      {
        hostname: CONFIG.target.host,
        port: CONFIG.target.port,
        path: clientReq.url,
        method: clientReq.method,
        headers: fwdHeaders,
        timeout: CONFIG.timeout,
      },
      (targetRes) => {
        const isSSE = (targetRes.headers['content-type'] || '').includes('text/event-stream');

        // 透传响应头；流式去掉 content-length，交给 Node chunked 编码
        const resHeaders = { ...targetRes.headers };
        if (isSSE || resHeaders['transfer-encoding']) delete resHeaders['content-length'];
        clientRes.writeHead(targetRes.statusCode, resHeaders);

        const resChunks = [];
        targetRes.on('data', chunk => {
          resChunks.push({ b: chunk, t: Date.now() - t0 }); // 记录到达时间，用于耗时分解
          clientRes.write(chunk); // 实时透传，不阻塞客户端
        });

        targetRes.on('end', () => {
          clientRes.end();
          const resBuffer = Buffer.concat(resChunks.map(r => r.b));
          const resText = resBuffer.toString('utf-8');
          const dur = Date.now() - t0;

          const sseEvents = isSSE ? parseSSETimed(resChunks) : [];
          const timing = isSSE ? computeTiming(sseEvents) : { total_ms: dur };
          const usage = extractUsage(sseEvents, resText);
          const toolCalls = extractToolCalls(sseEvents, isSSE ? null : resText);
          if (usage) {
            totalIn += usage.input_tokens || 0;
            totalOut += usage.output_tokens || 0;
          }
          if (timing && timing.thinking_ms !== undefined) {
            totalThinkingMs += timing.thinking_ms || 0;
            totalOutputMs += timing.output_ms || 0;
            totalTtfbMs += timing.ttfb_ms || 0;
            timingCount++;
          }
          for (const tc of toolCalls) {
            const name = tc.replace(/\(.*/, '');
            toolCounts[name] = (toolCounts[name] || 0) + 1;
            toolCallTotal++;
          }

          // ---- 响应阶段：结束时落盘（写入 response 文件，与 request 文件按 id 配对）----
          fs.appendFileSync(respPath, JSON.stringify({
            id: reqId,
            phase: 'response',
            timestamp: new Date().toISOString(),
            duration_ms: dur,
            model: reqJson?.model || null,
            response: {
              status: targetRes.statusCode,
              headers: targetRes.headers,
              is_streaming: isSSE,
              body: isSSE ? resText : (tryJSON(resText) || resText),
              body_size: resBuffer.length,
              sse_events: sseEvents,          // SSE 逐条解析结果（含 t_ms 时间戳）
              sse_event_count: sseEvents.length,
              tool_calls: toolCalls,          // 本轮模型调用的工具名
            },
            usage,
            timing,                           // 耗时分解: ttfb / thinking / output / first_token / total
            cumulative: { in: totalIn, out: totalOut, requests: requestCount }, // 实时累计统计
          }) + '\n');

          // ---- 摘要日志 ----
          fs.appendFileSync(summaryPath, JSON.stringify({
            id: reqId,
            timestamp: new Date().toISOString(),
            duration_ms: dur,
            method: clientReq.method,
            url: clientReq.url,
            model: reqJson?.model || null,
            status: targetRes.statusCode,
            is_streaming: isSSE,
            request_body_size: reqBuffer.length,
            response_body_size: resBuffer.length,
            sse_event_count: sseEvents.length,
            usage,
            cum_in: totalIn,            // 实时累计：截至本条的累计 input tokens
            cum_out: totalOut,          // 实时累计：截至本条的累计 output tokens
          }) + '\n');

          // ---- 控制台 ----
          const i = usage?.input_tokens ?? '?';
          const o = usage?.output_tokens ?? '?';
          const cc = usage?.cache_creation_input_tokens ?? 0;
          const cr = usage?.cache_read_input_tokens ?? 0;
          const tools = toolCalls.length ? ` | tools=[${toolCalls.join(', ')}]` : '';
          const tm = timing && timing.thinking_ms !== undefined
            ? ` | ttfb=${timing.ttfb_ms}ms think=${timing.thinking_ms}ms out=${timing.output_ms}ms`
            : '';
          log(`#${reqId} << ${targetRes.statusCode} ${dur}ms | ${fmtSize(resBuffer.length)} | in=${i} out=${o} cache+${cc}/${cr}${tools}${tm} | 累计 in=${totalIn} out=${totalOut}`);

          if (CONFIG.verbose && sseEvents.length) {
            for (const e of sseEvents) {
              const d = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
              log(`   ${e.type || '-'} ${d.slice(0, 120)}`);
            }
          }
        });
      }
    );

    proxyReq.on('error', err => {
      log(`#${reqId} !! 上游错误: ${err.message}`);
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'application/json' });
        clientRes.end(JSON.stringify({ type: 'error', error: { type: 'proxy_error', message: err.message } }));
      } else {
        clientRes.end();
      }
      fs.appendFileSync(respPath, JSON.stringify({
        id: reqId, phase: 'error', timestamp: new Date().toISOString(), error: err.message,
        request: { method: clientReq.method, url: clientReq.url, headers: clientReq.headers },
      }) + '\n');
    });

    proxyReq.on('timeout', () => {
      log(`#${reqId} !! 超时 (${CONFIG.timeout}ms)`);
      proxyReq.destroy(new Error('proxy timeout'));
    });

    // 客户端中途断开 → 终止上游请求
    clientRes.on('close', () => {
      if (!clientRes.writableEnded) {
        log(`#${reqId} client 断开`);
        proxyReq.destroy();
      }
    });

    if (reqBuffer.length > 0) proxyReq.write(reqBuffer);
    proxyReq.end();
  });

  clientReq.on('error', err => log(`#${reqId} client 请求错误: ${err.message}`));
});

function fmtSize(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

// ==================== 启动 ====================

server.listen(CONFIG.localPort, () => {
  console.log('');
  console.log('==========================================================');
  console.log('  Claude Code 代理 — 全量请求/响应拦截');
  console.log('==========================================================');
  console.log(`  监听 : http://localhost:${CONFIG.localPort}`);
  console.log(`  转发 : https://${CONFIG.target.host}:${CONFIG.target.port}`);
  console.log(`  请求流: ${reqPath}`);
  console.log(`  响应流: ${respPath}`);
  console.log(`  摘要  : ${summaryPath}`);
  console.log('----------------------------------------------------------');
  console.log('  接入方式（二选一）:');
  console.log(`  1) export ANTHROPIC_BASE_URL=http://localhost:${CONFIG.localPort}`);
  console.log('  2) settings.json -> env.ANTHROPIC_BASE_URL 同上');
  console.log('  Ctrl+C 退出并打印统计');
  console.log('==========================================================');
  console.log('');
});

// ==================== 退出统计 ====================

function printStats() {
  console.log('');
  console.log('==========================================================');
  console.log('  代理统计');
  console.log('==========================================================');
  console.log(`  请求数        : ${requestCount}`);
  console.log(`  输入 tokens   : ${totalIn}`);
  console.log(`  输出 tokens   : ${totalOut}`);
  console.log(`  合计 tokens   : ${totalIn + totalOut}`);
  if (timingCount > 0) {
    console.log('  ------------------------------------------------------');
    console.log(`  思维链耗时    : 总 ${(totalThinkingMs / 1000).toFixed(1)}s / 均 ${(totalThinkingMs / timingCount / 1000).toFixed(2)}s (${timingCount} 次流式请求)`);
    console.log(`  生成耗时      : 总 ${(totalOutputMs / 1000).toFixed(1)}s / 均 ${(totalOutputMs / timingCount / 1000).toFixed(2)}s`);
    console.log(`  TTFB          : 均 ${(totalTtfbMs / timingCount).toFixed(0)}ms`);
  }
  if (toolCallTotal > 0) {
    console.log('  ------------------------------------------------------');
    console.log(`  工具调用      : 共 ${toolCallTotal} 次`);
    const sorted = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);
    for (const [name, n] of sorted) {
      console.log(`    ${name.padEnd(16)} ${String(n).padStart(3)} 次`);
    }
  }
  console.log('  ------------------------------------------------------');
  console.log(`  请求流日志    : ${reqPath}`);
  console.log(`  响应流日志    : ${respPath}`);
  console.log(`  摘要日志      : ${summaryPath}`);
  console.log('==========================================================');
  process.exit(0);
}

process.on('SIGINT', printStats);
process.on('SIGTERM', printStats);
