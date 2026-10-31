# AOURA 启动器 · 鸿蒙 PC 适配版（28.1）

> 由珉爱制作 · 开源项目（MIT）· 源码：https://github.com/minaiyou/AOURA-Launcher

本工程为 AOURA 启动器的 **HarmonyOS NEXT（鸿蒙 PC）适配版**，采用 **ArkTS / ArkUI** 重写界面层，
保留与 Windows 版一致的「灵感气泡 · 液态玻璃 · 沉浸光感 · 灵动视效」设计语言。
下载与启动引擎逻辑与 Windows 版跨平台复用（Windows 版为本机引擎实现，鸿蒙版沙箱化后接入）。

## 系统要求

- HarmonyOS NEXT（API 12+，兼容 SDK 5.0.0(12)）
- 设备形态：2in1 / 平板 / 手机（鸿蒙 PC 体验最佳）
- 构建工具：DevEco Studio 5.0+（HarmonyOS NEXT 版本）

## 工程结构

```
harmonyos/
├── AppScope/                     # 应用级配置（bundleName: com.minaiyou.aoura）
├── entry/
│   └── src/main/
│       ├── ets/
│       │   ├── entryability/     # 入口 Ability
│       │   ├── pages/            # Index 主页 / Download 下载 / Resource 资源 / Settings 设置 / About 关于
│       │   ├── common/           # Theme 沉浸光感主题、气泡组件
│       │   └── model/            # 版本清单 / 沙箱桥（SandboxBridge）
│       └── resources/            # 字符串 / 颜色 / 图标 / 页面路由
├── build-profile.json5           # 工程构建配置
├── hvigorfile.ts                 # hvigor 任务入口
└── oh-package.json5              # 依赖声明
```

## 页面清单

| 页面 | 说明 |
|---|---|
| Index（主页） | 启动气泡居中，游戏环境气泡围绕，底部悬浮 Dock 栏 |
| Download（下载中心） | 版本清单（正式 / 快照 / 特色），沙箱运行入口预留 |
| Resource（资源中心） | 模组 / 光影 / 存档 / 整合包入口（展示层） |
| Settings（设置） | 账户（离线名强制英文）/ Java / 沙箱开关 / 沉浸主题 |
| About（关于） | 版本 / 运行平台 / 系统支持 / 开源 / 作者 / 反馈 |

## 沙箱运行（游戏）

鸿蒙 PC 上运行 Minecraft Java 版需要 **容器化 Java 运行时沙箱**（与 Windows 版 Windows Sandbox .wsb 策略对应）。
当前 `SandboxBridge.AVAILABLE = false`，表示鸿蒙 PC 系统容器能力尚未开放；
待系统 API 就绪后，只需将 `SandboxBridge` 中 `checkSupport()` 接入系统容器拉起接口，
游戏即会在隔离环境中运行，无需修改任何页面代码。

## 构建方式（DevEco Studio）

1. 使用 DevEco Studio 5.0+ 打开本 `harmonyos/` 目录；
2. 等待 hvigor 同步完成（首次会下载 SDK 依赖）；
3. 连接鸿蒙设备 / 模拟器，点击 Run 或 Build > Build Hap(s)/App(s)；
4. 签名：正式发布需在 AppGallery Connect 申请证书；本地调试可用自动签名。

## 与本机版（Windows）的关系

- 设计语言、版本号、功能布局保持同步（当前均 v28.1）；
- Windows 版已内置「沙箱运行游戏」入口（Windows Sandbox .wsb 一键配置）；
- 鸿蒙版界面层已就绪，沙箱容器与下载引擎接入完成后即可全量开放。

## 反馈

问题反馈：https://docs.qq.com/form/page/DUFRYU0dTanVIaURa
获取更新：https://docs.qq.com/aio/DUENmdFVWVmZrWGF3
官网：https://minaiyou.github.io/AOURA-Launcher/
