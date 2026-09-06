# 梦序 UI 回归审计

## 比较基线

- A：`1a9db18`，本轮开始时的 `feature/projects-v1`。
- B：`ed7f7bd`，项目系统 v1 之前。
- C：`3c029d1`，Embedded Tasks 之前。
- D：`upstream/main` 的 `ab1a2d1`，本地已获取的作者原版。没有合并或回滚上游。
- 关键业务提交：学习 `d065d1d`、计划 `d4c9b16`、日记复盘 `b9f59fd`、人生方向 `c82696d`、任务 `ed7f7bd`、项目 `9a668e6`。
- 已完成的视觉恢复：新建任务／项目 `a4fd0c4`、ProjectBoard `1a9db18`。

以 `git show`、`git diff` 和当前源码确认，未以印象推断原版。

## 页面审计

| 页面 / 组件 | 原版 UI → 本轮前 UI | 改变原因 | 本轮处理 / 业务冲突 |
| --- | --- | --- | --- |
| 首页顶部 | DashboardView 直接创建封面、Pulse、header、nav → 同结构，品牌/中文/时间进度经过批准调整 | 主动品牌与首页迭代 | 提取 WorkbenchShell，顺序与 class 不改；不恢复英文或光标 |
| 顶部导航 | DashboardView 的 ad-toolbar → 已批准的七项导航，只有短暂点击态 | 文案与页面入口调整 | 共享同一导航实现，当前页持续 active；不恢复旧导航文案 |
| 收件箱 | OpportunityBoard 挂载于 DashboardView 的 boardEl → 原结构保留 | 仅改用户可见名称、移除 wb-home class | 继续在 DashboardView，共用同一 shell；没有独立 Capture 一级 View |
| 全部项目 | DashboardView 内的 ProjectBoard → 9a668e6 的裸 ProjectView，1a9db18 已恢复 Board 本体 | 新 Markdown 模型改用独立 View，遗漏 chrome | 在独立项目标签中挂载共享 shell；不把 Board 塞回首页 |
| 新建任务 | ad-task-modal、ad-modal-field/row/col/input/btns → 曾改为默认表单 | Embedded Tasks 表单接线 | a4fd0c4 已恢复；本轮不动创建表单和保存逻辑 |
| 新建项目 | 原 ProjectModal 的名称/阶段/日期/描述 → 新模型名称/方向/状态/日期/目标 | UUID + Markdown 项目模型 | a4fd0c4 已恢复外壳；不恢复阶段配置或旧目录写入 |
| 项目详情 | 旧项目选择面板 + 阶段条、旧任务编辑 Modal；无等价 Markdown 详情页 → 新建裸标题/段落 | 新项目页包含目标、任务、资料、过程、成果 | 保留二级 View 和全部字段，复用原内容块/标题/按钮；不加一级 shell，不恢复旧任务文件编辑器 |
| 项目卡片 | po-kanban 卡片，原本内容主要是任务 → 简单 mx-project-card → 原 Board 卡片 | 项目聚合与任务语义变化 | 1a9db18 已恢复，当前不改；读取梦序 Adapter |
| 项目筛选 | 原任务状态／NPDP 阶段控制 → 简单 Setting 下拉 → 原风格真实项目状态 chips | 项目状态与旧阶段不同 | 已恢复视觉；真实状态不冒充阶段，NPDP 不写入梦序项目 |
| 甘特图 | 原 SVG 时间轴、缩放、底部列表 → 裸列表时无入口 → 已恢复 | 主页面被替换 | 渲染器不改；项目日期只读投影，旧任务拖拽写入不恢复 |
| 列表 | 原 po-table 和排序 → 简单段落 → 已恢复项目表格 | 数据字段不同 | 本轮不改 Board 列表；不恢复旧任务 checkbox/优先级/父子层级 |
| 日历 | 原月/周、日期导航、范围条 → 主页面入口丢失 → 已恢复 | 主页面被替换 | 本轮不改；只显示项目日期，不强接 Embedded Task 日期 |
| 看板 | 原 po-kanban 列布局 → 简单项目列表 → 已恢复 | 主页面被替换 | 本轮不改；按梦序状态分组，不恢复旧任务拖拽状态保存 |
| 更多工具 | 原作者可编辑首页模块 → 保留于 classic 模式 | 明确的新首页产品决策 | 保留原模块、原入口；继续共用 shell。不是裸独立 View |
| 学习 Modal / 列表 | 无对应原版业务页面；有成熟通用 Modal、内容块与按钮 → 新增默认 form/section | 学习 v1 新功能 | 新建资源复用 ad-task-modal / ad-modal-input / footer；队列/主题复用原内容块、按钮、空状态；保留 Properties 和资源类型路径 |
| 计划入口 | 无原版等价模块 → 梦序当前计划卡片和 Markdown 打开方式 | 计划 v1 明确产品设计 | 保持不动，不能把新功能称为“原版回归” |
| 日记 / 复盘列表 | 无原版等价列表 → 新增裸 h2/section/button | journal/review v1 | 最近记录/查看复盘复用原 modal、toolbar、内容块、空状态；日期规则与创建回调不变 |
| 人生方向详情 | 无原版等价 View → 新增裸标题/按钮/段落 | 人生罗盘 v1 | 仅复用原二级内容块、按钮、标题；能力/主题/资源/项目关联不变，不加一级 shell |
| 全部任务 / 今日执行行 | 原 TaskStore 的 ad-todo 行/状态/重复任务操作 → Embedded checkbox、日期、来源行及新增汇总 Modal | 来源笔记任务模型替代旧任务文件 | 汇总 Modal 复用原 shell/内容块；首页任务行不改布局。保留真实 checkbox、来源和日期，不能恢复旧重复任务/父子任务/文件操作 |

