import { router } from '@kit.ArkUI';
import { Theme } from '../common/Theme';

/**
 * 资源中心（鸿蒙版）：模组 / 光影 / 存档 管理入口（展示层）
 */
@Entry
@Component
struct Resource {
  @State activeTab: number = 0;

  build() {
    Column() {
      Row() {
        Text('‹')
          .fontSize(22)
          .fontColor(Theme.TXT_MAIN)
          .onClick(() => router.back())
        Text('资源中心')
          .fontSize(18)
          .fontColor(Theme.TXT_MAIN)
          .fontWeight(FontWeight.Bold)
          .margin({ left: 12 })
      }
      .width('100%')
      .padding({ left: 20, right: 20, top: 16, bottom: 12 })

      Row({ space: 8 }) {
        ForEach(['模组', '光影', '存档', '整合包'], (t: string, idx: number) => {
          Text(t)
            .fontSize(12)
            .fontColor(idx === this.activeTab ? '#0A0E1A' : Theme.TXT_SUB)
            .fontWeight(idx === this.activeTab ? FontWeight.Bold : FontWeight.Normal)
            .padding({ left: 16, right: 16, top: 6, bottom: 6 })
            .borderRadius(16)
            .backgroundColor(idx === this.activeTab ? Theme.GLOW_CYAN : '#1A2238')
            .onClick(() => this.activeTab = idx)
        }, (t: string) => t)
      }
      .width('100%')
      .padding({ left: 20, bottom: 12 })

      Column({ space: 12 }) {
        Text(['模组浏览（Modrinth 源）', '光影包', '存档管理', '整合包'][this.activeTab])
          .fontSize(15)
          .fontColor(Theme.TXT_MAIN)
          .fontWeight(FontWeight.Medium)
        Text('鸿蒙 PC 沙箱适配中：资源将安装在隔离环境对应目录')
          .fontSize(11)
          .fontColor(Theme.TXT_FAINT)
      }
      .width('100%')
      .layoutWeight(1)
      .justifyContent(FlexAlign.Center)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Theme.BG_DEEP)
  }
}
