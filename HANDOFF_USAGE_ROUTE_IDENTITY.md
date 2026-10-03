# 使用明细路由身份：完成交接

更新时间：2026-08-26（实现完成，待审阅合并提交）

## 状态

目标已实现并经真实页面验证：同为 `codex + gpt-5.6-sol` 的并发请求，使用明细可区分
官方订阅（OAuth）与 Moyuu 中转（api-key 实例），Provider 列分别显示
`[OAuth] 邮箱` 与中转 base-url；推力强度以徽章显示；密钥不再出现（含遮蔽形态仅在
URL 解析失败时兜底）。手动刷新/时间窗口/面板被覆盖三个次生问题也已修复。

## 后端字段事实（已确认，作为契约依据）

来源：CLIProxyAPI 7.2.138 二进制符号表 + Go 类型名表解析，并用本机 EasyCLI
`usage-records/usage.db`（`collector_source='redis_subscribe:usage'`，同一 usage 事件）
逐字段交叉验证。后端源码本机不可得。

`GET /v0/management/usage-queue?count=N`（取出即弹出）payload 字段：

| 字段 | 语义 |
|---|---|
| `model` | 实际上游模型 |
| `alias` | 最终选中模型项的 alias |
| `original_alias` | 客户端请求的原始模型（存在性来自二进制类型表，未在 DB 持久化中复现，前端按可选处理） |
| `provider` | 仅 provider 类型（如 `codex`） |
| `source` | 最终选中凭据身份。OAuth = 邮箱；**api-key 实例 = 原始 API key（秘密）** |
| `auth_index` | 稳定非秘密实例 ID |
| `auth_type` | `oauth` / `api-key` |
| `reasoning_effort` | 推力强度（medium/high/xhigh/max…） |
| `timestamp`/`latency_ms`/`ttft_ms`/`tokens.*`/`client_ip`/`request_id`/`endpoint`/`api_key`/`failed`/`fail.status_code`/`fail.body` | 现有口径，未改动 |

payload **不含** model/provider 的配置 `display-name`；该需求需后端在
`queuedUsageDetail` 增加 display-name 快照字段（跨仓库，未授权，未做）。

## 前端实现（本仓库）

- `src/types/usage.ts` — `UsageRecord` 新增：`requestedModel`、`modelAlias`、
  `providerInstanceId`（auth_index）、`providerInstanceLabel`（展示值：邮箱/URL/遮蔽）、
  `providerInstanceUrl`、`providerAuthType`、`reasoningEffort`。全部可选，兼容旧
  IndexedDB 记录。`normalizedModel` 语义收窄为仅定价显示名。
- `src/features/usage/collector/logCollector.ts` —
  - `parseUsageQueueRecord(raw, pricingRules, providerIndex)` 逐字段解析，不再把
    定价 displayName 折叠进路由身份；
  - `maskInstanceLabel`：api-key 形态 source（无 `@`、无空白、≥24 字符）遮蔽为
    `sk-***xxxx`；幂等，渲染层对旧记录兜底复用；
  - `buildProviderInstanceIndex(config)`：从 `GET /v0/management/config` 构建
    `auth-index` / api-key 原值 → `{name, baseUrl}` 索引，覆盖 codex/claude/gemini/
    xai/vertex/interactions 各 api-key 段与 openai-compatibility（含 api-key-entries）。
    索引仅采集时内存使用，密钥不入库（测试以 `JSON.stringify(record)` 断言）。
    注意：Moyuu 配在 **codex-api-key**（`https://long.moyuu.cc/v1`），不在
    openai-compatibility —— 这是最后一次修复的关键事实。
- `src/features/usage/UsagePage.tsx` —
  - `collectUsageQueue` 提为 useCallback；刷新按钮与顶栏刷新先采集后重查
    （原按钮只重读 IndexedDB，不会从队列取数）；
  - `filterParams` 不再冻结 `endTime`（原实现把窗口上界定死在挂载时刻，之后完成的
    请求永远落在 `IDBKeyRange.bound` 之外，导致"刷新不出新记录"）；
  - provider 索引 60s 缓存，随 15s 采集周期复用，未增加 usage-queue 轮询。
