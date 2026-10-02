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
   - [任务八：预览墙媒体标题改为原生 Hover 悬浮显示（与复选框逻辑统一）](#任务八预览墙媒体标题改为原生-hover-悬浮显示与复选框逻辑统一)
   - [任务九：播放器组件漂移与音量垂直滑块异常修复（Video.js 深度对齐与重构）](#任务九播放器组件漂移与音量垂直滑块异常修复videojs-深度对齐与重构)
   - [任务十：全域纯暗黑滚动条与原生深色模式适配（根除 Windows 白底亮色滚动条）](#任务十全域纯暗黑滚动条与原生深色模式适配根除-windows-白底亮色滚动条)
   - [任务十一：顶部导航栏实用工具按钮激活状态白底胶囊异形 Bug 修复](#任务十一顶部导航栏实用工具按钮激活状态白底胶囊异形-bug-修复)
   - [任务十二：全域高对比纯暗黑进度条重构（解决任务进度条灰底白条与文字隐形问题）](#任务十二全域高对比纯暗黑进度条重构彻底解决任务队列进度条灰底白条与文字隐形问题)
   - [任务十三：播放器中心大播放按钮重构为独立放大圆角三角形（去除底圈与微光阴影）](#任务十三播放器中心大播放按钮重构为独立放大圆角三角形去除底圈与微光阴影)
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

### 任务八：预览墙媒体标题改为原生 Hover 悬浮显示（与复选框逻辑统一）

* **机制剖析**：
  - 原版 Stash 在预览墙（SceneWallPanel、SceneMarkerWallPanel、GalleryWallCard）中，默认通过后端 `defaultWallShowTitle = true` 与 `.show-title` 类将卡片底部的标题、渐变黑条和元数据常驻显示，破坏了预览墙沉浸式画廊的极简视觉体验；
  - 且原版的悬浮动画带有 500ms 延迟（`transition-delay: 500ms; transition: 1s opacity;`），在响应式小屏幕下还会强制常驻；
  - 复选框（`.wall-item-check`）采用的是“默认 `opacity: 0`、鼠标移入即平滑渐显 `transition: opacity 0.5s`”的极简交互逻辑。
* **目标文件**：
  - `ui/v2.5/src/components/Scenes/SceneWallPanel.tsx`
  - `ui/v2.5/src/components/Scenes/SceneMarkerWallPanel.tsx`
  - `ui/v2.5/src/components/Scenes/styles.scss`
  - `ui/v2.5/src/components/Galleries/styles.scss`
  - `ui/v2.5/src/components/Wall/WallItem.tsx`
  - `ui/v2.5/src/components/Wall/styles.scss`
  - `internal/manager/config/config.go`
* **代码修改点**：
  1. **移除强制常驻类名**：在 `SceneWallPanel.tsx` 与 `SceneMarkerWallPanel.tsx` 中剔除 `show-title`，底板统一为 `<div className="wall-item" ...>`。
  2. **动效与复选框对齐**：
     - 在 `Scenes/styles.scss` 与 `Galleries/styles.scss` 中，将 `.lineargradient` 阴影底栏与 `&-footer` 底部标题区默认设为 `opacity: 0; pointer-events: none; transition: opacity 0.5s;`。
     - 在 `:hover` 态下同步触发 `opacity: 1; pointer-events: auto; transition: opacity 0.5s;`，无任何滞后延迟，与复选框的 hover 渐变完全同步联动。
     - 非 hover 状态下将 `pointer-events` 设为 `none`，杜绝卡片未悬浮时底部透明链接的误触。
  3. **后端配置基准重置**：将 `internal/manager/config/config.go` 中的 `defaultWallShowTitle` 默认基准值置为 `false`。
* **效果**：
  - 预览墙默认状态下纯净呈现无遮挡的媒体预览与封面海报，无任何黑条阴影与文字遮挡；
  - 当鼠标指针移入任一预览卡片时，左上角的选择复选框与底部的渐变阴影/媒体标题/演员信息完全同步淡入（0.5s 丝滑渐变）；鼠标移出时同步淡出。

---

### 任务九：播放器组件漂移与音量垂直滑块异常修复（Video.js 深度对齐与重构）

* **机制与根本原因剖析**：
  1. **音量按钮漂移**：原控制栏采用 `align-items: flex-end`，其他控制按钮固定为 `height: 36px`，但包裹音量控制的 `.vjs-volume-panel` 在 Video.js 原生逻辑中为撑满控制栏高度（`height: 100%`）的容器，其内部默认纵向居中，导致音量喇叭图标相比播放键等兄弟按钮纵向悬空漂移约 14px；
  2. **时间分隔斜杠 `/` 掉行折叠**：Video.js 中当前时间与总时长具备 `.vjs-time-control` 类名，但中间的分隔符 `<div class="vjs-time-divider">` 不具备该类名。在 Flex 布局下其宽度坍缩且缺乏同等高度与 `line-height`，导致斜杠文字 `/` 折行掉落至第二行下方；
  3. **进度条悬浮冲突**：原 progress-control 使用相对控制栏底部的固定偏移 `bottom: 3.2em`，导致在不同视频尺寸或字体缩放时浮动在画面中间，与控制栏按钮严重重叠穿模；
  4. **音量垂直滑块变形 Bug（图 2）**：Stash 在 `ScenePlayer.tsx` 初始化时显式配置了 `volumePanel: { inline: false }`，即音量条为垂直弹出的卡片面板（`.vjs-volume-vertical` 与 `.vjs-slider-vertical`）。然而此前 SCSS 中错误套用了水平音量条规则（强制指定了 `height: 4px` 与 `width: 4.5em`），将 80px 高的纵向音量轨道压扁成了 4px 的横向扁条，导致白色滑块圆点被挤在左上角空容器中无法正常操作；
  5. **精灵图 Scrubber 视口裁剪变形**：下方的交互式进度条组件（`ScenePlayerScrubber.tsx`）内部依赖 `$scrubberHeight: 120px`（视口 120px = 精灵图 90px + 标签 30px），此前外部样式被强行指定为 `height: 80px`，导致精灵图视口被硬性裁剪 40px，引发视觉变形错位。
* **目标文件**：
  - `ui/v2.5/src/components/ScenePlayer/styles.scss`
* **代码修改点**：
  1. **控制栏全局中心锁死与零漂移基准**：
     - 将 `.vjs-control-bar` 高度重设为 `48px`，对齐模式改为 `align-items: center !important`，确保所有子元素在同一水平基准线上；
     - 统一 `.vjs-button` 与 `.vjs-volume-panel` 均为 `36px × 36px`，音量面板设为 `position: relative`，彻底消除喇叭图标纵向漂移；
     - 为 `.vjs-autostart-button` 开关单独豁免圆形按钮限制（`width: 3.5rem; border-radius: 18px`），保护其胶囊滑动开关形态。
  2. **时间与分隔斜杠对齐**：
     - 联合声明 `.vjs-time-control, .vjs-time-divider`，统一赋予 `height: 36px !important; line-height: 36px !important; display: inline-flex !important; align-items: center !important; white-space: nowrap !important;`；
     - 为 `.vjs-time-divider` 设定 `min-width: 8px !important; width: auto !important;`，彻底根绝斜杠折行掉落。
  3. **进度条精准贴合控制栏顶边缘**：
     - 将 `.vjs-progress-control` 改为 `top: -8px !important; bottom: auto !important; height: 16px !important; width: 100% !important;`，使其 4px 轨道中心线完美重合在控制栏顶部边缘，彻底脱离按钮冲突区。
  4. **原生纵向音量弹窗重构（修复图 2 Bug）**：
     - 将垂直音量弹窗 `.vjs-volume-control.vjs-volume-vertical` 重新定位为 `position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); width: 32px; height: 112px;`，采用毛玻璃纯黑质感（`rgba(18, 18, 18, 0.92)` + `backdrop-filter: blur(16px)` + `border-radius: 16px`）；
     - 底部添加透明过渡桥（`&::after`），杜绝鼠标自喇叭移动至弹窗时的光标失焦闪退；
     - 垂直轨道 `.vjs-volume-bar.vjs-slider-vertical` 设定为 `width: 4px; height: 84px; margin: 0 auto;`，内部垂直白色充能条 `.vjs-volume-level` 设定为 `width: 100%; bottom: 0; left: 0;`；
     - 白色圆形调节旋钮精准固定在音量条顶部边缘（`top: -5px; left: 50%; transform: translateX(-50%); width: 12px; height: 12px; border-radius: 50%;`），并兼容原生拖拽 active 状态。
  5. **还原 Scrubber 120px 视口高度与无缩略图自动隐藏**：
     - 将 `.scrubber-wrapper`、`.scrubber-button`、`.scrubber-content` 高度与行高完全恢复绑定 `$scrubberHeight`（120px），保留纯暗黑半透质感与圆角；在 `ScenePlayerScrubber.tsx` 中增加空缩略图判断（`!spriteInfo || spriteInfo.length === 0` 时直接返回 `null`），未生成 Sprites 时彻底隐藏。
  6. **倍速按钮（1x）重叠碰撞与漂移根治**：
     - 剖析：`.vjs-playback-rate` 子元素（`<button>` 与 `.vjs-playback-rate-value`）在原生 Video.js 中均为 `position: absolute`，若父容器设为 `width: auto`，父级计算宽度塌缩为 0px，导致后续兄弟按钮（如 AD 语音说明、字幕按钮）重叠在相同坐标上形成穿模重叠；
     - 重构：将 `.vjs-playback-rate` 设定为固定基准 `position: relative !important; width: 36px !important; min-width: 36px !important; height: 36px !important;`，居中定位内部 28px × 22px 药丸形倍速徽章，悬浮弹窗 `.vjs-menu` 精准定位在上方 8px 处，彻底根绝图 2 穿模漂移问题。
  7. **Telegram 同款极简无框毛玻璃中心播放按钮**：
     - 去除突兀的白框外圈（`border: none !important`），改为 Telegram 同款纯黑半透毛玻璃圆盘（`rgba(0, 0, 0, 0.5)` + `backdrop-filter: blur(16px)` + `box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35)`）；
     - 尺寸定为 64px × 64px，采用 `transform: translate(-50%, -50%)` 精准居中，内部三角播放键右移 3px 实施视觉几何重心校准；
     - 悬停平滑放大 1.06 倍并深化背景透明度，无任何边缘线条；视频暂停时常驻显示于画面中央，点击即刻播放。
* **效果**：
  - 播放器底栏所有按钮、时间数字与斜杠完美居中对齐于一条水平线上，倍速按钮具有独立占位，不再与 AD / 字幕图标重叠穿模；
  - 屏幕正中播放按钮彻底去除粗糙边框，完美呈现 Telegram 标志性的无框暗黑磨砂玻璃质感，悬停呼吸缩放自然；
  - 鼠标悬浮音量图标时，向上平滑弹出精致的纯黑毛玻璃垂直音量柱，白色滑块圆点随音量实时在 84px 轨道上垂直定位滑动，操作丝滑自然，图 2 挤扁变形 bug 彻底根除；
  - 进度条置于控制栏顶部边沿，不遮挡任何按钮；下方精灵图进度条高度恢复正常，时间图块完整显示。

---

### 任务十：全域纯暗黑滚动条与原生深色模式适配（根除 Windows 白底亮色滚动条）

* **机制与根本原因剖析**：
  1. **父级选择器空格失靶**：原 `ui/v2.5/src/styles/_scrollbars.scss` 中的样式使用了 `body ::-webkit-scrollbar`（注意 `body` 与伪元素间存在空格）。CSS 规则中，该选择器仅匹配 `body` 的**子孙容器**（如弹窗、代码块等），而作为全页面视口根节点的 `html` 与 `body` 自身的主滚动条完全未被选中；
  2. **缺少系统级深色模式声明**：页面未在 `:root` 与 `html` 声明 `color-scheme: dark;`，导致 Chromium / Edge / Safari 等浏览器在 Windows 系统下直接渲染操作系统原生的浅白底色轨道、双向三角箭头按钮与亮灰滑块，与全站 `#0c0c0c` 暗黑背景形成极为刺眼的视觉割裂；
  3. **W3C 标准滚动条规范缺位**：未针对 Firefox 与现代标准的 `scrollbar-width` 与 `scrollbar-color` 提供声明；文本选择高亮默认残留 Blueprint 亮蓝底色（`#cce2ff`）。
* **目标文件**：
  - `ui/v2.5/src/styles/_scrollbars.scss`
  - `ui/v2.5/src/index.scss`
  - `ui/v2.5/index.html`
* **代码修改点**：
  1. **根节点深色模式系统级注入**：
     - 在 `index.html` 的 `<head>` 中新增 `<meta name="color-scheme" content="dark" />`，浏览器首帧即以暗色视口渲染；
     - 在 `index.scss` 与 `_scrollbars.scss` 中为 `:root, html` 统配 `color-scheme: dark; background-color: $body-bg;`。
  2. **WebKit / Chromium 纯暗黑极简滚动条定制**：
     - 全局选择器改为 `::-webkit-scrollbar`，全面覆盖主窗口、弹窗、下拉菜单与详情选项卡；
     - 宽度与高度设为超薄精致的 `8px`，背景轨道设为 `background: transparent;`；
     - 滑块 `::-webkit-scrollbar-thumb` 设为 `rgba(255, 255, 255, 0.2)`，搭配 `border: 2px solid transparent; background-clip: padding-box; border-radius: 4px;`，呈现优雅的悬浮纤细胶囊药丸；
     - Hover 态提升至 `rgba(255, 255, 255, 0.38)`，拖拽 Active 态提升至 `rgba(255, 255, 255, 0.55)`；
     - 彻底隐藏 Windows 原生古旧的上下三角箭头按钮：`::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; }`。
  3. **W3C 标准滚动条兼容与选区去蓝**：
     - 添加 `html, body, * { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.2) transparent; }`；
     - 文本选择区 `::selection` 底色由亮蓝改为极简柔和白色半透（`rgba(255, 255, 255, 0.25); color: #ffffff;`）。
* **效果**：
  - 页面主视口右侧刺眼的白底 Windows 滚动条彻底消失，化为与暗黑背景融为一体的 8px 悬浮半透明微光药丸滑块；
  - 移入滑块时高亮提亮，拖动反馈平滑；全站所有内部滚动容器（Modal、下拉框、详情侧栏、代码块）风格完全统一。

---

### 任务十一：顶部导航栏实用工具按钮激活状态白底胶囊异形 Bug 修复

* **机制与根本原因剖析**：
  1. **React-Bootstrap 默认 `variant="primary"` 强加类名**：`SettingsButton.tsx` 与 `MainNavbar.tsx` 中的按钮均采用 React-Bootstrap 的 `<Button className="minimal ...">` 组件。当未显式声明 `variant` 时，React-Bootstrap 会强制为按钮注入 `.btn.btn-primary` 类名；
  2. **高优先级活跃态底色穿透覆盖**：在 `_theme.scss` 中，为了支持全局主要的 Primary 按钮，定义了 `.btn-primary:focus`, `.btn-primary:active`, `.btn-primary.active` 拥有 `#e5e5e5` / `#cccccc` 的实心浅灰/白色背景与微光外描边。由于组合类名选择器权重大于单个类名 `button.minimal`，导致当用户点击“设置”或处于 `/settings` 活跃路由时，Bootstrap 的 `:active` / `:focus` 与 React Router `<NavLink>` 的 `.active` 联合触发了 `.btn-primary` 的实心底色；
  3. **`h-100` 高度拉伸为全高胶囊**：由于导航栏高度为 `50px`，按钮带有 `h-100` 类撑满纵向，实心底色与圆角在 50px 高度下被直接绘制为一个巨大的白底垂直药丸胶囊（如图中所示），严重破坏了“极简纯文字/纯图标无框化”的导航栏设计理念。
* **目标文件**：
  - `ui/v2.5/src/styles/_theme.scss`
* **代码修改点**：
  1. **全域 `.minimal` 按钮绝对去背景保底**：
     - 重构全局 `.minimal` 声明，明确将 `.btn.minimal`, `.btn-primary.minimal`, `.btn-secondary.minimal`, `a.minimal`, `button.minimal` 联合绑定；
     - 强制将其 `background`, `background-color`, `border`, `border-color`, `box-shadow`, `outline` 在普通态、`:hover`、`:focus`、`:active`、`.active` 及 `:focus-visible` 下全量切断，彻底杜绝实心色块污染。
  2. **导航栏右侧实用工具项（`.navbar-buttons .nav-utility`）纯粹文字/图标化重置**：
     - 为 `.nav-utility`, `a.nav-utility`, `button.nav-utility` 以及其内部的 `.btn`, `.btn.minimal`, `.btn-primary`, `.btn-secondary` 设立最高权重全状态清空规则：
       - `background: transparent !important;`
       - `background-color: transparent !important;`
       - `border: none !important; border-color: transparent !important;`
       - `box-shadow: none !important; outline: none !important;`
     - 激活态、聚焦态、点击态与悬浮态统一步调：仅使内部文本与 SVG 图标由默认的静止灰（`#888888`）高亮变为纯净亮白（`#ffffff !important;`），杜绝任何背景形变与药丸色块。
* **效果**：
  - 用户点击或进入“设置”、“数据统计”、“赞助”、“帮助”等功能时，仅齿轮/图标与文字由灰变亮白，原先高达 50px 的突兀白底垂直胶囊彻底消失；
  - 无论处于何种鼠标悬浮、点击激活还是键盘聚焦状态，顶部导航栏均保持完全透澈纯净的极简无框暗黑体验。

---

### 任务十二：全域高对比纯暗黑进度条重构（彻底解决任务队列进度条灰底白条与文字隐形问题）

* **机制与根本原因剖析**：
  1. **Bootstrap 原生亮灰底色与白色主色冲突**：在 `_theme.scss` 中，全局主色定义为 `primary: #ffffff`，而 Bootstrap 的进度条背景默认采用 `$progress-bg: $gray-200`（`#e9ecef`，浅亮灰），填充部分采用 `$progress-bar-bg: theme-color("primary")`（`#ffffff`，纯白）。在 `#141414` 的暗色卡片上，未完成区域是浅亮灰，已完成区域是纯白，两者对比度极弱，视觉上直接糊成一整根反差刺眼的泛白亮条，根本无法分辨进度分界；
  2. **百分比文本“白字白底”彻底隐形**：`<ProgressBar>` 内部渲染的百分比文本默认采用 `$progress-bar-color: $white`，绘制在 `#ffffff` 的白色进度填充条上，形成纯白字盖在纯白底上的完全隐形状态；
  3. **任务头部信息缺乏进度数值支撑**：原 `JobTable.tsx` 的头部右侧仅在运行中且耗时明确时渲染 `预估剩余时间: X 分钟`，缺少直观的百分比指示，初始阶段甚至为空白。
* **目标文件**：
  - `ui/v2.5/src/styles/_theme.scss`
  - `ui/v2.5/src/components/Settings/Tasks/JobTable.tsx`
  - `ui/v2.5/src/components/Settings/styles.scss`
* **代码修改点**：
  1. **SCSS 变量层重设暗黑高对比基准**：
     - 在 `_theme.scss` 的 `@import "bootstrap/scss/bootstrap"` 前注入 Bootstrap 变量声明：`$progress-bg: #1c1c1c; $progress-bar-bg: #ffffff; $progress-bar-color: #0c0c0c; $progress-border-radius: 6px; $progress-height: 16px;`；
     - 确保全局所有通过 Bootstrap 渲染的 Progress 组件默认均具备暗黑轨道与高亮黑字。
  2. **高对比微光进度条全域样式强化**：
     - 将 `.progress` 轨道底色设定为沉稳深炭灰（`#1c1c1c`），外加柔和内凹阴影（`inset 0 1px 3px rgba(0, 0, 0, 0.7)`）与细微边框（`1px solid rgba(255, 255, 255, 0.14)`），与 `#141414` 卡片背景形成精致立体沉降感；
     - 填充条 `.progress-bar` 设为纯白微光（`#ffffff` + `box-shadow: 0 0 8px rgba(255, 255, 255, 0.25)`），内部百分比文字设为高对比黑字（`color: #0c0c0c !important; font-weight: 700`）；
     - 条纹动画覆盖为优雅暗黑半透切角纹路（`rgba(0, 0, 0, 0.12)`），避免亮斑杂色干扰。
  3. **任务队列标题栏双重百分比显式呈现**：
     - 重构 `JobTable.tsx` 的 `maybeRenderETA()` 为复合进度指示器，在右侧实时渲染亮白加粗的数字徽章（如 `75%`），当存在预估时长时以圆点分隔（如 `75% · 预估剩余时间: 2 分钟`），确保任何阶段均一目了然。
* **效果**：
  - 任务队列进度条呈现极具质感的深暗色凹槽轨道与纯白立体进度填充，边界清晰锐利，对比度高达 12:1；
  - 进度条内黑字百分比与上方标题栏数值双重呼应，彻底告别“白底白条分不清、文字全隐形”的尴尬体验。

---

### 任务十三：播放器中心大播放按钮重构为独立放大圆角三角形（去除底圈与微光阴影）

* **机制与根本原因剖析**：
  1. **Telegram 风格暗黑圆形底板产生视觉压迫感**：此前播放器中央的大播放按钮采用了 Telegram 风格的圆形卡片设计（`background-color: rgba(0, 0, 0, 0.5)`、`border-radius: 50%`、`backdrop-filter: blur(16px)`），内部嵌套一个较小的播放三角形。在视频画面正中央形成了一块半透明黑底圆盘，遮挡了视频中心的画面细节；
  2. **字体图标角点锋利且尺寸偏小**：Video.js 默认使用的是 `VideoJS` 字体图标（`\f101`），尺寸受限于 64px 圆盘内部（仅 30px 大小），三角形三个顶点较为尖锐生硬，缺乏柔和现代的圆角弧度。
* **目标文件**：
  - `ui/v2.5/src/components/ScenePlayer/styles.scss`
* **代码修改点**：
  1. **彻底剥离圆形外壳与背景边框**：
     - 将 `.vjs-big-play-button` 以及 `:hover` 态下的 `background`、`background-color` 强制清空为 `transparent !important`；
     - 彻底移除 `border`、`outline`、`backdrop-filter` 与 `border-radius: 50%`，去除一切外置背景圆盘与外框。
  2. **嵌入高精度矢量平滑圆角三角形 SVG**：
     - 在 `.vjs-icon-placeholder::before` 中将原字体图标替换为精致的纯白圆角三角形矢量图形：
       ```svg
       <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>
         <path fill='#ffffff' d='M7.5 4.8c0-1.15 1.25-1.87 2.25-1.28l11.25 6.6c.98.57.98 1.99 0 2.56l-11.25 6.6c-1 .59-2.25-.13-2.25-1.28V4.8z'/>
       </svg>
       ```
     - 矢量图形在几何上三个顶点皆具备弧度均匀平滑的倒圆角（`r ≈ 2px`），重心精准位于 `(12, 12)` 正中心，旋转与缩放时拥有天然的光学对齐基准。
  3. **尺寸放大与电影级自然投影**：
     - 将按钮尺寸由 64px 整体放大至 `84px × 84px`，三角形可见主体放大近 2.5 倍，在大屏幕与移动端均极具视觉辨识度；
     - 采用基于形状边缘的双重自然漫反射投影：`filter: drop-shadow(0 4px 18px rgba(0, 0, 0, 0.65)) drop-shadow(0 1px 4px rgba(0, 0, 0, 0.5)) !important;`，确保白色圆角三角无论置于高光亮景、深色暗景还是复杂色彩视频上方，均能清晰立体悬浮，绝不与画面混色；
     - 鼠标悬浮（Hover）时平滑放大 1.12 倍（`scale(1.12)`）并加深漫反射，点击（Active）时自然回缩（`scale(0.94)`），动效灵动顺畅。
* **效果**：
  - 视频暂停或初次加载时，画面正中央呈现一个纯粹、精致、放大且自带微光立体投影的独立纯白圆角播放三角，没有任何多余的圆形黑底遮挡；
  - 整体视觉极度干净轻盈，极简高级质感跃然屏上。

---

### 任务十四：扫描任务进度条统计不准确与未完成显示 100% Bug 修复（基于媒体文件总数精准计量）

* **机制与根本原因深度剖析**：
  1. **目录文件夹误入进度计数（核心罪魁祸首）**：
     - 在原版 `internal/manager/task_scan.go` 中，遍历文件树时遇到的每一个目录文件夹都会执行 `j.handleFolder(ctx, ff, progress)`；
     - `handleFolder` 内部包含了 `defer progress.Increment()`，导致遍历到的所有文件夹都会使 `progress.processed` 计数累加；
     - 然而入队计数 `j.count` 只统计真正的媒体文件（普通文件才会触发 `j.count++`，文件夹处理完直接 `return nil`）；
     - 当遍历完成时调用 `progress.AddTotal(j.count)`，总数被设为媒体文件数，而已处理数 `progress.processed` 早已被海量文件夹占据。一旦文件夹数量 ≥ 媒体文件数量，进度条在第一个媒体文件还没扫描完时就已经飙升至 100%！即使文件夹少于文件数，也会在扫描刚过半时就提前耗尽配额到达 100%，并在后续很长的实际扫描过程中永久卡死在 100%。
  2. **生成任务（封面/精灵图/哈希）多重重叠自增破坏基准**：
     - 原逻辑中每一个视频的子生成任务（如 `ScanGenerateCovers`、`ScanGenerateSprites`、`ScanGeneratePhashes`）均独立调用了 `progress.AddTotal(1)` 与 `progress.Increment()`；
     - 与此同时，主文件的扫描处理 `j.handleFile` 自身也带有一个 `defer progress.Increment()`；
     - 导致单个视频的处理在 `processed` 计数上被重复自增 2~4 次，进度条配额被严重透支，导致百分比失真提前爆满。
  3. **前端 ETA（预估剩余时间）数学公式严重错误**：
     - 在 `JobTable.tsx` 中，原计算代码为：
       `const estimatedLength = (nowMS - startMS) / job.progress;`
       `etaStr = moment.duration(estimatedLength).humanize();`
     - `(nowMS - startMS) / job.progress` 计算出来的数值是**任务预估总运行时长**，而不是剩余时长！
     - 当进度到达 100%（`job.progress = 1.0`）时，`estimatedLength` 恰好等于已运行的全部时长（如运行了 8 分钟），而前端却将其作为“预估剩余时间”显示为 `100% · 预估剩余时间: 8 分钟`，造成了荒谬的“进度满了却还要剩余 8 分钟”的认知矛盾。
* **目标文件**：
  - `internal/manager/task_scan.go`
  - `ui/v2.5/src/components/Settings/Tasks/JobTable.tsx`
* **代码修改点**：
  1. **后端建立媒体文件总数预读与基准锚定机制**：
     - 新增 `countMediaFiles(ctx, paths, progress)` 轻量级预读函数，在扫描正式开始前以纯元数据秒级遍历（毫秒级完成，无数据库写入与文件 I/O 阻塞），精准统计所选路径下真正符合视频/图片/图库后缀与过滤规则的**媒体文件总数** `totalMediaFiles`；
     - 扫描启动时立即调用 `progress.SetTotal(totalMediaFiles)` 和 `progress.SetProcessed(0)`，彻底消除 indeterminate 模糊阶段，让进度百分比一开始就拥有精准明确的物理分母；
     - 队列遍历结束时，若存在扫描间隙文件变更，以实际队列数量动态校正总数（`if j.count > 0 && j.count != totalMediaFiles { progress.SetTotal(j.count) }`）。
  2. **剥离文件夹与附属任务对进度的干扰，严格按媒体文件计算**：
     - 彻底移除 `handleFolder` 中的 `progress.Increment()`，文件夹作为目录容器只建库更新，绝不计入媒体处理进度；
     - 彻底移除 `sceneGenerators` 与 `imageGenerators`（封面缩略图、精灵图、哈希）中的 `progress.AddTotal(1)` 与 `progress.Increment()`；
     - 确保**每一个媒体文件（`handleFile`）仅且只对应一次 `progress.Increment()`**，真正实现“已完成媒体文件数 / 总媒体文件数”的纯粹百分比计量。
  3. **后端扫描全任务完成闭环**：
     - 在 `ScanJob.Execute` 末尾，当主扫描、附属队列与所有后处理钩子完全执行完毕后，显式调用 `progress.SetProcessed(totalMediaFiles)` 与 `progress.SetPercent(1.0)`，保证 100% 只在真正完工时才触发。
  4. **前端运行态防早熟与 ETA 真实剩余时长纠正**：
     - 在 `JobTable.tsx` 中修正 ETA 数学公式：`remainingMS = Math.max(0, estimatedLength - elapsedMS)`，严格计算剩余耗时；当进度达到 100% 时剩余时长归零，不再显示多余时间；
     - 在运行状态（`job.status === Running` 且 `job.progress < 1`）下，进度显示采用 `Math.min(99, Math.floor(progress))`，杜绝因为四舍五入导致还在运行中就显示 100% 的误报。
* **效果**：
  - 扫描启动后即刻获得准确的媒体文件总数（如 `1280 个媒体文件`），进度条平滑、匀速、真实地随着视频与图片的入库逐一递增（0% -> 1% -> 50% -> 99%）；
  - 只要后台仍在扫描文件或执行任务，进度条绝不会提前卡死在 100%；
  - 预估剩余时间（ETA）真实反映距离扫描完成所需的剩余时长，扫描彻底完成时瞬间打钩闭环。

---

### 任务十五：全站 9 大核心界面默认视图统一为预览墙（Wall）70% 缩放（`zoomIndex = 2`）

* **机制与根本原因剖析**：
  1. **实体模型视图类型声明差异**：
     - 在 Stash 前端底层架构中，`ListFilterModel` 的全局默认显示参数 `DEFAULT_PARAMS.displayMode` 已定义为 `DisplayMode.Wall`，默认缩放层级 `zoomIndex` 与 `defaultZoomIndex` 也已设定为 `2`（对应缩放滑块的第 3 档，即 70% 放大比例）；
     - 短片（Scenes）、图片（Images）、图库（Galleries）、标记（Scene Markers）本身包含了 `DisplayMode.Wall`，因此天然支持预览墙；
     - 但集合（Groups）、演员（Performers）、工作室（Studios）、标签（Tags）的筛选模型定义中缺少 `DisplayMode.Wall`，例如 `groups.ts` 仅有 `[DisplayMode.Grid]`，`performers.ts`、`studios.ts` 与 `tags.ts` 仅有 `[DisplayMode.Grid, DisplayMode.List, DisplayMode.Tagger]`。由于其配置项未包含 `DisplayMode.Wall`，`ListFilterModel` 构造函数触发兜底回退：`this.displayMode = displayModeOptions[0]`（即 `Grid` 网格模式）；
     - `StudioList.tsx` 中原代码在 `filter.displayMode === DisplayMode.Wall` 分支甚至直接返回 `<h1>TODO</h1>`，未接入卡片墙渲染。
  2. **首页（FrontPage）推荐栏硬编码小尺寸缩放**：
     - 首页（FrontPage）的各个推荐行组件（如 `SceneRecommendationRow.tsx`、`RecommendedScenesRow.tsx`、`SceneMarkerRecommendationRow.tsx`、`GalleryRecommendationRow.tsx`、`ImageRecommendationRow.tsx` 等）原本硬编码为 `zoomIndex={1}`（甚至 `TagRecommendationRow.tsx` 为 `zoomIndex={0}`），导致首页虽然以卡片墙呈现，但尺寸偏小，未达到 70%（`zoomIndex = 2`）的视觉预期。
* **目标文件**：
  - `ui/v2.5/src/models/list-filter/groups.ts`
  - `ui/v2.5/src/models/list-filter/performers.ts`
  - `ui/v2.5/src/models/list-filter/studios.ts`
  - `ui/v2.5/src/models/list-filter/tags.ts`
  - `ui/v2.5/src/components/Groups/GroupList.tsx`
  - `ui/v2.5/src/components/Performers/PerformerList.tsx`
  - `ui/v2.5/src/components/Studios/StudioList.tsx`
  - `ui/v2.5/src/components/Tags/TagList.tsx`
  - `ui/v2.5/src/components/Scenes/SceneRecommendationRow.tsx`
  - `ui/v2.5/src/components/FrontPage/RecommendedScenesRow.tsx`
  - `ui/v2.5/src/components/Scenes/SceneMarkerRecommendationRow.tsx`
  - `ui/v2.5/src/components/Galleries/GalleryRecommendationRow.tsx`
  - `ui/v2.5/src/components/Images/ImageRecommendationRow.tsx`
  - `ui/v2.5/src/components/Groups/GroupRecommendationRow.tsx`
  - `ui/v2.5/src/components/Performers/PerformerRecommendationRow.tsx`
  - `ui/v2.5/src/components/Studios/StudioRecommendationRow.tsx`
  - `ui/v2.5/src/components/Tags/TagRecommendationRow.tsx`
* **代码修改点**：
  1. **模型层补全并置顶 `DisplayMode.Wall`**：
     - 在 `groups.ts`、`performers.ts`、`studios.ts`、`tags.ts` 的 `displayModeOptions` 选项数组首位增加 `DisplayMode.Wall`；
     - 使得所有 9 个模块的 `displayModeOptions.includes(DEFAULT_PARAMS.displayMode)` 均成功命中，默认全部自动生效为 `DisplayMode.Wall`，并继承 `DEFAULT_PARAMS` 规定的 `zoomIndex = 2`（70% 缩放）。
  2. **列表组件全面支持 `DisplayMode.Wall` 渲染与缩放**：
     - 在 `GroupList.tsx`、`PerformerList.tsx`、`StudioList.tsx`、`TagList.tsx` 中，扩展条件判断允许 `DisplayMode.Wall` 与 `DisplayMode.Grid` 同样渲染卡片墙（如 `GroupCardGrid`、`PerformerCardGrid`、`StudioCardGrid`、`TagCardGrid`），同时传递 `zoomIndex={filter.zoomIndex}`；
     - 彻底清除 `StudioList.tsx` 中的 `<h1>TODO</h1>` 占位符；
     - 4 个列表工具栏均已原生挂载 `zoomable` 支持，进入预览墙模式时自动高亮方形预览墙图标并展示滑块，用户可随意在 0%~100% 间调节或按 `+`/`-` 键缩放。
  3. **首页（FrontPage）所有推荐栏统一步调为 70% 缩放**：
     - 将 `SceneRecommendationRow.tsx` 与 `RecommendedScenesRow.tsx`（智能推荐行）的 `SceneWallPanel` 统一设定为 `zoomIndex={2}`；
     - 将 `SceneMarkerRecommendationRow.tsx`、`GalleryRecommendationRow.tsx`、`ImageRecommendationRow.tsx`、`GroupRecommendationRow.tsx`、`PerformerRecommendationRow.tsx`、`StudioRecommendationRow.tsx`、`TagRecommendationRow.tsx` 的卡片缩放全部设置为 `zoomIndex={2}`（70% 缩放比例）。
* **效果**：
  - **首页（FrontPage - `/`）**：所有推荐行卡片均以大气美观的 70% 尺寸（`zoomIndex = 2`）瀑布流排列展示；
  - **短片（Scenes - `/scenes`）**：默认进入视频动态预览墙，70% 大尺寸缩放；
  - **图片（Images - `/images`）**：默认进入图片瀑布照片墙，70% 大尺寸缩放；
  - **集合（Groups - `/groups`）**：默认以预览墙（卡片墙）70% 缩放展示，激活预览墙图标与缩放滑块；
  - **标记（Scene Markers - `/scenes/markers`）**：默认进入标记预览墙，70% 大尺寸缩放；
  - **图库（Galleries - `/galleries`）**：默认进入图库预览墙，70% 大尺寸缩放；
  - **演员（Performers - `/performers`）**：默认以演员预览墙 70% 大卡片呈现；
  - **工作室（Studios - `/studios`）**：默认以工作室预览墙 70% 大卡片呈现；
  - **标签（Tags - `/tags`）**：默认以标签预览墙 70% 大卡片呈现。
  - 9 大核心界面不论通过左侧导航直达还是通过无参数链接进入，均 100% 呈现统一和谐的预览墙 70% 缩放沉浸式视觉体验。

---

### 任务十六：“集合”（Groups）真·沉浸式预览墙（GroupWall）组件全新研发与自适应布局重构

* **机制与根本原因剖析**：
  1. **旧逻辑中预览墙与网格模式代码共用（罪魁祸首）**：
     - 在原生 Stash 中，“集合”（Groups）从未设计过专属预览墙组件（只有 `GroupCardGrid`）；
     - 上一任务中在支持 `DisplayMode.Wall` 时，`GroupList.tsx` 直接将 `Wall` 与 `Grid` 合并在同一分支返回 `<GroupCardGrid>`；
     - `GroupCardGrid` 内部基于 Bootstrap 的传统 `<GridCard>` 渲染，容器具有固定的宽高限制（固定 240px 宽度卡片外壳），由上层“图片缩略图区（`.thumbnail-section`）”与下层“卡片文本区（`.card-section`）”强制上下拼接组成；
     - 当集合封面为竖屏比例（如 9:16、3:4 或手机竖拍视频）时，图片无法铺满，导致顶部图片区出现黑边，而下半部分则是巨大的空置黑色文本块（仅放了标题和 `▶ 6` 播放次数图标），既浪费视觉空间，又与“格状显示”完全雷同，失去预览墙意义。
  2. **真正的“预览墙（Wall）”范式规范**：
     - 像短片（`SceneWallPanel`）、图库（`GalleryWallCard`）、图片（`ImageWall`）一样，真正的预览墙应当是**无下置独立文本块的纯视觉照片/媒体墙**；
     - 封面图片以 `object-fit: cover` 100% 填充满整个卡片容器，彻底消灭下方与两侧的空置黑边；
     - 标题、场景计数、日期、工作室等元数据应当作为下沉半透明渐变（`.lineargradient` + `.GroupWallCard-footer`）**在鼠标悬停（Hover）时浮层显示**；
     - 容器宽度应根据图片真实天然宽高比（`naturalWidth / naturalHeight`）动态自适应计算，竖版海报窄长排列、横版海报宽展舒展，多行无缝砖墙拼接。
* **目标文件**：
  - `ui/v2.5/src/components/Groups/GroupWallCard.tsx`（新增专属组件）
  - `ui/v2.5/src/components/Groups/GroupWall.tsx`（新增预览墙容器组件）
  - `ui/v2.5/src/components/Groups/GroupList.tsx`
  - `ui/v2.5/src/components/Groups/GroupRecommendationRow.tsx`
  - `ui/v2.5/src/components/Groups/styles.scss`
* **代码修改点**：
  1. **构建全新 `GroupWallCard` 媒体浮层卡片**：
     - 容器采用 `<section className="GroupWallCard wall-item">`，封面图片（`group.front_image_path` / `group.back_image_path`）以 `100%` 宽高及 `object-fit: cover` 饱满填充；无封面时优雅降级为深色渐变与收藏夹图标；
     - 挂载 `onImageLoad` 实时读取图片的 `naturalWidth / naturalHeight`，动态计算其实际宽高比（竖屏如 0.5625，横屏如 1.778，海报如 0.667）；
     - 剥离下置 `.card-section`，重构为现代流媒体标准的下浮渐变层：悬浮时浮现平滑暗色渐变（`linear-gradient(to top, rgba(0,0,0,0.92)...)`），优雅展示集合标题、场景数量胶囊徽章（`<Icon icon={faPlayCircle} /> {sceneCount}`）、发布日期与工作室；
     - 支持批量选择多选框（`.wall-item-check`，悬停时显现，选中时常驻）与评分角标（`RatingBanner`）。
  2. **构建行高锁定与比例自适应的 `GroupWall` 墙式容器**：
     - 在 `GroupWall` 中映射 `zoomIndex` 为基准行高（0: 160px, 1: 220px, 2: 300px, 3: 420px，70% 缩放下精准锁定为 `300px`）；
     - 每张卡片根据自身宽高比自适应宽度（`width = Math.round(rowHeight * effectiveRatio)`），并通过 `flex-grow` 按比例微微平摊行宽，使得整行两侧精准对齐如砖石拼合；
     - 容器尾部注入 `&::after { content: ""; flex: auto; flex-grow: 9999; }`，彻底杜绝最后一行卡片被非正常拉扯变长。
  3. **分流 `GroupList.tsx` 与首页推荐栏**：
     - `GroupList.tsx` 中分流 `filter.displayMode === DisplayMode.Grid` 返回传统网格 `<GroupCardGrid>`，`filter.displayMode === DisplayMode.Wall` 返回全新自适应预览墙 `<GroupWall>`，两者差异一目了然；
     - 首页（FrontPage）的 `GroupRecommendationRow.tsx` 同步重构为使用 `<GroupWallCard zoomIndex={2}>`。
* **效果**：
  - 点击或默认进入“集合”预览墙时，卡片呈现完整的全幅封面视觉冲击力，原本挤在底部占了一半空间的黑色文本块与固定方盒彻底消失；
  - 竖屏视频/封面保持优雅的竖版海报形态（如截图中的小野猫视频封面自动适配为竖屏海报），横屏保持宽展全景，完全告别上下黑框与容器呆板问题；
  - 鼠标悬浮时，标题、剧集数（如 `▶ 6`）与日期在封面底部渐变浮现，视觉质感与流媒体级体验拉满。

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

## 6. 根据子文件夹自动创建“集合”与封面图逻辑

### 功能概述
为实现自动化媒体库整理，系统新增了针对媒体库子文件夹的“自动创建集合与封面图”功能：
1. **自动识别媒体库子文件夹创建集合（二级子文件夹逻辑）**：
   - 遍历媒体库所有短片所在的文件夹结构；
   - **严格排除媒体库根目录直属单片**：直接存放于媒体库根目录（配置的 Stash 目录）下的视频文件不建立集合，仅对根目录下的二级子文件夹（及包含内容的子目录）自动创建“集合”（Group）；
   - **智能多盘片/多季层级向上聚合**：自动识别多盘片/分卷目录（如 `CD1`、`Disc 2`、`Part 1`、`Season 1`、`第一季` 等），智能向上提取其所属的上级影视/剧集目录名称作为真实集合名称；
   - 自动在 Stash 中建立对应名称的“集合”（Group），并将短片加入该集合。
   - **Windows 路径跨盘符自适应**：原生适配相对盘符根路径（如 `\樱晚`），自动探测真实盘符绝对路径。
2. **封面图三重优先级自动获取机制**：
   - **第一优先级（本地磁盘海报）**：自动检索所在子文件夹内命名为 `poster.*`、`cover.*`、`folder.*`、`front.*`、`集合名.*` 或任意图片文件并转码上传为集合封面；
   - **第二优先级（短片自带封面）**：若无独立海报图片，自动从数据库/系统提取该短片的封面截图赋值给集合；
   - **第三优先级（FFmpeg 视频抽帧）**：若暂无截图，自动调用系统 `ffmpeg` 对视频文件进行抽帧并生成集合封面图。
3. **自动化触发与手动执行**：
   - **自动钩子（Hook）**：监听 `Scene.Create.Post`，每当新增或扫描入库短片时自动执行归类与封面生成；
   - **增加目录联动**：在“配置”面板添加新目录后，自动触发扫描并无缝联动集合自动创建任务；
   - **扫描联动**：在“任务”面板点击“扫描”后，自动在后台排队执行该任务；
   - **独立任务按键**：“设置 -> 任务”中新增“自动创建集合与封面图”专属执行卡片，支持随时一键全库运行。

---

## 7. 媒体库目录生命周期与首页体验增强

### 任务十一：删除目录时立即清空关联缓存与元数据
- **目标文件**：`ui/v2.5/src/components/Settings/StashConfiguration.tsx`、`ui/v2.5/src/core/StashService.ts`
- **逻辑实现**：
  - 用户在设置中删除媒体库目录时，绕过防抖立即调用 `mutateConfigureGeneral` 提交配置；
  - 自动向后台任务队列发起 `mutateMetadataClean({ paths: [deletedPath], dryRun: false })`，精准清理已删除路径所绑定的元数据记录与磁盘缩略图/预览缓存；
  - 调用 `getClient().resetStore()` 强制刷新前端 Apollo 缓存，实现无缝数据清空并弹出全局 Toast 提示。

### 任务十二：媒体库为空时首页窗口绝对居中显示“新增目录”
- **目标文件**：`ui/v2.5/src/components/FrontPage/FrontPage.tsx`、`ui/v2.5/src/components/FrontPage/styles.scss`
- **设计理念**：
  - 当检测到媒体库目录为空 (`stashes.length === 0`) 时，首页自动隐藏常规推荐行，切换为全屏居中空态容器；
  - 使用 Flex 布局搭配 `min-height: calc(100vh - 120px)` 实现视口级别水平与垂直双向精准居中；
  - 放置高辨识度 Primary 风格“新增目录”按钮，点击直接唤起系统目录选择器 (`FolderSelectDialog`)，选中后立即保存并自动触发初始扫描与缩略图生成。

### 任务十三：缩略图/封面图生成异常排查与默认参数校准
- **目标文件**：
  - `ui/v2.5/src/components/Settings/Tasks/LibraryTasks.tsx`
  - `ui/v2.5/src/components/Settings/Tasks/ScanOptions.tsx`
  - `ui/v2.5/src/components/Settings/Tasks/GenerateOptions.tsx`
- **根本原因排查**：
  - 在 Stash 体系中，视频缩略图核心依赖于 **Covers (`covers` / `scanGenerateCovers`)** 从视频中提取关键帧作为海报；
  - 早期参数中 `scanGenerateCovers` 与 `covers` 默认值曾被误置为 `false`，导致扫描或执行生成任务时跳过了视频封面提取；
  - 最终表现为前端预览墙上的 `<video>` 缺少 poster 封面，浏览器只能显示黑底带有白色圆圈播放图标的缺省占位图。
- **修复方案**：
  - 校准 `getDefaultScanOptions()` 与 `getDefaultGenerateOptions()`，将 `scanGenerateCovers`、`covers`、`scanGenerateThumbnails`、`imageThumbnails` 等核心缩略图选项默认重置为 `true`；
  - 保证新添加目录时的自动扫描携带完整的封面与缩略图生成指令。

### 任务十四：全域只保留鼠标悬停（Hover）时播放短片预览
- **目标文件**：
  - `ui/v2.5/src/components/Scenes/SceneWallPanel.tsx`
  - `ui/v2.5/src/components/Scenes/SceneMarkerWallPanel.tsx`
  - `ui/v2.5/src/components/Wall/WallItem.tsx`
- **逻辑重构**：
  - 彻底将预览墙项目的 `<video>` 元素从全屏自启 `autoPlay: true` 调整为 `autoPlay: false`；
  - 默认绑定 `poster={scene.paths.screenshot}` 与 `preload="none"`，在未悬停时仅渲染静态封面图，杜绝多视频并发解码对 GPU 与 CPU 的无效占用；
  - 监听卡片容器的 `onMouseEnter` 与 `onMouseLeave` 事件：移入卡片时启动 `videoEl.current.play()` 播放预览，移出时执行 `videoEl.current.pause()` 并重置 `currentTime = 0`，实现如 YouTube 般平滑灵敏的仅悬停播放交互。

### 任务十五：新增媒体库目录后立即自动跳转显示任务队列
- **目标文件**：
  - `ui/v2.5/src/components/FrontPage/FrontPage.tsx`
  - `ui/v2.5/src/components/Settings/StashConfiguration.tsx`
- **交互升级**：
  - 无论在首页居中的“新增目录”还是设置“媒体库”面板中添加新文件夹，在自动下发目录配置与扫描/归类任务后；
  - 自动通过 `history.push("/settings?tab=tasks")` 路由直接重定向至任务管理面板；
  - 用户可第一时间直观查看到实时任务队列、当前进度百分比条及执行状态。

### 任务十六：切片预览时长调整为 15 秒与短视频原生直放智能分流
- **目标文件**：
  - `internal/manager/config/config.go`
  - `ui/v2.5/src/utils/wallPreview.ts`
  - `ui/v2.5/src/components/Scenes/SceneWallPanel.tsx`
  - `ui/v2.5/src/components/Scenes/SceneCard.tsx`
  - `ui/v2.5/src/components/Wall/WallItem.tsx`
- **逻辑重构**：
  1. **切片预览时长精确锁定 15 秒**：调整后端默认切片时长参数 `previewSegmentDurationDefault = 1.25`（配合 12 个片段，12 × 1.25s = 15.0 秒），全库生成浓缩短片时严格保持 15 秒节奏；
  2. **短视频原生直放智能分流机制**：
     - 在 `wallPreview.ts` 封装 `isBrowserDirectDecodable` 与 `getSceneHoverVideoSource` 决策链路；
     - 当原视频时长 **< 15 秒** 且格式为浏览器支持原生硬解的容器（MP4/WebM/MOV）与标准编码（H.264/AVC、VP8/VP9、AV1 等）时，鼠标悬停直接播放原视频流（`scene.paths.stream`），省去切片消耗与空间；
     - 当原视频时长 **≥ 15 秒** 或格式为特种编码（MKV、HEVC/H.265 无硬解、特殊音频等）时，自动播放 15 秒精彩切片预览（`scene.paths.preview`），若未生成切片则平滑回退，兼顾极速加载与画质表现。

### 任务十七：播放器时间轴雪碧图未生成自适应隐藏与 Telegram 风格中心播放键
- **目标文件**：
  - `ui/v2.5/src/components/ScenePlayer/ScenePlayerScrubber.tsx`
  - `ui/v2.5/src/hooks/sprite.ts`
  - `ui/v2.5/src/components/ScenePlayer/styles.scss`
- **逻辑与样式重构**：
  1. **未生成雪碧图（Sprites / VTT）时自适应彻底隐藏时间轴缩略条**：
     - 在 `ScenePlayerScrubber.tsx` 与 `sprite.ts` 中引入安全空值检查：若短片尚未生成 VTT/Sprites，组件直接返回 `null`，不再占用播放器底部任何高度与渲染资源；
  2. **Telegram 风格中心播放按钮重构**：
     - 去除原生多余的矩形边框与描边，重构 `.vjs-big-play-button` 为 `64px × 64px` 圆形亚克力毛玻璃风格（`background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(12px)`）；
     - 播放三角图标向右微调 `translateX(2px)` 实现几何绝对视觉居中；
     - 视频暂停时自动浮现，鼠标悬停与点击具备平滑缩放动效（`scale(1.08)` / `scale(0.96)`）；
  3. **倍速按钮（1x）位置漂移与重叠修复**：
     - 锁定 `.vjs-playback-rate` 容器宽度为 `36px` 相对定位，内部文字徽标 `28px × 22px` 居中显示，彻底解决其与 `AD`（音频解说）图标重叠或悬浮溢出的漂移问题。

### 任务十八：任务队列高对比度纯暗黑进度条与双百分比徽章重构
- **目标文件**：
  - `ui/v2.5/src/styles/_theme.scss`
  - `ui/v2.5/src/components/Settings/Tasks/JobTable.tsx`
  - `ui/v2.5/src/components/Settings/styles.scss`
- **样式升级**：
  - 彻底根除原版暗浅蓝灰混合导致的进度不可见问题；
  - 进度槽底色（Track）改为深邃碳素黑 `#1c1c1c` + 内阴影，进度填充（Fill）采用醒目纯白高光 `#ffffff`；
  - 条内数字进度采用纯黑粗体（`#0c0c0c`，`font-weight: 800`），保证高对比度清晰易读；
  - 任务表格标题行右侧集成实时高亮百分比徽章（`job-progress-badge`），双重保证即便进度极小时也能第一时间掌握精确执行进度。

### 任务十九：默认不生成雪碧图 / 缩略图（Sprites / VTT）逻辑重构
- **目标文件**：
  - `ui/v2.5/src/components/FrontPage/FrontPage.tsx`
  - `ui/v2.5/src/components/Settings/StashConfiguration.tsx`
  - `ui/v2.5/src/components/Settings/Tasks/LibraryTasks.tsx`
  - `ui/v2.5/src/components/Settings/Tasks/ScanOptions.tsx`
  - `ui/v2.5/src/components/Settings/Tasks/GenerateOptions.tsx`
  - `ui/v2.5/src/components/Dialogs/GenerateDialog.tsx`
- **逻辑重构**：
  - 针对大视频或海量素材切雪碧图（Sprites）消耗大量 CPU/GPU 算力与磁盘空间的情况，全域将雪碧图默认生成策略由“开启”调整为“默认关闭”；
  - **首页与媒体库自动扫描**：添加新目录时触发的初始扫描任务中，将 `scanGenerateSprites` 由 `true` 置为 `false`；
  - **任务扫描与生成默认配置**：`LibraryTasks.tsx` 的 `getDefaultScanOptions()`（`scanGenerateSprites: false`）与 `getDefaultGenerateOptions()`（`sprites: false`）全面关闭；
  - **弹窗与选项组件 Fallback**：`ScanOptions.tsx` 与 `GenerateOptions.tsx`、`GenerateDialog.tsx` 默认勾选态及解构 fallback 全部统一重置为 `false`；
  - **按需手动开启**：保留用户在扫描/生成高级对话框中随时手动勾选生成 Sprites 的完整能力。

### 任务二十：静态缩略图智能防黑帧与防空白帧机制
- **目标文件**：
  - `pkg/scene/generate/screenshot.go`
  - `internal/manager/task_generate_screenshot.go`
  - `data/plugins/auto_group/auto_group.py`
  - `data/plugins/auto_group/auto_group.yml`
- **问题剖析**：
  - 原版 Stash 在抽取静态缩略图/封面（Screenshot/Cover）时硬编码采用固定的视频 20% 时长（`duration * 0.2`）；
  - 遇到片头渐入、黑屏转场、暗光拍摄或静态色块过渡时，极易抓取到纯黑帧（Black Frame）、暗帧或单一纯色空白帧（Blank/Solid Frame），导致缩略图呈现为无意义的黑块。
- **机制与实现方案**：
  1. **双重统计学亮度与方差多维评估模型**：
     - 对抓取的图像像素进行均匀网格采样，计算感知亮度均值（$\text{mean } Y$）、标准差（$\text{stddev } Y$）与色彩极值区间（$\max - \min$）；
     - **黑帧拦截判定**：$\text{mean } Y < 20.0$ 且 $\max Y < 45.0$ 或 $\text{mean } Y < 15.0$ 判定为黑帧/严重暗帧；
     - **空白帧拦截判定**：$\text{stddev } Y < 6.0$ 或 $(\max - \min) < 15.0$ 判定为单色无内容空白帧；
     - **曝光质量加权评分**：引入曝光适度评分曲线 $\text{Score} = \text{stddev} \times \text{ExposureWeight}$，优先倾向光线充足且边缘细节对比度高的画面。
  2. **多时间戳智能寻优梯度采样**：
     - 若候选时间戳检测为黑帧或空白帧，自动在 20%、40%、60%、70%、50%、30%、80%、15%、10% 等时间戳中快速探测；
     - 遇到优质明亮高反差画面立即收敛返回，兼顾零额外开销与最高出图质量。
  3. **插件层无缝拦截与全库一键修复任务**：
     - 在 `auto_group.py` 与 `Scene.Create.Post` 钩子中全面引入质量核验，短片入库时若存在黑帧自动重新抽取高质量画面更新；
     - `auto_group.yml` 中新增独立任务卡片「优化短片缩略图（消除黑帧与空白帧）」，支持随时一键巡检并自动修复全库历史黑帧封面。

### 任务二十一：墙面视图悬停离开后瞬间恢复静态缩略图（消除黑帧冻结缺陷）
- **目标文件**：
  - `ui/v2.5/src/components/Scenes/SceneWallPanel.tsx`
  - `ui/v2.5/src/components/Scenes/SceneMarkerWallPanel.tsx`
  - `ui/v2.5/src/components/Wall/WallItem.tsx`
- **问题根源剖析**：
  - HTML5 规范中 `<video>` 元素的 `poster` 属性仅在视频尚未开始播放前显示；一旦调用过 `.play()` 或设置 `currentTime = 0`，浏览器便不会再重新显示 `poster` 静态海报，而是停留在当前定位帧（即 `currentTime = 0` 的首帧）；
  - 动态切片预览、原片片头通常包含淡入淡出黑场或过渡黑帧，导致鼠标移开暂停后，卡片直接冻结在切片首帧黑屏上，覆盖了原本清晰的静态封面。
- **机制与实现方案**：
  1. **双层视差架构（Dual-Layer Architecture）**：
     - 底层恒定渲染高清静态封面 `<img>`，保持常规文档流与物理占位；
     - 顶层绝对定位叠加 `<video>` 元素，通过 `opacity` 与状态机精准受控；
  2. **播放状态防抖与零黑帧过渡**：
     - 未悬停或正在缓冲（未出画面）时，视频保持 `opacity: 0` 且不阻挡交互；
     - 视频真正解码并触发 `onPlaying` 且确认当前仍处于悬停状态（`active == true`）时，平滑淡入视频画面；
     - 鼠标离开卡片瞬间（`onMouseLeave`），立刻重置 `isPlaying = false`，视频 `opacity` 瞬时归零并暂停重置，底层静态海报 0ms 无缝呈现，彻底根除黑帧闪烁或冻结！

### 任务二十二：初始配置向导（Setup Wizard）全面汉化、全域语言快捷切换与系统未翻译词条深度清零
- **目标文件**：
  - `internal/manager/config/config.go`
  - `internal/api/locale.go`
  - `internal/api/session.go`
  - `ui/login/login.html`
  - `ui/v2.5/src/App.tsx`
  - `ui/v2.5/src/components/Setup/Setup.tsx`
  - `ui/v2.5/src/locales/zh-CN.json`
  - `ui/v2.5/src/locales/en-GB.json`
  - `ui/v2.5/src/components/Settings/Tasks/ImportDialog.tsx`
  - `ui/v2.5/src/components/Tagger/FieldSelector.tsx`
  - `ui/v2.5/src/components/Tagger/PerformerModal.tsx`
  - `ui/v2.5/src/components/Tagger/scenes/SceneTagger.tsx`
  - `ui/v2.5/src/components/Performers/PerformerDetails/PerformerStashBoxModal.tsx`
  - `ui/v2.5/src/components/SceneDuplicateChecker/SceneDuplicateChecker.tsx`
  - `ui/v2.5/src/components/Scenes/SceneDetails/OCounterButton.tsx`
- **机制与根本原因剖析**：
  1. **Go 后端未初始化配置时硬编码强制指定 `"en-US"`**：
     - 在 `internal/manager/config/config.go`（`GetLanguage()`）中，当未读取到配置文件时，硬编码逻辑为 `if ret == "" { return "en-US" }`；
     - 导致在新装、首次启动向导（`SystemStatusEnum.Setup`）或重置环境下，后端向前端 GraphQL 接口报告的默认界面语言为 `"en-US"`，前端初始化获取后直接将语言强切为英文；
  2. **中文语言包（`zh-CN.json`）缺失 42+ 个关键字段与配置向导凭据词条**：
     - 包括 `setup.credentials.*`（账号密码设置、未设置密码警告等）、重复场景检查、自动标签警告等关键字段在 `zh-CN.json` 中完全缺失，运行时静默降级为英文；
  3. **初始配置向导（Setup Wizard）无语言切换入口且不持久化语言配置**：
     - 首次安装界面右上角缺少直观的语言切换下拉器；向导完成进入系统时未将当前语言持久化写入 `config.yml`；
  4. **全系统多处界面组件硬编码英文字符串**：
     - `ImportDialog`（导入 ZIP、重复处理、缺失引用）、`FieldSelector`（选择刮削标签字段）、`PerformerModal`（正在加载图片、图片加载失败、选择演员头像）、`SceneTagger`（无可用刮削源）、`OCounterButton`（重置/递减）等组件中遗留原生英文无国际化封装。
- **机制与实现方案**：
  1. **双层保底：后端与前端默认首选语言全面变更为 `zh-CN`**：
     - 在 `config.go` 中，将 `GetLanguage()` 默认空返回值改为 `"zh-CN"`，并在 `setDefaultValues()` 中写入 `i.setDefault(Language, "zh-CN")`；
     - 在 `locale.go`、`session.go`、`login.html` 中同步将简体中文提至最高匹配优先级；
     - 在 `App.tsx` 中，针对首次配置向导阶段（`status === GQL.SystemStatusEnum.Setup`），安全屏蔽未初始化的后端英文返回值，优先启用浏览器或用户所选中文。
  2. **语言包 100% 深度补齐与润色**：
     - 自动化对比并补全 `zh-CN.json` 缺失的全部 42 个词条，对向导流程、凭据校验、媒体排除项等提示进行高标准本土化深度润色。
  3. **初始向导多语言快速切换器与自动持久化保存**：
     - 在 `Setup.tsx` 顶部右侧新增极简风格的语言切换下拉菜单（支持 🌐 简体中文、English、繁體中文等无缝即时切换）；
     - 点击「完成」提交配置时，自动调用 `configureInterface({ language: currentLocale })`，将用户当前语言写入 `config.yml`，首次进入主界面无需二次设置。
  4. **全系统硬编码英文字符全面组件化汉化**：
     - 全面使用 `<FormattedMessage>` 与 `intl.formatMessage` 封装各对话框与组件，并在 `zh-CN.json` 与 `en-GB.json` 中统一注册国际化键值，实现系统全域无死角中文覆盖。

### 任务二十三：初始向导完成后添加目录自动扫描与消除手动扫描提示
- **目标文件**：
  - `ui/v2.5/src/components/Setup/Setup.tsx`
  - `ui/v2.5/src/components/Setup/Welcome.tsx`
  - `ui/v2.5/src/locales/zh-CN.json`
  - `ui/v2.5/src/locales/en-GB.json`
- **机制与需求剖析**：
  1. 原版逻辑中，当用户在配置向导（Setup Wizard）中添加媒体目录并点击确认创建系统后，进入完成界面 `/welcome`；
  2. 该页面生硬地提示用户手动前往设置与任务页面进行扫描（“接下来你将被重定向到配置页面... 当你对这些设置满意后，可以通过点击【任务】，然后点击【扫描】来开始扫描你的内容入库”）；
  3. 用户点击底部的【完成】按钮后，仅仅被重定向至 `/settings?tab=library`，仍需用户手动翻找任务页面并点击扫描，链路割裂；
  4. 用户需求：若向导中已添加媒体目录，后续不再提示任何手动扫描的说明文案，而是直接转为全自动化扫描并直达任务进度队列。
- **机制与实现方案**：
  1. **跨页面多重目录状态透传与精准感知**：
     - 在 `Setup.tsx` 的 `createSystem()` 成功执行时，向 `/welcome` 路由注入包含 `hasAddedDirectories` 与 `stashes` 的路由状态；
     - 结合 Apollo Client 缓存的 `configuration.general.stashes`，双重保底精确判定当前向导是否配置了媒体库目录。
  2. **智能消除手动扫描文案与动态按钮**：
     - 若检测到已添加目录（`hasDirectories === true`），动态隐藏原先提示用户“手动前往配置与任务页面扫描”的说明段落，替换为明确清晰的自动处理告知（`setup.success.auto_scan_notice`）；
     - 底部主操作按钮文案自适应变更为「完成并开始扫描」（`setup.success.finish_and_scan`）。
  3. **一键自动触发扫描与直达任务队列**：
     - 用户点击「完成并开始扫描」时，系统自动调用 `mutateMetadataScan(...)`（带路径、默认不生成雪碧图、生成封面与预览）并协同触发集合插件任务；
     - 触发成功后通过 Toast 给出队列添加通知，并直接跳转路由至 `/settings?tab=tasks`，让用户第一时间直观看到扫描进度，全流程无缝衔接；
     - 若未配置目录，则平滑降级保留原先指引前往媒体库设置的交互。

### 任务二十四：流式边扫描边入库、单视频封面与切片预览同步生成
- **目标文件**：
  - `internal/manager/task_scan.go`
  - `internal/manager/subscribe.go`
  - `pkg/scene/scan.go`
  - `ui/v2.5/src/core/createClient.ts`
- **机制与问题根源剖析**：
  1. **封面与切片预览异步排队导致严重滞后**：
     - 原版 Stash 在扫描视频时，`ScanFile` 仅将视频基本信息写入数据库，而将 `ScanGenerateCovers`（封面图）和 `ScanGeneratePreviews`（切片预览）作为任务推入异步后台队列 `taskQueue`；
     - 导致主扫描线程瞬间遍历扫完所有文件，而海量的封面图与切片切片任务堆积在后台队列末端迟迟未能处理，用户进入列表时看到的全部是无封面的白板卡片；
  2. **扫描完成前全局阻塞无实时通知**：
     - 后端仅在整个扫描作业全部跑完（`taskQueue.Close()`）后，才触发一次 `subscriptions.notify()`；
     - 前端仅在收到 `ScanCompleteSubscribe` 时才刷新缓存，导致在扫描过程中页面完全静态，无法感知新入库的视频；
  3. **插件钩子与封面时序倒挂**：
     - `Scene.Create.Post` 钩子在入库时立即注册，并在封面图生成之前就触发执行，导致 `auto_group` 插件自动创建集合时无法拿到刚入库短片的封面图。
- **机制与实现方案**：
  1. **单视频封面图与切片预览同步生成机制**：
     - 重构 `task_scan.go` 中的 `sceneGenerators.Generate`：当扫描到一个视频并入库后，**立即就地同步触发**该视频的防黑帧静态封面图生成（`taskCover.Start(ctx)`）与 15 秒切片预览生成（`taskPreview.Start(ctx)`），杜绝任何异步任务排队堆积；
  2. **插件后置钩子时序调整**：
     - 重构 `pkg/scene/scan.go`，确保在 `ScanGenerator.Generate` 同步生成封面与预览完成后，才触发 `SceneCreatePost` 钩子，保证 `auto_group` 自动创建集合时短片已有高清封面图可用；
  3. **流式实时推送与平滑刷新（边扫描边呈现）**：
     - 在 `subscribe.go` 中引入安全非阻塞通信与节流通知机制 `notifyThrottled(1 * time.Second)`；每当单个视频处理完毕（数据库、封面图、切片预览俱全），立即节流通知订阅者；
     - 前端 `createClient.ts` 监听 `ScanCompleteSubscribe`，收到流式增量通知时调用 `client.refetchQueries({ include: "active" })`，平滑无感地将最新入库且带有封面与预览的视频实时呈现在当前页面上。

### 任务二十五：插件安全存在性校验与 auto_group 自动集合任务触发保护
- **目标文件**：
  - `internal/api/resolver_mutation_plugin.go`
  - `ui/v2.5/src/core/StashService.ts`
  - `ui/v2.5/src/components/FrontPage/FrontPage.tsx`
  - `ui/v2.5/src/components/Settings/StashConfiguration.tsx`
  - `ui/v2.5/src/components/Setup/Welcome.tsx`
- **机制与问题根源剖析**：
  1. **前端盲目触发插件任务引发持久红标报错**：
     - 在自动化扫描或完成向导时，前端调用 `mutateRunPluginTask("auto_group", "自动创建集合与封面图")`；
     - 若用户的部署环境（如 Docker 挂载的 `./config/plugins` 或宿主机目录）尚未将 `auto_group` 插件文件夹复制放入，Go 后端内部直接将该无主任务提交给 `JobManager`；
     - 当后台任务线程执行到 `PluginCache.CreateTask` 时抛出 `no plugin with ID auto_group` 异常，并在系统任务队列中留下一道显眼的红色错误日志，给用户造成困惑；
  2. **后端 GraphQL Resolver 缺乏前置校验熔断**：
     - 原版 `RunPluginTask` resolver 在向后台队列推任务前，未校验该 `pluginID` 是否真实存在于 `PluginCache` 中，导致任何无效的插件调用都会污染后台任务队列。
- **机制与实现方案**：
  1. **后端前置熔断校验**：
     - 在 `internal/api/resolver_mutation_plugin.go` 中，向后台作业队列（`JobManager`）添加任务前，首先执行 `m.PluginCache.GetPlugin(pluginID) == nil` 校验；若不存在则即时阻断并返回错误，杜绝无效任务进入后台执行线程并在任务列表中留下持久红标；
  2. **前端动态探测与自适应调用安全守卫**：
     - 在 `StashService.ts` 中封装 `runAutoGroupIfAvailable()`，在触发插件前先向 GraphQL `queryPlugins` 查询当前服务端已加载的所有插件；
     - 仅当明确检测到 `auto_group` 存在且状态处于 `enabled: true` 时，才执行插件任务调度；若未安装或未启用，则静默安全略过，不打扰用户；
  3. **全面接入统一守卫**：
     - 将 `FrontPage.tsx`、`StashConfiguration.tsx` 及 `Welcome.tsx` 中的无感知硬编码调用全面替换为 `await runAutoGroupIfAvailable()`，确保无论在任何部署环境下均丝滑稳定无误报。

### 任务二十六：内置插件镜像层打包与 Go 内核嵌入自释放（零手动配置开箱即用）
- **目标文件**：
  - `pkg/plugin/builtin/builtin.go`
  - `pkg/plugin/builtin/auto_group/auto_group.py`
  - `pkg/plugin/builtin/auto_group/auto_group.yml`
  - `pkg/plugin/builtin/auto_group/log.py`
  - `pkg/plugin/plugins.go`
  - `docker/build/custom/Dockerfile`
- **机制与问题根源剖析**：
  1. **`.gitignore` 过滤导致插件未能提交进代码库与 Docker 构建上下文**：
     - 原先 `auto_group` 插件保存在 `data/plugins/auto_group`，而项目的根目录 `.gitignore` 中包含 `/data` 规则，导致插件源码从未进入版本控制，GitHub Actions 自动化构建 Docker 镜像时也不会包含该文件；
  2. **Docker 卷挂载覆盖（Bind Mount Masking）**：
     - 用户部署 Stash 时，通常使用 `-v ./config:/root/.stash` 挂载宿主机目录。如果仅在 Docker 镜像中的 `/root/.stash` 写入文件，一旦用户挂载宿主机目录，镜像内原有的文件会被宿主机目录直接遮蔽掩盖，导致容器内插件丢失。
- **机制与实现方案**：
  1. **插件源码正式归档入库**：
     - 将插件移入版本控制跟踪路径 `pkg/plugin/builtin/auto_group/`，随同核心代码一同管理和发布；
     - 优化 `auto_group.py` 中的路径与端口探测机制，优先识别 `STASH_CONFIG_FILE` 环境变量及 Docker 路径 `/root/.stash`；
  2. **Go 1.16+ `//go:embed` 静态编译嵌入**：
     - 在 `pkg/plugin/builtin/builtin.go` 中，利用 `//go:embed auto_group/*` 将全部插件文件编译嵌入到 Stash 主执行文件中，使其成为一个完全自包含的单一产物；
  3. **后端启动开机自解压与自维护（Auto-Provisioning）**：
     - 在 `pkg/plugin/plugins.go` 的 `ReloadPlugins()` 中，扫描插件目录前首先执行 `builtin.ProvisionDefaultPlugins(path)`；
     - 无论用户是在本地直接运行二进制，还是在 Docker 中将全新的空白目录挂载至 `/root/.stash`，Stash 服务端一启动便会自动将内置的 `auto_group` 插件释放到挂载的 `plugins/` 目录中，并立即完成加载与任务注册；
  4. **Dockerfile 双重预置**：
     - 在 `docker/build/custom/Dockerfile` 中显式添加 `COPY ./pkg/plugin/builtin/ /root/.stash/plugins/`，实现镜像层与内核层的双重内置保障。

### 任务二十七：扫描与生成逻辑解耦切片预览，视频与封面缩略图极速增量呈现
- **目标文件**：
  - `internal/manager/task_scan.go`
  - `internal/manager/task_generate.go`
  - `internal/manager/task_generate_screenshot.go`
  - `internal/manager/manager_tasks.go`
  - `pkg/scene/scan.go`
- **问题剖析**：
  - 此前为解决视频缩略图问题，在短片入库扫描循环中同步触发了 `taskPreview.Start(ctx)`（切片预览截取）；
  - 由于切片预览需要 FFmpeg 多点寻道、抽帧、拼接并转码，单部视频往往耗时 10~30 秒，导致扫描整个文件夹时发生严重阻塞，后续所有视频的入库与缩略图提取均被卡死在队列后方；
  - 在生成任务（`GenerateJob`）中，若同时勾选封面与切片预览，所有任务被平铺混杂进同一队列，并发 Worker 迅速被耗时漫长的切片预览占满，导致其他视频的封面缩略图迟迟无法生成。
- **机制与实现方案**：
  1. **扫描与切片预览彻底解耦（剥离同步切片）**：
     - 从 `task_scan.go` 的 `sceneGenerators.Generate` 中彻底移除同步调用的 `GeneratePreviewTask`；
     - 扫描视频时仅同步执行轻量的 `GenerateCoverTask`（封面缩略图提取，单片耗时仅约 0.1 秒）；
     - 每处理完一个视频的封面缩略图，立即触发 `mgr.scanSubs.notifyThrottled(1 * time.Second)` 向前端 Apollo 客户端发送增量推送，用户能在前端看到视频卡片伴随海报缩略图毫秒级逐个涌入；
  2. **扫描完成后自动衔接独立后台预览任务（慢慢补充切片）**：
     - 在 `ScanJob.Execute` 扫描全部文件完成后，若配置了 `ScanGeneratePreviews`，自动在后台向任务队列派发独立的 `GenerateMetadataInput{ Previews: true, Paths: j.input.Paths }` 任务；
     - 扫描任务（Scanning...）在几秒内即可达到 100% 完成，所有视频入库完毕且封面完整可用；随后后台队列平滑启动“Generating previews...”（切片预览生成）慢慢补充，绝不阻塞用户正常浏览与操作；
  3. **生成任务两阶段（Two-Phase）优先级调度**：
     - 重构 `task_generate.go` 中的任务生产管道：优先将全库/所选短片的封面、缩略图、哈希（Covers、ImageThumbnails、Phashes）等轻量资产排入队列执行（第一阶段）；
     - 待全部轻量缩略图排入并优先完成后，再将长耗时的切片预览（Previews、ClipPreviews）排入队列（第二阶段）；
     - 即使全库重新批量生成，所有短片的封面缩略图也会在数秒内最先瞬间刷满，随后后台从容补充切片。

### 任务二十八：缩略图生成性能瓶颈深度优化（消除多轮 FFmpeg 串行抽帧与后置钩子阻塞）
- **目标文件**：
  - `pkg/scene/generate/screenshot.go`
  - `pkg/scene/scan.go`
  - `pkg/plugin/builtin/auto_group/auto_group.py`
  - `data/plugins/auto_group/auto_group.py`
- **问题剖析（为什么只生成缩略图还这么慢）**：
  1. **过严阈值导致 9~12 次 FFmpeg 串行进程轮询（最核心瓶颈）**：
     - 在 `screenshot.go` 中，为了避免截取到黑屏，设置了 9~12 个候选时间戳（`20%, 40%, 60%, 70%, 50%, 30%, 80%, 15%, 10%`）；
     - 但提前接受条件被设定为过严的 `!fq.isUnusable && fq.avgY >= 40.0 && fq.score >= 25.0`；
     - 任何带有宽银幕上下黑边（Letterboxing，常见于 16:9 或 2.35:1 电影）、暗调室内戏、夜晚戏或动漫的视频，整幅图像平均亮度 `avgY` 极易低于 40 或对比度得分低于 25；
     - 虽然第 1 个时间点（20% 处）截取的画面完全正常可用（`!isUnusable`），却因未达到上述过严阈值被驳回，系统不得不连续拉起 9~12 次 `ffmpeg.exe` 进程！在 Windows 系统上，单次进程创建与文件 I/O 耗时 150ms~1.5s，单部视频仅封面提取就被拉长至 5~15 秒！
  2. **Python 插件钩子对每部短片重复进行 9 次二次抽帧**：
     - 短片入库触发 `Scene.Create.Post` 钩子时，`auto_group.py` 在 `run_hook` 中调用了 `check_and_repair_scene_thumbnail`；
     - 其在 Python 内部再次做黑帧/暗帧判断，如果判定不满足又在 Python 进程中连续拉起 9 次 FFmpeg 重新抽帧；
     - 叠加 Go 端与 Python 端，单部短片在最坏情况下被连续拉起多达 18 次 FFmpeg 进程与 1 次 Python 进程！
  3. **插件后置钩子同步阻塞扫描 Worker**：
     - `pkg/scene/scan.go` 中原先在事务提交后同步调用 `h.PluginCache.ExecutePostHooks`，导致文件扫描线程必须等待 Python 进程启动、通过 HTTP/GraphQL 查询全部分组、执行归类完成后才能处理下一个文件；
  4. **配置默认并发数（parallel_tasks）受限**：
     - 若配置中 `parallel_tasks: 1`，全部文件只能单线程串行处理，无法发挥多核 CPU 优势。
- **机制与实现方案**：
  1. **首选可用画面立即熔断返回（1 次 FFmpeg 即可完成 98% 的视频封面提取）**：
     - 在 `pkg/scene/generate/screenshot.go` 中优化退出条件：只要首个抽取帧不是全黑（`avgY >= 15` 且 `!(avgY < 20 && maxY < 45)`）且不是单色空白（`stddev >= 6` 且 `maxY - minY >= 15`），即满足 `!fq.isUnusable`，**直接命中并返回**，耗时仅 50~180ms；
     - 将候选时间戳由 9~12 个大幅精简为至多 3 个（`20%, 40%, 60%`），即使万一第 1 帧确实是片头黑屏，最多也只需尝试 2~3 次；
     - 全库扫描生成的 FFmpeg 进程总调用次数直降 90%~95%！
  2. **消除 Python 钩子中的重复核验与重复抽帧**：
     - 在 `auto_group.py` 的 `process_scene` 中增加 `fix_scene_thumb=False` 保护开关：常规入库与后置钩子仅负责子文件夹归类，不重复进行短片封面检测；
     - 集合封面优先直接复用 Go 后端已写入 SQLite 的高清短片封面，不再额外调用 FFmpeg；
     - 将 `auto_group.py` 内部的候选帧也精简至 3 个，并同样改为非黑屏即立即命中。
  3. **插件后置钩子异步派发（非阻塞扫描流水线）**：
     - 在 `pkg/scene/scan.go` 中将 `PluginCache.ExecutePostHooks` 置入后台 goroutine（`go h.PluginCache.ExecutePostHooks(...)`）；
     - 扫描线程生成封面后立即推送给前端并继续扫描下一个视频，后台 Python 归类完全不阻碍扫描入库的飞速进行。

### 任务二十九：彻底厘清感知哈希（Phash）与缩略图（Cover）区别，第一阶段纯净隔离
- **目标文件**：
  - `internal/manager/task_generate.go`
  - `data/config.yml`
- **问题剖析**：
  - 用户在生成任务界面中误将「视频感知哈希值（Phash）」与「预览（Previews）」开启，导致任务队列显示 `Generating phash for ... 预估剩余时间: 15 小时`，误以为是缩略图生成卡顿；
  - **核心误区**：
    - 「短片封面 (Covers)」才是视频卡片的海报缩略图（单张图片，优化后单部仅 0.1s）；
    - 「视频感知哈希值 (Phashes)」是全库视频**内容指纹比对与查重工具**（对每部视频截取 25 张图片拼接为 5x5 拼图矩阵计算特征码），极度耗时，且对界面卡片展示没有任何作用；
    - 「预览 (Previews)」是鼠标悬停时的 12 段视频切片压制小视频，同样是长耗时转码任务；
  - 在此前 `task_generate.go` 的双阶段调度中，`Phashes` 错误地被归类进了 Phase 1（快速任务），导致一旦勾选 Phash，封面就会被 Phash 的 25 帧密集运算阻塞。
- **机制与实现方案**：
  1. **Phase 1 纯净化（仅限短片封面与图片缩略图）**：
     - 重构 `task_generate.go`，将 `queueScenesFastTasks` 与 `queueSceneFastJobs` 严格收敛为**仅生成短片封面（Covers）**与**图片缩略图（ImageThumbnails）**；
     - 耗时巨大的视频感知哈希（Phashes）、切片预览（Previews）、雪碧图（Sprites）、标记切片（Markers）、视频转码（Transcodes）全数移至 Phase 2（慢速补充队列）；
     - 即使用户在生成时勾选了全部选项，第一阶段全库视频封面依然会在数秒内最先瞬间刷满，绝不阻塞。

### 任务三十一：扫描与生成任务默认配置严格对齐图 1 与图 2 状态
- **目标文件**：
  - `ui/v2.5/src/components/Settings/Tasks/LibraryTasks.tsx`
  - `ui/v2.5/src/components/Dialogs/GenerateDialog.tsx`
  - `data/config.yml`
- **具体对齐状态**：
  1. **收藏库 - 扫描（图 1）**：
     - `生成短片封面`：**开启 (`true`)**
     - `生成预览`：**开启 (`true`)**
     - `生成图片的缩略图`：**开启 (`true`)**
     - 其余选项（时间轴预览小图、感知识别码、图像感知哈希值、图像短片预览图、重新扫描文件）：**全部关闭 (`false`)**
  2. **生成的内容 - 生成（图 2）**：
     - `短片封面`：**开启 (`true`)**
     - `预览`：**开启 (`true`)**
     - `图像缩略图`：**开启 (`true`)**
     - 其余选项（时间轴预览小图、标记预览、标记屏幕截图、视频感知哈希值、热图速度资料、图像片段预览、图像感知哈希值、覆盖现有文件）：**全部关闭 (`false`)**
  3. **架构保障**：
     - 得益于任务二十七与二十九的双阶段（Two-Phase）调度机制，开启切片预览后，第一阶段全库视频封面缩略图依然会在数秒内极速涌入前端，长耗时的切片预览则无缝排入第二阶段后台静默补充，完全兼顾快速展示与完整体验。

### 任务三十二：播放器默认自动播放（界面→短片播放器→自动播放）
- **目标文件**：
  - `data/config.yml`
  - `internal/manager/config/config.go`
  - `ui/v2.5/src/components/ScenePlayer/ScenePlayer.tsx`
  - `ui/v2.5/src/components/ScenePlayer/autostart-button.ts`
  - `ui/v2.5/src/components/Settings/SettingsInterfacePanel/SettingsInterfacePanel.tsx`
- **问题与需求**：
  - 用户希望系统“界面→短片播放器→自动播放”（`autostartVideo`）默认开启。
- **机制与实现方案**：
  1. **配置层（YAML & Go Viper Defaults）**：
     - 在 `data/config.yml` 中将 `autostart_video` 设为 `true`；
     - 在 `internal/manager/config/config.go` 中新增常量 `autostartVideoDefault = true`，并将 `GetAutostartVideo()` 改造为 `i.getBoolDefault(AutostartVideo, autostartVideoDefault)`，与 `AutostartVideoOnPlaySelected` 保持统一的默认开启行为。
  2. **前端组件默认值兜底（React & VideoJS Plugin）**：
     - 在 `SettingsInterfacePanel.tsx` 中，将自动播放选项开关在无明确配置时的回退值由 `undefined` 设为 `true`；
     - 在 `ScenePlayer.tsx` 及 `autostart-button.ts` 中，将 `autostartVideo ?? false` 全面升级为 `autostartVideo ?? true`，确保进入短片播放详情页时默认自动起播。

### 任务三十三：全面手机端与移动设备 UI 响应式适配
- **目标文件**：
  - `ui/v2.5/index.html`
  - `ui/v2.5/src/index.scss`
  - `ui/v2.5/src/styles/_theme.scss`
  - `ui/v2.5/src/components/MainNavbar.tsx`
  - `ui/v2.5/src/components/List/styles.scss`
  - `ui/v2.5/src/components/ScenePlayer/styles.scss`
- **问题与现状剖析**：
  1. **导航栏高度死锁与移动端抽屉瘫痪**：此前极简单色黑主题为顶部导航栏强加了 `height: 50px !important; max-height: 50px !important;`，且对 `.navbar-collapse` 也强加了 50px 高度限制，导致移动端点击汉堡按钮时菜单根本无法展开，内容被裁切完全不可用；
  2. **移动端设置与退出入口缺失**：手机端在小屏幕下隐藏了右侧工具图标，而汉堡抽屉菜单内又未包含设置、统计、帮助与退出按钮，导致手机用户根本无法进入系统设置；
  3. **刘海屏与手势条安全区缺失**：缺乏 `viewport-fit=cover` 与 `env(safe-area-inset-*)` 适配，底部悬浮分页栏或抽屉容易与 iOS/Android 手势底条重叠；
  4. **搜索与过滤栏移动端挤压**：手机竖屏宽度下，多项按钮与输入框挤在一起导致换行错乱甚至撑破视口横向滚动；
  5. **iOS 输入自动放大（Auto-Zoom）缺陷**：iOS Safari 下输入框字体小于 16px 会强制将页面放大，破坏排版；
  6. **卡片宽度与触摸面积适配**：部分卡片在移动端未自动 100% 满宽，视频播放器进度条触控面积偏小容易误触。
- **机制与实现方案**：
  1. **视口安全区全面适配（Safe-Area Insets & Viewport-Fit）**：
     - 在 `index.html` 的 viewport 中追加 `viewport-fit=cover`；
     - 在 `index.scss` 中将 `body` 及固定导航栏的外边距升级为 `calc($navbar-height + env(safe-area-inset-top, 0px))`、`env(safe-area-inset-bottom)` 等，彻底规避刘海屏与手势黑条遮挡；统一将导航栏固定在顶部，废除旧版竖屏下翻转至底部的混乱行为。
  2. **响应式导航栏与毛玻璃抽屉菜单重构**：
     - 解除 `< xl` 屏幕下的 50px 限制，桌面端保持 50px 水平极简栏，移动端支持随内容自适应高度；
     - 展开菜单重构为精美 3 列（窄屏 2 列）触控卡片（微磨砂背景 + 图标置顶 + 标签清晰居中，最小高度 60px）；
     - 在 `MainNavbar.tsx` 移动端折叠抽屉底部新增专用的移动端工具栏（包含「设置」、「统计」、「帮助」、「退出」），彻底解决手机端无法进入设置的问题。
  3. **搜索与过滤工具栏移动端专属优化**：
     - 在手机屏幕（`<= 576px`）下，搜索输入框强制自适应 `flex: 1 1 100%; width: 100%`，置顶单行全宽；
     - 排序选项条（`sort-by-select`）开启横向平滑滚动防溢出；
     - 底部浮动分页条适配安全区内边距，按钮按压面积提升至 36px+。
  4. **全库网格卡片移动端 100% 优雅撑满**：
     - 统一为 `.grid-card`、短片卡片、演员卡片、图片卡片、制片商卡片等配置移动端 `width: 100% !important; margin: 0 0 0.75rem 0`，配合 8px 视口内边距，呈现如原生 App 般舒适的单列信息流。
  5. **移动端播放器触控优化与 iOS 体验防护**：
     - 在手机端适当隐藏空间占比过大的非必需音量滑条（利用手机物理音量按键），保留核心全屏、时间、倍速与清晰度按钮；
     - 将进度条触控热区（`vjs-progress-control`）增高至 24px，拖动更平滑跟手；
     - 标签页（`.nav-tabs`）支持横向丝滑滑动手势，杜绝换行折叠；
     - 限制移动端表单文本框文字不小于 16px，彻底根除 iOS 聚焦自动放大问题；
     - 弹窗与对话框强制适配 `max-height: calc(100vh - 1.5rem - safe-area)` 配合滚动体，杜绝底部确定按钮被顶出屏幕。

### 任务三十四：扫描总文件数精准统计与任务队列 ETA 剩余时间校准
- **目标文件**：
  - `internal/manager/task_scan.go`
  - `ui/v2.5/src/components/Settings/Tasks/JobTable.tsx`
- **问题与现状剖析**：
  1. **扫描任务进度条长期处于不确定状态且百分比失准**：
     - 原版 Stash 在扫描开始前未预先统计待处理文件总数，而是边走遍历边 `progress.AddTotal`，甚至在遍历子目录（`handleFolder`）与生成任务时随意叠加总数，导致进度条百分比来回跳跃，扫描未完成时常错误显示为 100%；
  2. **任务队列 ETA（预计剩余时间）计算错误**：
     - `JobTable.tsx` 原逻辑计算的是 `estimatedLength = elapsed / progress; etaStr = moment.duration(estimatedLength).humanize();`，这直接将**任务从开始到结束的预估总时长**当作**剩余时间**展示给用户，造成用户看到的倒计时与实际剩余时间严重脱节。
- **机制与实现方案**：
  1. **启动前快速预扫描统计有效媒体总数**：
     - 在 `task_scan.go` 的 `ScanJob.Execute` 中，正式扫描入库前调用 `countMediaFiles` 快速遍历待扫描路径，基于 `AcceptEntry` 过滤出实际合法的媒体文件总数，预先调用 `progress.SetTotal(totalMediaFiles)` 和 `progress.SetProcessed(0)`；
     - 彻底移除 `handleFolder` 与生成任务对主扫描进度条的不当干扰，让进度百分比自第 1 个文件开始即完全按照真实文件进度平滑递增；
  2. **任务进度条百分比与 ETA 剩余时间严格修正**：
     - 在 `JobTable.tsx` 中，引入 `remainingMS = Math.max(0, estimatedLength - elapsedMS)`，精准计算真正的**剩余所需时间**；
     - 当任务进度未达到 1（未完成）时，通过 `Math.min(99, Math.floor(progress))` 限制最高展示 99%，杜绝任务尚未结束却提前显示 100% 的误导体验。

### 任务三十五：根治自动集合并发竞态与集合重复生成问题（两个子文件夹生成7个集合 Bug）
- **目标文件**：
  - `data/plugins/auto_group/auto_group.py`
  - `pkg/plugin/builtin/auto_group/auto_group.py`
- **问题与现状剖析**：
  1. **多进程并发竞争导致集合重复创建（Race Condition）**：
     - 当 Stash 扫描媒体库或批量添加入库时，多个新短片并发完成封面生成，触发 `Scene.Create.Post` 钩子，瞬间拉起多个并行的 `python auto_group.py` 进程；
     - 由于各独立 Python 进程未加锁，且在启动时分别调用 `get_all_groups()`。在第 1 个进程完成封面抽取与 `createGroup` 创建之前，其余进程均认为该集合“尚不存在”，于是争相调用 `createGroup`；
     - Stash 后端 GraphQL 的 `groupCreate` 并未对集合名称实施数据库唯一性校验（SQLite `groups.name` 允许重名），最终导致 2 个文件夹（“凸凸兔”与“土豆喵”）分别被并发创建了 4 个与 3 个同名集合，总计生成了 7 个重复集合；
  2. **缺少自动查重与合并机制**：
     - 当扫描完成执行全量任务时，集合列表中已残留大量多余同名集合（部分集合孤立且短片计数为 0），UI 视图依然展示这 7 个散乱的集合卡片；
  3. **深层嵌套子文件夹的归类边界缺失**：
     - 原版依据单个视频文件的即时父目录（`os.path.dirname`）提取名称，若子文件夹内部存在分集或日期子目录，会导致集合被进一步碎片化为多余集合。
- **机制与实现方案**：
  1. **跨平台跨进程原子文件排他锁（AutoGroupLock）**：
     - 在 `auto_group.py` 中引入基于操作系统底层的非阻塞排他文件锁 `AutoGroupLock`（Windows 采用 `msvcrt.locking`，Linux/macOS 采用 `fcntl.flock`）；
     - 所有集合查询与创建临界区均受排他锁保护，杜绝并发竞争；
  2. **双重校验锁与数据库实时查验（Double-Checked Locking）**：
     - 在获取锁后，通过直接查询底层 SQLite（`SELECT id, name FROM groups WHERE LOWER(TRIM(name)) = ?`）与 GraphQL 实时接口进行二次查验；
     - 一旦发现集合已被前序并发进程创建，立即复用既有集合 ID 并直接进行短片关联，彻底杜绝重复调用 `createGroup`；
  3. **历史冗余集合自动检测、关联短片合并与多余清理（cleanup_duplicate_groups）**：
     - 每次执行插件任务或全量整理时，自动扫描全库同名集合；
     - 自动选定最佳主集合（优先保留短片数量多、包含封面图的集合），自动将冗余集合下的所有短片归并关联至主集合，并通过 `groupDestroy` 彻底清除多余冗余集合记录；
  4. **顶层媒体库子文件夹精准层级判定**：
     - 优化 `determine_collection_info`，严格计算短片文件相对于匹配媒体库根目录（Library Roots）的相对路径；
     - 以第一级有效子文件夹名称作为集合名称，无论该子文件夹内部有多少层下级目录或分段文件夹，均统一归属于该一级集合，不再碎片化生成多余集合。

### 任务三十六：图片全屏浏览模式无操作自动隐藏全部组件与沉浸式体验优化
- **目标文件**：
  - `ui/v2.5/src/hooks/Lightbox/Lightbox.tsx`
  - `ui/v2.5/src/hooks/Lightbox/lightbox.scss`
  - `ui/v2.5/src/components/Images/ImageDetails/Image.tsx`
- **问题与现状剖析**：
  1. **图片全屏浏览时控件常驻遮挡画面**：
     - 在图片大图浏览模式（Lightbox）进入全屏后，顶部的标尺、菜单、缩放控制栏、底部的评分高潮计数器、标题与图库跳转栏，以及两侧的翻页箭头按钮持续显示并遮挡画面，无法提供纯粹沉浸的观影/看图体验；
  2. **缺少无操作空闲计时器（Idle Detection）**：
     - 原版没有在全屏状态下监听用户的交互状态，鼠标指针也始终常驻显示在图片上方；
  3. **详情页图片点击交互缺位**：
     - 单张图片详情页（`/images/:id`）中的图片元素缺少便捷点击唤起 Lightbox 大图/全屏浏览器的交互。
- **机制与实现方案**：
  1. **全屏状态 2 秒空闲计时器机制（2s Idle Auto-Hide）**：
     - 在 `Lightbox.tsx` 中定义 `FULLSCREEN_IDLE_TIMEOUT = 2000`；
     - 引入 `isControlsHidden` 状态与 `idleTimerRef` 引用；
     - 当处于全屏状态时，全局监听 `mousemove`、`mousedown`、`touchstart`、`keydown`、`wheel` 事件；
     - 任何用户活动立即唤醒组件并重置 2 秒计时器；若连续 2 秒无操作，自动激活 `controls-hidden` 状态；
     - 保护机制：若用户当前打开了设置选项菜单（`showOptions`）或删图确认弹窗（`deleteTarget`），暂停自动隐藏，确保操作便利；
  2. **平滑淡入淡出动画与鼠标指针彻底隐藏**：
     - 在 `lightbox.scss` 中，`.Lightbox-header`、`.Lightbox-footer`、`.Lightbox-navbutton` 统一配置 `transition: opacity 0.3s ease, visibility 0.3s ease`；
     - 当进入 `.controls-hidden` 模式时，所有操作条与翻页按钮平滑过渡至 `opacity: 0`、`pointer-events: none` 与 `visibility: hidden`；
     - 容器全局应用 `cursor: none !important`，将鼠标光标彻底隐藏，呈现 100% 纯净全黑背景无黑边沉浸式画质；
  3. **控件隐藏状态下的误触防退出保护**：
     - 在控件处于隐藏状态时，点击屏幕背景优先唤醒全部控件，避免用户误触关闭 Lightbox；
  4. **全屏快捷键支持与图片详情页直达全屏大图模式**：
     - `Lightbox.tsx` 的键盘事件中新增 `F` / `f` 快捷键，支持一键切换全屏；
     - 在 `Image.tsx` 中挂载 `useLightbox`，单张图片详情页点击图片即可直接开启沉浸式大图模式。

### 任务三十七：系统级排除 NAS 与操作系统垃圾缩略图（拦截群晖 @eaDir、SYNOFILE_THUMB 等并支持一键清理）
- **目标文件**：
  - `pkg/file/ignore_system.go`
  - `pkg/file/ignore_system_test.go`
  - `pkg/file/scan.go`
  - `internal/manager/task_scan.go`
  - `internal/manager/task_clean.go`
  - `pkg/plugin/builtin/auto_group/auto_group.py`
  - `data/plugins/auto_group/auto_group.py`
- **问题根源剖析**：
  1. **群晖 DSM 与 NAS 索引机制自动生成海量缩略图缓存**：
     - 群晖 NAS（Synology DSM）在文件索引、Synology Photos、Video Station 等服务运行时，会自动在媒体文件夹中隐式创建 `@eaDir` 目录，并在其中生成大量的多规格缩略图文件（如 `SYNOFILE_THUMB_S.jpg`、`SYNOFILE_THUMB_M.jpg`、`SYNOFILE_THUMB_L.jpg`、`SYNOPHOTO_THUMB_*.jpg` 等）；
     - QNAP（`.@__thumb`）、macOS（`__MACOSX`、`._*` 资源分叉文件）、Windows（`Thumbs.db`、`$RECYCLE.BIN`）等系统也会在网络共享文件夹中生成大量垃圾文件与缩略图；
  2. **Stash 原版扫描器缺乏底层系统垃圾过滤器**：
     - 原版 Stash 仅依赖用户手动在设置中配置复杂的正则表达式（`exclude` / `image_exclude`）或在每个文件夹编写 `.stashignore`；
     - 若未配置，扫描器会将 `@eaDir` 视为普通图片图库文件夹遍历进入，并将其中包含的全部低分辨率缩略图（如 `SYNOFILE_THUMB_S.jpg`）当作正常图片入库并生成图库，造成媒体库被海量缩略图严重污染；
  3. **自动集合封面误选低画质缩略图**：
     - 插件在检测本地封面（`find_cover_image_on_disk`）时，若扫描到同目录下的系统缩略图，容易误将其作为集合的高清封面图。
- **机制与实现方案**：
  1. **底层全域系统缩略图与垃圾路径判定引擎（`IsIgnoredSystemOrThumbnailPath`）**：
     - 在 `pkg/file/ignore_system.go` 中建立系统级黑名单判定规则：
       - **目录级黑名单**：群晖 `@eaDir`、`.@eaDir`、`#recycle`、QNAP `.@__thumb`、`@recycle`、macOS `__MACOSX`、`.Spotlight-V100`、`.Trashes`、`.fseventsd`、Windows `$RECYCLE.BIN`、`System Volume Information`、Linux `.thumbnails` 等；
       - **文件级黑名单**：群晖 `SYNOFILE_THUMB_*`、`SYNOPHOTO_THUMB_*`、`SYNOPHOTO_FILM_*`、`@synoEAStream*`、macOS `._*`（AppleDouble 文件）、`.DS_Store`、Windows `Thumbs.db`、`ehthumbs.db`、`desktop.ini`、`.nomedia` 等；
       - 采用大小写不敏感与路径分段标准化拆解，只要路径中的任何一段父目录或文件名命中规则，即刻判定为忽略项；
  2. **扫描器深度拦截与剪枝跳过（`AcceptEntry` & `fs.SkipDir`）**：
     - 在 `pkg/file/scan.go` 的 `Scanner.AcceptEntry` 与 `internal/manager/task_scan.go` 的 `scanFilter.Accept` 最前置入口注入拦截；
     - 当遍历器遇到 `@eaDir` 等目录时，直接返回 `fs.SkipDir`，**彻底杜绝递归深入群晖缩略图目录**，扫描速度成倍提升，从源头上杜绝缩略图入库；
  3. **清理任务（Clean）自动清除历史已入库缩略图**：
     - 在 `internal/manager/task_clean.go` 的 `cleanFilter.Accept` 中加入相同校验；
     - 用户此前若已被误扫入库 `SYNOFILE_THUMB_*.jpg`，只需在「设置→任务→清理」中运行一次清理任务，系统便会自动识别出所有已入库的垃圾缩略图与空图库并将其从数据库中彻底抹除；
  4. **自动集合插件（`auto_group.py`）同步免疫**：
     - 在 `auto_group.py` 中引入 `is_ignored_path`，在计算子文件夹集合归属、遍历短片以及搜寻磁盘海报封面时，全方位跳过系统垃圾与缩略图文件，杜绝将 `@eaDir` 误建为集合或将低画质缩略图设为封面。

---

*文档更新时间：2026-10-02*  
*维护者：Antigravity & User Pair-Programming*

