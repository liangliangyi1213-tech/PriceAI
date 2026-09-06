# Live Pinduoduo Search Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-only, cached Pinduoduo live-offer layer to PriceAI search results without persisting it or allowing incomplete PDD data to affect PriceAI scores.

**Architecture:** The search page keeps the persisted Supabase catalog as its source of standard products and scores. A separate server service queries `goods.search`, falls back to `goods.recommend.get` when needed, deterministically filters and attaches up to five live PDD offers per matching standard product, and returns those offers only as display data. Failures and missing configuration return an empty live layer so the existing catalog remains fully usable.

**Tech Stack:** Next.js 16 App Router, TypeScript, React Server Components, Vitest, Testing Library, existing Pinduoduo Open Platform client and catalog models.

**Spec:** `docs/superpowers/specs/2026-09-05-live-pinduoduo-search-design.md`

## Global Constraints

- Do not read, print, modify, stage, or commit `.env.local`.
- Keep `PDD_CLIENT_ID`, `PDD_CLIENT_SECRET`, and `PDD_PID` server-only; never log secrets, signatures, tokens, full request URLs, or raw responses.
- Do not change Supabase schema or write live PDD offers to Supabase.
- Do not invent rating, review count, price, coupon, sales, URL, or other missing facts.
- Live PDD offers may affect displayed lowest price and platform comparison, but must not enter `ProductVariant.offers` or PriceAI score inputs.
- Matching, accessory rejection, price conversion, coupon handling, deduplication, and Top N selection must be deterministic.
- Retain the current catalog unchanged when PDD is unavailable or no eligible match exists.
- Do not implement Taobao, JD, OAuth token exchange, order, link conversion, commission settlement, or checkout.
- Make one final commit only, with message `feat: integrate live Pinduoduo offers into search`, and stage only explicit task files.

---

### Task 1: Complete the Pinduoduo client search and monetary fields

**Files:**
- Modify: `src/lib/platforms/pinduoduo-client.ts`
- Modify: `src/lib/platforms/pinduoduo-client.test.ts`

**Interfaces:**
- Produces: `PinduoduoGoods` containing `minNormalPrice`, `minGroupPrice`, `couponPrice`, `couponMinOrderAmount`, `extraCouponAmount`, category/description metadata, sales metadata, and `fetchedAt`.
- Produces: `parsePinduoduoSearchResponse(value: unknown): PinduoduoGoodsResponse`.
- Produces: `PinduoduoClient.searchGoods(query: string, options?: { limit?: number; page?: number }): Promise<PinduoduoGoodsResponse>`.
- Preserves: `getRecommendedGoods()` and the existing official signing/request behavior.

- [ ] **Step 1: Add failing response and request tests**

  Add fixtures proving that `goods_search_response.goods_list` is parsed, documented fen fields become yuan through `fenToYuan`, absent optional fields remain absent, and the request uses method `pdd.ddk.goods.search`, `keyword`, `page`, and `page_size` without exposing the signature in errors.

- [ ] **Step 2: Run the focused test and confirm RED**

  Run: `npm.cmd test -- src/lib/platforms/pinduoduo-client.test.ts`

  Expected: failure because search parsing/methods and added fields do not exist.

- [ ] **Step 3: Implement one shared safe request path**

  Refactor only the duplicated HTTP assembly into a private method, reuse the current signer and official router, add the search response envelope parser, and parse only known fields. Store `extra_coupon_amount` as an amount, never as a price candidate.

- [ ] **Step 4: Run the focused test and confirm GREEN**

  Run: `npm.cmd test -- src/lib/platforms/pinduoduo-client.test.ts`

  Expected: all client tests pass.

### Task 2: Add deterministic subject matching and live price selection

**Files:**
- Create: `src/lib/search/pinduoduo-relevance.ts`
- Create: `src/lib/search/pinduoduo-relevance.test.ts`
- Create: `src/lib/search/pinduoduo-live-offer.ts`
- Create: `src/lib/search/pinduoduo-live-offer.test.ts`

**Interfaces:**
- Produces: `classifyPinduoduoGoods(query: string, product: Product, goods: PinduoduoGoods): "subject" | "accessory" | "unrelated"`.
- Produces: `scorePinduoduoRelevance(query: string, product: Product, goods: PinduoduoGoods): number`.
- Produces: `selectComparablePinduoduoPrice(goods: PinduoduoGoods): { price: number; normalPrice?: number; groupPrice?: number; couponPrice?: number } | null`.
- Produces: `LivePinduoduoOffer`, which intentionally has no `rating`, `reviewCount`, or `ProductVariant.offers` compatibility.
- Produces: `selectLivePinduoduoOffers(products: Product[], query: string, goods: PinduoduoGoods[], limitPerProduct?: number): Map<string, LivePinduoduoOffer[]>`.

