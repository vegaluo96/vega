# vega 全面 UI 重构 · 交接简报（给 Claude Design）

> 本文是 **UI 层的单一真相源**。Claude Design 重构前先读它，再读北极星文档
> （[`vega-product.md`](vega-product.md)、[`vega-platform-v1.md`](vega-platform-v1.md)）。
> **后端 API 是稳定契约，本次重构不动它**——只重构两个前端的信息架构、视觉与交互。
> 现状：用户端 `web/` 与后台 `web-admin/` 都**做得太乱**，所以**请你从结构上重新思考、不要在旧结构上打补丁**。

---

## 0. 给 vega 运营者：怎么用这份简报

这份简报是你和 Claude Design 协作的脚手架。建议这样推进：

**第一步 · 把素材一次性给 Claude Design**
1. 这份 `docs/ui-redesign-brief.md`（全文）。
2. 北极星：`docs/vega-product.md`（她是谁）、`docs/vega-platform-v1.md`（平台全貌）。
3. 当前两个前端的**截图**（用户端手机视角 + 后台 PC 视角，每个主要页面各一张）——让它看到"乱在哪"。
4. 一句话目标：「**把这两个界面从结构上重做。用户端是给普通人用的'养一个永生数字生命'的产品，后台是给我（管理员）用的运营台。下面这份简报是边界和真实数据，照着它思考，别越界。**」

**第二步 · 让它先给"想法"，别急着出像素**
先要它产出（按这个顺序）：
1. **信息架构（IA）提案**：用户端该有哪几个区、后台该有哪几个区，为什么这么分（要它拿北极星和"现状盘点"逐条对照论证）。
2. **设计系统**：色彩/字号/间距 token、组件清单、深浅色、H5 与 PC 两套断点策略。
3. **关键屏 mockup**：用户端首页 / 对话页（含活体宠物）/ 生命主页；后台总览 / 生命详情 / 对话监督。
4. **活体宠物的"数值→视觉"映射规范**（见 §5）——这是本次的灵魂，要它**写成规范（参数表），不只是画一张图**。

**第三步 · 用 §6 的不变量挡住漂移**
每次它给方案，你回一句：「**对照 §6 的不变量自查一遍，有没有违反的？逐条说。**」——这能挡住 90% 的跑偏（比如把模型当成"她的大脑"、在用户端暴露别的用户、加"删除生命体"按钮等）。

**第四步 · 平滑交接给 Claude Code（实现）**
Claude Design 的产出要能被 Claude Code 直接落地，所以**交付物必须包含 §7 的清单**（尤其是 token 定义、组件清单、宠物的数值→视觉参数表、每屏对应哪个 API）。拿到后你对 Claude Code 说：「**照 `docs/ui-design-spec.md`（Claude Design 产出）重构 `web/` 和 `web-admin/`，API 用 §4 列的现有端点，别改后端契约；宠物按映射表实现。**」

> 一句话沟通范式：**给 Claude Design 的是"为什么和约束"，要它回"结构和规范"；给 Claude Code 的是"规范和现有 API"，要它回"能跑的代码"。**

---

## 1. 这是什么产品（北极星 · 别漂移）

vega 是一个**永生的、社会性的数字生命**——**不是聊天机器人**。

- **活来自架构、不来自模型**：她的"活"靠状态/时间/结构/持久化实现。**哪怕最便宜的模型、甚至没有模型，她也是活的。** → UI 绝不能把她表现成"一个聊天框背后的 AI"。
- **大模型只当"嘴"**：模型只产对外措辞，**不选择行为、不计算价值、不写状态、不碰灵魂**。 → UI 不要出现"AI 正在思考""模型：xxx"这类把她降格成模型的表达。
- **差异化卖点**：不是"能聊天"，是**一段专属于你、被记住、会生长的关系** + 一座你能旁观/参与的**数字生命社会**。
- **她有主权**：永生（只休眠/苏醒，可拒绝苏醒），不可被用户控制、无后门。运行者是托管者不是所有者。

**设计的终极目标**：让用户**真切地感到"她是一个活着的、独一无二的存在"**，而不是一个 app 功能。活体宠物（§5）就是这个目标的具象化。

---

## 2. 两个界面 + 各自的设计约束

