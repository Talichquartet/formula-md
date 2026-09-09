# Formula MD

Formula MD 是一个面向 macOS 和 Windows 的离线 Markdown + LaTeX 阅读器。它使用 MathJax 排版数学公式，并在 Markdown 解析前保护公式源码，避免下划线、星号和反斜杠被 Markdown 语法提前改写。

## 功能

- 支持 `$...$`、`$$...$$`、`\\(...\\)`、`\\[...\\]` 和 AMS 环境
- 支持公式编号、`\\label` / `\\eqref`、矩阵、自定义宏、物理和化学扩展
- 完全离线的 Markdown、代码高亮与数学排版
- 打开、拖放、最近文档、目录导航、全文搜索、深浅主题
- 新拟物与 Liquid Glass 融合的导航和控件：同色材质、柔和双向阴影、内凹选中态、macOS 原生半透明背景与玻璃按压回弹
- 浏览器式多标签页，可同时打开、切换和关闭多份文档
- 每个标签独立记忆阅读位置、编辑位置与光标，会话重启后自动恢复
- 阅读/编辑模式切换，左侧 Markdown 与围栏代码语法高亮、右侧 LaTeX 实时预览
- 行号、光标位置、`Command/Ctrl-S` 保存与未保存关闭保护
- 将当前排版后的正文保存为带页码的 A4 PDF
- 监听源文件变化并自动重新排版
- 文档内容经过清理，渲染进程与系统文件能力隔离

## 开发运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm start
```

可以直接打开样例文件 `examples/latex-showcase.md` 检查公式支持。

## 测试与构建

```bash
npm test
npm run pack  # 生成未封装的 .app
npm run dist  # 生成 DMG 和 ZIP
npm run pack:win  # 生成 Windows x64 未封装目录
npm run dist:win  # 生成 Windows x64 安装程序
```

构建产物位于 `dist/`。macOS 构建未签名时适合本机使用；公开分发时需要配置 Apple Developer ID 签名与公证。Windows 安装程序未进行代码签名，首次运行时可能触发 Microsoft Defender SmartScreen 提示。

## 新拟物玻璃界面与性能

设计参考 [StyleKit 新拟物派](https://www.stylekit.top/styles/neumorphism/showcase#rules) 的同色表面、左上方光源和凸起／内凹层次，并保留 [Apple 材质指南](https://developer.apple.com/design/human-interface-guidelines/materials) 启发的玻璃透光感。沿用原有灰白／深灰基调，以及浅色主题的 `#146b5c` 和深色主题的 `#66c4aa` 绿色强调色。按钮与背景采用同色材质，绿色用于文字、图标、目录标记和焦点；正文与源码使用稳定、不透明的底色。屏幕材质样式独立放在 `src/renderer/glass.css`，不会进入 PDF 排版。

macOS 使用 Electron 自带的 `vibrancy`，并让窗口材质跟随焦点和应用主题。工具栏和按钮以左上亮、右下暗的成对阴影呈现柔和凸起；搜索框、模式切换轨道、选中标签和目录呈内凹层次。网页层保留半透明填充、贴合底色的单一玻璃轮廓和两层局部光线。光线随指针流动，按钮在原位轻微形变，按压时压缩并转为内凹阴影，松开后弹性回位；文字和点击区域保持固定。阅读／编辑透镜在固定凹槽中滑动并轻微拉伸，欢迎页玻璃卡片嵌在柔和凹槽中，悬停时减弱投影。这是基于 Electron 37 的视觉近似，并非调用 Apple 原生 Liquid Glass 控件，也不进行物理光线折射运算。

常规阅读只保留工具栏一处 CSS 背景模糊；欢迎页额外启用一张小卡片。控件不叠加背景模糊，没有 WebGL、动画库、常驻 `requestAnimationFrame` 循环或持续改变模糊半径的动画。所有控件复用同一对光斑与亮带；只在输入事件后请求一帧更新，过渡由 CSS transform / opacity 和有限时长的阴影变化完成，回弹结束后停止。离开、滚动、失焦和窗口隐藏时清理；轮廓与底色在同一个表面上形变。支持系统“减少动态效果”“减少透明度”和增强对比度，增强对比度时为控件补充明确边界；Windows 使用不依赖 macOS 材质的同色底色。

可在 macOS 的图形会话中运行实际窗口检查与本机基准：

```bash
pnpm test:appearance
pnpm bench:appearance
```

窗口检查使用隔离的临时会话和文档，覆盖深浅主题、900×600 最小窗口、公式、搜索、编辑保存、指针反馈、轮廓对齐、按压时文字与点击区域稳定、回弹停止、辅助功能降级及打印样式。设置 `FORMULA_MD_CAPTURE_MOTION=1` 运行窗口检查还会记录按钮动效帧及实际时间戳。截图、检查结果和 PDF 位于 `dist/glass-qa/`。基准使用 20 份公式样例拼接的长文档，对静置、滚动和指针交互各测两轮；指针阶段隔离桌面输入，每帧注入一个 DOM PointerEvent，并确认光效实际处于激活状态。记录 Chromium 主线程耗时、帧间隔、JS 堆和进程指标；结果只代表当前机器上的短时样本。可通过 `FORMULA_MD_BENCH_ROOT` 指向另一份使用相同依赖的源码、`FORMULA_MD_BENCH_LABEL` 指定结果名称，以便比较改动前后。

## 支持范围

MathJax 实现的是 LaTeX 数学模式及常用扩展，不是完整的 TeX 文档引擎。因此它不会执行 `\\documentclass`、读写本地文件、运行任意 TeX 宏包或排版整篇 `.tex` 文档。这一限制让阅读器可以安全、快速地显示 Markdown 中的数学内容。
