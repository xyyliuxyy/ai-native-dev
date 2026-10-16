---
name: ai-native-dev
description: Use when the user invokes AI Native Dev in Codex or asks to run this project's evidence-based development and quality-gate workflow in a Git repository.
---

# AI Native Dev for Codex

Use this skill as the Codex entry point. The OpenCode `/ai-dev` command is a separate interface. The package root is the directory containing this `SKILL.md`; its executable is `bin/ai-native-dev.cjs`.

## Start in a project

1. Read the target repository and its existing instructions. Require a Git repository and Node.js 20 or newer.
2. If `.ai-native/tools/aicp.cjs` is absent, run `node <package-root>/bin/ai-native-dev.cjs install --project <target-root>`. Inspect existing `.ai-native`, `.agents/skills`, `.opencode`, and CI files first; the installer refuses differing files. It also creates OpenCode files, which Codex does not use. Tell the user if Matt skills cannot be downloaded or locked.
3. Run `node .ai-native/tools/aicp.cjs doctor` from the target root. Read `.ai-native/policy.json` and the user's request before planning the work.

## Develop and verify

- Clarify material gaps in requirements and acceptance criteria. After the user accepts them, record the task with `plan --task <description> --acceptance <criteria> --accepted`. Do not mark unconfirmed requirements accepted.
- Use the repository's own implementation and test practices. The CLI risk profile is a minimum; review security, money, privacy, and permission changes carefully.
- For medium or high risk, arrange independent QA when an independent agent is available. Its report belongs at `.ai-native/qa/assessment.json` and must reflect actual test design; a JSON field alone does not prove independence. High risk also requires a real security check.
- Run `node .ai-native/tools/aicp.cjs run`, then `node .ai-native/tools/aicp.cjs gate`. Report the exact failed or missing checks. A `NO-GO` is not a successful delivery.
- Keep authorization for push, merge, deploy, and external changes tied to the user's actual request. The local hook is advisory; GitHub branch protection requires separate repository configuration.

The package README and `templates/qa.SKILL.md` describe the workflow and QA report format. Do not treat the OpenCode command template as Codex instructions.
