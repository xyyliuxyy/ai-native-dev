# 发布到 GitHub

此文件夹是可以直接发布的源码仓库。建议**先创建私有仓库**，完整验证后再决定是否公开。不要上传真实项目生成的密钥、运行日志或 `.ai-native` 证据数据。

## 最快方式：GitHub CLI

前提：本机已安装 Git、GitHub CLI（`gh`），并在 GitHub CLI 完成登录。

在当前目录运行：

```bash
git init
git add .
git commit -m "Initial AI Native Dev source"
gh repo create ai-native-dev --private --source . --remote origin --push
```

如果提示需要配置 Git 身份，请先在本机设置 `git config user.name` 和 `git config user.email`，再重试提交。不需要把账号密码或 Token 发送给任何人。

如果远端仓库已存在，请在本地添加对应的真实地址并推送：

```bash
git remote add origin https://github.com/<你的GitHub用户名>/ai-native-dev.git
git branch -M main
git push -u origin main
```

## 不使用 GitHub CLI

1. 在 GitHub 网页创建一个空的私有仓库 `ai-native-dev`，不要勾选自动添加 README/License（这些文件已存在）。
2. 使用上面的 `git init` / `git add` / `git commit` 命令在本地创建提交。
3. 将仓库页面显示的 HTTPS URL 添加为 `origin`，然后运行 `git push -u origin main`（如当前分支并非 main，先运行 `git branch -M main`）。

## 发布前的本地验证

```bash
npm test
npm pack --dry-run
```

> 本项目尚未执行过线上 Matt 仓库安装或真实 OpenCode 聊天端到端测试。GitHub Actions 只验证工程源码与打包，不表示业务项目的质量门禁已自动接入。
