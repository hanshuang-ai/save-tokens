import json
import os
from datetime import datetime, timedelta, timezone

scenarios = [
    {
        'name': 'scenario-1 日志分析',
        'dir': r'E:\WT\save-tokens\日志汇总\without-context-mode\scenario-1-日志分析',
        'summary': 'summary-2026-08-20_12-48-03-811.jsonl',
        'request': 'proxy-2026-08-20_12-48-03-811-request.jsonl',
        'response': 'proxy-2026-08-20_12-48-03-811-response.jsonl',
    },
    {
        'name': 'scenario-2 代码优化',
        'dir': r'E:\WT\save-tokens\日志汇总\without-context-mode\scenario-2-代码优化',
        'summary': 'summary-2026-08-20_13-11-18-839.jsonl',
        'request': 'proxy-2026-08-20_13-11-18-839-request.jsonl',
        'response': 'proxy-2026-08-20_13-11-18-839-response.jsonl',
    },
    {
        'name': 'scenario-4 书籍分析',
        'dir': r'E:\WT\save-tokens\日志汇总\without-context-mode\scenario-4-书籍分析',
        'summary': 'summary-2026-08-20_12-29-24-809.jsonl',
        'request': 'proxy-2026-08-20_12-29-24-809-request.jsonl',
        'response': 'proxy-2026-08-20_12-29-24-809-response.jsonl',
    },
]

def parse_ts(ts_str):
    return datetime.fromisoformat(ts_str.replace('Z', '+00:00'))

