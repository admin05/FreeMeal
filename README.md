# FreeMeal

大众点评霸王餐/免费试自动报名脚本，面向 Arcadia 定时运行。参考了 `ZhangJinbao520/BaWangCan` 的接口思路，但实现为无第三方依赖的 Node.js CLI，并改为环境变量配置 Cookie 和 Bark。

## 功能

- 拉取指定城市的大众点评免费试活动列表
- 可按关键词、活动模式和最低中奖率过滤
- 支持 dry-run 预览，不提交报名
- 自动提交报名并统计成功、重复、失败、跳过
- 生成 CSV/JSON 报告到 `reports/`
- 通过 Arcadia 环境变量 `BARK` 发送运行摘要

## 环境变量

必需：

- `DIANPING_COOKIE`: 登录后的大众点评 Cookie
- `DIANPING_CITY_ID`: 城市 ID，例如上海为 `1`

可选：

- `DIANPING_CITY_NAME`: 城市名称，通知中展示
- `BARK`: Bark key、完整 Bark URL，或 Bark base URL
- `FREEMEAL_CONFIG`: JSON 配置文件路径，默认读取 `config/local.json`
- `FREEMEAL_DRY_RUN`: `1` 时只预览不报名
- `FREEMEAL_MAX_PAGES`: 最多抓取页数
- `FREEMEAL_MAX_APPLY`: 最多报名活动数
- `FREEMEAL_INCLUDE`: 标题包含关键词，逗号分隔
- `FREEMEAL_EXCLUDE`: 标题排除关键词，逗号分隔
- `FREEMEAL_MIN_WIN_RATE`: 最低中奖率百分比
- `FREEMEAL_MODES`: 活动模式，逗号分隔，例如 `聚会,电子券`

## 使用

先复制配置示例：

```bash
cp config/example.json config/local.json
```

dry-run 检查：

```bash
DIANPING_COOKIE='你的 Cookie' DIANPING_CITY_ID=1 npm run dry-run
```

正式报名：

```bash
DIANPING_COOKIE='你的 Cookie' DIANPING_CITY_ID=1 npm start
```

## Arcadia

在 Arcadia 环境变量中配置：

- `DIANPING_COOKIE`
- `DIANPING_CITY_ID`
- `DIANPING_CITY_NAME`
- `BARK`

运行命令：

```bash
node src/index.js
```

脚本不会在源码、报告或日志里保存 Bark key。Cookie 只从环境变量读取。

## 日志

脚本会输出带时间戳的运行日志，包括配置摘要、列表页抓取进度、活动处理进度、报名结果、报告路径和 Bark 发送状态。日志只显示 `cookie=configured/missing` 和 `bark=configured/missing`，不会打印 Cookie 或 Bark key。

## 说明

大众点评接口可能变更，也可能对账号、Cookie、风控或验证码有额外校验。建议首次运行使用 `npm run dry-run`，确认活动列表和过滤规则正常后再正式报名。
