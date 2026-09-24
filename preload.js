/* AOURA 启动器 · 预加载桥接 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aoura', {
  /* 配置与检测 */
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  detectMinecraft: () => ipcRenderer.invoke('minecraft:detect'),
  detectJava: () => ipcRenderer.invoke('java:detect'),
  listVersions: () => ipcRenderer.invoke('versions:list'),
  /* 启动 */
  launch: (versionId) => ipcRenderer.invoke('launch:start', versionId),
  stopLaunch: () => ipcRenderer.invoke('launch:stop'),
  /* 版本下载 */
  getManifest: () => ipcRenderer.invoke('download:manifest'),
  downloadVersion: (versionId) => ipcRenderer.invoke('download:versionStart', versionId),
  downloadVersionWithLoader: (versionId, loaderType) => ipcRenderer.invoke('download:versionWithLoader', versionId, loaderType),
  cancelDownload: () => ipcRenderer.invoke('download:cancel'),
  loaderSourceOk: () => ipcRenderer.invoke('loader:sourceOk'),
  translateText: (text) => ipcRenderer.invoke('translate:text', text),
  appInfo: () => ipcRenderer.invoke('app:info'),
  exportLogs: () => ipcRenderer.invoke('logs:export'),
  openWebsite: () => ipcRenderer.invoke('website:open'),
  // 联机引擎（Terracotta | 陶瓦联机）
  tcStart: () => ipcRenderer.invoke('terracotta:start'),
  tcStop: () => ipcRenderer.invoke('terracotta:stop'),
  tcState: () => ipcRenderer.invoke('terracotta:state'),
  tcScan: (player) => ipcRenderer.invoke('terracotta:scan', player),
  tcGuest: (room, player) => ipcRenderer.invoke('terracotta:guest', room, player),
  tcIde: () => ipcRenderer.invoke('terracotta:ide'),
  tcMeta: () => ipcRenderer.invoke('terracotta:meta'),
  /* 微软正版账户 */
  msDeviceCode: () => ipcRenderer.invoke('ms:deviceCode'),
  msPoll: (d) => ipcRenderer.invoke('ms:poll', d),
  msComplete: (d) => ipcRenderer.invoke('ms:complete', d),
  msLogout: () => ipcRenderer.invoke('ms:logout'),
  msStatus: () => ipcRenderer.invoke('ms:status'),
  msSetClientId: (id) => ipcRenderer.invoke('ms:setClientId', id),
  /* Modrinth */
  searchModrinth: (q, type, version, loader) => ipcRenderer.invoke('modrinth:search', q, type, version, loader),
  modrinthProject: (id) => ipcRenderer.invoke('modrinth:project', id),
  downloadModrinth: (id, type) => ipcRenderer.invoke('modrinth:download', id, type),
  downloadModrinthVersion: (id, versionId, type) => ipcRenderer.invoke('modrinth:downloadVersion', id, versionId, type),
  /* 加载器安装 */
  fabricVersions: (mc) => ipcRenderer.invoke('loader:fabricVersions', mc),
  forgePromos: () => ipcRenderer.invoke('loader:forgePromos'),
  forgeVersions: (mc) => ipcRenderer.invoke('loader:forgeVersions', mc),
  neoforgeVersions: (mc) => ipcRenderer.invoke('loader:neoforgeVersions', mc),
  installLoader: (opts) => ipcRenderer.invoke('loader:install', opts),
  /* Java 自动下载 */
  javaAvailable: () => ipcRenderer.invoke('java:available'),
  installJava: (major) => ipcRenderer.invoke('java:install', major),
  /* 模组管理 */
  listMods: (versionId) => ipcRenderer.invoke('mods:list', versionId || ''),
  setModEnabled: (name, enabled, versionId) => ipcRenderer.invoke('mods:setEnabled', name, enabled, versionId || ''),
  deleteMod: (name, versionId) => ipcRenderer.invoke('mods:delete', name, versionId || ''),
  /* 版本操作 */
  deleteVersion: (id) => ipcRenderer.invoke('versions:delete', id),
  duplicateVersion: (id, newId) => ipcRenderer.invoke('versions:duplicate', id, newId),
  /* 头像 */
  fabricLoaderVersions: (mc) => ipcRenderer.invoke('loader:fabricVersions', mc),
  useDefaultAvatar: () => ipcRenderer.invoke('avatar:default'),
  uploadAvatar: () => ipcRenderer.invoke('avatar:upload'),
  removeAvatar: () => ipcRenderer.invoke('avatar:remove'),
  getAvatarPath: () => ipcRenderer.invoke('avatar:path'),
  /* 版本资源管理：模组 / 存档 / 光影 / 整合包 */
  mgrList: (kind, versionId) => ipcRenderer.invoke('mgr:list', { kind, versionId }),
  mgrToggle: (kind, name) => ipcRenderer.invoke('mgr:toggle', { kind, name }),
  mgrDelete: (kind, name, versionId) => ipcRenderer.invoke('mgr:delete', { kind, name, versionId }),
  mgrOpen: (kind, versionId) => ipcRenderer.invoke('mgr:open', { kind, versionId }),
  mgrImport: () => ipcRenderer.invoke('mgr:import'),
  mgrImportSaves: (versionId) => ipcRenderer.invoke('mgr:importSaves', versionId || ''),
  /* 系统 */
  pickDir: () => ipcRenderer.invoke('dialog:pickDir'),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  winMin: () => ipcRenderer.invoke('window:min'),
  winMax: () => ipcRenderer.invoke('window:max'),
  winClose: () => ipcRenderer.invoke('window:close'),
  /* 事件 */
  onLaunchLog: (cb) => ipcRenderer.on('launch:log', (e, d) => cb(d)),
  onLaunchStatus: (cb) => ipcRenderer.on('launch:status', (e, d) => cb(d)),
  onDownloadProgress: (cb) => ipcRenderer.on('download:progress', (e, d) => cb(d)),
  onInstallerProgress: (cb) => ipcRenderer.on('installer:progress', (e, d) => cb(d)),
  onJavaProgress: (cb) => ipcRenderer.on('java:progress', (e, d) => cb(d)),
  onWindowMaximized: (cb) => ipcRenderer.on('window:maximized', (e, d) => cb(d))
});
