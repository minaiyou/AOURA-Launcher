import { router } from '@kit.ArkUI';
import { Theme } from '../common/Theme';

/**
 * 设置（鸿蒙版）：账户 / Java / 沙箱 / 主题（设置页与账户设置分离）
 */
@Entry
@Component
struct Settings {
  @State offlineName: string = '离线玩家';
  @State sandboxOn: boolean = false;
  @State themeIdx: number = 0;
  private readonly themes: string[] = ['极光蓝', '极光紫', '珊瑚粉', '薄荷绿', '熔岩橙'];

  build() {
    Column() {
      Row() {
        Text('‹')
          .fontSize(22)
          .fontColor(Theme.TXT_MAIN)
          .onClick(() => router.back())
        Text('设置')
          .fontSize(18)
          .fontColor(Theme.TXT_MAIN)
          .fontWeight(FontWeight.Bold)
          .margin({ left: 12 })
      }
      .width('100%')
      .padding({ left: 20, right: 20, top: 16, bottom: 12 })

      List({ space: 12 }) {
        // 账户
        ListItem() {
          this.card('账户', '离线账户名（强制英文）', '')
        }
        // Java
        ListItem() {
          this.card('Java 运行时', '鸿蒙沙箱容器化 Java 适配中', '')
        }
        // 沙箱
        ListItem() {
          Row() {
            Column({ space: 4 }) {
              Text('沙箱运行游戏')
                .fontSize(15)
                .fontColor(Theme.TXT_MAIN)
              Text('在隔离环境中运行游戏，保护宿主机')
                .fontSize(11)
                .fontColor(Theme.TXT_SUB)
            }
            .alignItems(HorizontalAlign.Start)
            .layoutWeight(1)
            Toggle({ type: ToggleType.Switch, isOn: this.sandboxOn })
              .selectedColor(Theme.GLOW_CYAN)
              .onChange((on: boolean) => this.sandboxOn = on)
          }
          .width('100%')
          .padding(16)
          .borderRadius(16)
          .backgroundColor('#161D33')
          .border({ width: 1, color: Theme.LINE })
        }
        // 主题
        ListItem() {
          Column({ space: 10 }) {
            Text('沉浸主题')
              .fontSize(15)
              .fontColor(Theme.TXT_MAIN)
            Row({ space: 8 }) {
              ForEach(this.themes, (t: string, idx: number) => {
                Text(t)
                  .fontSize(11)
                  .fontColor(idx === this.themeIdx ? '#0A0E1A' : Theme.TXT_SUB)
                  .padding({ left: 12, right: 12, top: 5, bottom: 5 })
                  .borderRadius(14)
                  .backgroundColor(idx === this.themeIdx ? Theme.GLOW_CYAN : '#1A2238')
                  .onClick(() => this.themeIdx = idx)
              }, (t: string) => t)
            }
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding(16)
          .borderRadius(16)
          .backgroundColor('#161D33')
          .border({ width: 1, color: Theme.LINE })
        }
      }
      .layoutWeight(1)
      .width('100%')
      .padding({ left: 16, right: 16 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Theme.BG_DEEP)
  }

  @Builder
  card(name: string, desc: string, val: string) {
    Row() {
      Column({ space: 4 }) {
        Text(name)
          .fontSize(15)
          .fontColor(Theme.TXT_MAIN)
        Text(desc)
          .fontSize(11)
          .fontColor(Theme.TXT_SUB)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      if (val.length > 0) {
        Text(val)
          .fontSize(12)
          .fontColor(Theme.GLOW_CYAN)
      }
    }
    .width('100%')
    .padding(16)
    .borderRadius(16)
    .backgroundColor('#161D33')
    .border({ width: 1, color: Theme.LINE })
  }
}
