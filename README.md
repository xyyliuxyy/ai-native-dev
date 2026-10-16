# AI Native Dev

**一次安装，一个 `/ai-dev` 入口，在 OpenCode 内通过自然语言完成需求、规格、实现、测试、独立 QA 和质量验收。**

这是可运行的工程入门包，采用可替换的 Matt Skills + 独立的质量控制层，而不是 Fork Matt。优先支持已有 Git 仓库里的 JS/TS、Python 项目。需要 Node.js 20+ 和 Git，OpenCode 已安装时可以直接使用命令。

## 最简单的安装方法

从交付物里下载 `ai-native-dev-installer.tgz`。在你**现有项目的根目录**打开终端：

```bash
npx --yes --package /绝对路径/ai-native-dev-installer.tgz ai-native-dev install
```

例如在 Windows PowerShell：

```powershell
npx --yes --package "C:\Users\你\Downloads\ai-native-dev-installer.tgz" ai-native-dev install
```

此命令会复制本地总控 Skill、原生 OpenCode `/ai-dev` 指令、独立 QA 子 Agent、Hook、执行器和 GitHub Actions 模板；自动检测 npm/pnpm/yarn/bun 或 Python 测试脚本，并尝试从 Matt 官方 GitHub 仓库下载部分选定工程 Skill 并固定到 Git SHA 和文件哈希。**并非全量下载所有 Skill**。下载来的 Matt 代码不会在安装时自动执行。

> 这是一个**本地 npm 安装包**，尚未发布到 npm 公共仓库。因此现在不能直接执行 `npx ai-native-dev install`；要通过上面的本地 `.tgz` 路径安装。待正式发布到 npm 才能使用更短的公共包名命令。

如果当前无 GitHub 网络连接，安装器会保留已安装的入口，并显示 Matt 未接入。此时可以用 `/ai-dev` 讨论和实现，但质量门禁不会在 Matt 缺失时声称全绿。联网后重新执行同一条安装命令会尝试补装 Matt。

若要完全离线演示，可加 `--skip-matt`，门禁同样会标明 Matt 缺失。


## 从 GitHub 源码安装

仓库推送成功后，可以先 `git clone` 到本地，进入目标 Git 项目再使用 npm 从该源码目录执行安装命令：

```bash
# 在 ai-native-dev 源码仓库目录执行
npm pack
# 在你的目标项目根目录执行（将路径改成上一步生成的 .tgz 文件绝对路径）
npx --yes --package /path/to/ai-native-dev-local-0.2.0.tgz ai-native-dev install
```

以上是使用源码的方式，项目目前没有发布到公共 npm 注册表。公开发布或经审核后也可以考虑基于固定 Git Commit 安装。

仓库首次发布方式见 [PUBLISH.md](PUBLISH.md)。

## 使用方式

重启/重新打开 OpenCode 项目，在聊天框输入：

```text
/ai-dev
```

OpenCode 会问“你想开发什么功能？”。你也可以直接带需求：

```text
/ai-dev 开发一个退款接口：只有订单付款人可退款，退款金额不得超过实付金额，重复请求必须幂等
```

之后按顺序协作：

1. Agent 自动读取项目配置，与你澄清少量关键业务要求（已有信息充分就不重复问）。
2. 形成规格与可测的验收条件，等你确认后保存到 `.ai-native/task.json`。
3. 风险分级：低风险走单测，中风险加独立 QA，高风险加安全扫描。
4. 根据宿主允许的能力读取已安装的 Matt Skill；Matt 的某些 Skill 要求用户显式调用或依赖 Issue Tracker。无法直接调用时，系统采用本地规格 / 任务文档工作流并如实披露，不伪装成官方调用。
5. Coding Agent 按计划实现并跑测试；中高风险交给 `ai-native-qa` 子 Agent 独立设计负向测试，输出 `.ai-native/qa/assessment.json`。
6. CLI 从项目真实脚本中识别可执行测试，并由 Node 子进程实际运行；通过后生成 `.ai-native/reports/execution.json`。
7. 质量门禁再次检查测试结果、报告时效、QA 报告和固定的 Matt 来源。缺少任何必需环节，返回 NO-GO，Agent 继续修复或报告阻塞原因。

