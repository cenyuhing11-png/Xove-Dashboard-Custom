# 项目与成果目录命名

正式项目根目录为 `03-项目与成果/`，新项目仍按 `根目录/项目名称/项目名称.md` 创建。
根路径只在 `src/data/vaultPaths.ts` 定义；`projects.ts` 重导出以兼容现有调用。
Project scanner、Process adapter、默认设置、Embedded Tasks 来源判断、任务来源提示和 legacy 创建兜底均复用该常量。
不保留旧根路径兜底扫描，不改变项目 UUID、Properties、Embedded Tasks、学习根目录或数据模型。

## 本次迁移核对

- 修改前备份了项目目录、完整 Custom 插件、单独的 data.json 和 Obsidian 根配置，并记录原笔记哈希。
- 待迁移目录为空；目标目录不存在。使用原地 rename，目录 inode 保持一致。
- Custom 设置仅 `projectsFolder` 更新为当前正式根目录，其他设置逐项校验不变；data.json 不进入 Git。
- 现有 12 篇 Markdown 无目录路径引用，无需修改正文或内链。
- workspace 的旧路径仅是已删除测试笔记的 `lastOpenFiles` 历史，不手工修改。
- 周记和月复盘新模板的总类别标题同步为“项目与成果”；既有笔记不改写。“作品与内容”“最终成果”不变。

## 验证

完整 check（build/typecheck/test）466 项全部通过：458 项原测试，新增 8 项目录、创建、覆盖保护、任务、Adapter、日期、学习兼容和文案回归。
Obsidian 顶部创建测试项目进入新根目录；顶部新建任务写入同一项目 Markdown，checkbox 写回及 UUID 保持正常。
首页进程与日程、全部进程、项目类型筛选、项目详情、设计方向关联、甘特图、列表、日历、看板均完成实机检查。
测试项目连同其任务移出 Vault 至恢复备份，原笔记哈希不变，最终项目根目录为空。
