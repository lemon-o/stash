# 刮削器开发指南（Scraper Development）

您可以为社区贡献自制刮削器，或为个人专属站点定制刮削规则。

## 刮削器配置文件结构（YAML）

刮削器定义在 `.yml` 文件中，顶层结构如下：

```yaml
name: 网站名称
sceneByName:        # 按关键词检索短片
  action: scrapeXPath
  ...
sceneByURL:         # 按 URL 抓取短片
  - action: scrapeXPath
    url:
      - 目标网站域名
    ...
performerByName:    # 按姓名检索演员
  ...
performerByURL:     # 按 URL 抓取演员
  ...
```

## 支持的动作类型（Actions）

- `scrapeXPath`：使用 XPath 规则直接解析 HTML 网页内容（速度快、轻量，适合绝大多数静态或半静态网站）。
- `script`：调用外部脚本（如 Python、Node.js），将页面内容或 JSON 结果输出给 Stash。

## XPath 提取常用语法

- 文本内容：`//h1/text()`
- 属性获取：`//img/@src`
- 条件筛选：`//div[contains(@class, 'title')]/text()`
- 日期格式化：可指定 `date: { selector: "//span[@class='date']", format: "January 2, 2006" }` 进行自动时间转换。