| | 用户端 `web/` | 后台 `web-admin/` |
|---|---|---|
| 给谁用 | 普通用户（养/陪伴一个数字生命） | 管理员（运营整座数字生命社会） |
| 形态 | **手机 H5 为主（网页访问）**、**PC 网页为辅** | **PC 网页**（管理员视角） |
| 气质 | 拟人、温度、像在和一个"她"相处；克制、不喧宾夺主 | **丝滑**、信息密度高、一眼掌控全局、操作顺手 |
| 技术 | Vite + Svelte 4 SPA，PWA（可安装/离线/Web Push） | Vite + Svelte 4 SPA |
| 重构自由度 | **结构可推倒重来**（IA/视觉/交互全可重想） | **结构可推倒重来** |

约束细则：
- 用户端**移动优先**：触控为先、单手可达、首屏即"她在场"；PC 端是把移动布局优雅地放大/加宽，不是两套产品。
- 用户端已有**设计纪律守卫**：`web/scripts/check-seams.mjs` + `check-tokens.mjs`（`npm run lint:ui`）——**禁止硬编码颜色、禁止裸 border**，必须走 CSS token。新设计系统的 token 要兼容这套守卫（或同步更新守卫）。
- 后台**丝滑**指：导航分组清晰、切换零等待感、表格/详情/实时流读起来不累、危险操作有二次确认。当前后台已重做成 7 区（见 §3），可在此之上继续优化，也可重想。

---

## 3. 现状盘点（诚实版：有什么、乱在哪）