def analyze_scenario(sc):
    print(f'\n{"="*60}')
    print(f'  {sc["name"]}')
    print(f'{"="*60}')

    summary_path = os.path.join(sc['dir'], sc['summary'])
    request_path = os.path.join(sc['dir'], sc['request'])
    response_path = os.path.join(sc['dir'], sc['response'])

    # 1. 解析 summary
    records = []
    with open(summary_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

    api_count = len(records)
    first_end = parse_ts(records[0]['timestamp'])
    first_start = first_end - timedelta(milliseconds=records[0]['duration_ms'])
    last_end = parse_ts(records[-1]['timestamp'])
    wall_clock = (last_end - first_start).total_seconds()
    api_total_ms = sum(r['duration_ms'] for r in records)
    api_total = api_total_ms / 1000
    local_total = wall_clock - api_total
    local_avg = local_total / max(api_count - 1, 1)

    # token
    last_rec = records[-1]
    total_in = last_rec.get('cum_in', 0)
    total_out = last_rec.get('cum_out', 0)
    total_tokens = total_in + total_out

    # 2. 统计工具调用次数 - 从request文件的最后一条（包含完整对话历史）
    tool_use_count = 0
    tool_result_count = 0
    tool_names = {}
    with open(request_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            req = obj.get('request', {})
            messages = req.get('messages', [])
            for m in messages:
                content = m.get('content', '')
                if isinstance(content, list):
                    for c in content:
                        if c.get('type') == 'tool_use':
                            tool_use_count += 1
                            name = c.get('name', 'unknown')
                            tool_names[name] = tool_names.get(name, 0) + 1
                        elif c.get('type') == 'tool_result':
                            tool_result_count += 1

    # 3. 找最长的一次API调用，看它做了什么
    longest = max(records, key=lambda x: x['duration_ms'])
    longest_id = longest['id']
    longest_duration = longest['duration_ms']
    longest_out_tokens = longest.get('usage', {}).get('output_tokens', 0) if longest.get('usage') else 0

    # 从response文件找对应内容
    longest_preview = ''
    if os.path.exists(response_path):
        with open(response_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                if obj.get('id') == longest_id:
                    resp = obj.get('response', {})
                    body = resp.get('body', '')
                    if isinstance(body, str) and body:
                        try:
                            body = json.loads(body)
                        except:
                            pass
                    if isinstance(body, dict):
                        content = body.get('content', [])
                        if isinstance(content, list):
                            for c in content:
                                if c.get('type') == 'text':
                                    longest_preview += c.get('text', '')
                                elif c.get('type') == 'tool_use':
                                    longest_preview += f'[工具调用: {c.get("name")}] '
                                    inp = c.get('input', {})
                                    longest_preview += json.dumps(inp, ensure_ascii=False)[:200]
                    break

    # 输出
    print(f'  总时长 (Wall Clock):    {wall_clock:.1f}s  ({int(wall_clock//60)}分{int(wall_clock%60)}秒)')
    print(f'  API请求次数:             {api_count} 次')
    print(f'  API累计耗时:             {api_total:.1f}s  ({int(api_total//60)}分{int(api_total%60)}秒)')
    print(f'  本地处理总时长:          {local_total:.1f}s  ({int(local_total//60)}分{int(local_total%60)}秒)')
    print(f'  本地处理平均时长:        {local_avg:.2f}s/次')
    print(f'  工具调用次数(tool_use):  {tool_use_count} 次')
    print(f'  工具返回次数(tool_result): {tool_result_count} 次')
    print(f'  总Token数:               {total_tokens:,}  (输入 {total_in:,} + 输出 {total_out:,})')
    print(f'  最长一次API调用:         id={longest_id}, {longest_duration}ms ({longest_duration/1000:.1f}s), 输出 {longest_out_tokens} tokens')
    if tool_names:
        print(f'  工具调用分布:')
        for name, cnt in sorted(tool_names.items(), key=lambda x: -x[1]):
            print(f'    {name}: {cnt}次')
    if longest_preview:
        print(f'  最长一次内容预览:')
        preview = longest_preview[:300].replace('\n', ' ')
        print(f'    {preview}')
        if len(longest_preview) > 300:
            print(f'    ... (共 {len(longest_preview)} 字符)')

    return {
        'name': sc['name'],
        'wall_clock': wall_clock,
        'api_count': api_count,
        'api_total': api_total,
        'local_total': local_total,
        'local_avg': local_avg,
        'tool_use_count': tool_use_count,
        'total_tokens': total_tokens,
        'total_in': total_in,
        'total_out': total_out,
        'longest_id': longest_id,
        'longest_duration': longest_duration,
        'longest_preview': longest_preview[:200],
    }

results = []
for sc in scenarios:
    try:
        r = analyze_scenario(sc)
        results.append(r)
    except Exception as e:
        print(f'  ERROR: {e}')

# 汇总对比表
print(f'\n\n{"="*80}')
print(f'  三场景汇总对比')
print(f'{"="*80}')
print(f'{"指标":<20} {"scenario-1":>15} {"scenario-2":>15} {"scenario-4":>15}')
print(f'-'*80)
print(f'{"总时长(秒)":<20} {results[0]["wall_clock"]:>15.1f} {results[1]["wall_clock"]:>15.1f} {results[2]["wall_clock"]:>15.1f}')
print(f'{"API请求次数":<20} {results[0]["api_count"]:>15} {results[1]["api_count"]:>15} {results[2]["api_count"]:>15}')
print(f'{"API累计(秒)":<20} {results[0]["api_total"]:>15.1f} {results[1]["api_total"]:>15.1f} {results[2]["api_total"]:>15.1f}')
print(f'{"本地处理总时长(秒)":<20} {results[0]["local_total"]:>15.1f} {results[1]["local_total"]:>15.1f} {results[2]["local_total"]:>15.1f}')
print(f'{"本地处理平均(秒)":<20} {results[0]["local_avg"]:>15.2f} {results[1]["local_avg"]:>15.2f} {results[2]["local_avg"]:>15.2f}')
print(f'{"工具调用次数":<20} {results[0]["tool_use_count"]:>15} {results[1]["tool_use_count"]:>15} {results[2]["tool_use_count"]:>15}')
print(f'{"总Token数":<20} {results[0]["total_tokens"]:>15,} {results[1]["total_tokens"]:>15,} {results[2]["total_tokens"]:>15,}')
