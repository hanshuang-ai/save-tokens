#!/usr/bin/env python3
"""从原始 6 个 HTML 报告重新生成带设计系统的合并报告。"""
import re
from pathlib import Path

DIR = Path("E:/WT/save-tokens/日志汇总/html报告")
OUT = DIR / "五场景汇总报告.html"

SCENARIOS = [
    ("scenario-1-日志分析-带插件vs不带插件对比.html", "S1 日志分析", "section-s1", "显著正向", "badge-good"),
    ("scenario-2-代码优化-带插件vs不带插件对比.html", "S2 代码优化", "section-s2", "正向", "badge-good"),
    ("scenario-3-2048游戏-带插件vs不带插件对比.html", "S3 2048游戏", "section-s3", "中性", "badge-mid"),
    ("scenario-4-书籍分析-带插件vs不带插件对比.html", "S4 书籍分析", "section-s4", "偏负向", "badge-bad"),
    ("scenario-5-项目逆向分析-带插件vs不带插件对比.html", "S5 项目逆向", "section-s5", "显著正向", "badge-good"),
]
SUMMARY_FILE = "插件效果对比分析-五场景汇总.html"
SUMMARY_ID = "section-summary"

CHART_IDS_SCENE = ["chart-core", "chart-token", "chart-time", "chart-tools"]
CHART_IDS_SUMMARY = ["chart-duration", "chart-token", "chart-output", "chart-api", "chart-tools", "chart-time"]


def read_html(path):
    return path.read_text(encoding="utf-8")


def remove_project_scale(html):
    """删除 <h3>项目规模</h3> 及其后的 <div class="info-grid">...</div>"""
    pattern = re.compile(
        r'<h3>\s*项目规模\s*</h3>\s*<div\s+class="info-grid">.*?</div>',
        re.DOTALL | re.IGNORECASE,
    )
    html = pattern.sub("", html)
    # 如果 info-grid 里还有内联样式（如 grid-column）也尝试移除
    html = re.sub(r'<h3>\s*项目规模\s*</h3>\s*<div\s+class="info-grid"[^>]*>.*?</div>', "", html, flags=re.DOTALL | re.IGNORECASE)
    return html


def namespace_ids(html, prefix, chart_ids):
    """给容器 ID 和 JS 引用都加上前缀。"""
    for cid in chart_ids:
        # HTML id
        html = re.sub(rf'id="{cid}"', f'id="{cid}-{prefix}"', html)
        html = re.sub(rf"id='{cid}'", f"id='{cid}-{prefix}'", html)
        # JS getElementById
        html = re.sub(rf"getElementById\('{cid}'\)", f"getElementById('{cid}-{prefix}')", html)
        html = re.sub(rf'getElementById\("{cid}"\)', f'getElementById("{cid}-{prefix}")', html)
        # 数组形式
        html = re.sub(rf"\['{cid}'", f"['{cid}-{prefix}'", html)
        html = re.sub(rf'\["{cid}"', f'["{cid}-{prefix}"', html)
    return html


def extract_body(html):
    """提取 <body> 内 <div class="container">...</div> 的内容。"""
    m = re.search(r'<body>\s*<div class="container">(.*?)</div>\s*</body>', html, re.DOTALL)
    if m:
        return m.group(1).strip()
    # fallback
    m = re.search(r'<body>(.*?)</body>', html, re.DOTALL)
    return m.group(1).strip() if m else html


def split_scripts(body):
    """把 body 中的 <script>...</script> 分离出来。"""
    scripts = re.findall(r'<script>(.*?)</script>', body, re.DOTALL)
    body_no_script = re.sub(r'<script>.*?</script>', '', body, flags=re.DOTALL)
    return body_no_script, scripts


def wrap_iife(script):
    """把脚本包在独立 IIFE 中，并自动 resize。"""
    script = script.strip()
    # 如果脚本末尾已经有 resize listener，就不重复加；否则给 chart 自动 resize
    # 简单做法：统一包起来
    return f"(function(){{\n{script}\n}})();\n"


def update_effect_badge(body, label, badge_class):
    """把 effect-badge 的文本和 class 更新为新设计系统的语义 class。"""
    # 原始是 <span class="effect-badge">显著正向</span>
    body = re.sub(
        r'<span class="effect-badge">([^<]+)</span>',
        f'<span class="effect-badge {badge_class}">{label}</span>',
        body,
        count=1,
    )
    return body