- [ ] **Step 1: Add failing relevance tests**

  Cover case-insensitive tokenization, compact model tokens such as `iphone16`, `Apple`/`苹果` brand aliases, required model-number matching, and rejection of names containing deterministic accessory terms such as 手机壳、保护膜、数据线、充电器、镜头膜、支架、配件、适用于.

- [ ] **Step 2: Add failing pricing and selection tests**

  Assert that normal and group prices are comparable candidates; coupon price is used only when the parsed field represents the confirmed payable coupon price and its threshold is satisfied by the base candidate; `extraCouponAmount` is never used alone; invalid/non-positive prices return `null`; duplicate `goodsId` values collapse; sorting is relevance descending, comparable price ascending, sales descending, goods ID ascending; and only five offers remain per product.

- [ ] **Step 3: Run focused tests and confirm RED**

  Run: `npm.cmd test -- src/lib/search/pinduoduo-relevance.test.ts src/lib/search/pinduoduo-live-offer.test.ts`

  Expected: failure because the modules do not exist.

- [ ] **Step 4: Implement normalization, classification, score, price, and selection**

  Normalize punctuation/spacing, expand only an explicit brand alias table, require positive query/model evidence, hard-reject accessory evidence, compute a transparent weighted score, attach the best matching variant ID without mutating it, and create live-only offer records with title, image, merchant, price components, coupon/sales/promotion metadata, source `live`, and fetch time.

- [ ] **Step 5: Run focused tests and confirm GREEN**

  Run: `npm.cmd test -- src/lib/search/pinduoduo-relevance.test.ts src/lib/search/pinduoduo-live-offer.test.ts`

  Expected: all relevance, pricing, deduplication, and Top N tests pass.

### Task 3: Add the cached server-only live search service

**Files:**
- Create: `src/lib/search/pinduoduo-live-service.ts`
- Create: `src/lib/search/pinduoduo-live-service.test.ts`
- Modify: `src/lib/platforms/pinduoduo-adapter.ts`
- Modify: `src/lib/platforms/pinduoduo-adapter.test.ts`

**Interfaces:**
- Produces: `PinduoduoAdapter.searchGoods(query: string, options?: PlatformSearchOptions): Promise<PlatformSearchResult[]>` as a real separate endpoint.
- Produces: `getLivePinduoduoOffers(products: Product[], query: string): Promise<Map<string, LivePinduoduoOffer[]>>`.
- Uses: a 600-second query-result cache that stores only parsed public product data, never credentials or signed request URLs.

- [ ] **Step 1: Add failing adapter and service tests**

  Cover `searchGoods` returning mapped search results, empty search triggering recommendation-pool fallback in the service, a non-empty search skipping recommendations, missing environment configuration returning an empty map, API rejection returning an empty map, and repeated equal queries using cached data.

- [ ] **Step 2: Run focused tests and confirm RED**

  Run: `npm.cmd test -- src/lib/platforms/pinduoduo-adapter.test.ts src/lib/search/pinduoduo-live-service.test.ts`

  Expected: failure because the adapter search and live service are absent.

- [ ] **Step 3: Implement the adapter method and service orchestration**

  Keep endpoint fallback above the UI: call `searchGoods(query)`, call `getRecommendedGoods()` only when search returns no goods, then run Task 2 selection. Return an empty map for missing configuration, request errors, or no matches; emit only a fixed safe warning identifier without raw errors or request material.

- [ ] **Step 4: Implement the 600-second cache**

  Key by normalized query and cache only parsed goods arrays. Ensure rejected requests are not cached and keep cache construction injectable so tests use a deterministic fake clock/cache.

- [ ] **Step 5: Run focused tests and confirm GREEN**

  Run: `npm.cmd test -- src/lib/platforms/pinduoduo-adapter.test.ts src/lib/search/pinduoduo-live-service.test.ts`

  Expected: all adapter, fallback, and cache tests pass.

### Task 4: Merge live offers into search presentation without changing score inputs

**Files:**
- Modify: `src/lib/search/products.ts`
- Modify: `src/lib/search/product-search.test.ts`
- Modify: `src/app/search/page.tsx`
- Modify: `src/components/search/search-product-card.tsx`
- Modify: `src/components/search/search-ui.test.tsx`
- Modify: `src/components/search/presentation.ts`
- Modify: `src/components/search/presentation.test.ts`
- Create: `src/components/search/live-pinduoduo-offers.tsx`

