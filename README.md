# 桌面看板

一个常驻 Windows 桌面的个人工作台。界面仿 iOS 小组件，把备忘录、日历、待办、项目看板、AI 额度、资讯、AI 早报、GitHub 热门放在同一块桌面上。每个小组件有 **小 / 中 / 大 / 超大** 四种尺寸，可以自由拖动排列，配色会跟着壁纸自动变。

数据全部存在本机，不需要注册账号，也不会上传到任何服务器。

<!-- 截图：把图片放到 docs/screenshots/ 下，再取消下一行的注释 -->
<!-- ![主界面](docs/screenshots/main.png) -->

---

## 下载安装

1. 打开本仓库右侧的 **[Releases](../../releases)**，下载最新版本里的 `桌面看板_x.y.z_x64-setup.exe`。
2. 双击安装。安装程序没有做代码签名，Windows 可能弹出「Windows 已保护你的电脑」，点 **更多信息 → 仍要运行** 即可。
3. 安装完成后从开始菜单打开「桌面看板」。

**系统要求**：Windows 10 / 11（64 位）。程序依赖 Microsoft Edge WebView2，Windows 11 自带；Windows 10 如果缺少，安装程序会自动下载。

## 快速上手

- **添加小组件**：右键桌面空白处 → 添加小组件。
- **调整尺寸**：右键小组件，直接切换小 / 中 / 大 / 超大。
- **移动位置**：点右上角「编辑」（或长按小组件）进入编辑模式，拖动到任意格子；拖右下角把手可以改大小。
- **打开完整页面**：点击小组件，或点底部 Dock 的图标。
- **换壁纸 / 主题**：右键空白处 → 更换壁纸与主题，或进「设置」。
- **关闭窗口**不会退出，而是隐藏到右下角托盘；要彻底退出请右键托盘图标。

### 挂件模式

「设置」里可以打开 **桌面挂件模式**：窗口固定在桌面最底层、不占任务栏，像壁纸一样常驻。也可以打开「开机自启」和「窗口置顶」。

## 功能一览

| 模块 | 小组件 | 完整页面 |
|---|---|---|
| 时钟 | 时间、农历、今日 / 全年进度 | — |
| 日历 / 日程 | 下一项倒计时、今日时间线、一周计划、月历 | 月视图（农历、节气、法定假日与调休），双击日期新建日程，到点提醒 |
| 待办 | 完成度圆环、清单（可直接添加） | 分组清单（逾期 / 今天 / 之后 / 未安排），本周计划拖动排期 |
| 备忘录 | 置顶和最近的备忘 | Markdown 编辑与预览、搜索、置顶 |
| 项目 | 单个项目的进度、要点、看板，或全部项目总览 | 项目概况、三列看板（待办 / 进行中 / 完成）、截止日期、工作日志 |
| AI 额度 | DeepSeek / 智谱 GLM / Claude 余额与用量 | 各平台详情、Claude Code 30 天按模型 / 按项目统计 |
| 资讯 | 按来源分组的资讯列表 | 任意 RSS / Atom 订阅，AI 一键总结 |
| AI 早报 | 当天早报要点 | 按「要闻 / 开发生态 / 产品应用」等分类浏览 |
| GitHub 热门 | 今日 / 本周 / 本月热门仓库 | 按语言筛选，AI 总结 |
| 创造台 | — | AI 整理导入数据、自定义小组件（见下文） |

### 壁纸与主题

- 内置预设壁纸，也可以导入自己的图片或视频。
- 支持导入 **Wallpaper Engine** 壁纸文件夹（Steam 目录下 `workshop\content\431960\<数字>`）：视频类型直接播放；场景类型会解析贴图和图层并用 CSS 动效近似还原；网页类型会切换为透明模式，浮在 Wallpaper Engine 上方。只读取你本机已订阅的文件，请遵守各壁纸作者的条款。
- 配色从壁纸自动提取（强调色、玻璃底色、文字色），也可以手动指定。
- 可调整小组件不透明度、壁纸暗化与模糊、格子大小，以及多套内置字体（也可导入 .ttf / .otf）。

## 配置 AI 与 API Key

以下功能需要你自己的 Key，**不填也能正常使用其余功能**：

| 用途 | 在哪里填 | 说明 |
|---|---|---|
| DeepSeek 余额 | AI 额度页 | 普通 API Key |
| 智谱 GLM 额度 | AI 额度页 | API Key，国际版可切换到 `api.z.ai` |
| Claude API 用量 | AI 额度页 | 需要 **Admin Key**（`sk-ant-admin...`，组织账户才能创建） |
| Claude Code 用量 | 无需填写 | 自动读取本机 `~/.claude/projects` 下的日志 |
| AI 总结 / 创造台 | 设置 → AI 服务 | 可选 DeepSeek、智谱、Claude，或任意 OpenAI 兼容接口 |
| GitHub 热门（API 模式） | GitHub 热门页 | 可选的 GitHub Token，只用于提高接口频率上限 |

所有 Key 都保存在 **Windows 凭据管理器** 中，不会写入数据文件，也不会发送给除对应平台以外的任何地方。

## 数据与备份