def add_section_anchor(body, section_id):
    """在 container 内容最外层不用加 div，因为容器本身就是 scenario-section 的内容会处理。"""
    return body


def process_table_wrapping(body):
    """给没有 table-wrap 包裹的 table 加上 table-wrap。"""
    # 仅包裹直接位于 section 下、没有被 table-wrap 包住的 table
    def repl(m):
        return f'<div class="table-wrap">{m.group(0)}</div>'
    body = re.sub(r'(?<!</div>\s*)(?<!<div class="table-wrap">)<table>(.*?)</table>', repl, body, flags=re.DOTALL)
    return body


def build_css():
    return """
/* ============================================================
   Design Tokens · 主题色 #F4732F
   ============================================================ */
:root {
  --primary: #F4732F;
  --primary-50: #FFF4EC;
  --primary-100: #FFE6D4;
  --primary-200: #FFC9A8;
  --primary-300: #FFA97A;
  --primary-400: #FA8A50;
  --primary-500: #F4732F;
  --primary-600: #DE5F1F;
  --primary-700: #B94A13;

  --ink-950: #13132a;
  --ink-900: #1a1a2e;
  --ink-800: #23233c;
  --ink-700: #3a3a55;

  --gray-50:  #f8fafc;
  --gray-100: #f1f5f9;
  --gray-200: #e6eaf0;
  --gray-300: #d4dae3;
  --gray-400: #94a3b8;
  --gray-500: #64748b;
  --gray-600: #475569;

  --success: #10b981;  --success-bg: #ecfdf5;
  --danger:  #ef4444;  --danger-bg:  #fef2f2;
  --warning: #d97706;  --warning-bg: #fffbeb;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 999px;

  --shadow-sm: 0 1px 2px rgba(26,26,46,.05), 0 1px 3px rgba(26,26,46,.07);
  --shadow-md: 0 4px 14px rgba(26,26,46,.09), 0 2px 4px rgba(26,26,46,.05);
  --shadow-lg: 0 14px 36px rgba(26,26,46,.14), 0 4px 10px rgba(26,26,46,.07);

  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif;
  --mono: "JetBrains Mono", "SF Mono", Consolas, "Courier New", monospace;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  font-family: var(--font);
  background:
    radial-gradient(1200px 500px at 85% -10%, rgba(244,115,47,.07), transparent 60%),
    radial-gradient(900px 420px at -10% 0%, rgba(244,115,47,.05), transparent 55%),
    var(--gray-50);
  color: var(--ink-800);
  line-height: 1.75;
  text-align: left;
}

.container { max-width: 1180px; margin: 0 auto; }
.scenario-section { scroll-margin-top: 24px; }

/* ============================================================
   Sidebar
   ============================================================ */
.sidebar {
  position: fixed; left: 0; top: 0; bottom: 0; width: 232px;
  background: linear-gradient(180deg, var(--ink-950) 0%, var(--ink-900) 55%, #23233c 100%);
  color: #fff;
  display: flex; flex-direction: column;
  padding: 22px 0 16px;
  z-index: 1000;
  overflow-y: auto; overflow-x: hidden;
  box-shadow: 3px 0 24px rgba(26,26,46,.18);
}
.sidebar-brand {
  display: flex; align-items: center; gap: 12px;
  padding: 0 20px 20px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  margin-bottom: 14px;
}
.brand-logo {
  width: 40px; height: 40px; flex: 0 0 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--primary-400), var(--primary-600));
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 16px; color: #fff;
  box-shadow: 0 6px 16px rgba(244,115,47,.4);
}
.brand-title { font-size: 15px; font-weight: 700; letter-spacing: .3px; }
.brand-sub { font-size: 11px; color: rgba(255,255,255,.55); margin-top: 2px; }
.sidebar-section-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px;
  color: rgba(255,255,255,.4); padding: 14px 20px 6px; font-weight: 600;
}
.nav-link {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; margin: 2px 10px;
  border-radius: var(--radius-sm);
  color: rgba(255,255,255,.78);
  text-decoration: none; font-size: 14px; font-weight: 500;
  border-left: 3px solid transparent;
  transition: background .2s, color .2s, transform .2s;
}
.nav-link:hover { background: rgba(255,255,255,.06); color: #fff; }
.nav-link.active {
  background: linear-gradient(90deg, rgba(244,115,47,.28), rgba(244,115,47,.07));
  color: #fff; font-weight: 600;
  border-left-color: var(--primary);
}
.nav-icon {
  width: 24px; height: 24px; flex: 0 0 24px;
  border-radius: 7px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700;
  background: rgba(255,255,255,.1); color: var(--primary-300);
}
.nav-link.active .nav-icon { background: var(--primary); color: #fff; }
.sidebar-footer {
  margin-top: auto; padding: 16px 20px 0;
  font-size: 11px; color: rgba(255,255,255,.35);
  border-top: 1px solid rgba(255,255,255,.08);
}

/* ============================================================
   Main Layout
   ============================================================ */
.main-content { margin-left: 232px; padding: 28px 32px 64px; }

/* Hero */
.page-hero {
  position: relative;
  background: linear-gradient(135deg, var(--primary-600) 0%, var(--primary-500) 40%, var(--primary-400) 78%, #ffd9c0 130%);
  border-radius: var(--radius-lg);
  padding: 40px 44px;
  color: #fff;
  overflow: hidden;
  margin-bottom: 32px;
  box-shadow: var(--shadow-lg);
}
.page-hero::before {
  content: '';
  position: absolute; top: -60px; right: -60px;
  width: 260px; height: 260px;
  background: rgba(255,255,255,.12);
  border-radius: 50%;
  filter: blur(40px);
}
.page-hero::after {
  content: '';
  position: absolute; bottom: -40px; left: 10%;
  width: 160px; height: 160px;
  background: rgba(255,255,255,.08);
  border-radius: 50%;
  filter: blur(30px);
}
.hero-kicker {
  position: relative; z-index: 1;
  font-size: 12px; font-weight: 700; letter-spacing: 1.2px;
  margin-bottom: 10px; opacity: .95;
}
.hero-title {
  position: relative; z-index: 1;
  font-size: 34px; font-weight: 800; letter-spacing: -.3px;
  margin-bottom: 8px; line-height: 1.2;
}
.hero-subtitle {
  position: relative; z-index: 1;
  font-size: 15px; opacity: .88; margin-bottom: 26px;
}
.hero-stats {
  position: relative; z-index: 1;
  display: flex; gap: 12px; flex-wrap: wrap;
}
.hero-stat {
  background: rgba(255,255,255,.16);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,.22);
  border-radius: var(--radius-md);
  padding: 10px 16px;
  min-width: 92px;
}
.hero-stat b { display: block; font-size: 22px; line-height: 1; margin-bottom: 4px; }
.hero-stat span { font-size: 11px; opacity: .85; font-weight: 600; letter-spacing: .4px; }

/* ============================================================
   Scenario container overrides
   ============================================================ */
.scenario-section h1 {
  font-size: 26px; font-weight: 800; color: var(--ink-900);
  margin-bottom: 6px; line-height: 1.3;
}
.scenario-section > .subtitle {
  font-size: 13px; color: var(--gray-500);
  margin-bottom: 14px;
}
.header-effect {
  margin-bottom: 20px;
  font-size: 14px; font-weight: 600; color: var(--ink-700);
}
.effect-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 14px; border-radius: var(--radius-full);
  color: #fff; font-size: 13px; font-weight: 700;
  margin-left: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,.12);
}
.badge-good { background: linear-gradient(135deg, #10b981, #059669); }
.badge-mid  { background: linear-gradient(135deg, #f59e0b, #d97706); }
.badge-bad  { background: linear-gradient(135deg, #f87171, #dc2626); }

/* ============================================================
   Cards
   ============================================================ */
.metric-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 24px; }
.metric-card {
  position: relative;
  background: #fff; border: 1px solid var(--gray-200);
  border-top: 3px solid var(--primary);
  border-radius: var(--radius-md);
  padding: 18px 14px 16px; text-align: center;
  box-shadow: var(--shadow-sm);
  transition: transform .25s, box-shadow .25s;
}
.metric-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }
.metric-label { font-size: 12px; color: var(--gray-500); font-weight: 600; letter-spacing: .8px; margin-bottom: 10px; }
.metric-wo { font-size: 13px; color: var(--gray-400); text-decoration: line-through; }
.metric-arrow { font-size: 14px; color: var(--primary); margin: 3px 0; font-weight: 700; }
.metric-wi { font-size: 17px; font-weight: 800; color: var(--ink-900); }
.metric-change { display: inline-block; margin-top: 8px; padding: 3px 12px; border-radius: var(--radius-full); font-size: 13px; font-weight: 800; }
.metric-change.down { background: var(--success-bg); color: var(--success); }
.metric-change.up   { background: var(--danger-bg);  color: var(--danger); }

.summary-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 24px; }
.card {
  background: #fff; border: 1px solid var(--gray-200);
  border-top: 3px solid var(--primary);
  border-radius: var(--radius-md); padding: 18px;
  box-shadow: var(--shadow-sm);
  transition: transform .25s, box-shadow .25s;
}
.card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }
.card-title { font-size: 13px; color: var(--gray-500); font-weight: 600; margin-bottom: 10px; }
.card-value { font-size: 24px; font-weight: 800; color: var(--ink-900); line-height: 1.2; }
.card-change { font-size: 13px; margin-top: 4px; }
.card .up { color: var(--danger); }
.card .down { color: var(--success); }

/* ============================================================
   Sections
   ============================================================ */
.section {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: var(--shadow-sm);
}
.section h2 {
  font-size: 18px; font-weight: 800; color: var(--ink-900);
  margin-bottom: 16px; padding-left: 12px;
  border-left: 4px solid var(--primary);
}
.section h3 { font-size: 15px; font-weight: 700; color: var(--ink-800); margin: 18px 0 10px; }
.section h4 { font-size: 14px; font-weight: 700; color: var(--ink-700); margin: 14px 0 8px; }
.section h5 { font-size: 13px; font-weight: 700; color: var(--gray-600); margin: 12px 0 6px; }
.section p, .section li { font-size: 14px; color: var(--ink-800); margin-bottom: 8px; }
.section ul { padding-left: 22px; margin: 8px 0; }
.section li { margin-bottom: 6px; }

.insight {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: var(--shadow-sm);
}
.insight h3 {
  font-size: 18px; font-weight: 800; color: var(--ink-900);
  margin-bottom: 12px; padding-left: 12px;
  border-left: 4px solid var(--primary);
}
.insight h4 { font-size: 15px; font-weight: 700; color: var(--ink-800); margin: 14px 0 8px; }
.insight h5 { font-size: 14px; font-weight: 700; color: var(--ink-700); margin: 12px 0 6px; }
.insight ul { padding-left: 22px; }
.insight li { margin-bottom: 8px; line-height: 1.6; font-size: 14px; }

.tag { display: inline-block; padding: 3px 12px; border-radius: var(--radius-full); font-size: 12px; font-weight: 700; }
.tag-good { background: var(--success-bg); color: var(--success); }
.tag-bad  { background: var(--danger-bg);  color: var(--danger); }
.tag-mid  { background: var(--warning-bg); color: var(--warning); }

/* ============================================================
   Prompt / Code
   ============================================================ */
.prompt-box {
  background: var(--primary-50);
  border-left: 4px solid var(--primary-400);
  border-radius: var(--radius-md);
  padding: 18px 20px;
  font-size: 14px;
  max-height: 360px; overflow-y: auto;
  line-height: 1.8;
  margin-bottom: 16px;
}
.prompt-box h3 { font-size: 15px; color: var(--primary-700); margin: 12px 0 6px; }
.prompt-box h4 { font-size: 14px; color: var(--ink-700); margin: 10px 0 5px; }
.prompt-box h5 { font-size: 13px; color: var(--gray-600); margin: 8px 0 4px; }
.prompt-box p { margin-bottom: 6px; }
.prompt-box ul { margin: 6px 0; padding-left: 20px; }
code {
  background: var(--primary-50);
  color: var(--primary-700);
  padding: 2px 7px; border-radius: 5px;
  font-family: var(--mono); font-size: 12px; font-weight: 600;
}

/* ============================================================
   Tables
   ============================================================ */
.table-wrap {
  overflow-x: auto; border-radius: var(--radius-md);
  border: 1px solid var(--gray-200);
  background: #fff;
}
.section table, .insight table, .table-wrap table {
  width: 100%; border-collapse: collapse; font-size: 13px;
}
.section th, .section td,
.insight th, .insight td,
.table-wrap th, .table-wrap td {
  padding: 10px 14px; text-align: right;
  border-bottom: 1px solid var(--gray-200);
}
.section th:first-child, .section td:first-child,
.insight th:first-child, .insight td:first-child,
.table-wrap th:first-child, .table-wrap td:first-child { text-align: left; }
.section th,
.insight th,
.table-wrap th {
  background: var(--primary-50);
  font-weight: 700; color: var(--ink-700);
  position: sticky; top: 0;
}
.section tr.highlight,
.insight tr.highlight,
.table-wrap tr.highlight { background: var(--primary-50); }
.section tr.highlight td,
.insight tr.highlight td,
.table-wrap tr.highlight td { font-weight: 700; }
.section tr:hover,
.insight tr:hover,
.table-wrap tr:hover { background: var(--gray-50); }

/* ============================================================
   Charts
   ============================================================ */
.chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.chart-box {
  background: #fff; border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg); padding: 20px;
  box-shadow: var(--shadow-sm);
  transition: transform .25s, box-shadow .25s;
  margin-bottom: 0;
}
.chart-box:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.chart-title {
  font-size: 14px; font-weight: 700; color: var(--ink-900);
  margin-bottom: 12px;
  display: flex; align-items: center; gap: 9px;
}
.chart-title::before {
  content: ''; width: 9px; height: 9px; border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 4px var(--primary-100);
}
.chart { width: 100%; height: 300px; }
.chart-full .chart { height: 420px; }

/* 让不在 section 内的 chart-box 之间间距一致 */
.container > .chart-box,
.container > .chart-row { margin-bottom: 20px; }

/* ============================================================
   Section divider
   ============================================================ */
.section-divider {
  border: 0; border-top: 2px solid var(--primary);
  margin: 32px 0; opacity: .6;
}

/* ============================================================
   Back to top
   ============================================================ */
#back-to-top {
  position: fixed; right: 24px; bottom: 24px;
  width: 48px; height: 48px; border-radius: 50%;
  border: none; cursor: pointer;
  background: linear-gradient(135deg, var(--primary-400), var(--primary-600));
  color: #fff; font-size: 19px; line-height: 1;
  display: none; align-items: center; justify-content: center;
  box-shadow: var(--shadow-md);
  transition: transform .2s, box-shadow .2s;
}
#back-to-top:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); }

/* ============================================================
   Responsive
   ============================================================ */
@media (max-width: 1080px) {
  .metric-cards { grid-template-columns: repeat(3, 1fr); }
  .summary-cards { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 960px) {
  .sidebar {
    position: sticky; top: 0; width: 100%; height: auto;
    flex-direction: row; align-items: center;
    padding: 10px 14px; overflow-x: auto; overflow-y: hidden;
    box-shadow: 0 4px 16px rgba(26,26,46,.18);
  }
  .sidebar-brand, .sidebar-section-label, .sidebar-footer { display: none; }
  .nav-link { flex: 0 0 auto; margin: 0 4px; padding: 8px 14px; border-left: none; }
  .nav-link.active { border-left: none; box-shadow: inset 0 -2px 0 var(--primary); }
  .main-content { margin-left: 0; padding: 18px 14px 48px; }
  .page-hero { padding: 28px 22px; }
  .hero-title { font-size: 24px; }
  .chart-row { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .metric-cards { grid-template-columns: repeat(2, 1fr); }
  .summary-cards { grid-template-columns: repeat(2, 1fr); }
  .section, .insight { padding: 20px 16px; }
}
"""


