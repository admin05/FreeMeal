# FreeMeal

大众点评霸王餐/免费试活动发现脚本，面向 Arcadia 定时运行。脚本只做“发现 + 筛选 + 通知”，不再自动提交报名，避免普通 Node 环境直接请求 App 报名接口导致 403 或触发风控。

## 功能

- 拉取指定城市的大众点评免费试活动列表
- 可按关键词、活动模式和最低中奖率过滤
- 发现符合条件的活动并统计匹配、跳过
- 生成 CSV/JSON 报告到 `reports/`
- 通过 Arcadia 环境变量 `BARK` 发送运行摘要，通知链接优先打开 iPhone 上的大众点评 App

## 环境变量

可选：

- `DIANPING_CITY_ID`: 城市 ID，默认福州 `14`
- `DIANPING_CITY_NAME`: 城市名称，通知中展示
- `DIANPING_COOKIE`: 登录后的大众点评 Cookie，可选；用于访问详情页时带上账号态
- `BARK`: Bark key、完整 Bark URL，或 Bark base URL
- `FREEMEAL_CONFIG`: JSON 配置文件路径，默认读取 `config/local.json`
- `FREEMEAL_MAX_PAGES`: 最多抓取页数
- `FREEMEAL_MAX_RESULTS`: 最多推送和报告的匹配活动数
- `FREEMEAL_INCLUDE`: 标题包含关键词，逗号分隔
- `FREEMEAL_EXCLUDE`: 标题排除关键词，逗号分隔
- `FREEMEAL_MIN_WIN_RATE`: 最低中奖率百分比
- `FREEMEAL_MODES`: 活动模式，逗号分隔，例如 `聚会,电子券`

## 使用

先复制配置示例：

```bash
cp config/example.json config/local.json
```

本地运行：

```bash
node index.js
```

## Arcadia

在 Arcadia 环境变量中配置：

- `BARK`

脚本默认使用福州：`DIANPING_CITY_ID=14`、`DIANPING_CITY_NAME=福州`，一般不用在 Arcadia 里额外配置城市。

运行命令：

```bash
node index.js
```

如果 Arcadia 项目习惯使用 `checkin.js` 作为入口，也可以填：

```bash
node checkin.js
```

如果运行日志只有“执行开始/执行完毕”，但没有 `[FreeMeal] [INFO] Script started`，说明 Arcadia 没有执行到本项目入口。请检查任务的运行命令是否填了上面的 `node index.js` 或 `node checkin.js`。

脚本不会在源码、报告或日志里保存 Bark key。Cookie 只从环境变量读取。

Bark 通知正文里的活动链接使用 `dianping://picassobox?...` App 深链；点通知本身会打开本次第一个匹配活动。报告里会同时保存网页链接和 App 链接。

## 日志

脚本会输出带时间戳的运行日志，包括配置摘要、列表页抓取进度、活动处理进度、报告路径和 Bark 发送状态。日志只显示 `cookie=configured/missing` 和 `bark=configured/missing`，不会打印 Cookie 或 Bark key。

## 说明

大众点评接口可能变更，也可能对账号、Cookie、风控或验证码有额外校验。当前脚本只拉取免费试列表、读取可公开访问的详情信息并推送匹配活动，不提交报名请求。报名建议在大众点评 App 内手动完成。
