# MiMo Dots

> 独立桌面工作台，调用你本机安装的 Xiaomi MiMo Desktop 执行 AI 任务。

English: [README.md](README.md)

## 项目来源

**MiMo Dots 是基于开源仓库 [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot) 二次开发、面向 MiMo Desktop 的独立版本。**它单独维护，不是上游项目或 Xiaomi 官方发行版；MiMo Desktop 接入和独立工作台是为本项目适配的，未包含 DSH 运行时。

本项目与 Xiaomi 无隶属或背书关系，不包含 Xiaomi MiMo 专有源码或素材。

## 功能

- 创建多个不同职责的 Bot，并按工作组组织。
- 为 Bot 和群聊成员创建、绑定独立的 MiMo Desktop 会话。
- 在本机保存任务记录、群聊记忆和会话绑定。
- 使用内置日式插画头像，或选择本地图片。
- 显示本机 MiMo Desktop 界面提供的账号名称与登录状态。账号状态运行时读取、仅保存在内存中；账号名和 MiMo 凭据不会打包进应用。MiMo Desktop 当前未提供可读取的剩余额度。

## 环境要求

- Windows x64
- Node.js 22.12 或更新版本
- 已安装并登录 Xiaomi MiMo Desktop

## 从源码运行

```powershell
npm ci
npm start
```

构建 Windows 便携版：

```powershell
npm run dist
```

应用运行时通过本机 MiMo Desktop API 描述文件连接你自己的 MiMo 安装，不内置共享 API Key 或模型供应商凭据。不要公开上传本机应用数据目录、生产截图或个人验收日志。

## 许可与致谢

本衍生项目按 Apache License 2.0 发布。许可条款和上游归属见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。
