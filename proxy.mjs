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
 * 注意:
 *   - 代理只负责记录日志，不修改请求内容（模型由客户端决定）
 *   - 零依赖，只用 Node 内置模块
 *   - 请求头里含 API Key，日志文件请勿外传
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

// ==================== 配置 ====================

const CONFIG = {
  target: {
    host: 'tokenhub.tencentmaas.com',
    port: 443,
  },
  localPort: 8080,
  logDir: path.join(process.cwd(), 'proxy-logs'),
  verbose: false,
  timeout: 10 * 60 * 1000,
  apiKey: 'sk-5rJHAvVsbwICba6gYTPDYpjg7BRcOJFB7Ds4nPvEof7M1B18',
};

// ==================== 初始化 ====================

let reqPath, respPath, summaryPath;
let requestCount = 0;
let totalIn = 0;
let totalOut = 0;
let totalThinkingMs = 0;
let totalOutputMs = 0;
let totalTtfbMs = 0;
let timingCount = 0;
const toolCounts = {};
let toolCallTotal = 0;

function initLogPaths() {
  fs.mkdirSync(CONFIG.logDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  reqPath = path.join(CONFIG.logDir, `proxy-${stamp}-request.jsonl`);
  respPath = path.join(CONFIG.logDir, `proxy-${stamp}-response.jsonl`);
  summaryPath = path.join(CONFIG.logDir, `summary-${stamp}.jsonl`);
}

// ==================== 工具函数 ====================

function log(msg) {
  const t = new Date().toISOString().slice(11, 23);
  console.log(`[${t}] ${msg}`);
}

function tryJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function fmtSize(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

/** 从响应提取 token 用量，兼容 Anthropic / OpenAI 两种格式 */
function extractUsage(sseEvents, body) {
  let usage = null;
  for (const evt of sseEvents) {
    if (evt.type === 'message_start' && evt.data?.message?.usage) {
      usage = { ...evt.data.message.usage };
    } else if (evt.type === 'message_delta' && evt.data?.usage) {
      usage = { ...usage, ...evt.data.usage };
    }
  }
  if (!usage) {
    const json = typeof body === 'string' ? tryJSON(body) : body;
    const u = json?.usage;
    if (u) {
      if (u.input_tokens !== undefined) usage = u;
      else if (u.prompt_tokens !== undefined) {
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

/** 解析 SSE 事件流 */
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
    carry = parts.pop();
    for (const block of parts) pushBlock(block, rec.t);
  }
  const lastT = records.length ? records[records.length - 1].t : 0;
  pushBlock(carry, lastT);
  carry = '';
  return events;
}

/** 从 SSE 事件计算耗时分解 */
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
  const thinkingEnd = thinkingStart !== null && outputStart !== null ? outputStart : null;
  return {
    ttfb_ms,
    thinking_ms: thinkingStart !== null && thinkingEnd !== null ? thinkingEnd - thinkingStart : 0,
    output_ms: outputStart !== null ? endMs - outputStart : 0,
    first_token_ms: (thinkingStart ?? outputStart ?? endMs) - ttfb_ms,
    total_ms: endMs,
  };
}

/** 从响应中提取工具调用 */
function extractToolCalls(sseEvents, body) {
  const tools = [];
  for (const evt of sseEvents) {
    const cb = evt.data?.content_block;
    if (evt.type === 'content_block_start' && cb?.type === 'tool_use') {
      tools.push({ name: cb.name, id: cb.id || null, input: cb.input || null });
    }
    if (evt.type === 'content_block_delta' && evt.data?.delta?.type === 'input_json_delta') {
      const lastTool = tools[tools.length - 1];
      if (lastTool && !lastTool._inputComplete) {
        lastTool._partialJson = (lastTool._partialJson || '') + evt.data.delta.partial_json;
      }
    }
    if (evt.type === 'content_block_stop' && tools.length > 0) {
      const lastTool = tools[tools.length - 1];
      if (lastTool && lastTool._partialJson) {
        try { lastTool.input = JSON.parse(lastTool._partialJson); } catch { lastTool.input = lastTool._partialJson; }
        delete lastTool._partialJson;
        lastTool._inputComplete = true;
      }
    }
  }
  if (!tools.length) {
    const json = typeof body === 'string' ? tryJSON(body) : body;
    for (const cb of json?.content || []) {
      if (cb?.type === 'tool_use') {
        tools.push({ name: cb.name, id: cb.id || null, input: cb.input || null });
      }
    }
  }
  return tools;
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
    // 注入腾讯 API Key（使用 x-api-key 头，与 Anthropic 格式一致）
    if (CONFIG.apiKey) {
      fwdHeaders['x-api-key'] = CONFIG.apiKey;
      delete fwdHeaders['authorization'];
    }

    const model = reqJson?.model || '-';
    const streaming = reqJson?.stream === true;
    const nMsgs = reqJson?.messages?.length ?? 0;

    // 代理只负责记录日志，不修改请求内容
    log(`#${reqId} >> ${clientReq.method} ${clientReq.url} | ${model} ${streaming ? 'stream' : 'once'} | msgs=${nMsgs} body=${fmtSize(reqBuffer.length)}`);

    // ---- 请求阶段：到达即落盘 ----
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
        messages: reqJson?.messages || [],
        system: reqJson?.system || null,
        tools_available: (reqJson?.tools || []).map(t => ({
          name: t?.name,
          description: t?.description?.slice(0, 200) || null,
        })).filter(t => t.name),
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

        const resHeaders = { ...targetRes.headers };
        if (isSSE || resHeaders['transfer-encoding']) delete resHeaders['content-length'];
        clientRes.writeHead(targetRes.statusCode, resHeaders);

        const resChunks = [];
        targetRes.on('data', chunk => {
          resChunks.push({ b: chunk, t: Date.now() - t0 });
          clientRes.write(chunk);
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
            toolCounts[tc.name] = (toolCounts[tc.name] || 0) + 1;
            toolCallTotal++;
          }

          // ---- 响应阶段：结束时落盘 ----
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
              sse_events: sseEvents,
              sse_event_count: sseEvents.length,
              tool_calls: toolCalls,
            },
            usage,
            timing,
            cumulative: { in: totalIn, out: totalOut, requests: requestCount },
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
            cum_in: totalIn,
            cum_out: totalOut,
          }) + '\n');

          // ---- 控制台 ----
          const i = usage?.input_tokens ?? '?';
          const o = usage?.output_tokens ?? '?';
          const cc = usage?.cache_creation_input_tokens ?? 0;
          const cr = usage?.cache_read_input_tokens ?? 0;
          const toolNames = toolCalls.map(t => t.name);
          const tools = toolNames.length ? ` | tools=[${toolNames.join(', ')}]` : '';
          const tm = timing && timing.thinking_ms !== undefined
            ? ` | ttfb=${timing.ttfb_ms}ms think=${timing.thinking_ms}ms out=${timing.output_ms}ms`
            : '';
          log(`#${reqId} << ${targetRes.statusCode} ${dur}ms | ${fmtSize(resBuffer.length)} | in=${i} out=${o} cache+${cc}/${cr}${tools}${tm} | 累计 in=${totalIn} out=${totalOut}`);
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

    clientRes.on('close', () => {
      if (!clientRes.writableEnded) {
        log(`#${reqId} client 断开`);
        proxyReq.destroy();
      }
    });

    // 发送请求体（原样转发）
    proxyReq.write(reqBuffer);
    proxyReq.end();
  });

  clientReq.on('error', err => log(`#${reqId} client 请求错误: ${err.message}`));
});

// ==================== 启动 ====================

function killPortProcess(port) {
  try {
    // Windows: 使用 findstr 查找占用端口的进程
    const result = execSync(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`, { encoding: 'utf-8' });
    const lines = result.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(pid)) {
        console.log(`  杀死占用端口 ${port} 的进程 PID: ${pid}`);
        try {
          execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf-8' });
        } catch (killErr) {
          // 忽略杀死进程的错误
        }
      }
    }
  } catch (e) {
    // 没有找到占用端口的进程，忽略错误
  }
}

async function main() {
  // 启动前杀死占用端口的进程
  killPortProcess(CONFIG.localPort);

  initLogPaths();

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
}

main().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
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
