---
name: initial-doc-bootstrap
description: '在首次开发、模块初建或大规模重构时，生成或修复首版项目文档体系。适用于需要同时创建或整理 README.md、QUICK_START.md、frontend/README.md、backend/README.md、config/README.md、DEVELOPMENT_PLAN.md 的场景。'
argument-hint: '描述正在初始化的项目或模块'
user-invocable: true
disable-model-invocation: false
---

# 首版文档引导 Skill

当项目第一次成型、某个大模块第一次落地，或现有文档严重缺失、失真时，使用这个 Skill 来建立一套可持续维护的基础文档。

## 目标

生成或修复一套核心文档，让后续任何 AI 模型或人工维护者都能快速理解系统，并继续维护。

本 Skill 覆盖的文档集合包括：
- README.md
- QUICK_START.md
- frontend/README.md
- backend/README.md
- config/README.md
- DEVELOPMENT_PLAN.md

## 适用场景

- 新项目首版落地
- 大型子系统第一次进入可运行状态
- 代码已有雏形，但文档缺失或互相矛盾
- 大规模重构后旧文档已不可信

## 必须执行的步骤

1. 先读真实代码。
在写文档前，先阅读真实的前端、后端、配置、测试和运行入口文件。不要靠猜测补系统行为。

2. 明确文档边界。
把事实写到正确的文件里：
- README.md：系统级说明、架构、模块地图、API 全览、运行流程、维护规则
- QUICK_START.md：最短启动和验证路径
- frontend/README.md：前端结构、页面、交互约定、前端维护说明
- backend/README.md：路由、服务、调度、数据库/数据流、后端维护说明
- config/README.md：配置字段、默认值、更新规则、维护注意事项
- DEVELOPMENT_PLAN.md：里程碑、当前阶段、本轮完成事项

3. 去除重复。
不要把同一份系统事实复制到每个文件里。README.md 是系统级事实源，其它文档只保留各自边界内的信息。

4. 文档必须可维护。
首版文档里必须写清楚维护规则，让后续维护者知道代码变更时该更新哪份文档。

5. 对照代码库核验。
结束前核对端口、命令、路由、文件名、数据结构和功能描述，确保与真实代码一致。

6. 优先复用模板骨架。
在首次创建这六份文档时，优先参考以下模板资源，再结合真实代码填充：
- [README 模板](./assets/README.template.md)
- [QUICK_START 模板](./assets/QUICK_START.template.md)
- [前端文档模板](./assets/frontend.README.template.md)
- [后端文档模板](./assets/backend.README.template.md)
- [配置文档模板](./assets/config.README.template.md)
- [开发计划模板](./assets/DEVELOPMENT_PLAN.template.md)

## 必须执行的文档规则

生成文档时始终执行以下规则：

1. README.md 是系统级事实源。
2. 子文档不重复整套系统说明。
3. 所有命令、路由、配置字段和运行事实都必须能在当前代码库中找到依据。
4. 不能从代码验证的事实，要么标注待确认，要么删除。
5. 进度历史写进 DEVELOPMENT_PLAN.md，而不是到处散落在 README 中。
6. 启动和联调步骤归 QUICK_START.md 管。
7. 前后端实现细节分别写在各自 README 中。

## 输出标准

使用这个 Skill 后，仓库应至少具备：
- 一份系统级清晰的 README.md
- 一份可直接执行的 QUICK_START.md
- 一份边界清晰的 frontend/README.md
- 一份边界清晰的 backend/README.md
- 一份与真实配置结构对齐的 config/README.md
- 一份反映当前进度的 DEVELOPMENT_PLAN.md

## 最终检查项

结束前确认：
- 六份核心文档都存在
- 它们的职责没有明显重叠
- 文档描述的是当前代码，而不是过时规划
- 文档里已经写入后续维护规则