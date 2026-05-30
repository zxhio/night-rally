# AGENTS

本文件只描述本仓库的本地 skill 功能、路由和项目工作规范。

## 项目方向

Night Rally 是一个纯 H5 Canvas 的俯视角街机赛车手感实验。当前目标不是完整游戏，而是逐步调出爽滑、可控、算法化的车辆运动。

## 路由

| Skill | 功能 | 什么时候用 |
|---|---|---|
| `plan-workflow` | 写简短的文件化计划，包含目标、方案、边界、风险、确认项和进度。 | 用户要求写计划、先规划、拆步骤、checkpoint、保存计划到文件、或先确认后执行时。 |
| `review-workflow` | 先 review，不改代码；把 findings 给用户确认后，再转入计划和执行。 | 用户要求 review、review-gate、先审查再修、检查当前 diff、或根据 review 结果修复时。 |
| `git-workflow` | 约束安全 Git 操作和 commit message。 | 检查状态、stage、review diff、准备 commit 或写 commit message 时。 |

## 默认规则

- 用户要求“先不要写代码”“先讨论”“给方向”时，只输出方案，不编辑文件。
- 用户要求实现时，每次只做一个小步，优先保持可试玩。
- 对车感相关改动，优先集中在 `src/main.js` 顶部参数和车辆运动算法。
- 对视觉和 UI 改动，优先集中在 `src/styles.css` 和 Canvas 绘制函数。
- 不引入 Phaser、Vite、TypeScript、打包流程或新依赖，除非用户明确确认。
- 不复刻 K-Rally 的名称、素材、音乐、赛道或 UI。

## H5 原型边界

- 技术路线：纯 HTML + CSS + JavaScript + Canvas。
- 第一阶段：车感实验室，可以带一条直线跑道或极简测试场。
- 操控目标：爽滑街机感，车辆轨迹由算法控制，不依赖物理引擎。
- 开发节奏：一小段实现后让用户试玩和调参，再继续下一小段。

## Build & Test

- 当前没有构建流程。
- 运行：直接打开 `index.html`，或使用 `python3 -m http.server 5173`。
- 代码改动后至少做一次浏览器手动试玩。
- 如果以后加入构建工具，再补充对应命令。

## Agent Workspace

- `.agent/plans/`：本地计划文件，不提交。
- `.agent/reviews/`：本地 review 笔记，不提交。
- `.agent/templates/`：计划和 review 模板，提交到仓库。
- `.codex/skills/`：本仓库 Codex skill，提交到仓库。
- 不要把 AI 工作流规则放到 `docs/`。