def build_sidebar():
    links = '\n'.join(
        f'  <a href="#{sid}" class="nav-link" data-target="{sid}"><span class="nav-icon">{i+1}</span>{title.split()[1]}</a>'
        for i, (_, title, sid, _, _) in enumerate(SCENARIOS)
    )
    return f"""<nav class="sidebar">
  <div class="sidebar-brand">
    <div class="brand-logo">▣</div>
    <div>
      <div class="brand-title">插件效果分析</div>
      <div class="brand-sub">五场景汇总报告</div>
    </div>
  </div>
  <div class="sidebar-section-label">场景报告</div>
{links}
  <div class="sidebar-section-label">综合洞察</div>
  <a href="#{SUMMARY_ID}" class="nav-link" data-target="{SUMMARY_ID}"><span class="nav-icon">★</span>对比分析汇总</a>
  <div class="sidebar-footer">生成于 2026-08-21 · context-mode</div>
</nav>
"""


def build_hero():
    return """<header class="page-hero">
  <div class="hero-kicker">● Context-Mode 插件 · 效果评测报告</div>
  <h1 class="hero-title">五场景汇总报告</h1>
  <p class="hero-subtitle">带插件 vs 不带插件 · 六维度量化对比分析</p>
  <div class="hero-stats">
    <div class="hero-stat"><b>5</b><span>测试场景</span></div>
    <div class="hero-stat"><b>3</b><span>正向效果</span></div>
    <div class="hero-stat"><b>1</b><span>中性</span></div>
    <div class="hero-stat"><b>1</b><span>偏负向</span></div>
    <div class="hero-stat"><b>26</b><span>可视化图表</span></div>
  </div>
</header>
"""


