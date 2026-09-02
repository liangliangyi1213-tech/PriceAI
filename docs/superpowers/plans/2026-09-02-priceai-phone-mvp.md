# PriceAI 手机 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first responsive Chinese PriceAI landing page and query-driven search placeholder.

**Architecture:** Use Next.js App Router with Server Components by default. Keep form navigation within one client component and compose the rest from small presentational components. Reserve type and adapter directories for later product, SKU, offer and platform integrations without implementing them.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, ESLint, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-02-priceai-phone-mvp-design.md`

## Global Constraints

- Use npm and create an App Router project with TypeScript, Tailwind CSS and ESLint.
- Do not add Supabase, OpenAI, or real marketplace integrations.
- Chinese is the visible UI language.
- Default to Server Components; only interactive form code uses `"use client"`.
- All layout must avoid mobile horizontal overflow.

---

### Task 1: Bootstrap the application and test runner

**Files:**
- Create: Next.js scaffold files, `vitest.config.ts`, `src/test/setup.ts`
- Modify: `package.json`
- Test: `src/lib/search-query.test.ts`

**Interfaces:**
- Produces: an npm project with `lint`, `test`, `typecheck`, and `build` scripts.

- [ ] **Step 1: Create the test for query normalization**

```ts
expect(normalizeSearchQuery("  iPhone 16 Pro  ")).toBe("iPhone 16 Pro");
expect(normalizeSearchQuery("   ")).toBeNull();
```

- [ ] **Step 2: Run the test and verify it fails because the module is missing**

Run: `npm test -- src/lib/search-query.test.ts`

- [ ] **Step 3: Implement the smallest query helper**

```ts
export function normalizeSearchQuery(value: string) {
  const query = value.trim();
  return query || null;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/lib/search-query.test.ts`

### Task 2: Build shared layout and homepage content

**Files:**
- Create: `src/components/layout/site-header.tsx`, `src/components/layout/site-footer.tsx`, `src/components/product/value-proposition.tsx`, `src/components/search/search-form.tsx`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Test: `src/components/search/search-form.test.tsx`

**Interfaces:**
- Consumes: `normalizeSearchQuery(value: string): string | null`.
- Produces: `SearchForm` that navigates to `/search?q=<encoded query>` only for non-empty values.

- [ ] **Step 1: Write failing form tests for submitted input, Enter submission, hot search action and empty input**

```tsx
await user.type(screen.getByRole("textbox"), "iPhone 16 Pro");
await user.click(screen.getByRole("button", { name: "开始搜索" }));
expect(push).toHaveBeenCalledWith("/search?q=iPhone%2016%20Pro");
```

- [ ] **Step 2: Run form tests and verify they fail because `SearchForm` is missing**

Run: `npm test -- src/components/search/search-form.test.tsx`

- [ ] **Step 3: Implement semantic responsive layout and the minimal client search form**

- [ ] **Step 4: Run form tests and verify they pass**

Run: `npm test -- src/components/search/search-form.test.tsx`

### Task 3: Build the query-driven search placeholder

**Files:**
- Create: `src/app/search/page.tsx`
- Test: `src/app/search/page.test.tsx`

**Interfaces:**
- Consumes: URL `searchParams.q` as a string or omitted value.
- Produces: Chinese search status and Mock-data next-step notice.

- [ ] **Step 1: Write a failing page test for a supplied q parameter**

```tsx
expect(await SearchPage({ searchParams: Promise.resolve({ q: "华为 Mate 70" }) })).toContain("正在为你搜索：华为 Mate 70");
```

- [ ] **Step 2: Run the test and verify it fails because the page is missing**

Run: `npm test -- src/app/search/page.test.tsx`

- [ ] **Step 3: Implement the minimal server page**

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/app/search/page.test.tsx`

### Task 4: Verify quality and responsive behavior

**Files:**
- Modify: files from Tasks 1-3 only when a verification result identifies a defect.

**Interfaces:**
- Consumes: completed application.
- Produces: lint, type, build and browser verification evidence.

- [ ] **Step 1: Run `npm run lint`**
- [ ] **Step 2: Run `npm run typecheck`**
- [ ] **Step 3: Run `npm run build`**
- [ ] **Step 4: Start the dev server and verify desktop and mobile search flows in a browser**
