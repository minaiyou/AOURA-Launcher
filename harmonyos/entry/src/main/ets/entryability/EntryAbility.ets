import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(0x0000, 'AOURA', 'Ability onCreate');
  }

  onDestroy(): void {
    hilog.info(0x0000, 'AOURA', 'Ability onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(0x0000, 'AOURA', 'loadContent failed: %{public}s', JSON.stringify(err));
        return;
      }
      hilog.info(0x0000, 'AOURA', 'loadContent succeeded');
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(0x0000, 'AOURA', 'WindowStage destroyed');
  }

  onForeground(): void {
    hilog.info(0x0000, 'AOURA', 'onForeground');
  }

  onBackground(): void {
    hilog.info(0x0000, 'AOURA', 'onBackground');
  }
}
