# macOS 预发布版

MiMo Dots 基于 Fei2411/DeepSeek-Bot 二次开发，使用 Apache-2.0 许可证。保留 LICENSE 与 NOTICE；不附带 Xiaomi MiMo 的源码、账号、认证凭据或运行时。

## 安装

1. 下载 arm64 DMG，打开后将 MiMo Dots 拖到“应用程序”。先退出旧版再安装。
2. 安装并打开官方 Xiaomi MiMo Desktop，完成登录。应用发现位置为 `/Applications/Xiaomi MiMo.app` 或 `~/Applications/Xiaomi MiMo.app`。
3. 本预发布版只有本地 ad-hoc 签名，没有 Apple Developer ID 签名和公证。macOS 可能拦截首次打开；确认下载来源后，在“系统设置 → 隐私与安全性”使用“仍要打开”，按系统要求确认。不要关闭 Gatekeeper、SIP 或删除隔离属性。
4. 在 MiMo Dots 的“连接与角色”点击“辅助功能权限”。在“系统设置 → 隐私与安全性 → 辅助功能”（新系统可能显示“设备控制和数据访问”）中允许 **应用程序目录中的 MiMo Dots**，然后退出并重开应用。
5. ad-hoc 签名更新后，系统可能保留旧版本的权限身份。若开关已开仍提示无权限，从列表移除 MiMo Dots，再点“+”添加 `/Applications/MiMo Dots.app` 并重新打开。不要授权不明来源的同名应用。

## 使用与限制

- 默认 PM、Coder、QA；保留白色界面、日式头像与品牌。
- 私聊、不同群聊以及每位群成员分别创建新会话。默认数据没有历史绑定。现有绑定和自定义角色不被替换。
- 创建前保存 MiMo 草稿，等可见任务结束并回到聊天页；创建期间不要操作 MiMo。工作台在无项目的新任务页提交一次无害初始化，并通过本机接口核对唯一标识、实际模型和结束状态。
- 焦点、草稿、控件或模型变化时停止。中断或失败后使用“核对已有会话”；恢复只读核对，不再次创建或发送。不确定的任务不会自动重发。
- 账号名称只从 MiMo 可见界面读取并保留于内存；确认“已登录”需要刷新账号菜单。剩余用量尚不支持读取，界面会明确显示。
- 本机已核对的接口描述文件位置为 `~/Library/Application Support/Xiaomi MiMo/desktop-api.json`，只在运行时读取。HTTP 连接固定到 127.0.0.1，拒绝重定向，每次重读凭据；不连接模型 API、CLI 或 DSH。
- 本次只发布 Apple Silicon arm64。Intel x64 未构建、未实机验证。系统兼容下限配置为 macOS 12，但只在验证报告列出的系统上实测，不代表每个旧系统都通过。
- 自动创建依赖 MiMo UI 的中文控件及模型 ID 标签。其他界面语言、未来控件布局或模型显示名变化会停止自动创建并提示；仍可手动在 MiMo 创建专用会话后绑定，不能视为自动创建通过。

## 源码构建

需要 Node.js 22.12+ 和 Xcode Command Line Tools（`xcode-select --install`）。

```sh
npm ci
npm test
npm start
npm run dist:mac
node scripts/prepare-release.mjs
```

macOS 原生桥由 Swift 编译，不需要 .NET。构建在系统临时目录完成，再把 DMG 复制到 `release/dots-<version>`，避免 iCloud 文稿目录给 .app 添加不兼容的 Finder 元数据。`MIMO_TARGET_ARCH=x64 npm run dist:mac` 只提供显式交叉构建入口，不代表 Intel 适配已验证；当前不要对外宣称支持 Intel。

Windows 保留原 C# UI Automation、APPDATA/LOCALAPPDATA 及 NSIS 路径。`npm run dist:win` 可生成 Windows 包。稳定发布工作流只允许 main 上的纯数字正式版本；本次 macOS 分支和预发布版本不能写入 Windows 稳定 Release。

正式使用的工作台数据位于 `~/Library/Application Support/MiMoBotWorkbench`，Chromium 窗口配置沿用 `MiMo Bot 工作台`。测试使用独立目录，不包含在安装包中。