| 内容 | 位置 |
|---|---|
| 所有业务数据 | `%APPDATA%\com.iuu.deskboard\data.json`（设置页可一键打开目录） |
| 导入前的自动备份 | `%APPDATA%\com.iuu.deskboard\backups\` |
| 壁纸解码缓存 | `%LOCALAPPDATA%\com.iuu.deskboard\we-cache\` |
| API Key | Windows 凭据管理器 |

备份只需要复制 `data.json`。卸载时默认保留这些数据；如需彻底清除，在卸载界面勾选删除应用数据，或手动删除上面的目录。

## 创造台：批量导入与自定义小组件

Dock 里的「创造台」配合 [docs/扩展规范.md](docs/扩展规范.md) 使用：

- **AI 整理导入**：粘贴会议记录、需求文档、待办清单等原始材料，让 AI 整理成项目和待办；先预览再导入，导入前自动备份，可一键撤销。
- **小组件工坊**：用 JSON 声明一个小组件（数据地址 + 字段映射 + 显示方式），或者用一句话描述让 AI 生成，实时预览后安装。
- **扩展规范**：一键复制规范文档，交给任意外部 AI 帮你写。

---

## 技术栈

| 层 | 技术 | 作用 |
|---|---|---|
| 桌面外壳 | [Tauri 2](https://tauri.app/)（Rust） | 生成原生 Windows 程序，安装包约 18 MB（大部分是内置字体）；负责窗口、托盘、开机自启、通知 |
| 界面 | React 19 + TypeScript + Vite | 所有页面和小组件 |
| 拖拽 | dnd-kit | 编辑模式下的小组件拖动与看板卡片 |
| 日期 / 农历 | date-fns、lunar-javascript | 日历、节气、法定假日 |
| Markdown | marked + DOMPurify | 备忘录与项目概况的渲染（并做 XSS 过滤） |
| 网络请求 | reqwest（Rust） | 在后端请求各 AI 平台、RSS、GitHub，避开浏览器跨域限制 |
| 资讯解析 | feed-rs、scraper | 解析 RSS / Atom，解析 GitHub Trending 页面 |
| 密钥存储 | keyring（Windows 凭据管理器） | 安全保存 API Key |
| 壁纸解析 | lz4_flex、texpresso、image | 解码 Wallpaper Engine 场景包里的压缩贴图 |

**为什么是 Tauri 而不是 Electron**：Tauri 使用系统自带的 WebView2 渲染界面，不需要把整个 Chromium 打包进来，安装包和内存占用都小得多，适合常驻桌面的程序。

### 架构

```
┌──────────── 前端（React，运行在 WebView2 里） ────────────┐
│  pages/ 完整页面   widgets/ 小组件   components/ 网格与编辑   │
│  store.ts 全局状态 ── 防抖 ──▶ 保存                          │
│  services/ 定时刷新、资讯、AI 调用                           │
└───────────────────────┬────────────────────────────────┘
                        │ invoke()（Tauri 命令）
┌───────────────────────▼──── 后端（Rust） ─────────────────┐
│  storage.rs  读写 data.json        secrets.rs  凭据管理器    │
│  providers.rs AI 平台额度          claude_code.rs 本地日志   │
│  feeds.rs  RSS / Atom              github.rs  GitHub 热门   │
│  ai.rs  调用大模型                  wallpaper.rs / we_scene.rs 壁纸 │
└──────────────────────────────────────────────────────────┘
```

前端只负责界面和状态；所有需要联网、读写文件、访问系统的操作都通过 Tauri 命令交给 Rust 后端完成。

## 从源码构建

需要先安装：

- [Node.js](https://nodejs.org/) 20 或更高
- [Rust](https://www.rust-lang.org/tools/install)（stable）
- Visual Studio 的「使用 C++ 的桌面开发」组件（Rust 在 Windows 上编译需要）

```bash
git clone https://github.com/<你的用户名>/<仓库名>.git
cd <仓库名>
npm install
npm run app:dev      # 开发模式启动桌面程序
npm run app:build    # 打包安装程序，输出在 src-tauri/target/release/bundle/nsis/
npm run dev          # 只在浏览器里预览界面（需要后端的功能不可用）
```

### 目录结构

```
src/
  App.tsx               标题栏、Dock、页面切换、窗口模式
  store.ts              全局状态 + 持久化
  components/           小组件网格、编辑模式、弹窗
  widgets/              各小组件；registry.tsx 注册类型、尺寸和配置项
  pages/                各模块完整页面
  services/             AI、资讯、早报、GitHub、定时刷新与提醒
src-tauri/src/          Rust 后端（见上方架构图）
docs/扩展规范.md         导入数据与自定义小组件的 JSON 规范
```

### 新增一个小组件

1. 在 `src/widgets/` 写组件，接收 `{ w }`，根据 `w.size` 渲染不同尺寸。
2. 在 `src/types.ts` 的 `WidgetType` 里加类型名。
3. 在 `src/widgets/registry.tsx` 的 `WIDGETS` 里注册（名称、图标、可用尺寸、点击打开的页面、可选配置组件）。

### 发布新版本

仓库配置了 GitHub Actions（`.github/workflows/release.yml`），推送版本标签后会自动在云端打包：

1. 把 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 里的 `version` 改成新版本号并提交。
2. 打标签并推送：
   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```
3. 等 Actions 跑完（约 10–15 分钟），在 Releases 里会出现一个草稿，检查安装包后点 **Publish release**。

## 致谢

- AI 早报内容来自 [橘鸦 AI 早报](https://daily.juya.uk/)
- 字体：霞鹜文楷、站酷快乐体、站酷小薇、Nunito、Quicksand、Lora、Outfit（均为 SIL OFL 开源字体）
- 农历数据：[lunar-javascript](https://github.com/6tail/lunar-javascript)

## 许可证

[MIT](LICENSE) © JxyCarles。可以自由使用、修改和再发布，请保留原作者署名。
