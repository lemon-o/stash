# Stash 源码级深度魔改与定制开发规范文档

> **项目路径**：`D:\programming\stash`  
> **基准版本**：`stashapp/stash` 官方主分支（React 17 + TypeScript + Vite + Go GraphQL）  
> **目标**：打造全域极简纯暗黑（Monochrome Dark）、高性能、原生自适应的专属媒体中心系统。

---

## 目录
1. [魔改核心设计原则](#1-魔改核心设计原则)
2. [魔改任务清单与精准代码定位](#2-魔改任务清单与精准代码定位)
   - [任务一：默认显示模式改为「预览墙 (Wall)」](#任务一默认显示模式改为预览墙-wall)
   - [任务二：缩放滑块默认设为 70% 缩放位置](#任务二缩放滑块默认设为-70-缩放位置)
   - [任务三：物理级彻底删除顶部横线、页码栏与统计数字](#任务三物理级彻底删除顶部横线页码栏与统计数字)
   - [任务四：第二层工具栏原生对齐与排布重构](#任务四第二层工具栏原生对齐与排布重构)
   - [任务五：滑块轨道与外框原生去框去蓝](#任务五滑块轨道与外框原生去框去蓝)
   - [任务六：顶部导航栏原生极简无框纯文字化](#任务六顶部导航栏原生极简无框纯文字化)
   - [任务七：全域纯暗黑 SCSS 底色重置（根绝蓝色与绿色）](#任务七全域纯暗黑-scss-底色重置根绝蓝色与绿色)
3. [本地开发热重载与生产联调指南](#3-本地开发热重载与生产联调指南)
4. [编译构建与定制 Docker 镜像部署方案](#4-编译构建与定制-docker-镜像部署方案)
5. [Git 分支管理与未来上游同步策略](#5-git-分支管理与未来上游同步策略)

---

## 1. 魔改核心设计原则

| 维度 | 原版 Stash (CSS 补丁模式) | 源码级魔改 (Source Mod 模式) |
| :--- | :--- | :--- |
| **默认视图** | 每次需手动点击预览墙并设置默认筛选 | **底层模型初始化直接锁死为 `DisplayMode.Wall`** |
| **滑块初始值** | 默认为 1 (33% 紧凑)，需手动拖动 | **初始值直接设为 2 (67%~70% 舒适大图比例)** |
| **顶部冗余元素** | 用 CSS `display: none !important` 强行隐藏 | **从 TSX 源码中直接删除节点，不生成任何 DOM，零重绘零漂移** |
| **工具栏排布** | 依赖大量 CSS `!important` 覆盖 Bootstrap 边距 | **在 JSX 与专用 SCSS 中原生写死 32px 高度与 6px 间隙** |
| **移动端适配** | 桌面与移动混杂，易换行错位 | **原生封装移动端平滑横向滚动，触屏手势如原生 App** |
| **色彩体系** | 随处可见 Blueprint 蓝 (`#137cbd`) 与 Spotify 绿 | **SCSS 变量层原生统配 `#0c0c0c` / `#141414` / `#ffffff`** |

---

## 2. 魔改任务清单与精准代码定位

### 任务一：默认显示模式改为「预览墙 (Wall)」

* **目标文件**：
  - `ui/v2.5/src/models/list-filter/filter.ts`
  - `ui/v2.5/src/models/list-filter/scenes.ts`
  - `ui/v2.5/src/models/list-filter/images.ts`
  - `ui/v2.5/src/models/list-filter/galleries.ts`
* **代码修改点**：
  在 `ui/v2.5/src/models/list-filter/filter.ts` 第 36~41 行：
  ```typescript
  // 【原代码】
  const DEFAULT_PARAMS = {
    sortDirection: SortDirectionEnum.Asc,
    displayMode: DisplayMode.Grid,
    currentPage: 1,
    itemsPerPage: 40,
  };

  // 【修改为】
  const DEFAULT_PARAMS = {
    sortDirection: SortDirectionEnum.Asc,
    displayMode: DisplayMode.Wall, // 🎯 默认全局初始化为预览墙
    currentPage: 1,
    itemsPerPage: 40,
  };
  ```
  在第 53 行：
  ```typescript
  // 【修改为】
  public displayMode: DisplayMode = DEFAULT_PARAMS.displayMode;
  ```
* **效果**：无论任何用户、首次打开或无预设筛选时，直接默认以「预览墙」加载呈现。

---

### 任务二：缩放滑块默认设为 70% 缩放位置

* **机制剖析**：
  - 在 `ZoomSlider.tsx` 中，滑块的取值标尺为 `minZoom = 0`，`maxZoom = 3`：
    - `0` = 最小网格 (0%)
    - `1` = 紧凑视图 (33.3%)
    - `2` = 大图视图 (**66.7% ≈ 70% 位置**，即舒适大图预览比例)
    - `3` = 超大图视图 (100%)
* **目标文件**：
  - `ui/v2.5/src/models/list-filter/filter.ts`
  - `ui/v2.5/src/components/List/ZoomSlider.tsx`
* **代码修改点**：
  在 `ui/v2.5/src/models/list-filter/filter.ts` 第 54~58 行：
  ```typescript
  // 【原代码】
  public zoomIndex: number = 1;
  private defaultZoomIndex: number = 1;

  // 【修改为】
  public zoomIndex: number = 2;        // 🎯 默认处于 70% (刻度 2) 位置
  private defaultZoomIndex: number = 2; // 🎯 默认重置基准值
  ```
* **效果**：预览墙加载时，自动以 70% 比例大图呈现，无需手动拖动滑块。

---

### 任务三：物理级彻底删除顶部横线、页码栏与统计数字

* **机制剖析**：
  - Stash 的列表页面容器 `PagedList.tsx` 在渲染内容时，在顶部和底部分别各渲染了一次 `{pagination}` 和 `{paginationIndex}`。
  - 用户之前指出的“横线与组件太碍眼、容易漂移”，正是因为顶部的这两个冗余组件及其自带的外框边距所致。
* **目标文件**：
  - `ui/v2.5/src/components/List/PagedList.tsx`
* **代码修改点**：
  定位到 `PagedList.tsx` 第 112~118 行：
  ```tsx
  // 【原代码】
  return (
    <>
      {pagination}
      {paginationIndex}
      {content}
    </>
  );

  // 【修改为】
  return (
    <>
      {/* 🎯 彻底物理移除顶部的页码栏与统计文字，不生成任何 DOM */}
      {content}
    </>
  );
  ```
  *(注：底部翻页依然保留在 `content` 内部第 95~100 行，完全不影响正常的底部翻页功能！)*
* **效果**：
  - 页面顶部彻底干净，从根源消除顶部页码栏与统计行；
  - 消除 DOM 节点带来的上下跳动与布局重绘；
  - 顶部横线彻底消失，视频内容直通第二层工具栏。

---

### 任务四：第二层工具栏原生对齐与排布重构

* **目标文件**：
  - `ui/v2.5/src/components/List/FilteredListToolbar.tsx`
  - `ui/v2.5/src/components/List/styles.scss`
* **代码优化规范**：
  1. **高度死锁 32px**：
     - 在 `styles.scss` 中原生锁定工具栏内所有直接子组件（按键组、输入框、下拉框、滑块外壳）为 `height: 32px; min-height: 32px; max-height: 32px; line-height: 30px;`。
  2. **间距死锁 6px**：
     - 容器采用 `display: flex; gap: 6px; align-items: center; justify-content: center;`。
     - 打破 `ListOperationButtons` 内部按键粘连，组内同样锁死 `gap: 6px;`。
  3. **图标绝对居中**：
     - SVG 图标统一 `display: block; margin: auto; max-height: 15px; max-width: 15px;`，消除垂直对齐基线偏移。
  4. **正方形按钮标准化**：
     - 书签、漏斗、箭头、播放、更多、网格、列表、墙、标签统一为 `32px × 32px`。
  5. **移动端自适应平滑横滑**：
     - `@media (max-width: 768px)` 下，容器 `justify-content: flex-start; overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch;`。
     - 所有组件添加 `flex-shrink: 0;` 防止挤压变形。
     - 手机端隐藏缩放滑块。

---

### 任务五：滑块轨道与外框原生去框去蓝

* **目标文件**：
  - `ui/v2.5/src/styles/_range.scss`
* **代码修改点**：
  - 原版使用了大量的 `$primary` (`#137cbd` 蓝色) 和默认 input 外框。
  - 重构为：
    - `input[type="range"]`：完全去除背景、边框、outline、阴影。
    - 轨道（Track）：高度 `4px`，背景 `#2a2a2a`，圆角 `2px`。
    - 滑块（Thumb）：直径 `12px`，纯白高亮 `#ffffff`，边框 `1px solid #555555`，垂直居中 `margin-top: -4px`。

---

### 任务六：顶部导航栏原生极简无框纯文字化

* **目标文件**：
  - `ui/v2.5/src/components/MainNavbar.tsx`
  - `ui/v2.5/src/styles/_theme.scss`
* **代码修改点**：
  - 桌面端固定高度 `50px`，去除所有边框、底线、背景框和下划线。
  - 未激活链接文字为纯白银 `#888888`，悬浮与激活态为纯白 `#ffffff` + 粗体 `font-weight: 700`。
  - 手机端折叠汉堡按钮采用 `#141414` 磨砂暗黑背景与高精白银矢量图标。

---

### 任务七：全域纯暗黑 SCSS 底色重置（根绝蓝色与绿色）

* **目标文件**：
  - `ui/v2.5/src/styles/_theme.scss`
* **全局颜色变量重构对照表**：

| 变量名 | 原版 Stash (Blueprint 蓝) | 改造后 (极简纯暗黑) |
| :--- | :--- | :--- |
| `$body-bg` | `#202b33` (石板蓝灰) | **`#0c0c0c` (深邃纯黑)** |
| `$card-bg` | `#30404d` (暗蓝卡片) | **`#141414` (纯黑卡片)** |
| `$popover-bg` | `#394b59` | **`#161616` (极暗微光)** |
| `$theme-colors.primary` | `#137cbd` (亮蓝) | **`#ffffff` (纯白高光)** |
| `$theme-colors.secondary`| `#394b59` | **`#161616` (暗黑辅助色)** |
| `$theme-colors.dark` | `#394b59` | **`#0c0c0c`** |
| `$link-color` | `#48aff0` (天蓝) | **`#ffffff` (白)** |
| `$link-hover-color` | `#48aff0` | **`#cccccc` (淡银)** |
| `$text-color` | `#f5f8fa` | **`#e5e5e5` (舒适抗疲劳白)** |

---

## 3. 本地开发热重载与生产联调指南

无需在本地搭建庞大的 Go 和 SQLite/PostgreSQL 后端，可以通过 Vite 代理直接连接你现有的生产服务器（`https://stash.lemjoo.top`）：

### 步骤 1：安装前端依赖
在 `D:\programming\stash\ui\v2.5` 目录下执行：
```powershell
npx pnpm install
```

### 步骤 2：配置 Vite 生产反向代理
编辑 `ui/v2.5/vite.config.js`，在 `server` 块中加入 proxy 配置：
```javascript
server: {
  port: 3000,
  cors: false,
  proxy: {
    '/graphql': {
      target: 'https://stash.lemjoo.top',
      changeOrigin: true,
      secure: false,
    },
    '/api': {
      target: 'https://stash.lemjoo.top',
      changeOrigin: true,
      secure: false,
    }
  }
}
```

### 步骤 3：启动本地热重载开发服务器
```powershell
npx pnpm run start
```
- 浏览器打开 `http://localhost:3000`。
- 本地任何 TSX 或 SCSS 代码改动，浏览器均在 **毫秒级自动热更新**，且直接消费线上生产真实的媒体与元数据！

---

## 4. 编译构建与定制 Docker 镜像部署方案

### 方式 A：纯前端快速热替换（极简模式，无需重新编译 Go 二进制）
1. 本地执行编译命令：
   ```powershell
   npx pnpm run build
   ```
   编译产物会输出至 `ui/v2.5/build/`。
2. 将该目录打包上传到服务器，通过 Nginx 静态文件映射或容器挂载直接覆盖容器内的静态文件目录，秒级生效。

### 方式 B：全量 Docker 镜像编译（生产标准模式）
1. 在项目根目录使用现有 Dockerfile 构建：
   ```bash
   docker build -t my-custom-stash:latest -f docker/production/Dockerfile .
   ```
2. 推送至你的私有镜像仓库（或 Docker Hub）：
   ```bash
   docker tag my-custom-stash:latest yourusername/stash:latest
   docker push yourusername/stash:latest
   ```
3. 在服务器的 `docker-compose.yml` 中无缝替换：
   ```yaml
   services:
     stash:
       image: yourusername/stash:latest # 替换为你专属的镜像
       container_name: stash
       volumes:
         - /path/to/config:/root/.stash  # 原始配置、数据库与刮削完全保留
         - /path/to/media:/data          # 视频媒体完全保留
       ports:
         - "9999:9999"
   ```
4. 运行 `docker-compose up -d`，所有个人数据 **100% 完好无损继承**，UI 全面蜕变！

---

## 5. Git 分支管理与未来上游同步策略

为了保证魔改代码既能持久维护，又能未来轻松同步官方的新功能与 Bug 修复，制定如下分支策略：

1. **`upstream-master`**：跟踪官方 `stashapp/stash` 原版更新。
2. **`custom-ui`**：我们的魔改主分支。
3. 同步官方更新时，只需运行：
   ```bash
   git fetch origin
   git merge origin/master
   ```
   由于我们的修改高度集中在 `ui/v2.5/src` 的 UI 表现层与全局参数，合并冲突极低，可轻松终身随官方主线升级。

---

*文档生成时间：2026-10-01*  
*维护者：Antigravity & User Pair-Programming*
