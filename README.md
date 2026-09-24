# AOURA 启动器

> 由珉爱制作 · 我的世界（Minecraft: Java Edition）第三方启动器
> 视觉风格：沉浸光效 / 液态玻璃 / 灵动视效

AOURA 是一款开源的 Minecraft 启动器，基于 Electron 构建，专注提供流畅、稳定、美观的游玩体验：自动下载游戏版本与模组底层（Forge / Fabric / NeoForge）、内置资源中心与联机房间、支持正版（微软）与离线双账户模式。

---

## ✨ 功能特性

- **游戏下载**：完整版本列表（正式版 / 快照版 / 远古版），一键下载原版并可选安装模组底层；下载采用测速选源 + 多线程分段，失败自动换源重试，稳定不卡壳
- **模组底层**：Forge / Fabric / NeoForge 支持，无需运行官方安装器即可完成底层安装（自动解析安装描述、补齐依赖库、本地生成补丁主程序）
- **启动前自检**：自动补齐缺失依赖库与游戏资源，保证游戏正常进入不崩溃
- **游戏语言**：启动前自动写入语言配置，所有版本与底层完整支持简体中文
- **资源中心**：浏览并安装 Mod（模组）、光影、整合包，展示图标与模组底层支持情况，可按游戏版本与底层类型筛选
- **版本管理**：版本列表、加载器去重与防误删、导入存档 / 整合包
- **联机功能**：基于 Terracotta（陶瓦联机）的房间系统，支持创建 / 加入房间、复制服务器地址
- **账户系统**：微软正版登录（设备码流程）与离线账户（强制英文名、支持自定义头像），首次启动引导选择账户模式
- **主题系统**：预装 20 套配色主题，点击即换
- **日志系统**：独立日志面板，正常绿色 / 异常红色，一键导出日志便于问题反馈
- **灵动视效**：粒子漂浮、气泡光效、液态玻璃质感、沉浸光感背景

## 🖥️ 运行环境

| 平台 | 状态 |
| --- | --- |
| **Windows** | ✅ 已支持（当前版本） |
| macOS / HarmonyOS / Linux | 🔜 开发中，敬请期待 |

## 📦 快速开始（安装包）

前往项目 Release 页面下载最新版安装包（`AOURA启动器-Setup-<版本>.exe`），双击安装即可使用。

首次启动按引导选择账户模式；需要微软正版登录时，在「设置 - 正版账户」中填入 Azure 应用 Client ID（设备码登录，客户端不存储任何微软凭据）。

## 🔨 从源码构建

环境要求：Node.js 18+、npm；打包 Windows 安装包需在可运行 NSIS 的环境下进行。

```bash
# 安装依赖
npm install

# 本地运行（开发调试）
npm start

# 生成 dist/win-unpacked（绿色目录）
npm run dist

# 注入图标与版本信息（Windows）
node build/set-icon.js "dist/win-unpacked/AOURA启动器.exe" assets/icon.ico
node build/set-version.js "dist/win-unpacked/AOURA启动器.exe" <版本> "AOURA 启动器" "珉爱" "AOURA 启动器 · 由珉爱制作"

# 生成 NSIS 安装包（需要 NSIS 3.0.4.1 linux/makensis，或由 electron-builder 自动下载）
makensis build/installer.nsi
```

## 📁 目录结构

```
aoura-launcher-app/
├── main.js                 # 主进程：下载、安装、启动游戏、联机、账户、日志
├── preload.js              # 预加载脚本（安全桥接）
├── renderer/
│   ├── index.html          # 启动器界面
│   ├── style.css           # 样式（主题、气泡、粒子、液态玻璃）
│   ├── renderer.js         # 渲染进程逻辑
│   ├── website/            # 内置官网页面
│   └── assets/             # 界面图标资源
├── assets/                 # 应用图标（icon.ico / icon.png / icon.svg）
├── build/
│   ├── installer.nsi       # NSIS 安装脚本
│   ├── set-icon.js         # 图标注入脚本
│   └── set-version.js      # 版本信息注入脚本
├── bin/terracotta/         # 联机引擎（Terracotta 陶瓦联机）
└── package.json
```

## 🔗 开源依赖与致谢

- **Electron** — 应用框架（MIT）
- **Terracotta（陶瓦联机）** — 联机房间功能底层（开源项目）
- **BMCLAPI** — 游戏下载镜像源
- **adm-zip** — 压缩包解析
- **electron-builder / NSIS** — 安装包构建

## 📝 反馈与支持

- 问题反馈：[填写反馈表单](https://docs.qq.com/form/page/DUFRYU0dTanVIaURa)
- 获取更新：[更新公告](https://docs.qq.com/aio/DUENmdFVWVmZrWGF3)
- 作者爱发电：[珉爱制作](https://ifdian.net/a/minaiyu)

## 📄 开源许可

本项目基于 [MIT License](LICENSE) 开源。

---

**AOURA 启动器 · 由珉爱制作** — 把极光装进启动器，把世界握在手中。
