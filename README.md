# 桌面看板

一个常驻 Windows 桌面的个人工作台：备忘录、日历、日程、待办计划、工作项目看板、AI 额度、资讯聚合。
界面仿 iOS 小组件，每个组件可选 **小 / 中 / 大 / 超大** 四种尺寸，可自由拖动排列。

技术栈：Tauri 2（Rust）+ React 19 + TypeScript + Vite。数据全部保存在本地。

## 运行

```bash
npm install
npm run app:dev      # 开发模式启动桌面程序
npm run app:build    # 打包安装程序，输出在 src-tauri/target/release/bundle/nsis/
npm run dev          # 只在浏览器里预览界面（AI 额度、资讯等后端功能不可用）
```

## 功能

| 模块 | 小组件尺寸 | 完整页面 |
|---|---|---|
| 时钟 | 小：时间 + 农历；中：加今日 / 全年进度 | — |
| 日历 | 小：今天 + 下一个日程；中：加近期列表；大：月历 | 月视图（农历、节气、法定假日、调休），双击日期新建日程，日程提醒 |
| 日程 | 小：下一项倒计时；中/大：今日时间线；超大：未来 7 天周计划 | 同日历页 |
| 待办 | 小：完成度圆环；中/大：清单（大尺寸可直接添加） | 分组清单（逾期/今天/之后/未安排）、本周计划（拖动卡片安排日期） |
| 备忘录 | 小：置顶备忘；中/大：列表 | Markdown 编辑 / 预览、搜索、置顶 |
| 项目 | 选某个项目：小（进度环）/ 中（概况 + 计数）/ 大（待办·进行中·完成 分列要点）/ 超大（左概况右看板）；也可选“全部项目”总览 | 项目概况（Markdown）、三列看板（拖动或 ‹ › 切换状态）、每项可写细节和截止日期、工作日志 |
| AI 额度 | 小：单个平台；中：2×2 总览；大：加 Claude Code 14 天用量柱状图 | 各平台详情与 Key 配置、Claude Code 30 天按模型 / 按项目统计 |
| 资讯 | 小：头条；中/大/超大：列表 | 资讯源管理（任意 RSS / Atom） |

其他：托盘图标（关闭窗口 = 隐藏到托盘）、桌面挂件模式（窗口置于桌面底层、不占任务栏；此模式下最小化会改为隐藏到托盘，从托盘唤出时临时提到最前）、窗口置顶、开机自启、启动时恢复上次的窗口大小和位置。

## 创造台（扩展与批量导入）

Dock 里的「创造台」，配合 [docs/扩展规范.md](docs/扩展规范.md) 使用：