## 计数与恢复边界

按独立变化点计：5 处旧视觉替换或遗漏（项目 shell、Board 主页面、新建任务、新建项目、任务行），以及 6 组新增页面的未统一外壳（学习创建、学习列表、任务汇总、复盘列表、项目详情、方向详情）。共 11 组，其中前轮已恢复 3 处。本轮恢复项目 shell、统一 6 组新增页面；任务行因来源语义和首页冻结保留。

原版不存在的学习、计划、复盘、方向页面不伪造原版，不回滚梦序规则。ProjectBoard、Project adapter、首页卡片布局、人生罗盘、新建项目表单、Markdown 模板与数据模型保持不变。

## 挂载与生命周期

- 首页/收件箱/更多工具：DashboardView → WorkbenchShell + 原内容 board。
- 全部项目：独立 ProjectView → WorkbenchShell + 上一轮 ProjectBoard。
- 项目详情：同一个 ProjectView 的二级状态，卸载 shell；返回总览时重新挂载一个 shell。
- 每个 shell 是 Obsidian Component，卸载清理 clock、vault/css 监听和 noise rAF；导航重绘替换节点，不叠加监听。
- 封面与主题读取同一 plugin settings；概览使用同一个只读 shellTaskStore 和同一计数函数；日期复用 naturalTimeSummary，农历复用原函数。概览统计口径保持不变。
- 首页导航通过已有 Dashboard leaf 复用，项目仍是独立“全部项目”标签；不创建隐藏首页实例。

## CSS / DOM

- 删除 DashboardView 内搬入 WorkbenchShell 的 header/banner/pulse/nav/noise 重复实现，而非复制一份。
- 删除学习/复盘/任务汇总的裸标题、裸 section 与默认 form 外壳，改为既有原 class。
- 替换裸项目页的 flex 填满规则，为顶部保留正常文档流和滚动空间。
- 仅增加弹窗工具栏换行、长标题换行的必要布局规则；不重新定义 palette/border/radius/input/button。
- mx-task-* 仍由首页/Embedded Tasks 使用；mx-project-tasks 仍服务旧工具的 Embedded 区；mx-direction 和 mx-project-view 仍服务二级页面。均不盲删。原版 CSS 自身已有的重复声明不在本轮清理。

## 验证

既有业务测试不移除；仅更新导航实现迁移后的源码定位断言，并补充 Component 测试替身。新增共享 shell 顺序、一致性、active、重复刷新、卸载、封面切换、异步关闭，以及新列表样式/回调测试。实机使用部署前顶部位置与文案记录对照，检查主题、窄窗口、导航、Board 四视图与二级页面；配置和原笔记以 SHA-256 核验。

结果：`npm run check` 330/330 通过（315 原测试 + 15 新回归），`node --check main.js` 和 `git diff --check` 通过。首页顶部各项文案、位置、尺寸和字号与部署前记录一致。项目页完整 shell、active、Board 四视图、创建与详情、Embedded 完成统计、学习创建/队列、主题列表、任务汇总、最近记录、复盘、方向详情及更多工具均实机巡检。深色与 760px 窄视口无外层横向溢出，保留 Board 内部横向滚动。测试项目/资源已移出 Vault 留在恢复备份，原 11 篇 Markdown、Custom data.json 和官方插件哈希一致。
