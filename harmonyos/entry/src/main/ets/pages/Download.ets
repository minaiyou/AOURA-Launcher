import { router } from '@kit.ArkUI';
import { Theme } from '../common/Theme';
import { VersionRepo, VersionInfo } from '../model/VersionRepo';

/**
 * 下载中心（鸿蒙版）：版本清单展示 + 沙箱运行预留
 */
@Entry
@Component
struct Download {
  @State filter: string = '全部';
  private readonly filters: string[] = ['全部', 'release', 'snapshot'];

  build() {
    Column() {
      // 顶栏
      Row() {
        Text('‹')
          .fontSize(22)
          .fontColor(Theme.TXT_MAIN)
          .onClick(() => router.back())
        Text('下载中心')
          .fontSize(18)
          .fontColor(Theme.TXT_MAIN)
          .fontWeight(FontWeight.Bold)
          .margin({ left: 12 })
      }
      .width('100%')
      .padding({ left: 20, right: 20, top: 16, bottom: 12 })

      // 筛选
      Row({ space: 10 }) {
        ForEach(this.filters, (f: string) => {
          Text(f)
            .fontSize(12)
            .fontColor(f === this.filter ? '#0A0E1A' : Theme.TXT_SUB)
            .fontWeight(f === this.filter ? FontWeight.Bold : FontWeight.Normal)
            .padding({ left: 14, right: 14, top: 6, bottom: 6 })
            .borderRadius(16)
            .backgroundColor(f === this.filter ? Theme.GLOW_CYAN : '#1A2238')
            .onClick(() => this.filter = f)
        }, (f: string) => f)
      }
      .width('100%')
      .padding({ left: 20, bottom: 10 })

      // 版本列表
      List({ space: 10 }) {
        ForEach(this.visibleVersions(), (v: VersionInfo) => {
          ListItem() {
            Row() {
              Column({ space: 4 }) {
                Text(v.id)
                  .fontSize(15)
                  .fontColor(Theme.TXT_MAIN)
                  .fontWeight(FontWeight.Medium)
                Text(v.type === 'release' ? '正式版' : '快照/特色版')
                  .fontSize(10)
                  .fontColor(Theme.TXT_SUB)
              }
              .alignItems(HorizontalAlign.Start)
              .layoutWeight(1)

              Text('沙箱运行（适配中）')
                .fontSize(11)
                .fontColor(Theme.GLOW_PINK)
                .padding({ left: 12, right: 12, top: 6, bottom: 6 })
                .borderRadius(14)
                .border({ width: 1, color: Theme.GLOW_PINK })
            }
            .width('100%')
            .padding(16)
            .borderRadius(16)
            .backgroundColor('#161D33')
            .border({ width: 1, color: Theme.LINE })
          }
        }, (v: VersionInfo) => v.id)
      }
      .layoutWeight(1)
      .width('100%')
      .padding({ left: 16, right: 16 })

      Text('鸿蒙 PC 沙箱（容器化 Java 运行时）适配中；版本下载功能将在沙箱可用后开放')
        .fontSize(11)
        .fontColor(Theme.TXT_FAINT)
        .textAlign(TextAlign.Center)
        .padding({ left: 24, right: 24, top: 10, bottom: 18 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Theme.BG_DEEP)
  }

  private visibleVersions(): VersionInfo[] {
    if (this.filter === '全部') {
      return VersionRepo.all();
    }
    return VersionRepo.byType(this.filter);
  }
}
