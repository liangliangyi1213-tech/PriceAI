# Product Detail Decision Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/products/[slug]` as a consumer-first buying decision center while preserving all existing product, score, offer, price-history, and AI data flows.

**Architecture:** Keep the route as the server-side orchestrator and move rendering into focused product components. Add one pure presentation helper for like-for-like offer ordering and purchase-reference copy; reuse the existing score, product-image, price-history, comparison, and AI insight data without changing their producers.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Vitest.

**Spec:** User-approved requirements in the 2026-09-05 PriceAI product-detail request.

## Global Constraints

- Do not change Supabase schema, Catalog Sync, adapters, matching, score formula, AI cache/config/request flow, price-history data layer, APIs, or existing data.
- Do not read, print, modify, stage, commit, or push `.env.local` or credentials.
- Consumer copy is Chinese-first and category-neutral; never invent product, price, score, sales, history, links, or promotion facts.
- Preserve empty, single-point, equal-price, zero-price, and query-failure history behavior.
- Validate 375px, 390px, tablet, and 1440px with no horizontal overflow and touch targets of at least 44px.

---

### Task 1: Deterministic Detail Presentation Model

**Files:**
- Create: `src/components/product/product-detail-presentation.ts`
- Create: `src/components/product/product-detail-presentation.test.ts`

**Interfaces:**
- Consumes: `Product`, `ProductVariant`, existing price validation/formatting helpers.
- Produces: `getDetailOffers(variant)` and `getDetailPurchaseReference(variant)`.

- [ ] Write tests proving offers are valid, sorted, de-duplicated by platform, and purchase copy compares the two lowest same-variant platform prices with honest empty/single/tied fallbacks.
- [ ] Run the focused test and confirm failure because the module is absent.
- [ ] Implement the pure helper without touching score or data logic.
- [ ] Run the focused test and confirm it passes.

### Task 2: Decision Hero and Platform Offers

**Files:**
- Create: `src/components/product/product-decision-hero.tsx`
- Create: `src/components/product/platform-offers.tsx`
- Create: `src/components/product/product-detail-ui.test.tsx`
- Modify: `src/app/products/[slug]/page.tsx`

**Interfaces:**
- Consumes: product, selected existing first variant, score total, lowest offer, and Task 1 presentation values.
- Produces: `ProductDecisionHero` and `PlatformOffers` sections with `#platform-offers` navigation.

- [ ] Write a rendering test for image, brand/name, category-neutral specification summary, lowest price, PriceAI score/label, purchase reference, lowest platform, honest quote rows, and unavailable states.
- [ ] Run the focused test and confirm it fails because the components are absent.
- [ ] Implement the hero as a responsive two-column card and the offer list as readable rows using only present offer fields; omit unreliable `#` links.
- [ ] Replace the route's old heading/spec-first/offer markup with the new components while leaving data calls untouched.
- [ ] Run the focused and existing tests and confirm they pass.

### Task 3: Price Trend, AI Advice, and Category-Neutral Specifications

**Files:**
- Modify: `src/components/price-history/price-history-panel.tsx`
- Create: `src/components/product/product-insight-panel.tsx`
- Create: `src/components/product/product-specifications.tsx`
- Modify: `src/components/product/product-detail-ui.test.tsx`
- Modify: `src/app/products/[slug]/page.tsx`

**Interfaces:**
- Consumes: existing `PriceHistoryViewModel`, `ProductInsight`, and `Record<string,string>` specs.
- Produces: reordered sections titled `价格趋势`, `AI 购买建议`, and `商品规格`.

- [ ] Extend rendering tests for the required section order, Chinese headings, AI fields, normalized spec list, and empty spec handling.
- [ ] Run the focused test and confirm it fails on the old rendering.
- [ ] Restyle history stats and chart wrapper without recalculating data; implement reusable AI and specification sections.
- [ ] Wire sections into the route in price/score → offers → trend → AI → specs order.
- [ ] Run focused and full tests and confirm they pass.

### Task 4: Responsive and Full Verification

**Files:**
- Modify only files above if verification exposes a regression.
- Save screenshots outside the repository.

**Interfaces:**
- Consumes: `/products/apple-iphone-16-pro` from an environment-free, source-identical verification copy.
- Produces: automated results and screenshots for 375px, 390px, tablet, and 1440px.

- [ ] Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run build`.
- [ ] Start the verification server without copying environment files.
- [ ] Verify page identity, first screen, offer anchor, trend, AI advice, specifications, comparison control, console health, overlays, touch targets, and horizontal overflow.
- [ ] Run `git diff --check`, source-copy hash comparison, and `git status --short`.
- [ ] Perform a read-only code review and resolve all important findings.

