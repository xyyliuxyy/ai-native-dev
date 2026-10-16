---
description: AI Native 研发全流程（需求对话→规格→开发→独立QA→真实检查→质量门禁）
agent: build
---

# AI Native Dev — 统一研发入口

用户描述（可以为空，空时请先询问用户要开发什么）：$ARGUMENTS

先加载 `.agents/skills/ai-native-orchestrator/SKILL.md` 并严格遵循它。不要只给流程建议；在当前对话里真正实施所需阶段。与用户继续通过自然语言对话，不要求其提前填写 policy.json 或 task.txt。

启动步骤：
1. 查看仓库与代码组织，运行 `node .ai-native/tools/aicp.cjs doctor`（不存在时说明需要先安装）。自动识别项目已有测试工具。
2. 如果用户尚未给需求，问“你想开发什么功能？”；描述不完整时只问阻碍正确实现的关键问题。已有信息足够便继续。
3. 生成简短的需求与可测验收条件，向用户确认。确认后使用 `node .ai-native/tools/aicp.cjs plan --task "..." --acceptance "..." --accepted` 保存正式任务，注意命令使用参数数组或安全引用避免 Shell 注入。
4. 根据风险选择 Matt Skill（如果已经安装），或根据同等工作原则生成本地规格 / task 清单。不要伪称调用了未安装或用户显式调用才允许的 Skill。不要让 `ask-matt` 成为第二个总控。
5. 按规格和 TDD 实施代码与测试，变更范围明确；先跑相关测试。
6. 中高风险任务必须委派 `ai-native-qa` 子 Agent，它仅根据批准的验收条件和实际代码，从独立上下文设计、创建独立验收测试和 QA 报告，未经授权不得修改业务实现。若 QA Agent 工具能力不可用，不得自称完成独立 QA。
7. 完成后运行 `node .ai-native/tools/aicp.cjs detect`，自动检测真实 test/qa/security 命令；缺失测试时请提出最小安装/脚本接入方案，需要安装依赖或提升权限前询问用户许可。绝不以 `echo OK` 等虚假检查替代。
8. 运行 `node .ai-native/tools/aicp.cjs run` 与 `node .ai-native/tools/aicp.cjs gate`。遇到 FAIL 分析报告、修复并完整重跑；若依赖不存在或需权限而用户未授权，报告 NO-GO，不假装成功。
9. 最终返回需求目标、修改内容、实际命令、QA 结果、未验证项和门禁 GO/NO-GO。未经用户授权不要自动 push、合并、部署或发布。

关键原则：
- 尽量自动推进，只有业务决策、外部安装、危险动作才需要确认。
- Matt `to-spec` 和部分实现 Skill 可能依赖 Issue Tracker 或用户显式调用，不能假装这些调用在任意宿主都能自动运行；可以按其已审核工作方法生成本地同等资产。
- `/ai-dev` 是 OpenCode 的原生自定义命令，不是独立的后台 Agent 服务；质量门禁由真实 CLI/CI 检查提供。
