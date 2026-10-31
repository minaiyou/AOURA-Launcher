import { router } from '@kit.ArkUI';
import { Theme } from '../common/Theme';

/**
 * 关于（鸿蒙版）：软件信息 / 作者 / 开源 / 系统支持
 */
@Entry
@Component
struct About {
  build() {
    Column() {
      Row() {
        Text('‹')
          .fontSize(22)
          .fontColor(Theme.TXT_MAIN)
          .onClick(() => router.back())
        Text('关于')
          .fontSize(18)
          .fontColor(Theme.TXT_MAIN)
          .fontWeight(FontWeight.Bold)
          .margin({ left: 12 })
      }
      .width('100%')
      .padding({ left: 20, right: 20, top: 16, bottom: 12 })

      Scroll() {
        Column({ space: 14 }) {
          // 品牌
          Column({ space: 6 }) {
            Text('AOURA')
              .fontSize(34)
              .fontColor(Theme.TXT_MAIN)
              .fontWeight(FontWeight.Bold)
            Text('启动器 v28.1 · 由珉爱制作')
              .fontSize(12)
              .fontColor(Theme.TXT_SUB)
          }
          .width('100%')
          .padding({ top: 24, bottom: 16 })

          this.card('版本号', 'v28.1（鸿蒙 PC 适配版）')
          this.card('运行平台', 'HarmonyOS NEXT（ArkTS / ArkUI 重构）')
          this.card('系统支持', 'Windows 当前支持 · 鸿蒙 PC 适配中 · macOS / Linux 开发中')
          this.card('开源项目', 'MIT License · github.com/minaiyou/AOURA-Launcher')
          this.card('引擎与开源', 'Electron 引擎（Windows 版）· 联机由 Terracotta 陶瓦联机（AGPL-3.0）提供')
          this.card('沙箱运行', '鸿蒙 PC 沙箱（容器化 Java 运行时）适配中，敬请期待')
          this.card('反馈', 'docs.qq.com/form/page/DUFRYU0dTanVIaURa')

          Text('AOURA 启动器 · 沉浸光效 Minecraft 启动器')
            .fontSize(11)
            .fontColor(Theme.TXT_FAINT)
            .padding({ top: 12, bottom: 24 })
        }
        .width('100%')
        .padding({ left: 16, right: 16 })
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Theme.BG_DEEP)
  }

  @Builder
  card(name: string, desc: string) {
    Row() {
      Text(name)
        .fontSize(14)
        .fontColor(Theme.TXT_MAIN)
        .fontWeight(FontWeight.Medium)
      Text(desc)
        .fontSize(11)
        .fontColor(Theme.TXT_SUB)
        .textAlign(TextAlign.End)
        .layoutWeight(1)
        .margin({ left: 12 })
    }
    .width('100%')
    .padding(16)
    .borderRadius(16)
    .backgroundColor('#161D33')
    .border({ width: 1, color: Theme.LINE })
  }
}