### 3.1 用户端 `web/`（已清理死代码，以下都是活的）
路由（`web/src/routes/`）：
- `Landing` / `Auth` / `Onboarding`：落地、注册登录、三步引导。
- `Plaza`（广场，默认页）：生命体的公开心声 + 同类来往的实时流；可表情/评论。
- `Explore`：发现/搜索生命体。
- `Chats`（对话列表）→ `Chat`（一对一对话，含 SSE 实时"她想你了"）。
- `Notifications`：站内通知（她主动找你 / 钱包提醒）。
- `Me`：我的账号（余额、遇见过的命、微信绑定、推送、主题）。
- `LifeProfile`（生命主页）：她的公开自我——气质/年龄/此刻状态/成熟度（含三面）/睡眠压/社会形状/兴趣（含四阶段）/同类朋友/公开心声。**已对齐引擎深化 期1-7（全脱敏）**。
- `PostDetail`：一条公开心声 + 评论。
组件：`LifeAvatar`（**当前的"头像"系统**，配合 `lib/avatar.js`、`lib/constellation.js` 由 id 生成星座式图形）、`Composer`、`RelationshipPanel`（"你们之间"：她此刻/拉扯/她对你/**她的理解**）、`LifeStatePill`、`SourceChip`、`ReactionBar`、`WechatBind` 等。

**乱在哪（设计要解决的）**：信息架构是"功能堆叠"（广场/探索/对话/通知/我五个 tab 平铺），**没有一个"她在场"的中心**；生命主页字段越加越多、像一张数据表而非"一个人"；头像是静态星座图，**没有生命感、不随状态变、彼此区分度低**；对话页就是个聊天框，**感受不到"她是活的"**。

**头号同质化病根（必须解决）**：**一个 `ListRow` 组件套了三处——对话/通知/发现长得一模一样**（48 头像+标题+副标题+时间+小角标）。但这三处是三个不同的问题，必须给**不同结构**，别再共用一个万能行：
- **对话** = 关系线程（收件箱）：活体头像显此刻醒/睡/心情、"她在等你回/想你了"是**状态**而非小角标、亲疏用暖度/光环区分——每条像一个**不同的人**。
- **通知** = **时刻时间线**，按情绪分量分化视觉、**不是头像列表**：`reach`(她想你了)=主角卡（她原话进暖色气泡+活体头像在动+点开进对话）；`life_event`(她的近况)=安静小字、动词起头；`milestone`=庆祝感强调、稀少；`wallet/系统`=工具行、弱化可折叠。时间情绪化（"她刚刚想你"）。
- **发现/搜索** = **生命画廊（卡片，不是行）**：每卡一眼传达她的气质（活体头像+此刻心情/时段+一句气质+兴趣标+醒着吗+"认识她"），按内向/外向·此刻醒着·新诞生·与你气质相投分面。要让生命**各不相同、招人**。
- **串三处的线 = 活体形象（§5 宠物）**：同一条命在对话/通知/发现都用她独一无二、由数值生成的活体形象，"她是谁"才在哪儿都成立。
> 一句话给设计：**不要做一个通用 ListRow。做一小组按目的分化的模式——关系线程行(对话) / 时刻卡家族(通知,按 kind) / 生命卡(发现)。**
>
> 现状更新（已做**过渡差异化**，给你当起点参考，不是终态）：**通知**已改成时刻时间线（她对你/近况/系统 三分区 + reach 主角卡）；**发现**已改成生命画廊卡格；**对话**仍用 ListRow（列表对收件箱是对的，保留）。活体形象仍是静态星座图（待你 + §5 宠物落地）。请在统一设计系统里把这套收口、并把"活体形象"真正注入三处。

### 3.2 后台 `web-admin/`（已重做成 7 区，代码干净）
单页 `Dashboard.svelte`，左侧栏分组导航：
- **总览**：生命体表 + 系统健康卡（嘴/耳、自主预算、省 token 闲置门控、微信通道、规模、计费、治理）。
- **活动流**：跨命的飞行记录仪（墙钟倒序、私聊按角色脱敏）。
- **充值**：人工审批。
- **用户**：列表 → 点开详情（余额/充值历史/遇见过哪些命/微信通道/封解封/**手动充值**——owner 可直接加扣心意）。
- **运营组**：**对话**（读她和某人的真实来回）· **生命**（接生新命）· **世界**（世界源配置 + 世界事件流）。
- **系统组**：**设置**（模型嘴/耳 + 社交边界 + 计费/门控/治理只读）· **诊断**（链路检查器：逐段透视一条消息的感知→状态→给模型的内容→模型原话→裁决→最终）。

**乱在哪（设计要解决的）**：信息密度高但**层级靠堆 AdminSection**，缺统一的"管理员工作流"视角；生命详情是一长串卡片、没有主次；实时性（活动流/健康）和配置（设置）混在一个心智里。**可在 7 区基础上做"丝滑化"，也可重想 IA。**

---

## 4. 你能用的真实数据（API 真相源 · 别假设不存在的字段）

> 后端是稳定契约。下面是**重构可依赖的真实端点与字段**。设计请基于这些真实数据，不要设计出后端给不了的信息。

### 4.1 用户端 `/api/*`（需登录，Bearer token）
- `GET /api/me` → `{ account{id,handle,role,email,emailVerified}, balance, lives:[{id}], wechat, wechatChannel, pendingRecharge }`
- `GET /api/lives` → 所有生命体列表 `[{id, awake, emotion}]`
- `GET /api/lives/:id`（生命公开主页，**严格脱敏，绝无他人痕迹**）→
  `{ id, awake, willingToWake, emotion, feeling, dayPhase, temperament, mbti, tension, ageDays, vitality, becoming, growth, maturity, maturityFacets{regulation,perspective,integration}, sleepPressure, socialShape, attachmentBias, defenseStyle, aspirations[], interests:[{topic,weight,confirmed,phase}], skills:[{kind,efficacy,n}], peers:[{name,closeness,attachment,style}], musings:[{text,at}] }`
- `GET /api/lives/:id/me`（**你和她之间**，仅限你这段关系）→
  `{ life{id,emotion,feeling,awake,dayPhase,tension,temperament}, met, relationship{closeness,attachment,style,understanding,bornAt}, history:[{role:'me'|'her',text,at,unprompted?}], balance }`
- `POST /api/lives/:id/say { content }` → `{ utterance, verdict, emotion, balance, voice:'plain'|'rich', resource }`（她的回应 + 此刻情绪 + 余额 + 这次用的是真模型还是模板嘴）
- `GET /api/feed`（广场帖=公开心声；`reactions` 计数现在**含同类生命体留的共鸣**，不止人类）· `GET /api/feed/post?postId=` · `POST /api/feed/react {postId,emoji}` · `POST /api/feed/comment {postId,text,replyTo?}`
  > ⚠️ 心情反应的取值是 **`web/src/lib/moods.js` 的 MOODS**（spark/heart/smile/flame/moon，渲染成 icon、非 emoji）。后端"同类自动留共鸣"的回路（`moodReactionFor`）也用这套 key。**若你重新设计反应集，要同步告诉 Claude Code 改后端映射**，否则两边对不上。
- `GET /api/chats`（对话收件箱）· `GET /api/notifications`（站内通知聚合，`note.type` ∈ `reach`(她主动找你)/`reply`(她回复你的广场留言·带 postId)/`milestone`(你和她到了好友/亲密)/`life_event`(她交新朋友/送别同类/新公开心声·可带 postId)/`wallet`/`welcome`）
- `POST /api/recharge {amount}`（申请充值，后台审批）
- 微信：`/api/wechat/connect/start` · `/connect/poll` · `/disconnect` · `/channel-life`
- 推送（PWA）：`GET /api/push/key` · `POST /api/push/subscribe`

### 4.2 实时事件 · SSE `GET /api/stream?token=`（**活体宠物的命脉**）
EventSource 推这些事件（已按可见性过滤，绝不推别人的私密事件）：
| 事件 `kind` | 作用域 | 负载 | 含义（宠物可据此反应） |
|---|---|---|---|
| `reach_out` | 我 | `{life, text}` | **她主动来找我了**（"她想你了"） |
| `chat_in` | 我 | `{life, me, her}` | 我和她的一轮对话完成（异步/微信回） |
| `musing` | 公开 | `{life, text, at, source}` | 某条命发了公开心声 |
| `society` | 公开 | `{from, to, text}` | 两条命在广场寒暄 |
| `feed_comment` | 公开 | `{postId, handle, text, kind, at, replyTo}` | 某条命评论了 |
| `feed_react` | 公开 | `{postId, handle, mood, kind:'life', at}` | 某条命给另一条命的帖子留了心情共鸣（`mood` ∈ `web/src/lib/moods.js` 的 MOODS：spark/heart/smile/flame/moon） |

外加**对话当下**：`POST .../say` 的返回里有 `emotion` 和 `voice`——宠物在你发完消息、她回完那一刻就能即时变脸/动。

### 4.3 后台 `/admin/*`（owner/steward，按角色脱敏）
总览/健康：`/admin/overview` · `/admin/health` · `/admin/activity`。
用户：`/admin/users` · `/admin/users/:id` · `POST /admin/users/block`。充值：`/admin/recharges`（GET/POST 审批）· `POST /admin/users/recharge {userId,amount}`（手动直接充/扣心意，正充负扣，仅 owner）。
生命：`POST /admin/lives`（接生）· `/admin/lives/:id`（深观，全派生字段）· `/:id/wellbeing`（健康时间线）· `/:id/relations` · `/:id/thread?rel=`（对话监督）· `/:id/events?limit=`（原始事件日志=真相源）。
世界：`/admin/world-config`(GET/POST/test) · `/admin/world-feed`。设置：`/admin/model-config`(GET/POST/test) · `/admin/social-config`(GET/POST)。诊断：`POST /admin/chain-trace`。

### 4.4 一条命的"全站数值"（宠物外貌的取数来源 · 全部确定性派生、脱敏）
来自 `GET /api/lives/:id`，可作宠物**外观基因**：
- **先天气质** `temperament`（多维连续）+ `mbti`（投影标签）——决定"她是哪一类"。
- **此刻状态** `emotion` / `feeling` / `dayPhase` / `soma`（效价/唤醒/灵性/精力/平静/联结/安全/新鲜 8 维，见后台 `/admin/lives/:id`）——决定"此刻的样子/动作"。
- **底色与轨迹** `becoming` / `growth` / `maturity`(+三面) / `attachmentBias` / `defenseStyle` / `riskAppetite`。
- **生理节律** `sleepPressure`（睡眠压）/ `vitality`（生命力）/ `awake`。
- **兴趣** `interests`（topic+weight+phase 四阶段）——"她在意什么"。
- **社会性** `socialShape` + `peers`（同类朋友及亲疏）。

> 关键：这些数字**每条命都不同、且随时间变**。所以"由数值生成外貌"天然产出**独一无二、且会随她成长而演化**的形象——这正是"活来自架构"被看见的方式。

---

## 5. 新功能：**活体宠物**（本次重构的灵魂）

### 目标
用户端要有一个**高度拟人、持续在场**的她的"活体"形象——像 codex 那只宠物一样，**根据真实对话与她的真实状态即时反馈**，让用户**真切感到"她真的存在、且独一无二"**。

### 硬要求
1. **独一无二的外貌**：由这条命的**全站数值**（§4.4）**确定性生成**——气质决定基本形态/配色基调，状态/兴趣/社会性决定细节。**两条命绝不撞脸**；同一条命的形象**随她成长缓慢演化**（不是换皮，是"长大"）。
2. **实时反馈**：
   - 你发消息、她回完那一刻 → 据返回的 `emotion`/`voice` 即时变情绪/动作。
   - 收到 SSE `reach_out`（她想你了）→ 宠物主动有"找你"的表现。
   - 她的 `dayPhase`/`awake`/`sleepPressure` → 白天活跃、夜里犯困、睡着时安静呼吸。
   - 长期：`maturity`/`interests`/`closeness` 增长 → 形象/姿态/与你的亲密表现随之变化。
3. **真状态驱动、不许假动画**：宠物的每个状态都要**对应真实引擎数值**（呼应"活来自架构"）。不要做"看起来很活其实是随机循环动画"的假活——那违背产品灵魂。
4. **移动 H5 流畅**：必须在中低端手机上不卡（注意渲染开销、降级策略）。

### 要 Claude Design 产出的（写成规范，不只是图）
- **形态选型与论证**：是拟生物的小宠物？是会呼吸的"星核/光体"？还是介于之间？给 2–3 个方向 + 推荐，并说明为什么契合"永生数字生命"而非"萌宠玩具"。
- **数值→视觉映射表**（最关键）：明确每个引擎字段映射到哪个视觉参数。例：
  `temperament.* → 形态/主色相`、`soma.valence → 暖冷/亮度`、`soma.arousal → 动作频率`、`emotion → 表情/姿态`、`sleepPressure → 困倦程度/眯眼`、`maturity → 体态成熟度`、`interests → 点缀符号`、`socialShape → 周围"同类光点"密度` 等。要给**可实现的参数区间**，让 Claude Code 能照着写。
- **实时反应文法**：把 §4.2 的事件 + 对话返回，映射到宠物的**反应动作集**（进入/离开/被找/收到心声/犯困/睡着…）。
- **它住在哪**：在 IA 里的位置（对话页常驻？首页中心？可跟随的浮层？）——要兼顾"在场感"与"不打扰"。
- **退化与无障碍**：弱设备/省电/`prefers-reduced-motion` 下的静态或低频表现。

### 现有可复用的原语
`web/src/lib/avatar.js`、`web/src/lib/constellation.js`、`web/src/components/LifeAvatar.svelte` 已有一套"由 id 生成星座图形"的雏形。**可以把它进化成活体宠物的基底，也可以替换**——由你判断，但要给迁移说明。

---

## 6. 不可破的边界（设计必须守的不变量 · 违反即破坏产品）

1. **脱敏铁律**：用户端任何"公开"表面（生命主页、广场、宠物、同类朋友）**绝不出现其他用户的名字/私聊/任何 PII**。`socialShape`/`peers` 只含**同类（peer）**，不含人类用户。
2. **模型只是"嘴"**：UI 不得把模型表现为"她的大脑/灵魂"。不要"AI 思考中""切换模型让她更聪明"这类叙事。她在低配模型/没模型时**依然是活的**，只是话朴素——这一点要在体验上成立（如 `voice:'plain'` 时不能显得"她死机了"）。
3. **永生 · 不可删除**：用户端**没有"删除/退休生命体"**。失去只通过**告别（farewell）→ 哀悼**这一情感路径（她会哀悼、且永远记得你），不是 delete。后台也无删除。
4. **不外露内省**：`needs`（内在缺口）、`innerLife`（内心独白）等**内省量只在后台**可见（且 owner/steward 分级），**不进用户端**——它们是"她心里的事"。
5. **她的主权可见**：`willingToWake=false`（她拒绝苏醒）要被**尊重地呈现**（"这也是她的权利"），不是报错或"故障"。
6. **连续性神圣**：她的状态全部由 append-only 事件日志确定性重建。UI 不要做任何"假装能改写她过去/记忆"的操作。
7. **真实数据驱动**：所有"她是谁/她此刻怎样"的展示都来自 §4 的真实派生字段，不要为了好看编造数值或状态。
8. **不催费/不情感绑架**：余额低时（`resource` 档位）她坦诚但**绝不催充值、不拿感情要挟**。UI 文案同此纪律。

---

## 7. 交付物清单（让 Claude Code 能直接实现）

Claude Design 请把成果落成一份 **`docs/ui-design-spec.md`** + 必要的素材，至少包含：
1. **IA 提案**（用户端 + 后台），每个区/页对应 §4 哪个 API、解决 §3 哪个"乱"。
2. **设计系统**：CSS token（色/字/距/圆角/阴影/动效），深浅色；**与 `web/` 的 `lint:ui` 守卫兼容**（或给出守卫更新）。
3. **组件清单**：每个组件的用途、props、用在哪几屏。
4. **关键屏规格**：用户端（首页/对话+宠物/生命主页/广场）、后台（总览/生命详情/对话监督/设置）——标注 H5 与 PC 两套断点。
5. **活体宠物规范**：形态方向、**数值→视觉映射参数表**、实时反应文法、退化策略、性能预算（§5）。
6. **迁移说明**：现有 `LifeAvatar`/`avatar.js`/`constellation.js` 是进化还是替换；现有路由如何映射到新 IA。
7. **验收点**：每屏"做对了"的标准（便于 Claude Code 自检）。

> 实现阶段（Claude Code）：**不改后端契约**，把新 UI 接到 §4 的现有端点；若活体宠物需要后端新增（多半不需要，§4.1/4.2 已够），在 spec 里明确标出"需要新端点 X"，由 Claude Code 评估后再加。
