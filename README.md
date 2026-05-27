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
- `DIANPING_TOKEN`: 大众点评 App 环境 token，新版报名接口必需

可选：

- `DIANPING_CITY_ID`: 城市 ID，默认福州 `14`
- `DIANPING_CITY_NAME`: 城市名称，通知中展示
- `DIANPING_LAT`: 定位纬度，可选；用于模拟 App 详情/预报名请求
- `DIANPING_LNG`: 定位经度，可选；用于模拟 App 详情/预报名请求
- `DIANPING_LOC_CITY_ID`: 定位城市 ID，默认跟 `DIANPING_CITY_ID` 一致
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
DIANPING_COOKIE='你的 Cookie' node index.js --dry-run
```

正式报名：

```bash
DIANPING_COOKIE='你的 Cookie' DIANPING_TOKEN='你的 App token' node index.js
```

## Arcadia

在 Arcadia 环境变量中配置：

- `DIANPING_COOKIE`
- `DIANPING_TOKEN`
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

## Token

`DIANPING_TOKEN` 可以从 Stream 导出的 HAR 中提取。脚本自带本地提取工具，默认只显示脱敏预览：

```bash
node scripts/extract-token.js "/path/to/Stream.har"
```

确认命中的是大众点评当前账号后，再显示完整 token 并复制到 Arcadia 环境变量：

```bash
node scripts/extract-token.js "/path/to/Stream.har" --show-secret
```

不要把完整 token 写入源码、README、日志或提交记录。

## 日志

脚本会输出带时间戳的运行日志，包括配置摘要、列表页抓取进度、活动处理进度、报名结果、报告路径和 Bark 发送状态。日志只显示 `cookie=configured/missing`、`token=configured/missing` 和 `bark=configured/missing`，不会打印 Cookie、token 或 Bark key。

## 说明

大众点评接口可能变更，也可能对账号、Cookie、风控或验证码有额外校验。建议首次运行使用 `node index.js --dry-run`，确认活动列表和过滤规则正常后再正式报名。

当前脚本可以稳定拉取免费试列表。报名流程已按大众点评 App 抓包更新为 `loadactivitydetail.bin -> preapply.bin -> doapply.bin`，并会从预报名结果里自动选择可报名门店后提交。如果接口继续变化，需要用手机 App 重新抓包确认新的详情页和报名接口参数。

如果正式报名时 `loadactivitydetail.bin`、`preapply.bin` 或 `doapply.bin` 返回 `403`，说明该 App 接口拒绝普通 HTTP 请求，可能依赖大众点评 App 原生 MAPI/Shark 通道、设备参数或额外签名。脚本会在第一个 `403` 后停止继续提交，避免对所有活动重复失败请求。