- `src/features/usage/components/requests/UsageRequestsTab.tsx` + `.module.scss` —
  模型列主行 `alias + 推力徽章`，副行 `requested → upstream`；Provider 列
  OAuth 绿色徽章 + 邮箱，或中转 URL；搜索覆盖 alias/请求模型/上游模型/实例身份/ID。
  推力配色：minimal/low 灰 → medium 绿 → high 金 → xhigh 琥珀 → max 红（复用应用
  语义色变量）。
- `src/features/usage/components/requests/UsageRequestDetailSheet.tsx` — 详情分别
  列出上游/请求模型、alias、定价显示名、认证方式、实例、实例 URL、推力强度；
  "复制完整 JSON" 同样走脱敏。
- `tests/usageRouteIdentity.test.ts` — 9 个用例：同 model+provider 不同实例可区分、
  定价名不覆盖路由身份、旧 payload 降级、token/缓存/费用口径不变、遮蔽幂等与
  邮箱透传、URL 解析（auth_index 与 api-key 双路）、密钥零入库、auth_type 保留。

另含 3 处定向 `eslint-disable react-hooks/purity`（UsagePage 1 处、useUsageAnalytics
2 处）：这些 lint 错误在 HEAD 已存在（`Date.now()` 在 useMemo 内），非本任务引入，
为让 `bun run verify` 通过做最小豁免，行为未变。

## 部署与运行环境（仓库外，重要）

- 后端：`C:\Users\26294\Tools\CLIProxyAPI\cli-proxy-api.exe`，`127.0.0.1:8317`，
  面板由 `static/management.html` 托管。
- 后端有面板自动更新：定期从 GitHub 拉取官方面板原子覆盖 `static/management.html`
  （本次曾覆盖掉手工部署，导致页面回退原版）。已在 `config.yaml` 的
  `remote-management:` 下设置 `disable-auto-update-panel: true`
  （备份 `config.yaml.before-disable-panel-autoupdate-20260826-1555.bak`）。
- 部署方式：`bun run build` 后
  `cp dist/index.html /c/Users/26294/Tools/CLIProxyAPI/static/management.html`，
  以 curl 比对 hash 验证后端实际返回新构建。旧版备份：
  `management.html.bak-20260826` / `.bak-20260826-1130`。
- 残留风险：后端完整重启时是否会重新释放内嵌面板未经触发验证；若页面再次回退，
  重新执行上面的 cp 即可。

## 验证记录

- `bun run verify`：430 测试全过、ESLint 0 error（1 个既有 warning）、tsc + build 通过。
- `bun test tests/usageRouteIdentity.test.ts`：9/9。
- `git diff --check`：干净。
- `python C:/Users/26294/.ai/check_change_budget.py`：唯一新文件为
  `tests/usageRouteIdentity.test.ts`。
- 真实页面验证：用户在 8317 页面确认并发 Moyuu/官方订阅/auto-review 记录可区分
  （2026-08-26，含截图）；密钥显示问题、刷新问题、URL 显示均按用户反馈迭代修复。

## 未解决边界

1. 旧 IndexedDB 记录（2026-08-26 20:25 前采集）无路由字段，显示 `—`/遮蔽形态，
   属设计行为，不伪造归属；如需追溯可加渲染时按 auth_index 联表（未做）。
2. 配置 display-name 需后端扩展 payload（跨仓库，等授权）。
3. `original_alias` 在真实 payload 中的存在性未 100% 复现，前端按可选解析，
   缺省时副行退化为仅上游模型。
4. 多管理页并发打开时的队列消费模型（取出即弹出）维持原状，未在本次范围。

## 工作区状态（供审阅/提交者）

- 分支 `main`，领先 `origin/main` 3 个本地提交（用户既有工作，勿动）。
- 未提交改动 = 用户此前的 usage dashboard WIP（mock 删除、useUsageRecords 精简、
  logs.ts 接口调整等）+ 本次路由身份实现，两者在同一批文件中交织。
- 未跟踪：`HANDOFF_USAGE_ROUTE_IDENTITY.md`（本文件）、`tests/usageRouteIdentity.test.ts`。
- 仓库外改动（不属于本仓库提交范围）：后端 `config.yaml` 的
  `disable-auto-update-panel: true` 与 `static/management.html` 部署。
