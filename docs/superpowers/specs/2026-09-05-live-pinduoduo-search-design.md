# PriceAI 搜索页实时拼多多报价层设计

## 目标

在不写入 Supabase、不伪造评分或购买链接的前提下，将拼多多实时推荐商品池经过确定性搜索匹配后，作为临时报价叠加到 PriceAI 标准商品搜索结果。实时 PDD 报价参与最低价与平台报价展示，但不参与当前 PriceAI 评分。

## 边界

- 继续使用 `pdd.ddk.goods.recommend.get` 作为实时商品池；为 `pdd.ddk.goods.search` 保留独立 `searchGoods(query)` 客户端方法。
- 调用顺序为 `searchGoods(query)`；若返回空列表，再调用推荐商品池并做本地匹配。
- 不写入 `products`、`product_variants`、`offers` 或价格历史表，不修改 Supabase schema。
- 不生成购买链接，不实现转链、OAuth token exchange、订单、佣金结算、淘宝或京东。
- 不创建任何 `NEXT_PUBLIC_PDD_*` 变量；所有 PDD 凭据只在服务端客户端中使用。

## 架构

### 1. PDD 客户端与字段解析

扩展现有 `PinduoduoClient`：

- `searchGoods(query, options)` 独立调用 `pdd.ddk.goods.search`。
- `getRecommendedGoods(options)` 保持现有能力。
- 两种响应统一解析为 `PinduoduoRecommendedGoods`。
- 新增并保留 `minGroupPrice`、`extraCouponAmount`、`optName`、`catIds`、`goodsDescription`、`fetchedAt`。
- 所有官方定义为分的金额字段在解析边界转为人民币元。
- 不记录完整请求体、签名、凭据或原始响应。

价格策略：

1. `min_normal_price` 是原始单买价。
2. `min_group_price` 存在且为正时是可比较团购价。
3. `coupon_price` 仅在已确认表示可用券后价格时作为候选价格；否则只作为优惠券元数据展示。
4. `extra_coupon_amount` 是额外优惠金额，不直接当作商品价格。
5. 主价格取已经确认具有成交价语义的正数候选中的最低值，不把 `promotion_rate`、佣金或补贴额当作价格。

### 2. 搜索匹配与主体识别

新增纯函数模块处理 PDD 商品池，不由 AI 决策：

- 将查询词和商品标题按中文片段、英文单词、数字和型号边界分词，并处理 `Apple/苹果` 等品牌别名。
- 标准商品名称、品牌、规格中的核心 token 为必须或高权重匹配项。
- 完整型号短语、品牌、存储规格、数字型号分别加权。
- 手机壳、保护膜、数据线、充电器、支架、镜头膜、配件等负面词直接判为配件。
- `category_name`、`opt_name`、`cat_ids`、商品描述和商城信息只作为确定性辅助证据。
- 手机主体需要满足主体关键词或手机类目证据，并达到最低相关性阈值。
- 结果按相关性降序、有效价格升序、销量降序、商品 ID 稳定排序。
- 按 `goods_id` 去重，每个标准商品最多保留 5 条实时 PDD 报价。

### 3. 临时报价层与现有目录融合

新增服务端 `getSearchProductsWithLivePinduoduo(query)`：

1. 读取现有 Supabase/Mock 目录。
2. 无关键词时不发起 PDD 实时请求，避免无界调用。
3. 有关键词时读取带 10 分钟 TTL 的服务端 PDD 查询缓存。
4. 先调用正式 `searchGoods(query)`；为空时调用推荐商品池并本地筛选。
5. 将合格结果按标准商品和规格匹配，形成 `LivePinduoduoOffer`。
6. 返回原始 `Product[]` 与按 product/variant 分组的临时报价，不修改原对象，不写数据库。
7. 请求失败、环境变量缺失或没有合格结果时返回空临时报价图，搜索页完整使用现有目录。

缓存只保存标准化后的公开商品数据，不缓存 client secret、签名或完整原始响应。缓存键由规范化查询、页数和版本组成，TTL 为 10 分钟，并限制商品池大小。

### 4. 搜索结果与评分

扩展 `ProductSearchRow`，增加与卡片展示相关的 `livePinduoduoOffers` 和 `displayLowestOffer`，但保留现有 `lowestOffer` 作为评分数据来源：

- PriceAI Score 继续只基于持久化完整 Offer。
- 价格筛选、价格排序和卡片最低价使用持久化报价与“卡片当前展示规格明确一致”的实时 PDD 报价中的最低有效价。规格未知或属于其他规格的实时报价仍可在独立区域展示，但不得压低当前规格主价格。
- 实时 PDD 报价不提供虚构 `rating` 或 `reviewCount`。
- 商品卡新增“实时拼多多报价”小节，展示实时标记、标题、商城、图片、价格、销量提示和经确认的优惠券信息。
- 文案明确说明“实时拼多多报价暂未参与 PriceAI 评分”。
- 若没有实时结果，卡片结构和现有报价完全不变。

`LivePinduoduoOffer` 是独立类型，不扩展或污染当前需要完整评分字段的 `Offer`。未来获得可靠评分与购买链接后，可以在服务端映射边界将其升级为完整 `Offer`，再进入 `ProductVariant.offers`。

## 缓存与失败处理

- 使用 Next.js 服务端缓存能力或等价的进程内受限缓存，TTL 固定为 600 秒。
- 单次搜索到推荐池的完整上游序列最多等待 8 秒；超时后返回空实时报价层，页面继续使用现有目录。
- 同一规范化查询在 TTL 内复用结果。
- PDD 失败只记录安全、固定格式的错误类别和状态，不包含 secret、sign、token、完整 URL、请求体或原始响应。
- 页面捕获实时层错误并回退现有目录，不产生 500。

## 测试

- `searchGoods` 与推荐池 fallback 顺序。
- 查询 token、品牌别名、型号与规格相关性。
- 手机主体、配件和明显无关商品分类。
- 金额分转元、团购价与优惠券候选策略。
- PDD 临时报价字段映射，不存在 rating/reviewCount。
- `goods_id` 去重、稳定排序和 Top 5。
- 缓存命中与 10 分钟过期。
- API 失败和缺少环境变量时回退。
- 搜索服务融合后的最低价、价格排序和评分隔离。
- 商品卡出现实时 PDD 信息及“未参与评分”说明。

## 验证与发布

运行 `npm.cmd test`、`npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd run build`，检查 Git 差异和敏感信息，只暂存本轮文件，使用指定提交信息提交并推送。等待 Vercel Ready 后在生产站搜索 `iPhone 16 Pro`，确认标准商品存在、合格实时 PDD 报价正确展示或安全回退、无配件误匹配、无 500 和敏感信息泄漏。