- **导入数据 · AI 整理**：粘贴 `deskboard.import/v1` JSON，或粘贴任意原始材料（会议记录、需求文档、待办清单）让 AI 整理成 JSON。先预览再导入；同名项目可选合并或另建；导入前自动备份到 `%APPDATA%\com.iuu.deskboard\backups\`，可一键撤销。也可以把全部项目导出成同样格式的 JSON。
- **小组件工坊**：用 `deskboard.widget/v1` 声明式地定义小组件（数据地址 + 字段映射 + 显示方式），或用一句话描述让 AI 生成；实时预览，安装后出现在「添加小组件」里。
- **扩展规范**：一键复制规范文档交给任意外部 AI。

AI 服务在「设置 → AI 服务」里选择：DeepSeek、智谱 GLM（复用「AI 额度」里保存的 Key）、Claude、或任意 OpenAI 兼容接口（填写地址、模型和 Key）。

## 布局操作

- **右键小组件**：直接切换 小 / 中 / 大 / 超大，打开、设置、移除。
- **右键空白处**：添加小组件、自动整理布局、更换壁纸与主题。
- **编辑模式**（右上角「编辑」、右键菜单，或长按小组件）：拖动小组件到任意格子（允许留空位，挡住的组件自动下移）；拖右下角把手调整大小，自动吸附到该组件支持的尺寸。

## 壁纸与主题

- 6 个预设壁纸，或导入自己的图片 / 视频。
- 导入 Wallpaper Engine 壁纸文件夹（`workshop\content\431960\<数字>`）：
  - 「视频」类型直接播放。
  - 「场景」类型由 `src-tauri/src/we_scene.rs` 解析 `scene.pkg`：解码贴图（内嵌 PNG/JPG、LZ4 压缩的 RGBA、DXT1/3/5），按 `.mdl` 网格把人偶（puppet）图层烘焙成完整图片，读取骨骼挂点定位子图层，再按场景树算出每层的变换矩阵。壁纸自带的主题切换和开关（如气泡、眼泪）会出现在设置页。粒子、文字、着色器特效和脚本无法还原，改用近似的 CSS 动效（摆动、漂浮、闪烁）和鼠标视差。解码结果缓存在 `%LOCALAPPDATA%\com.iuu.deskboard\we-cache\`。
  - 「网页」类型切换为**透明模式**，浮在 Wallpaper Engine 的动态壁纸上。
  - 只在本机读取你已订阅的文件，不做任何分发；请遵守各壁纸作者的使用条款。
- 配色自动从壁纸提取（k-means 取主色）：强调色、小组件玻璃底色、文字色、图标色都来自壁纸本身；也可以手动指定强调色、切换明暗、单色图标。
- 可调：小组件不透明度、壁纸暗化、壁纸模糊、格子大小。
- 字体：圆润 / 文艺（霞鹜文楷）/ 活泼（站酷快乐体）/ 雅致（站酷小薇）/ 现代（Outfit）/ 默认，均随程序打包；也可以导入自己的 .ttf / .otf。

## AI 平台接入

| 平台 | 接口 | 需要填写 |
|---|---|---|
| DeepSeek | `GET https://api.deepseek.com/user/balance` | 普通 API Key |
| 智谱 GLM | `GET https://open.bigmodel.cn/api/monitor/usage/quota/limit`（GLM Coding Plan 额度） | API Key；国际版可切换到 `api.z.ai` |
| Claude API | `GET https://api.anthropic.com/v1/organizations/cost_report` | **Admin Key**（`sk-ant-admin...`，只有组织账户能创建）；普通 Key 查不到用量 |
| Claude Code | 读取本机 `~/.claude/projects/**/*.jsonl` | 不需要 |

Key 在「AI 额度」页面填写，保存在 **Windows 凭据管理器**（条目名 `provider:deepseek` 等），不会写入数据文件。

说明：
- 智谱按量付费账户目前没有公开的余额查询接口，这里查的是 Coding Plan 的 5 小时 / 每周窗口用量。
- Claude Code 的金额是按 API 标价折算的估算值，订阅用户仅供参考。

## 数据

- 业务数据：`%APPDATA%\com.iuu.deskboard\data.json`（设置页可一键打开目录），复制该文件即可备份。
- API Key：Windows 凭据管理器。

## 目录结构

```
src/
  App.tsx               标题栏、Dock、页面切换、窗口模式
  store.ts              全局状态 + 持久化（防抖写入 data.json）
  components/Board.tsx  小组件网格、编辑模式（拖动排序、尺寸切换、移除）
  widgets/              各小组件；registry.tsx 注册类型、可用尺寸和配置项
  pages/                各模块完整页面
  services/             AI 额度解析、资讯抓取、定时刷新与日程提醒
src-tauri/src/
  storage.rs            读写 data.json
  secrets.rs            Windows 凭据管理器
  providers.rs          DeepSeek / GLM / Claude 接口
  claude_code.rs        解析 Claude Code 本地日志
  feeds.rs              RSS / Atom 抓取
```

## 新增一个小组件

1. 在 `src/widgets/` 写组件，接收 `{ w }`，根据 `w.size` 渲染不同尺寸。
2. 在 `src/types.ts` 的 `WidgetType` 里加类型名。
3. 在 `src/widgets/registry.tsx` 的 `WIDGETS` 里注册（名称、图标、可用尺寸、点击打开的页面、可选配置组件）。

## 后续计划

- 全局快捷键快速记录
- 外部日历同步（Outlook / ICS 订阅）
- 读取本地 Git 提交自动生成项目日志
- AI 早报：用大模型总结当天资讯
- 用量历史快照与趋势图
