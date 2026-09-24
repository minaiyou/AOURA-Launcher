# AOURA 启动器

> 把极光装进启动器，把世界握在手中。
>
> 由 **珉爱制作** 的开源 Minecraft: Java Edition 第三方启动器。
> 沉浸光效 · 液态玻璃 · 灵动视效，内置资源中心、模组底层安装与联机房间。

**官网**：<https://minaiyou.github.io/AOURA-Launcher/> ｜ **下载**：[Releases](https://github.com/minaiyou/AOURA-Launcher/releases/latest)

---

## ✨ 为什么选择 AOURA

AOURA 不只是一个下载器——从沉浸光效的视觉语言，到稳定流畅的下载引擎，再到开箱即用的联机房间，我们希望把每一次点击都变成新旅程的起点。

### 一眼入魂的视觉
以 HarmonyOS 沉浸光感为灵感，贯穿液态玻璃、灵动视效与灵感气泡的界面语言。**20 套预装配色主题**，点击即换；粒子漂浮、光晕呼吸、气泡微动效，让启动器本身就成为一场视觉体验。

### 稳定到不卡壳的下载
采用**测速选源机制**——下载前自动探测镜像与官方源的真实响应，挑选最快的源作为主源；多线程分段并行，单段失败立即换源重试。下载游戏、安装模组底层（Forge / Fabric / NeoForge）、补齐依赖库，全程不卡进度、不静默丢文件。

### 开机即玩的省心设计
**启动前自动自检**：缺失的依赖库与游戏资源自动补齐，资源齐全才拉起游戏；游戏语言自动写入，所有版本与底层完整支持简体中文，无需任何额外配置。

### 一站式内容生态
资源中心浏览并安装模组、光影与整合包，展示图标与底层支持情况，可按版本与底层筛选；版本管理支持导入存档与整合包；内置 **Terracotta（陶瓦联机）** 房间系统，创建房间、邀请好友、复制服务器地址，即刻开黑。

### 开放与透明
全流程开源（MIT 许可），无任何内置广告与数据采集；日志系统独立展示，正常绿色、异常红色，一键导出，问题反馈直达作者。

---

## 🛠️ 技术亮点

- **免安装器装底层**：解析官方安装描述、自动补齐依赖库、本地生成补丁主程序，无需运行官方安装器即可完成 Forge / NeoForge 安装
- **PCL 级下载体验**：测速选源 + 多线程分段 + 失败换源 + 启动前资源自检补齐
- **双账户体系**：微软正版设备码登录（本地不落任何凭据）与离线账户（英文名规范 + 自定义头像），首次启动引导选择
- **联机引擎**：基于开源项目 [Terracotta](https://github.com/Pcklb/Terracotta)（陶瓦联机）的房间系统，与 HMCL / FMCL 跨端互通
- **资源中心**：Modrinth 集成，按游戏版本与底层筛选，模组名称一键翻译

---

## 🖥️ 运行环境

| 平台 | 状态 |
| --- | --- |
| **Windows** | ✅ 已支持（当前版本） |
| macOS / 鸿蒙 OS / Linux | 🔜 开发中，敬请期待 |

## 📦 快速开始

前往 [Releases 页面](https://github.com/minaiyou/AOURA-Launcher/releases/latest) 下载最新版安装包（`AOURA-Setup-<版本>.exe.zip`），解压后双击安装即可。

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

# 生成 NSIS 安装包
makensis build/installer.nsi
```

## 📁 目录结构

```
aoura-launcher/
├── main.js                 # 主进程：下载、安装、启动游戏、联机、账户、日志
├── preload.js              # 预加载脚本（安全桥接）
├── renderer/
│   ├── index.html          # 启动器界面
│   ├── style.css           # 样式（主题、气泡、粒子、液态玻璃）
│   ├── renderer.js         # 渲染进程逻辑
│   ├── website/            # 内置官网页面
│   └── assets/            # 界面图标资源
├── assets/                 # 应用图标（icon.ico / icon.png / icon.svg）
├── build/
│   ├── installer.nsi       # NSIS 安装脚本
│   ├── set-icon.js         # 图标注入脚本
│   └── set-version.js      # 版本信息注入脚本
├── bin/terracotta/         # 联机引擎（Terracotta 陶瓦联机）
└── package.json
```

---

## 🔗 开源信息

| 项目 | 说明 |
| --- | --- |
| 开源许可 | [MIT License](LICENSE) |
| 应用框架 | [Electron](https://www.electronjs.org/) |
| 联机底层 | [Terracotta（陶瓦联机）](https://github.com/Pcklb/Terracotta) |
| 镜像源 | [BMCLAPI](https://bmclapidoc.bangbang93.com/)（下载加速） |
| 资源解析 | [adm-zip](https://github.com/cthackers/adm-zip) |
| 安装打包 | electron-builder / NSIS |

## 💬 反馈与支持

- 问题反馈：[填写反馈表单](https://docs.qq.com/form/page/DUFRYU0dTanVIaURa)
- 获取更新：[更新公告](https://docs.qq.com/aio/DUENmdFVWVmZrWGF3)
- 作者爱发电：[珉爱制作](https://ifdian.net/a/minaiyu)

---

**AOURA 启动器 · 由珉爱制作** — 每一次启动，都是一场光的旅行。
