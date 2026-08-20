# 项目长期备忘

## 目录约定
- `E:\WT\save-tokens\workbuddy\`：只放**助手生成**的交付物（如 context-mode-merged.html、merge-reports.js），不得放入用户原有文件。
- `funlist\`：用户原有报告与工具（10 个 round-tokens 源报告、analyze/compare/detect/generate 脚本、chart_issue*.png、cross-comparison-report.html 等）。用户脚本输出到 `__dirname`（funlist）。
- `test-scenarios/` = 原始日志分类（with/without-context-mode × 5 场景），`proxy.mjs` / `proxy.log` = 流量采集链路。

## 用户偏好
- 数据驱动、结构化呈现（表格/场景对比/具体指标）。
- 不喜欢"分析仪表盘"式的过度加工；要求把开/关两份报告**真正合成同一个 DOM**（卡片/表格/图表同页左右对齐、一起滚动），不要 iframe 并排。
- 开/关两组是非受控实验（轮次不同），对比时注意归一化；缓存命中率是最稳健信号。
