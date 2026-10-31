/**
 * 版本与底层数据模型（鸿蒙版：版本清单展示 + 鸿蒙专属沙箱运行）
 * 创新特性：当鸿蒙 PC 系统无法直接运行 Minecraft Java 版（JVM 依赖
 * glibc 与桌面运行库）时，AOURA 自动创建容器沙箱，在隔离环境中拉起
 * 游戏，实现"鸿蒙 PC 也能玩 Java 版"。Windows 端原生直跑，无需沙箱。
 */
export class VersionInfo {
  id: string;
  type: string; // release / snapshot / old_beta / old_alpha
  releaseTime: string;

  constructor(id: string, type: string, releaseTime: string) {
    this.id = id;
    this.type = type;
    this.releaseTime = releaseTime;
  }
}

export class VersionRepo {
  static readonly VERSIONS: VersionInfo[] = [
    new VersionInfo('1.21.4', 'release', '2024-12-03'),
    new VersionInfo('1.21.1', 'release', '2024-08-08'),
    new VersionInfo('1.20.6', 'release', '2024-04-29'),
    new VersionInfo('1.20.4', 'release', '2023-12-07'),
    new VersionInfo('1.19.4', 'release', '2023-03-14'),
    new VersionInfo('1.18.2', 'release', '2022-02-28'),
    new VersionInfo('1.16.5', 'release', '2021-01-15'),
    new VersionInfo('1.12.2', 'release', '2017-09-18'),
    new VersionInfo('1.8.9', 'release', '2015-12-09'),
    new VersionInfo('24w14potato', 'snapshot', '2024-04-01')
  ];

  static byType(type: string): VersionInfo[] {
    return VersionRepo.VERSIONS.filter((v: VersionInfo): boolean => v.type === type);
  }

  static all(): VersionInfo[] {
    return VersionRepo.VERSIONS;
  }
}

/**
 * 鸿蒙专属沙箱桥（创新特性）
 * 流程：启动游戏前先探测 Java 是否可直跑（兼容性检测）。
 *  - 可直跑：直接本地运行，无需沙箱；
 *  - 不可直跑（默认场景）：自动创建容器沙箱，在隔离的 Java 运行时内
 *    拉起游戏，用户无感进入游戏。
 * 真实实现将调用系统容器 API（容器化 Java 运行时）完成拉起。
 */
export class SandboxBridge {
  static readonly AVAILABLE: boolean = false; // 当前鸿蒙 PC 容器能力待系统版本开放

  /** 返回沙箱状态文案（鸿蒙端展示用） */
  static checkSupport(): string {
    if (SandboxBridge.AVAILABLE) {
      return '鸿蒙沙箱：自动创建容器沙箱，游戏在隔离环境中运行';
    }
    return '鸿蒙专属沙箱（容器化 Java 运行时）适配中：系统无法直跑时将自动启用沙箱运行游戏';
  }
}
