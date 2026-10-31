import { router } from '@kit.ArkUI';
import { Theme, AuroraTopGlow, BubbleButton } from '../common/Theme';
import { VersionRepo, SandboxBridge } from '../model/VersionRepo';

/**
 * 主页：启动气泡居中，游戏环境气泡围绕，底部悬浮 Dock 栏
 * 布局与 Windows 版 14.0「灵感气泡」一致
 */
@Entry
@Component
struct Index {
  @State currentVersion: string = '1.21.4';
  @State currentLoader: string = '原版';
  @State accountName: string = '离线玩家';
  @State sandboxTip: string = SandboxBridge.checkSupport();
  @State envBubbles: number[] = [0, 1, 2, 3];

  private toPage(page: string): void {
    router.pushUrl({ url: 'pages/' + page }).catch((err: Error) => {
      console.error('router fail: ' + JSON.stringify(err));
    });
  }

  build() {
    Stack({ alignContent: Alignment.Top }) {
      // 深空背景
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(Theme.BG_DEEP)

      // 极光光带
      AuroraTopGlow()

      // 中央启动气泡 + 环境气泡
      Column() {
        // 启动键（灵感气泡 · 随时变化）
        BubbleButton({
          label: '启动游戏',
          sub: this.currentVersion + ' · ' + this.currentLoader,
          icon: '▶',
          glow: Theme.GLOW_CYAN,
          onTap: () => {
            this.toPage('Settings');
          }
        })

        // 游戏环境气泡（围绕启动键）
        Row({ space: 14 }) {
          ForEach(this.envBubbles, (i: number) => {
            Column({ space: 4 }) {
              Text(['Java', '版本', '账户', '沙箱'][i])
                .fontSize(12)
                .fontColor(Theme.TXT_MAIN)
              Text(['已就绪', '1.21.4', this.accountName, '适配中'][i])
                .fontSize(9)
                .fontColor(Theme.TXT_SUB)
            }
            .width(104)
            .height(104)
            .borderRadius(52)
            .backgroundColor('#182038')
            .border({ width: 1, color: Theme.LINE })
            .shadow({ radius: 18, color: Theme.GLOW_VIOLET, offsetX: 0, offsetY: 0 })
          }, (i: number) => i.toString())
        }
        .margin({ top: 30 })

        Text(this.sandboxTip)
          .fontSize(11)
          .fontColor(Theme.TXT_SUB)
          .margin({ top: 18 })

        Text('AOURA v28.1 · 由珉爱制作')
          .fontSize(11)
          .fontColor(Theme.TXT_FAINT)
          .margin({ top: 8 })
      }
      .width('100%')
      .layoutWeight(1)
      .justifyContent(FlexAlign.Center)

      // 底部悬浮 Dock 栏
      Row({ space: 8 }) {
        this.dockItem('主页', '⌂', 'Index')
        this.dockItem('下载', '↓', 'Download')
        this.dockItem('资源', '▣', 'Resource')
        this.dockItem('设置', '⚙', 'Settings')
        this.dockItem('关于', 'ⓘ', 'About')
      }
      .width('92%')
      .height(62)
      .borderRadius(31)
      .backgroundColor('#1A2238')
      .border({ width: 1, color: Theme.LINE })
      .shadow({ radius: 24, color: '#0A0E1A', offsetX: 0, offsetY: 6 })
      .position({ x: '4%', y: 'calc(100% - 86vp)' })
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  dockItem(label: string, icon: string, page: string) {
    Column({ space: 2 }) {
      Text(icon)
        .fontSize(18)
        .fontColor(Theme.TXT_MAIN)
      Text(label)
        .fontSize(10)
        .fontColor(Theme.TXT_SUB)
    }
    .layoutWeight(1)
    .height(54)
    .justifyContent(FlexAlign.Center)
    .borderRadius(27)
    .onClick(() => {
      if (page === 'Index') return;
      this.toPage(page);
    })
  }
}
