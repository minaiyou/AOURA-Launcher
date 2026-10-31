# AOURA 鸿蒙端 · Rust 核心引擎接入（拥抱世界 28.0α）

> 大版本：**拥抱世界 28.0α** — 开发语言全面切换为 Rust（核心引擎跨平台复用）

## 架构

```
┌─────────────────────────── 鸿蒙端（ArkTS / ArkUI）───────────────────────────┐
│  UI 层：主页 / 下载 / 资源 / 设置 / 关于（沉浸光感设计语言）                   │
│  账户 / 版本选择 / 主题切换 / 沙箱开关                                        │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │ NAPI（C ABI 桥，aoura-core 编译为 .so 后经 ohos napi 注册）
┌───────────────▼───────────────────────────────────────────────────────────────┐
│  Rust 核心引擎（aoura-rs/crates/aoura-core）— 同一份代码两端复用               │
│  · manifest 版本清单（BMCLAPI / Mojang 双源回退）                              │
│  · download 多线程下载（并发分片 / 断点续传 / 失败换源）                        │
│  · java Java 检测（jdk-21 / jdk-17 / JAVA_HOME / PATH）                        │
│  · launch 启动参数组装（与 Windows 版 28 引擎同语义）                           │
│  · config 配置读写（安装目录 config.json）                                     │
│  · sandbox 沙箱策略（Windows .wsb / 鸿蒙容器化 Java 预留）                     │
└────────────────────────────────────────────────────────────────────────────────┘
```

## 接入步骤

1. **编译核心为动态库**（在工程机，例如 x86_64 Windows / 或鸿蒙 SDK 的 llvm 工具链）：

   ```bash
   cd aoura-rs
   # 本地验证（Linux/Windows 均可）
   cargo build -p aoura-core
   # 产出 cdylib：target/debug/libaoura_core.so（或 .dll / .dylib）
   ```

   鸿蒙侧将 `libaoura_core.so` 放入 `entry/libs/arm64-v8a/`（或对应 CPU 架构目录），
   并在 `entry/oh-package.json5` 声明 native 依赖。

2. **NAPI 注册**：`aoura-core` 已以 `crate-type = ["rlib", "cdylib"]` 编译，
   提供 `#[no_mangle] extern "C"` 导出（见 `src/napi_bridge.rs` 生成说明）；
   鸿蒙侧新建 `entry/src/main/cpp/napi_init.cpp`，用 `napi_define_properties` 将
   `aoura_engine_info` / `aoura_manifest` / `aoura_download` 注册为 JS 函数。

3. **ArkTS 调用示例**（`entry/src/main/ets/common/Engine.ets`）：

   ```typescript
   import native from 'libaoura_core.so';

   export class AouraEngine {
     static engineInfo(): string {
       return native.aoura_engine_info();   // 返回 JSON 字符串
     }
     static fetchManifest(): string {
       return native.aoura_manifest();      // 返回版本清单 JSON
     }
     static download(urls: string[], dest: string): number {
       return native.aoura_download(JSON.stringify({ urls, dest }));
     }
   }
   ```

4. **页面接入**：
   - `pages/Download.ets`：用 `AouraEngine.fetchManifest()` 渲染真实版本清单（替换内置示例）
   - `pages/Home.ets`：Java 检测显示 `AouraEngine.javaDetect()`
   - `pages/Settings.ets`：线程数写入 `config.json`（Rust 侧 config 模块）

## 与 Windows 端的关系

- 两端共用 `aoura-rs/crates/aoura-core` **同一份 Rust 代码**；
- Windows 端用原生 GUI（egui，`aoura-win` crate）直接链接 rlib；
- 鸿蒙端用 ArkTS UI + NAPI 调用同一核心；
- 版本号统一 **28.0α（拥抱世界）**。

## 构建环境

- Rust stable（1.99+），`rustup target add x86_64-pc-windows-gnu`（Windows 交叉编译需 mingw-w64）
- 鸿蒙侧需 DevEco Studio 5.0+（NDK 工具链，用于编译 NAPI 桥）
