# PriceAI 手机 MVP 设计

## 目标

交付一个中文响应式 Next.js 首页及基础搜索页，向用户介绍 PriceAI，并让用户提交手机型号搜索。第一阶段不连接数据库、OpenAI 或真实电商平台。

## 范围

- `/`：导航、Hero 搜索、热门搜索、三项价值说明与页脚。
- `/search?q=...`：显示当前关键词和下一阶段 Mock 数据提示。
- 搜索表单仅在非空输入时跳转；热门搜索复用相同跳转行为。
- 使用 App Router、TypeScript、Tailwind CSS、shadcn/ui。

## 架构

页面默认采用 Server Components。`SearchForm` 是唯一需要客户端状态与提交处理的组件；它使用 `useRouter` 跳转至搜索页。布局、导航、页脚、价值说明和搜索结果提示保持为可复用的服务端组件。

目录保留下一阶段的演进边界：`types/` 将放置 Product、ProductVariant 与 Offer 类型，`lib/adapters/` 将容纳未来平台适配器；本阶段不建立数据库访问、AI 客户端或平台实现。

## UI 与响应式

- 内容容器最大宽度为 72rem，在小屏幕使用 1rem 横向内边距。
- 桌面 Hero 采用宽松垂直节奏；平板保持两列价值卡片；手机为单列。
- 导航在小屏幕隐藏文字链接并保留“手机榜单”入口，避免横向溢出。
- 搜索输入和按钮在窄屏上下排列，最小触控高度 48px。
- 以深墨蓝文字、浅蓝背景和蓝色主操作构成可读性高的视觉系统；不用外部图片或额外依赖。

## 验收标准

- 搜索框按 Enter 或点击按钮，以 URL 编码后的非空关键词导航到 `/search?q=<keyword>`。
- 空白输入不导航。
- 热门词均跳转至相应搜索 URL。
- `/search` 展示“正在为你搜索：xxx”以及“下一阶段接入手机 Mock 商品数据。”。
- `npm run lint`、TypeScript 检查和 `npm run build` 均通过。

## 非目标

不实现商品搜索、Mock 数据、同款识别、报价、排行榜数据、Supabase、OpenAI、平台 API 或用户账户。