**你无需为了启动对话预填 JSON**。项目里若已经有 `test:ci` / `test:qa` 或 pytest 测试目录会自动探测。系统无法确定的项目依赖或危险变更才向你请求许可。

## 一般项目会自动识别的内容

- JS/TS：`package.json`、锁文件、`test:ci` / `test`、`test:qa` / `test:acceptance` / `test:e2e`、Semgrep CLI。
- Python：`tests/`、`qa_tests/`、pytest 命令、Semgrep CLI。
- GitHub Actions：生成按技术栈安装依赖的 CI 检查模板；不会自动开启 GitHub 仓库分支保护。

如果你项目里没有任何可执行测试，AI 可以根据需求帮你写测试，但在真实测试能跑通之前 **不会给 GO**。高风险项目没有安全扫描器时同样如此。

## 直接诊断与测试

安装后你不需要记住下面这些命令，但它们有助于排查问题：

```bash
node .ai-native/tools/aicp.cjs doctor
node .ai-native/tools/aicp.cjs detect
node .ai-native/tools/aicp.cjs run
node .ai-native/tools/aicp.cjs gate
node .ai-native/tools/aicp.cjs matt-check
```

只有真正通过 `gate`，才可将检查视为满足当前策略。CI 工作流名为 `ai-native-quality`，仓库管理员必须另外启用 **Required Status Check** 才能阻止 PR 合并。

## Matt 来源与升级

初次联网安装时会获取官方仓库 `https://github.com/mattpocock/skills.git` 的当前 HEAD，锁定完整 Commit SHA 和所选目录的内容哈希；本工程包不预先夹带第三方 Matt 源码。不会后台悄悄更新。

```bash
node .ai-native/tools/aicp.cjs matt-check
node .ai-native/tools/aicp.cjs matt-update --approve
```

更新命令会验证旧版文件未被擅自修改，备份旧版后安装当前上游提交。用于生产团队时，还应在执行 `--approve` 前审查上游差异、权限和脚本。当前实现提供备份与防覆盖检查，不是完整的自动化安全扫描或原子回滚事务。

Matt Skills 使用其自身许可证，详见安装后 `.ai-native/upstream/` 内的版权文件；本工程自己的代码采用 MIT。

## 工程边界（非常重要）

- `/ai-dev` 是 OpenCode 的**原生自定义命令 + 模型遵循的编排指令**。这套工程包尚不是一个完全确定性的后台 DAG 工作流执行器；无法保证 AI 在所有模型/上下文中百分之百按自然语言自动调用每项 Skill。
- OpenCode Hook 仅对识别到的明显 Git 推送、合并和 npm 发布命令尝试本地拦截，**不是安全沙箱，不能替代仓库保护**。
- 中高风险要求真实 QA 测试与结构化 QA 报告，但一个 JSON 不能单独证明“确实由不同模型或进程独立完成”。隔离和权限取决于 OpenCode 执行环境，还需要在真实环境验收。
- CI 的运行依赖于项目已有依赖和其可用的安装方式；非 JS/TS、Python 技术栈需要自行扩展识别器。
- 自动从官方仓库拉取最新 Commit 仅代表来源可追溯，**不等于内容已经通过安全审批**。强合规生产环境应在内部镜像中维护批准版本。
- 这是在隔离示例仓库中通过自动化测试的最小系统；在本次交付环境未运行 OpenCode 的实际聊天流程，也未从 GitHub 在线安装过 Matt 官方仓库。

## 开发和测试这个安装包

在本工程目录下：

```bash
npm test
npm pack
```

测试使用 Node 内置测试框架，包含模拟 Git 项目、真实测试执行、Matt 本地固定版本、证据失效、独立 QA 和 fail-closed 门禁。