def build_scripts_iife(scripts):
    """把多个 script 字符串合并成一组 IIFE。"""
    return "\n".join(wrap_iife(s) for s in scripts)


def add_auto_resize(script, chart_ids):
    """在 IIFE 末尾追加 window resize 监听。"""
    if not chart_ids:
        return script
    ids_str = ",".join(f"'{c}'" for c in chart_ids)
    resize = f"""
window.addEventListener('resize', function() {{
  [{ids_str}].forEach(function(id) {{
    var el = document.getElementById(id);
    if (!el) return;
    var inst = echarts.getInstanceByDom(el);
    if (inst) inst.resize();
  }});
}});
"""
    # 插入到 IIFE 关闭括号之前
    if script.rstrip().endswith("})();"):
        script = script.rstrip()[:-5] + resize + "\n})();\n"
    else:
        script = script.rstrip() + "\n" + resize
    return script


def main():
    parts = []
    scripts = []

    for filename, title, section_id, badge_label, badge_class in SCENARIOS:
        html = read_html(DIR / filename)
        html = remove_project_scale(html)

        # 先提取 script 再 namespace，避免误替换 script 里的字面量？
        body = extract_body(html)
        body, scrs = split_scripts(body)

        # 给 body 加 section id
        body = f'<div class="container scenario-section" id="{section_id}">\n{body}\n</div>'

        # 命名空间 body 里的 chart id
        body = namespace_ids(body, section_id.split("-")[1], CHART_IDS_SCENE)

        # 更新 effect badge 样式
        body = update_effect_badge(body, badge_label, badge_class)

        # 给 table 加 wrap
        body = process_table_wrapping(body)

        # namespace scripts 里的 chart id
        prefix = section_id.split("-")[1]
        ns_scrs = [namespace_ids(s, prefix, CHART_IDS_SCENE) for s in scrs]
        combined_script = "\n".join(ns_scrs)
        # 加自动 resize
        ids = [f"{cid}-{prefix}" for cid in CHART_IDS_SCENE]
        combined_script = add_auto_resize(combined_script, ids)

        parts.append(body)
        scripts.append(combined_script)

    # 汇总分析
    html = read_html(DIR / SUMMARY_FILE)
    body = extract_body(html)
    body, scrs = split_scripts(body)
    body = f'<div class="container scenario-section" id="{SUMMARY_ID}">\n{body}\n</div>'
    body = namespace_ids(body, "summary", CHART_IDS_SUMMARY)
    body = process_table_wrapping(body)
    ns_scrs = [namespace_ids(s, "summary", CHART_IDS_SUMMARY) for s in scrs]
    combined_script = "\n".join(ns_scrs)
    ids = [f"{cid}-summary" for cid in CHART_IDS_SUMMARY]
    combined_script = add_auto_resize(combined_script, ids)
    parts.append(body)
    scripts.append(combined_script)

    # 汇总所有 scripts 到一个 script 标签，body 末尾
    all_scripts = "\n".join(scripts)

    scrollspy = """
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav-link'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.scenario-section'));
  var navMap = {};
  links.forEach(function (l) { navMap[l.getAttribute('href').slice(1)] = l; });
  if ('IntersectionObserver' in window && sections.length) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && navMap[e.target.id]) {
          links.forEach(function (l) { l.classList.remove('active'); });
          navMap[e.target.id].classList.add('active');
        }
      });
    }, { rootMargin: '-15% 0px -75% 0px', threshold: 0 });
    sections.forEach(function (s) { obs.observe(s); });
  }
  var btn = document.createElement('button');
  btn.id = 'back-to-top';
  btn.innerHTML = '&uarr;';
  btn.setAttribute('aria-label', '返回顶部');
  btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.body.appendChild(btn);
  window.addEventListener('scroll', function () {
    btn.style.display = (window.scrollY > 400) ? 'flex' : 'none';
  });
})();
"""

    body_html = f"""<div class="main-content">
{build_hero()}
{('<hr class="section-divider">\n').join(parts)}
</div>
<script>
{all_scripts}
{scrollspy}
</script>
"""

    final = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>五场景汇总报告 — context-mode 插件效果分析</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
<style>
{build_css()}
</style>
</head>
<body>
{build_sidebar()}
{body_html}
</body>
</html>
"""

    OUT.write_text(final, encoding="utf-8")
    print(f"Saved: {OUT} ({len(final)} chars)")


if __name__ == "__main__":
    main()