**Interfaces:**
- Modifies: `searchCatalog(products, searchQuery, liveOffersByProduct?)` where the optional third argument is `ReadonlyMap<string, readonly LivePinduoduoOffer[]>`.
- Extends: `ProductSearchRow` with `livePinduoduoOffers` and `displayLowestPrice`; retains the persisted `lowestOffer` as the only score source.
- Consumes: `getLivePinduoduoOffers(products, query)` from Task 3.

- [ ] **Step 1: Add failing search-domain tests**

  Assert that a lower live PDD price becomes `displayLowestPrice` and participates in price sorting/filtering while `valueScore`, rating, review count, and persisted `lowestOffer` remain unchanged; with no live data, rows are byte-for-byte compatible in visible values with current behavior.

- [ ] **Step 2: Add failing rendered UI tests**

  Render a row with one live offer and assert visible Chinese labels for `实时拼多多报价`, title, shop, live price, supplied sales/coupon details, and `实时拼多多报价暂未计入 PriceAI 评分`; assert no fabricated rating/review/purchase link; render without live offers and assert the section is absent.

- [ ] **Step 3: Run focused tests and confirm RED**

  Run: `npm.cmd test -- src/lib/search/product-search.test.ts src/components/search/presentation.test.ts src/components/search/search-ui.test.tsx`

  Expected: failure because search rows and cards do not support live offers.

- [ ] **Step 4: Implement search-page server orchestration**

  Fetch the existing catalog first. For a non-empty query, request the live layer and pass it to `searchCatalog`; for an empty query, do not call PDD. Keep all credentials and client creation in server modules and keep the page functional when the live map is empty.

- [ ] **Step 5: Implement restrained live-offer UI**

  Preserve current product-card hierarchy. Add a compact live PDD quote section below the standard comparison information, limit it to selected offers, render only present facts, use the live product image as a small quote thumbnail, and add the score-separation sentence. Do not display a purchase button because this API supplies no verified product URL.

- [ ] **Step 6: Run focused tests and confirm GREEN**

  Run: `npm.cmd test -- src/lib/search/product-search.test.ts src/components/search/presentation.test.ts src/components/search/search-ui.test.tsx`

  Expected: all search and UI tests pass.

### Task 5: Full regression, responsive verification, security review, release, and production check

**Files:**
- Modify only if needed to fix failures introduced by Tasks 1–4.
- Verify: `docs/superpowers/specs/2026-09-05-live-pinduoduo-search-design.md`
- Verify: `docs/superpowers/plans/2026-09-05-live-pinduoduo-search.md`

**Interfaces:**
- Validates the complete server-to-search-card flow and release state.

- [ ] **Step 1: Run all required validation commands in order**

  Run:

  ```powershell
  npm.cmd test
  npm.cmd run lint
  npm.cmd run typecheck
  npm.cmd run build
  ```

  Expected: all four commands exit 0. Fix only regressions caused by this implementation and rerun the failing command plus all later commands.

- [ ] **Step 2: Verify responsive behavior locally**

  Start the production build locally without loading any copied secret file, inspect `/search?q=iPhone%2016%20Pro` at 375px, 390px, and 1440px, and verify no horizontal overflow, intact header/search/sort controls, readable live quote rows, and unchanged score labeling.

- [ ] **Step 3: Perform explicit secret and diff review**

  Run `git status --short`, `git diff --check`, `git diff --stat`, and targeted content searches over only the changed tracked/source files for secret assignments, tokens, raw signatures, and `NEXT_PUBLIC_PDD_`. Confirm `.env.local` is neither tracked nor staged and inspect the complete diff.

- [ ] **Step 4: Stage only explicit implementation files and commit once**

  Use `git add` with the exact paths changed in Tasks 1–4 plus the spec and plan documents. Verify `git diff --cached --name-only`, then run:

  ```powershell
  git commit -m "feat: integrate live Pinduoduo offers into search"
  ```

- [ ] **Step 5: Push and verify Vercel Production**

  Run `git push origin main`, wait for the deployment associated with the new commit to reach Ready, and confirm the production domain serves successfully.

- [ ] **Step 6: Verify production search behavior**

  Open `https://price-ai-tan.vercel.app/search?q=iPhone%2016%20Pro`. Confirm the standard product remains present, the page has no 500, accessories are absent from live results, and no secret-like content appears. If an eligible current live result exists, confirm its title/image/price/shop are shown under `实时拼多多报价`; otherwise confirm the unchanged catalog fallback and report that no eligible live match was returned rather than claiming success.

- [ ] **Step 7: Record final release evidence**

  Report changed files, data flow, deterministic rules, price policy, live/fallback behavior, four validation results, commit hash, push/deployment status, actual production result, whether a live PDD offer appeared, and the explicit no-secret conclusion.
