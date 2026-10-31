/**
 * AOURA 鸿蒙版 · 沉浸光感主题
 * 与 Windows 版 28 主题体系保持一致：灵感气泡 / 液态玻璃 / 沉浸光感 / 灵动视效
 */
export class Theme {
  // 深空底色（液态玻璃深色基底）
  static readonly BG_DEEP: string = '#0A0E1A';
  static readonly BG_GLASS: string = '#141A2E';
  // 鸿蒙 7 风格极光光带
  static readonly GRAD_MAIN: string = 'linear-gradient(135deg, #4DE3FF 0%, #7B8CFF 45%, #FF7BA9 100%)';
  // 光效辉光色
  static readonly GLOW_CYAN: string = '#4DE3FF';
  static readonly GLOW_PINK: string = '#FF7BA9';
  static readonly GLOW_VIOLET: string = '#7B8CFF';
  // 文字层级
  static readonly TXT_MAIN: string = '#EAF1FF';
  static readonly TXT_SUB: string = '#9AA7BD';
  static readonly TXT_FAINT: string = '#5C6B85';
  // 边框
  static readonly LINE: string = 'rgba(120, 150, 210, 0.22)';
}

/**
 * 顶部光带装饰组件：流动极光光带（沉浸光感核心视觉）
 */
@Component
export struct AuroraTopGlow {
  @Prop glowColor: string = Theme.GLOW_CYAN;

  build() {
    Column()
      .width('100%')
      .height(220)
      .linearGradient({
        angle: 135,
        colors: [
          [Theme.GLOW_CYAN, 0.0],
          [Theme.GLOW_VIOLET, 0.5],
          [Theme.GLOW_PINK, 1.0]
        ]
      })
      .opacity(0.28)
      .blur(60)
      .position({ x: 0, y: -90 })
  }
}

/**
 * 灵动气泡按钮（主页启动键 / 快捷入口共用）
 */
@Component
export struct BubbleButton {
  label: string = '';
  sub: string = '';
  @Prop icon: string = '▶';
  @Prop glow: string = Theme.GLOW_CYAN;
  onTap: () => void = () => {};

  build() {
    Column({ space: 4 }) {
      Text(this.icon)
        .fontSize(26)
        .fontColor(Theme.TXT_MAIN)
        .fontWeight(FontWeight.Bold)
      Text(this.label)
        .fontSize(15)
        .fontColor(Theme.TXT_MAIN)
        .fontWeight(FontWeight.Medium)
      if (this.sub.length > 0) {
        Text(this.sub)
          .fontSize(10)
          .fontColor(Theme.TXT_SUB)
      }
    }
    .width(132)
    .height(132)
    .borderRadius(66)
    .backgroundColor('#1C2440')
    .border({ width: 1, color: this.glow })
    .shadow({
      radius: 26,
      color: this.glow,
      offsetX: 0,
      offsetY: 0
    })
    .onClick(() => this.onTap())
  }
}
