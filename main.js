/* AOURA 启动器 · 主进程（启动器引擎） 由珉爱制作 */
'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const https = require('https');
const AdmZip = require('adm-zip');

/* 28：URL 安全编码 —— Electron net.fetch 对含非 ASCII 字符的 URL 抛 ByteString 异常直接崩溃主进程
（报错：Cannot convert argument to a ByteString ... 65533 ...），统一在请求前把路径中的非 ASCII 字符
编码为百分号形式；已编码片段保持不变，避免双重编码 */
function safeUrl(u){
  if (!u || /^[\x20-\x7E]*$/.test(u)) return u;
  try {
    const p = new URL(u);
    const segs = [];
    for (const seg of p.pathname.split('/')){
      let s = seg;
      try { s = encodeURIComponent(decodeURIComponent(seg)); }
      catch(e){ try { s = encodeURIComponent(seg); } catch(e2){} }
      segs.push(s);
    }
    p.pathname = segs.join('/');
    return p.toString();
  } catch(e){ return u; }
}

/* 统一网络请求：优先 Electron net（Chromium 网络栈，自动识别系统/环境代理），失败回退全局 fetch */
async function httpFetch(url, opts){
  opts = opts || {};
  url = safeUrl(url);
  try {
    if (net && typeof net.fetch === 'function') return await net.fetch(url, opts);
  } catch(e){}
  return fetch(url, opts);
}

/* ================= 配置 ================= */
let cfg = {
  gameDir: '',
  javaPath: '',
  memory: 4096,
  offlineName: 'Player',
  mirror: 'bmclapi',
  dlThreads: 16,   // 19.0：下载最大线程数（1-256，可调；>64 时提醒注意 CPU 占用）
  dlRateLimit: 0,  // 19.0：下载速度限制（KB/s，0 = 不限速）
  currentVersion: '',
  lightEffect: true,
  dynamicWallpaper: true,
  panelBlur: true,
  isolation: true, // 20.4：版本隔离默认开启——每个版本的存档/模组/光影/资源包独立存放
  lang: 'zh_cn',
  closeAfterLaunch: false,
  jvmArgs: '',
  gameArgs: '',
  launchCount: 0
};
function configPath(){ return path.join(dataRoot(), 'config.json'); }
function migrateLegacyData(){
  // 4.0.2 及更早版本把数据放在 %APPDATA%/aoura-launcher，启动器切换到安装目录后做一次迁移
  if (process.env.AOURA_DATA_DIR) return;
  const legacy = app.getPath('userData');
  const cur = dataRoot();
  try {
    if (fs.existsSync(path.join(legacy, 'config.json')) && !fs.existsSync(configPath())){
      fs.mkdirSync(cur, { recursive: true });
      fs.copyFileSync(path.join(legacy, 'config.json'), configPath());
    }
    if (fs.existsSync(path.join(legacy, 'avatar.png')) && !fs.existsSync(avatarPath())){
      fs.mkdirSync(cur, { recursive: true });
      fs.copyFileSync(path.join(legacy, 'avatar.png'), avatarPath());
    }
  } catch(e){ console.error('数据迁移失败', e); }
}
function loadConfig(){
  migrateLegacyData();
  try { cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(configPath(), 'utf8'))); } catch(e){}
  if (!cfg.gameDir) cfg.gameDir = defaultGameDir();
}
function saveConfig(){
  try {
    fs.mkdirSync(dataRoot(), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  } catch(e){ console.error('保存配置失败', e); }
}
function avatarPath(){ return path.join(dataRoot(), 'avatar.png'); }

/* ================= 路径 ================= */
function defaultGameDir(){
  // 默认位于启动器安装目录下的 .minecraft（可在设置中自定义）
  return path.join(dataRoot(), '.minecraft');
}
function gameDir(){ return cfg.gameDir || defaultGameDir(); }
function versionsDir(){ return path.join(gameDir(), 'versions'); }
function librariesDir(){ return path.join(gameDir(), 'libraries'); }
function assetsDir(){ return path.join(gameDir(), 'assets'); }
function cacheDir(){
  const d = path.join(dataRoot(), 'cache');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/* ================= 小工具 ================= */
function offlineUUID(name){
  const h = crypto.createHash('md5').update('OfflinePlayer:' + name).digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.toString('hex');
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}
function mirrorUrl(url){
  if (!url) return url;
  if (cfg.mirror === 'fastmc'){
    // 20.1：FastMinecraftMirror（国内开源镜像，子域名同构；新版库仓库 libraries.minecraft.net 无镜像时自动回退官方）
    return url
      .replace('https://launcher.mojang.com/', 'https://launcher.fastmcmirror.org/')
      .replace('https://resources.download.minecraft.net/', 'https://resources.fastmcmirror.org/')
      .replace('https://maven.minecraftforge.net/', 'https://forge.fastmcmirror.org/')
      .replace('https://files.minecraftforge.net/maven/', 'https://forge.fastmcmirror.org/')
      .replace('https://maven.fabricmc.net/', 'https://fabric.fastmcmirror.org/')
      .replace('https://maven.quiltmc.org/repository/release/', 'https://quilt.fastmcmirror.org/repository/release/');
  }
  if (cfg.mirror !== 'bmclapi') return url;
  return url
    .replace('https://libraries.minecraft.net/', 'https://bmclapi2.bangbang93.com/libraries/')
    // launcher.mojang.com 已下线（301→piston-data），不镜像（避免等路径替换产生无效 URL），官方直连兜底
    .replace('https://resources.download.minecraft.net/', 'https://bmclapi2.bangbang93.com/assets/')
    .replace('https://maven.fabricmc.net/', 'https://bmclapi2.bangbang93.com/maven/')
    .replace('https://maven.minecraftforge.net/', 'https://bmclapi2.bangbang93.com/maven/')
    .replace('https://maven.neoforged.net/releases/', 'https://bmclapi2.bangbang93.com/maven/');
}
function send(channel, payload){ if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }

/* ================= 版本资源管理辅助 ================= */
// 模组/存档/光影目录：版本隔离开启时在版本目录下，否则在游戏目录下；整合包管理指向 versions
function mgrBase(kind, versionId){
  if (kind === 'packs') return versionsDir();
  const iso = cfg.isolation && versionId ? path.join(versionsDir(), versionId) : gameDir();
  if (kind === 'mods') return path.join(iso, 'mods');
  if (kind === 'saves') return path.join(iso, 'saves');
  if (kind === 'shaderpacks') return path.join(iso, 'shaderpacks');
  return iso;
}
// 读取 level.dat 中的 LevelName（前 4 字节为未压缩长度，其后为压缩 NBT）
function saveDisplayName(p){
  try {
    const zlib = require('zlib');
    const b = fs.readFileSync(path.join(p, 'level.dat'));
    let data;
    try { data = zlib.inflateSync(b.slice(8)); } catch (e) { data = zlib.gunzipSync(b.slice(8)); }
    const idx = data.indexOf(Buffer.from('LevelName'));
    if (idx >= 0){
      const slen = data.readUInt16BE(idx + 11);
      if (idx + 11 + slen <= data.length) return data.toString('utf8', idx + 11, idx + 11 + slen);
    }
  } catch (e) {}
  return null;
}
async function extractZip(src, target){
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(src);
  for (const entry of zip.getEntries()){
    if (entry.isDirectory) continue;
    const out = path.join(target, entry.entryName);
    if (!out.startsWith(target + path.sep)) continue; // 防 zip slip
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, entry.getData());
  }
}

function copyTree(src, dest){
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })){
    const sp = path.join(src, e.name), dp = path.join(dest, e.name);
    if (e.isDirectory()) copyTree(sp, dp);
    else if (e.isFile()){ fs.mkdirSync(path.dirname(dp), { recursive: true }); fs.copyFileSync(sp, dp); }
  }
}

/* ================= 数据根目录（默认=启动器安装目录） ================= */
function dataRootBase(){
  // 环境变量优先（测试/便携场景），否则使用启动器所在目录
  if (process.env.AOURA_DATA_DIR) return process.env.AOURA_DATA_DIR;
  // 便携版：electron-builder portable 运行时会设置 PORTABLE_EXECUTABLE_DIR 指向便携 exe 所在目录，
  // 数据（.minecraft / java / 缓存 / 日志）跟随 exe，绿色免安装
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  return path.dirname(app.getPath('exe'));
}
function dataRoot(){ return (cfg && cfg.dataDir) || dataRootBase(); }
function logFilePath(){
  const d = path.join(dataRoot(), 'logs');
  fs.mkdirSync(d, { recursive: true });
  return path.join(d, 'launcher.log');
}
let logSizeGuard = 0;
function logLine(level, text){
  send('launch:log', { level: level || 'info', text });
  try {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ts = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    const line = '[' + ts + '] [' + (level || 'info') + '] ' + text + '\n';
    const lp = logFilePath();
    if (logSizeGuard++ % 64 === 0 && fs.existsSync(lp) && fs.statSync(lp).size > 5 * 1048576){
      fs.writeFileSync(lp, '==== AOURA 日志轮转 ' + new Date().toLocaleString() + ' ====\n');
    }
    fs.appendFileSync(lp, line);
  } catch(e){}
}

/* ================= 微软正版账户（设备码流，微软官方 OAuth 流程） ================= */
function msClientId(){ return (cfg.msClientId || '').trim(); }

async function msDeviceCode(){
  const cid = msClientId();
  if (!cid) throw new Error('请先在“设置 - 正版账户”中填写微软应用 Client ID');
  const res = await httpFetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'client_id=' + encodeURIComponent(cid) + '&scope=' + encodeURIComponent('XboxLive.signin offline_access')
  });
  const j = await res.json();
  if (j.error || !j.device_code) throw new Error(j.error_description || '获取设备码失败');
  return {
    deviceCode: j.device_code,
    userCode: j.user_code,
    verificationUri: j.verification_uri,
    expiresIn: j.expires_in,
    interval: Math.max(j.interval || 5, 5)
  };
}

async function msPollToken(deviceCode, interval){
  const cid = msClientId();
  const res = await httpFetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:device_code')
      + '&client_id=' + encodeURIComponent(cid)
      + '&device_code=' + encodeURIComponent(deviceCode)
  });
  const j = await res.json();
  if (j.error){
    if (j.error === 'authorization_pending') return { pending: true, interval: interval || 5 };
    if (j.error === 'slow_down') return { pending: true, interval: (interval || 5) + 5 };
    if (j.error === 'authorization_declined') throw new Error('你在浏览器中拒绝了登录请求');
    if (j.error === 'expired_token') throw new Error('设备码已过期，请重新发起登录');
    throw new Error(j.error_description || j.error);
  }
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresIn: j.expires_in };
}

async function msXbl(accessToken){
  const res = await httpFetch('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 'd=' + accessToken },
      RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT'
    })
  });
  const j = await res.json();
  if (!j.Token) throw new Error('Xbox Live 认证失败：' + (j.message || res.status));
  return j.Token;
}

async function msXsts(xblToken){
  const res = await httpFetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT'
    })
  });
  const j = await res.json();
  if (!j.Token){
    const err = j.XErr;
    if (err === 2148916233) throw new Error('该微软账户没有 Xbox Live 档案，请先在 Xbox 官网注册');
    if (err === 2148916238) throw new Error('该账户未满 18 岁，需要家长同意后才能登录');
    throw new Error('XSTS 授权失败：' + (j.message || res.status));
  }
  const uhs = j.DisplayClaims && j.DisplayClaims.xui && j.DisplayClaims.xui[0] && j.DisplayClaims.xui[0].uhs;
  return { token: j.Token, uhs: uhs || '' };
}

async function msMinecraft(xstsToken, uhs){
  const res = await httpFetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ identityToken: 'XBL3.0 x=' + uhs + ';' + xstsToken })
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('Minecraft 服务认证失败：' + (j.errorMessage || res.status));
  return { token: j.access_token, expiresIn: j.expires_in || 86400 };
}

async function msProfile(mcToken){
  const res = await httpFetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { 'Authorization': 'Bearer ' + mcToken }
  });
  if (res.status === 404) throw new Error('该账户没有 Minecraft Java 版档案，可能未购买游戏');
  const j = await res.json();
  if (!j.id || !j.name) throw new Error('获取 Minecraft 档案失败：' + (j.errorMessage || res.status));
  return { uuid: j.id, name: j.name };
}

async function msOwnership(mcToken){
  try {
    const res = await httpFetch('https://api.minecraftservices.com/entitlements/mcstore', {
      headers: { 'Authorization': 'Bearer ' + mcToken }
    });
    const j = await res.json();
    const items = (j.items || []).map(i => i.name);
    return items.includes('game_minecraft') || items.includes('product_minecraft');
  } catch(e){ return true; } // 查询失败不阻断登录，仅影响提示
}

async function msCompleteLogin(accessToken, refreshToken){
  const xbl = await msXbl(accessToken);
  const xsts = await msXsts(xbl);
  const mc = await msMinecraft(xsts.token, xsts.uhs);
  const prof = await msProfile(mc.token);
  const owns = await msOwnership(mc.token);
  cfg.msAuth = {
    refreshToken: refreshToken,
    mcToken: mc.token,
    mcUuid: prof.uuid,
    mcName: prof.name,
    mcExpiresAt: Date.now() + (mc.expiresIn - 60) * 1000,
    owns: !!owns
  };
  cfg.authType = 'msa';
  cfg.offlineName = prof.name;
  saveConfig();
  return { name: prof.name, uuid: prof.uuid, owns: !!owns };
}

async function ensureMsAuth(){
  const a = cfg.msAuth;
  if (!a || !a.mcToken) throw new Error('未登录微软正版账户，请先登录');
  if (a.mcExpiresAt && Date.now() < a.mcExpiresAt) return a;
  if (!a.refreshToken || !msClientId()) throw new Error('正版登录已过期，请重新登录');
  const res = await httpFetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&client_id=' + encodeURIComponent(msClientId())
      + '&refresh_token=' + encodeURIComponent(a.refreshToken)
      + '&scope=' + encodeURIComponent('XboxLive.signin offline_access')
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('刷新正版登录失败，请重新登录');
  const xbl = await msXbl(j.access_token);
  const xsts = await msXsts(xbl);
  const mc = await msMinecraft(xsts.token, xsts.uhs);
  a.mcToken = mc.token;
  a.mcExpiresAt = Date.now() + (mc.expiresIn - 60) * 1000;
  a.refreshToken = j.refresh_token || a.refreshToken;
  saveConfig();
  return a;
}

function msLogout(){
  cfg.authType = 'offline';
  cfg.msAuth = null;
  saveConfig();
}

function currentAuth(){
  if (cfg.authType === 'msa'){
    const a = cfg.msAuth;
    if (a && a.mcToken && a.mcUuid && a.mcName) return { type: 'msa', name: a.mcName, uuid: a.mcUuid, token: a.mcToken };
  }
  const name = cfg.offlineName || 'Player';
  return { type: 'legacy', name: name, uuid: offlineUUID(name), token: '0' };
}

/* ================= 下载 ================= */
const cancelTokens = new Set();
function makeToken(){ return Symbol('dl'); }
function cancelToken(t){ if (t) cancelTokens.add(t); }
function isCancelled(t){ return !!(t && cancelTokens.has(t)); }

/* 18.4：资源下载/补齐互斥锁 —— 防止下载任务与启动前补齐并发写同一批资源文件触发 Windows EPERM */
let assetPhaseBusy = false;
function sleepMs(ms){ return new Promise(r => setTimeout(r, ms)); }
async function withAssetPhaseLock(fn){
  while (assetPhaseBusy) await sleepMs(200);
  assetPhaseBusy = true;
  try { return await fn(); } finally { assetPhaseBusy = false; }
}
/* 写盘重试：Windows 下目标文件被短暂占用（EPERM/EACCES）时，延迟重试打开 */
async function openWriteRetry(dest, tries){
  for (let i = 0; i < (tries || 5); i++){
    try { return fs.openSync(dest, 'w'); }
    catch(e){
      if (i === (tries || 5) - 1) throw e;
      await sleepMs(150 * (i + 1));
    }
  }
}

function downloadFile(url, dest, token, onProgress){
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (net && typeof net.fetch === 'function'){
    return downloadViaNetFetch(url, dest, token, onProgress);
  }
  return downloadViaHttps(url, dest, token, onProgress);
}
async function downloadViaNetFetch(url, dest, token, onProgress){
  if (isCancelled(token)) throw new Error('CANCELLED');
  url = safeUrl(url);
  // 防卡壳：总时限 10 分钟 + 无数据 30s 自动中断（镜像多源容错思路，JDK 包约 200MB 需要更宽裕的总时限）
  const ctrl = new AbortController();
  let lastAct = Date.now();
  const killTimer = setTimeout(() => ctrl.abort(new Error('下载超时: ' + url.slice(0, 70))), 600000);
  const idleTimer = setInterval(() => {
    if (Date.now() - lastAct > 30000) ctrl.abort(new Error('下载无响应: ' + url.slice(0, 70)));
  }, 5000);
  try {
    const res = await net.fetch(url, {
      headers: { 'User-Agent': 'AOURA-Launcher/4.0' },
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    const total = parseInt(res.headers.get('content-length') || '0', 10) || 0;
    let received = 0;
    const fd = await openWriteRetry(dest);
    const ws = fs.createWriteStream(dest, { fd, autoClose: true });
    const reader = res.body.getReader();
    for (;;){
      if (isCancelled(token)){ reader.cancel().catch(()=>{}); ws.destroy(); try { fs.unlinkSync(dest); } catch(e){} throw new Error('CANCELLED'); }
      const { done, value } = await reader.read();
      if (done) break;
      if (value){
        received += value.length;
        lastAct = Date.now();
        ws.write(Buffer.from(value));
        if (onProgress) onProgress({ received, total });
      }
    }
    await new Promise((r, j) => ws.end(err => err ? j(err) : r()));
    return { received, total };
  } finally {
    clearTimeout(killTimer);
    clearInterval(idleTimer);
  }
}
function downloadViaHttps(url, dest, token, onProgress){
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let redirects = 0;
    const attempt = (u) => {
      if (isCancelled(token)) return reject(new Error('CANCELLED'));
      u = safeUrl(u);
      const req = https.get(u, { headers: { 'User-Agent': 'AOURA-Launcher/4.0' } }, res => {
        if ([301,302,303,307,308].includes(res.statusCode)){
          if (++redirects > 6) return reject(new Error('重定向过多: ' + u));
          res.resume();
          return attempt(res.headers.location);
        }
        if (res.statusCode !== 200){
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode + ' ' + u));
        }
        const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
        let received = 0;
        // 18.4：写盘 EPERM 重试（同步短暂等待）
        let fd = null;
        for (let wi = 0; wi < 5; wi++){
          try { fd = fs.openSync(dest, 'w'); break; }
          catch(werr){
            if (wi === 4) throw werr;
            const tw = Date.now(); while (Date.now() - tw < 150 * (wi + 1)){ /* 同步等待 */ }
          }
        }
        const ws = fs.createWriteStream(dest, { fd, autoClose: true });
        res.on('data', chunk => {
          received += chunk.length;
          if (onProgress) onProgress({ received, total });
        });
        res.pipe(ws);
        ws.on('finish', () => { ws.close(); resolve({ received, total }); });
        ws.on('error', e => { res.destroy(); reject(e); });
      });
      req.on('error', reject);
      // 30s 无数据自动中断（数据到达时重置）
      req.setTimeout(30000, () => { req.destroy(new Error('下载超时: ' + u)); });
      res.on('data', () => req.setTimeout(30000));
    };
    attempt(url);
  });
}
async function multiSourceDownload(urls, dest, onProg, retries){
  // 多源轮询：按顺序逐个源尝试（各带 retries 次重试），全部失败才抛错 —— 参考主流启动器的镜像回退做法
  let lastErr = null;
  for (const u of urls){
    try {
      await downloadWithRetry(u, dest, null, onProg, retries || 3);
      return;
    } catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('所有下载源均失败');
}

/* 18.0：测速选源 —— HEAD 探测各源响应耗时，选最快者作为主源（PCL 同款思路，避免慢源拖累） */
async function pickFastSource(urls, timeoutMs){
  const cands = (urls || []).filter(Boolean);
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  // 19.1：改用真实下载测速（GET Range 拉取 768KB），HEAD 只反映可达性、不反映吞吐，易选错慢源
  const results = await Promise.allSettled(cands.map(async u => {
    const t0 = Date.now();
    try {
      const res = await httpFetch(u, { method: 'GET', headers: { 'User-Agent': 'AOURA-Launcher/4.0', Range: 'bytes=0-786431' }, signal: AbortSignal.timeout(timeoutMs || 8000) });
      if (!res || (!res.ok && res.status !== 206)) return { u, ok: false, ms: Date.now() - t0, len: 0 };
      const reader = res.body.getReader();
      let got = 0;
      for (;;){
        const { done, value } = await reader.read();
        if (done) break;
        if (value) got += value.length;
        if (got >= 786432){ await reader.cancel().catch(()=>{}); break; }
      }
      return { u, ok: got > 0, ms: Date.now() - t0, len: got };
    } catch(e){ return { u, ok: false, ms: Date.now() - t0, len: 0 }; }
  }));
  const good = results.filter(r => r.status === 'fulfilled' && r.value.ok).map(r => r.value);
  if (!good.length) return cands[0];
  good.sort((a, b) => a.ms - b.ms);
  return good[0].u;
}

async function fastHeadSize(url){
  // HEAD 探测：返回 { size, range }；Range 支持且文件够大才值得分段
  try {
    const res = await httpFetch(url, { method: 'HEAD', headers: { 'User-Agent': 'AOURA-Launcher/4.0' } });
    if (!res || !res.ok) return null;
    const len = parseInt(res.headers.get('content-length') || '0', 10) || 0;
    const rangeOk = (res.headers.get('accept-ranges') || '').toLowerCase().includes('bytes');
    return { size: len, range: rangeOk };
  } catch(e){ return null; }
}
// 19.1：全局限速桶（所有分段共享一个速率预算，避免每段各自限速导致总速被放大）
let rateBucket = { bytes: 0, at: 0 };
async function fastRangeFetch(url, dest, start, end, token, onProg){
  const ctrl = new AbortController();
  const tmr = setTimeout(() => ctrl.abort(), 15000); // 单段 15s 超时，防止慢源挂死整条下载
  url = safeUrl(url);
  try {
    const res = await net.fetch(url, {
      headers: { 'User-Agent': 'AOURA-Launcher/4.0', Range: 'bytes=' + start + '-' + end },
      signal: ctrl.signal
    });
  if (!res.ok && res.status !== 206) throw new Error('HTTP ' + res.status + ' ' + url);
  const fdSeg = await openWriteRetry(dest);
  const ws = fs.createWriteStream(dest, { fd: fdSeg, autoClose: true });
  const reader = res.body.getReader();
  for (;;){
    if (isCancelled(token)){ reader.cancel().catch(()=>{}); ws.destroy(); try { fs.unlinkSync(dest); } catch(e){} throw new Error('CANCELLED'); }
    const { done, value } = await reader.read();
    if (done) break;
    if (value){
      const chunk = Buffer.from(value);
      ws.write(chunk);
      if (onProg) onProg(chunk.length);
      // 19.1：下载速度限制（KB/s，0=不限）——全局共享速率桶，语义为整机总限速
      if (cfg.dlRateLimit > 0){
        rateBucket.bytes += chunk.length;
        if (rateBucket.bytes >= 262144){ // 每 ~256KB 校准一次
          const el = Date.now() - rateBucket.at;
          const want = Math.ceil(rateBucket.bytes / (cfg.dlRateLimit * 1024) * 1000);
          if (want > el) await sleepMs(want - el);
          rateBucket.at = Date.now(); rateBucket.bytes = 0;
        }
      }
    }
  }
  await new Promise((r, j) => ws.end(e => e ? j(e) : r()));
  } finally { clearTimeout(tmr); }
}
/* 下载加速：大文件分段并发（Range），任一段多源失败即整体回退整文件下载 */
async function fastDownloadMulti(attempts, dest, token, onProgress){
  if (isCancelled(token)) throw new Error('CANCELLED');
  // 28：只探测首选源（镜像）一次即可，失败走整文件双源兜底——避免小文件批量下载时
  // 对每个文件逐源 HEAD 探测（3598 个资源可省约一半探测请求），显著提升资源补齐/库下载速度
  let probe = null;
  try { probe = await fastHeadSize(attempts[0]); } catch(e){}
  if (!probe || !probe.range || probe.size < 1024 * 1024) return false;
  // 19.0：线程数由用户在设置中调节（1-256，默认 16）；文件过小时自动回落单线程整文件下载
  // 19.1：线程数由用户调节（1-256）；每段至少 1MB，避免文件较小时分段碎片化（请求开销反超收益）
  const SEG0 = Math.max(1, Math.min(256, cfg.dlThreads || 16));
  const SEG = Math.max(1, Math.min(SEG0, Math.ceil(probe.size / (1024 * 1024))));
  const segSize = Math.ceil(probe.size / SEG);
  const tmp = dest + '.fast';
  fs.mkdirSync(tmp, { recursive: true });
  let segDone = 0;
  let progDone = 0; // 已完整落盘分段的字节累计（保证进度按真实字节平滑推进）
  let maxReported = 0; // 18.6：进度单调保护——换源重试/并发交错时 received 可能回落，一律只增不减，杜绝进度条倒退抽搐
  const report = received => {
    const r = Math.min(probe.size, Math.max(maxReported, received));
    maxReported = r;
    if (onProgress) onProgress({ received: r, total: probe.size });
  };
  const one = async (i) => {
    const start = i * segSize;
    const end = Math.min(probe.size - 1, start + segSize - 1);
    const destSeg = path.join(tmp, 'p' + i);
    // 单主源分段：先试最快的源，失败再换下一源，避免双源并发相互拖慢/触发限流
    let lastErr = null;
    for (let t = 0; t <= 3; t++){
      for (const u of attempts){
        try {
          let segMax = 0;
          await fastRangeFetch(u, destSeg, start, end, token, inc => {
            segMax += inc;
            report(progDone + segMax);
          });
          segDone++;
          progDone += (end - start + 1);
          report(progDone);
          return;
        } catch(e){
          if (e.message === 'CANCELLED') throw e;
          lastErr = e;
          await new Promise(r => setTimeout(r, 150 * (t + 1)));
        }
      }
    }
    throw lastErr || new Error('分段下载失败');
  };
  try {
    // 18.6：先并行一轮；个别段瞬时失败（网络抖动）不再直接判整体失败，
    // 单独补齐重试最多两轮，仍失败才回退整文件下载，显著降低“下载直接失败”概率
    let results = await Promise.allSettled(Array.from({ length: SEG }, (_, i) => i).map(one));
    let rejIdx = results.map((r, i) => r.status === 'rejected' ? i : -1).filter(i => i >= 0);
    for (let pass = 0; pass < 2 && rejIdx.length; pass++){
      const retry = await Promise.allSettled(rejIdx.map(one));
      const still = [];
      retry.forEach((r, k) => { if (r.status === 'rejected') still.push(rejIdx[k]); });
      rejIdx = still;
    }
    if (rejIdx.length){
      const first = results[rejIdx[0]];
      throw (first && first.reason) || new Error('分段下载未完成');
    }
    // 合并（18.4：写盘与读段均带 EPERM 重试）
    const fdOut = await openWriteRetry(dest);
    const ws = fs.createWriteStream(dest, { fd: fdOut, autoClose: true });
    for (let i = 0; i < SEG; i++){
      let buf = null;
      for (let t = 0; t < 5; t++){
        try { buf = fs.readFileSync(path.join(tmp, 'p' + i)); break; }
        catch(e){ if (t === 4) throw e; await sleepMs(100 * (t + 1)); }
      }
      ws.write(buf);
    }
    await new Promise((r, j) => ws.end(e => e ? j(e) : r()));
    // 大小校验：不符视为下载不完整，回退整文件
    const st = fs.statSync(dest);
    if (st.size !== probe.size) throw new Error('分段合并后大小不符 ' + st.size + ' != ' + probe.size);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch(e){}
    return { received: probe.size, total: probe.size };
  } catch(e){
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch(e2){}
    throw e;
  }
}
async function downloadWithRetry(origUrl, dest, token, onProgress, retries, extraMirror){
  const mirrored = mirrorUrl(origUrl);
  const mirrorUsable = mirrored !== origUrl && Date.now() >= mirrorDisabledUntil;
  let attempts = mirrorUsable ? [mirrored, origUrl] : [origUrl];
  if (extraMirror && !attempts.includes(extraMirror)) attempts.unshift(extraMirror);
  // 加速：先尝试分段并发，不适合/失败则回退整文件多源
  try {
    const fast = await fastDownloadMulti(attempts, dest, token, onProgress);
    if (fast) return fast;
  } catch(e){
    if (e.message === 'CANCELLED') throw e;
    try { fs.rmSync(dest + '.fast', { recursive: true, force: true }); } catch(e2){}
    try { fs.unlinkSync(dest); } catch(e2){}
  }
  let lastErr = null;
  for (const u of attempts){
    for (let i = 0; i <= Math.min(retries || 2, 2); i++){
      try {
        const r = await downloadFile(u, dest, token, onProgress);
        if (u === mirrored) mirrorFailStreak = 0;
        return r;
      }
      catch(e){
        if (e.message === 'CANCELLED') throw e;
        lastErr = e;
        if (u === mirrored){
          mirrorFailStreak++;
          if (mirrorFailStreak >= 3){ mirrorDisabledUntil = Date.now() + 30000; mirrorFailStreak = 0; }
        }
        await new Promise(r => setTimeout(r, 400 * (i + 1)));
      }
    }
  }
  throw lastErr || new Error('下载失败');
}

/* 多源依次尝试下载：优先国内镜像，全部失败才报错 */
async function downloadTryUrls(urls, dest, token, onProgress){
  let lastErr = null;
  for (let i = 0; i < urls.length; i++){
    try {
      return await downloadWithRetry(urls[i], dest, token, onProgress, 2);
    }
    catch(e){
      if (e.message === 'CANCELLED') throw e;
      lastErr = e;
      logLine('warn', '下载源 ' + (i + 1) + '/' + urls.length + ' 失败：' + (e.message || '网络错误') + (urls.length > 1 ? '，尝试下一源…' : ''));
    }
  }
  throw lastErr || new Error('下载失败');
}
let mirrorFailStreak = 0;
let mirrorDisabledUntil = 0;

/* ================= Java 检测 ================= */
function scanJavaDirs(){
  const dirs = [];
  const roots = [];
  if (process.env.JAVA_HOME) roots.push(process.env.JAVA_HOME);
  try {
    const own = path.join(dataRoot(), 'java');
    if (fs.statSync(own).isDirectory()){
      roots.push(own);
      fs.readdirSync(own, { withFileTypes: true }).forEach(d => {
        if (d.isDirectory()) dirs.push(path.join(own, d.name));
      });
    }
  } catch(e){}
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pfx = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const jdkCandidates = [
    path.join(pf, 'Java'), path.join(pfx, 'Java'),
    path.join(pf, 'Eclipse Adoptium'), path.join(pfx, 'Eclipse Adoptium'),
    path.join(pf, 'Microsoft'), path.join(pf, 'Android', 'Android Studio', 'jbr'),
    path.join(pf, 'Zulu'), path.join(pf, 'Amazon Corretto'),
    path.join(pf, 'Common Files', 'Oracle', 'Java', 'javapath'),
    'C:\\Program Files\\BellSoft'
  ];
  jdkCandidates.forEach(p => {
    try {
      if (fs.statSync(p).isDirectory()){
        roots.push(p);
        fs.readdirSync(p, { withFileTypes: true }).forEach(d => {
          if (d.isDirectory()) dirs.push(path.join(p, d.name));
        });
      }
    } catch(e){}
  });
  if (process.platform !== 'win32'){
    ['/usr/lib/jvm', '/opt/java', '/usr/java', '/Library/Java/JavaVirtualMachines', '/opt/homebrew/opt'].forEach(r => {
      try {
        if (!fs.statSync(r).isDirectory()) return;
        roots.push(r);
        fs.readdirSync(r, { withFileTypes: true }).forEach(d => {
          if (d.isDirectory()) dirs.push(path.join(r, d.name));
        });
      } catch(e){}
    });
  }
  roots.forEach(r => { if (fs.existsSync(r)) dirs.push(r); });
  const out = [];
  dirs.forEach(d => {
    const exe = path.join(d, 'bin', javaExeName());
    if (fs.existsSync(exe)) out.push(d);
  });
  return Array.from(new Set(out));
}
function javaMajorFromVersionText(txt){
  const m = txt.match(/(?:version\s+")([0-9._]+)/);
  if (!m) return null;
  const v = m[1];
  if (v.startsWith('1.')) return parseInt(v.split('.')[1], 10);
  return parseInt(v.split('.')[0], 10);
}
function javaExeName(){ return process.platform === 'win32' ? 'java.exe' : 'java'; }
function detectJavaVersion(dir){
  const exe = path.join(dir, 'bin', javaExeName());
  return new Promise(resolve => {
    execFile(exe, ['-version'], { timeout: 8000 }, (err, so, se) => {
      const txt = (se || so || '').toString();
      resolve({ dir, major: javaMajorFromVersionText(txt), detail: (txt.split('\n')[0] || '').trim() });
    });
  });
}
async function detectJavaList(){
  const results = [];
  const dirs = scanJavaDirs();
  for (const d of dirs.slice(0, 12)){
    const r = await detectJavaVersion(d);
    if (r.major) results.push(r);
  }
  // where java
  if (process.platform === 'win32'){
    try {
      const { stdout } = require('child_process').execSync('where java 2>nul', { encoding: 'utf8' });
      stdout.split(/\r?\n/).filter(Boolean).forEach(p => {
        p = p.trim();
        const dir = path.dirname(path.dirname(p));
        if (dir && !results.find(x => x.dir === dir) && fs.existsSync(path.join(dir,'bin','java.exe'))){
          results.push({ dir, major: null, detail: p });
        }
      });
    } catch(e){}
  }
  results.sort((a,b) => (b.major||0)-(a.major||0));
  return results;
}
function resolveJavaExe(versionId){
  // 28：新版 Minecraft（1.21+/26.x）需要 Java 21+——优先使用已安装的 jdk-21，缺失时回退现有 Java 17
  if (versionId && needsJava21(versionId)){
    const j21 = path.join(dataRoot(), 'java', 'jdk-21', process.platform === 'win32' ? 'bin/java.exe' : 'bin/java');
    if (fs.existsSync(j21)) return j21;
  }
  if (cfg.javaPath){
    const p = cfg.javaPath;
    if (fs.existsSync(p)){
      if (fs.statSync(p).isDirectory()){
        return process.platform === 'win32' ? path.join(p, 'bin', 'java.exe') : path.join(p, 'bin', 'java');
      }
      return p;
    }
  }
  return 'java';
}
function needsJava21(versionId){
  if (!versionId) return false;
  const first = versionId.split('-')[0];
  const n = parseInt(first, 10);
  if (!isNaN(n)) return n >= 21; // 26.x 等新命名
  if (first.startsWith('1.')){
    const parts = first.split('.');
    if (parts.length >= 2 && parts[0] === '1') return parseInt(parts[1], 10) >= 21; // 1.21+
  }
  return false;
}
function detectJavaMajor(exe){
  try {
    const r = require('child_process').spawnSync(exe, ['-version'], { timeout: 8000, encoding: 'utf8' });
    const m = String(r.stderr || r.stdout || '').match(/"(\d+)(?:\.|")/);
    if (m) return parseInt(m[1], 10);
  } catch(e){}
  return 0;
}

/* ================= 版本扫描 ================= */
/* 检测版本是否为试玩（demo）版本：仅当 --demo 是无条件参数（字符串或无条件对象）时才算。
   arguments.game 中带 rules 的 --demo（features.is_demo_user）属官方正常结构，不是试玩版 */
function metaIsDemo(meta){
  if (!meta) return false;
  const g = meta.arguments && meta.arguments.game;
  if (Array.isArray(g)){
    for (const a of g){
      if (typeof a === 'string'){ if (a.includes('--demo')) return true; continue; }
      if (a && a.value && !a.rules){
        const v = Array.isArray(a.value) ? a.value : [a.value];
        if (v.some(x => String(x).includes('--demo'))) return true;
      }
    }
  }
  if (typeof meta.minecraftArguments === 'string' && /\s?--demo(\s|$)/.test(meta.minecraftArguments)) return true;
  return false;
}

function loaderOfId(id){
  const t = String(id).toLowerCase();
  if (t.includes('neoforge')) return 'neoforge';
  if (t.includes('forge')) return 'forge';
  if (t.includes('fabric')) return 'fabric';
  return 'vanilla';
}
function scanVersions(){
  const list = [];
  let demoSkipped = 0;
  const dir = versionsDir();
  const refs = {}; // baseId -> [usingVersionIds]
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    // 第一遍：收集继承链引用（原版被哪些 modloader 版本依赖）
    entries.forEach(e => {
      if (!e.isDirectory()) return;
      const jf = path.join(dir, e.name, e.name + '.json');
      if (!fs.existsSync(jf)) return;
      try {
        const meta = JSON.parse(fs.readFileSync(jf, 'utf8'));
        let base = meta.inheritsFrom, guard = 0;
        while (base && guard++ < 6){
          if (!refs[base]) refs[base] = [];
          if (!refs[base].includes(e.name)) refs[base].push(e.name);
          const bjf = path.join(dir, base, base + '.json');
          if (!fs.existsSync(bjf)) break;
          try { base = JSON.parse(fs.readFileSync(bjf, 'utf8')).inheritsFrom || ''; } catch(err){ break; }
        }
      } catch(err){}
    });
    // 第二遍：构建版本列表
    entries.forEach(e => {
      if (!e.isDirectory()) return;
      const jf = path.join(dir, e.name, e.name + '.json');
      if (!fs.existsSync(jf)) return;
      try {
        const meta = JSON.parse(fs.readFileSync(jf, 'utf8'));
              if (metaIsDemo(meta)){ demoSkipped++; return; } // 试玩版本不入列表
        const jar = path.join(dir, e.name, e.name + '.jar');
        let installed = fs.existsSync(jar);
        // 继承版本（modloader）自身无主 jar：底层原版 jar 存在即视为文件完整
        if (!installed && meta.inheritsFrom){
          let base = meta.inheritsFrom, guard = 0;
          while (base && guard++ < 6){
            if (fs.existsSync(path.join(dir, base, base + '.jar'))){ installed = true; break; }
            const bjf = path.join(dir, base, base + '.json');
            if (!fs.existsSync(bjf)) break;
            try { base = JSON.parse(fs.readFileSync(bjf, 'utf8')).inheritsFrom || ''; } catch(e){ break; }
          }
        }
        list.push({
          id: e.name,
          type: meta.type || 'release',
          releaseTime: meta.releaseTime || '',
          javaMajor: meta.javaVersion ? meta.javaVersion.majorVersion : null,
          mainClass: meta.mainClass || '',
          installed,
          loader: loaderOfId(e.name),
          inheritsFrom: meta.inheritsFrom || '',
          // 16.0：底层依赖保护
          userOriginal: fs.existsSync(path.join(dir, e.name, '.aoura-original')),
          isBase: (refs[e.name] || []).length > 0,
          baseRefs: refs[e.name] || [],
          baseOf: (refs[e.name] || []).filter(u => u !== e.name)
        });
      } catch(err){}
    });
  } catch(e){}
  list.sort((a,b) => (a.releaseTime < b.releaseTime ? 1 : -1));
  if (demoSkipped > 0) logLine('warn', '已从版本列表移除 ' + demoSkipped + ' 个试玩（demo）版本，正式版本不受影响');
  return list;
}

/* ================= 启动引擎 ================= */
let launchProc = null;
let launchProcKilled = false;

function rulesAllowed(rules){
  // Mojang rules 语义（HMCL 同款）：默认不应用；
  // 任一 disallow 规则匹配 -> 禁止；任一 allow 规则匹配 -> 允许
  // 本启动器默认所有 features 均为 false（不开启 demo / 自定义分辨率 / 快捷游戏）
  if (!rules || !rules.length) return true;
  let result = false;
  for (const rule of rules){
    let ok = true;
    if (rule.os && rule.os.name){
      // macOS 在旧版 JSON 写作 osx，新版写作 macos
      if (rule.os.name === 'osx' || rule.os.name === 'macos'){
        ok = ok && process.platform === 'darwin';
      } else {
        const want = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'macos' : 'linux');
        ok = ok && rule.os.name === want;
      }
    }
    if (rule.features){
      // 任何要求 feature 为 true 的规则都不匹配（启动器未开启任何 feature）
      for (const k of Object.keys(rule.features)){
        if (rule.features[k]) ok = false;
      }
    }
    if (ok){
      if (rule.action === 'disallow') return false;
      result = true;
    }
  }
  return result;
}

// 递归解析版本继承链（modloader 版本 inheritsFrom 原版），合并库/主类/参数
function resolveVersionMeta(versionId){
  const metas = [];
  let cur = versionId;
  while (cur){
    const jf = path.join(versionsDir(), cur, cur + '.json');
    if (!fs.existsSync(jf)) break;
    const m = JSON.parse(fs.readFileSync(jf, 'utf8'));
    metas.unshift(m); // 底层（原版）在前
    if (!m.inheritsFrom) break;
    cur = m.inheritsFrom;
  }
  if (!metas.length) return null;
  const base = metas[0];
  const top = metas[metas.length - 1];
  const merged = {
    id: versionId,
    type: top.type || base.type,
    releaseTime: top.releaseTime || base.releaseTime,
    javaVersion: top.javaVersion || base.javaVersion,
    mainClass: top.mainClass || base.mainClass,
    assets: base.assets || top.assets,
    assetIndex: base.assetIndex || top.assetIndex,
    libraries: [],
    arguments: top.arguments || base.arguments || {},
    minecraftArguments: top.minecraftArguments || base.minecraftArguments || undefined
  };
  const seen = {};
  metas.forEach(m => (m.libraries || []).forEach(lib => {
    const art = lib.downloads && lib.downloads.artifact;
    const lp = art ? art.path : (lib.name ? libPathFromName(lib.name) : null);
    if (lp){
      if (seen[lp]) return;
      seen[lp] = 1;
    }
    merged.libraries.push(lib);
  }));
  return { merged, baseId: base.id, baseJar: path.join(versionsDir(), base.id, base.id + '.jar') };
}
async function ensureBaseJar(versionId){
  // 确保继承链底层原版主 jar 就位；缺失时按底层 version.json 自动补下
  const rvm = resolveVersionMeta(versionId);
  if (!rvm) throw new Error('版本描述解析失败');
  if (fs.existsSync(rvm.baseJar)) return rvm.baseJar;
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(path.join(versionsDir(), rvm.baseId, rvm.baseId + '.json'), 'utf8')); } catch(e){}
  const jarUrl = meta && meta.downloads && meta.downloads.client && meta.downloads.client.url;
  if (jarUrl){
    try {
      fs.mkdirSync(path.dirname(rvm.baseJar), { recursive: true });
      await downloadWithRetry(mirrorUrl(jarUrl), rvm.baseJar, null, null, 3);
    } catch(e){ logLine('warn', '自动补下主 jar 失败：' + e.message); }
  }
  if (fs.existsSync(rvm.baseJar)) return rvm.baseJar;
  throw new Error('缺少主程序 ' + rvm.baseId + '（主 jar 缺失且自动补下失败，请回到下载中心重新下载）');
}
async function buildLaunchCommand(meta, versionId){
  const gd = cfg.isolation ? path.join(versionsDir(), versionId) : gameDir();
  fs.mkdirSync(gd, { recursive: true });
  const jf = path.join(versionsDir(), versionId, versionId + '.json');
  let jar = path.join(versionsDir(), versionId, versionId + '.jar');
  if (!fs.existsSync(jar)){
    // modloader 版本（inheritsFrom 原版）自身无 jar：把继承链底层的原版主 jar 复制进自身版本目录，
    // 使「原版游戏依赖 + 模组底层」自包含在同一文件夹，不再依赖外部底层目录（避免误删底层导致缺少主程序）
    const baseJar = await ensureBaseJar(versionId);
    try {
      fs.copyFileSync(baseJar, jar);
      jar = jar;
    } catch(e){
      jar = baseJar; // 复制失败则退回引用底层原版 jar
    }
  }
  const cp = [];
  const nativesToExtract = [];

  (meta.libraries || []).forEach(lib => {
    if (!rulesAllowed(lib.rules)) return;
    const isNatives = lib.natives && lib.natives.windows;
    if (isNatives){
      const archSuffix = process.arch === 'x64' ? '-64' : '-32';
      const cls = lib.downloads && lib.downloads.classifiers;
      const art = (cls && (cls['natives-windows' + archSuffix] || cls['natives-windows'])) || null;
      if (art) nativesToExtract.push({ path: art.path, url: art.url });
      return;
    }
    const art = lib.downloads && lib.downloads.artifact;
    const libPath = art ? art.path : (lib.name ? libPathFromName(lib.name) : null);
    if (libPath) cp.push(path.join(librariesDir(), libPath));
  });

  // 版本主 jar
  cp.push(jar);

  // 原生库解压
  const nativesDir = path.join(gd, 'bin', versionId + '-natives-' + Date.now().toString(36));
  fs.mkdirSync(nativesDir, { recursive: true });
  nativesToExtract.forEach(n => {
    const src = path.join(librariesDir(), n.path);
    if (fs.existsSync(src)){
      try {
        const zip = new AdmZip(src);
        zip.getEntries().forEach(ent => {
          if (ent.entryName.includes('/') && !ent.entryName.startsWith('META-INF')) {
            try { zip.extractEntryTo(ent, nativesDir, false, true); } catch(e){}
          }
        });
      } catch(e){ logLine('warn', '原生库解压失败 ' + n.path + '：' + e.message); }
    } else {
      logLine('warn', '缺少原生库：' + n.path);
    }
  });

  const classpath = cp.join(path.delimiter);
  const mem = cfg.memory || 2048;
  // 20.4：JVM locale 兜底——Minecraft 26.x 存在语言设置回退英文的缺陷（Mojira MC-310197），options.txt 之外再加 JVM 参数双保险
  const jvmBase = ['-Xmx' + mem + 'M', '-Xms256M', '-Duser.language=zh_CN', '-Duser.country=CN', '-Djava.library.path=' + nativesDir, '-cp', classpath];
  const auth = currentAuth();
  const placeholders = {
    '${version_name}': versionId,
    '${game_directory}': gd,
    '${assets_root}': assetsDir(),
    '${assets_index_name}': meta.assetIndex ? meta.assetIndex.id : versionId,
    '${auth_player_name}': auth.name,
    '${auth_uuid}': auth.uuid,
    '${auth_access_token}': auth.token,
    '${auth_session}': auth.type === 'msa' ? auth.token : '0',
    '${user_type}': auth.type === 'msa' ? 'msa' : 'legacy',
    '${user_properties}': '{}',
    '${version_type}': meta.type || 'release',
    '${resolution_width}': '1280',
    '${resolution_height}': '720',
    '${launcher_name}': 'AOURA',
    '${launcher_version}': '28.0.1',
    '${classpath}': classpath,
    '${natives_directory}': nativesDir,
    // 28：Forge/NeoForge 的 JVM 参数依赖这两个占位符——缺失会致模块路径无效、securejarhandler 模块无法识别、
    // --add-opens java.base/java.lang.invoke 失效，游戏启动即崩溃（ExceptionInInitializerError）
    '${library_directory}': librariesDir(),
    '${classpath_separator}': path.delimiter
  };
  const subst = s => s.replace(/\$\{[a-z_0-9]+\}/g, m => (m in placeholders ? placeholders[m] : m));

  let args = [];
  if (meta.arguments && meta.arguments.jvm){
    meta.arguments.jvm.forEach(a => {
      if (typeof a === 'string') args.push(subst(a));
      else if (a.rules && rulesAllowed(a.rules) && a.value) {
        const v = Array.isArray(a.value) ? a.value : [a.value];
        v.forEach(x => args.push(subst(x)));
      }
    });
    // 确保注入 natives 与 classpath
    if (!args.includes('-Djava.library.path=' + nativesDir)) args.unshift('-Djava.library.path=' + nativesDir);
    if (!args.includes(classpath)){
      const ci = args.indexOf('-cp');
      if (ci >= 0) args[ci+1] = classpath; else args.push('-cp', classpath);
    }
  } else {
    args = args.concat(jvmBase);
  }
  // 用户自定义 JVM 参数
  if (cfg.jvmArgs && cfg.jvmArgs.trim()){
    const extra = cfg.jvmArgs.trim().split(/\s+/).filter(Boolean);
    extra.forEach(a => {
      if (a === '-cp' || a === classpath || a.startsWith('-Xmx')) return; // 防覆盖关键参数
      if (!args.includes(a)) args.push(a);
    });
  }
  const main = meta.mainClass || 'net.minecraft.client.main.Main';
  args.push(main);
  if (meta.arguments && meta.arguments.game){
    meta.arguments.game.forEach(a => {
      if (typeof a === 'string') args.push(subst(a));
      else if (a.rules && rulesAllowed(a.rules) && a.value){
        const v = Array.isArray(a.value) ? a.value : [a.value];
        v.forEach(x => args.push(subst(x)));
      }
    });
  } else if (meta.minecraftArguments){
    meta.minecraftArguments.split(' ').forEach(a => args.push(subst(a)));
  }
  // 用户自定义游戏参数
  if (cfg.gameArgs && cfg.gameArgs.trim()){
    const extra = cfg.gameArgs.trim().split(/\s+/).filter(Boolean);
    extra.forEach(a => { if (!args.includes(a)) args.push(a); });
  }
  // 试玩模式拦截：官方/原版版本不允许带 --demo 参数启动
  const demoHit = (args) => args.some(a => typeof a === 'string' && (a === '--demo' || a.startsWith('--demo')));
  if (demoHit(args)) throw new Error('该版本为试玩（demo）版本，无法正式游玩。AOURA 已在下载与版本列表中自动过滤试玩版本，请选择列表中的正式版本');
  // 28：Java 17 不识别新版 Minecraft 的 --sun-misc-unsafe-memory-access=allow（Java 21+ 选项），
  // 按实际 Java 主版本过滤，避免 JVM 直接拒绝启动（Unrecognized option）
  const exe = resolveJavaExe(versionId);
  const jMajor = detectJavaMajor(exe);
  if (jMajor > 0 && jMajor < 21){
    const before = args.length;
    args = args.filter(a => !(typeof a === 'string' && a.startsWith('--sun-misc-unsafe-memory-access')));
    if (args.length !== before) logLine('info', 'Java ' + jMajor + '：已自动移除 --sun-misc-unsafe-memory-access 参数（该选项需 Java 21+，移除后旧版 Java 可继续启动）');
  }
  return { exe, args, nativesDir, classpath, gameDir: gd };
}

function libPathFromName(name){
  const parts = name.split(':');
  if (parts.length < 3) return null;
  const [group, artifact, ver] = parts;
  let ext = 'jar';
  if (parts.length > 3){
    const cls = parts.slice(3).join('-');
    return group.replace(/\./g,'/') + '/' + artifact + '/' + ver + '/' + artifact + '-' + ver + '-' + cls + '.jar';
  }
  return group.replace(/\./g,'/') + '/' + artifact + '/' + ver + '/' + artifact + '-' + ver + '.' + ext;
}

async function ensureLibraries(meta, versionId){
  const missing = [];
  (meta.libraries || []).forEach(lib => {
    if (!rulesAllowed(lib.rules)) return;
    if (lib.natives && lib.natives.windows) return;
    const art = lib.downloads && lib.downloads.artifact;
    const lp = art ? art.path : (lib.name ? libPathFromName(lib.name) : null);
    if (lp && !fs.existsSync(path.join(librariesDir(), lp))){
      missing.push({ path: lp, url: art ? art.url : null, name: lib.name });
    }
  });
  // 19.3：缺失依赖 12 路并发补全（PCL 同款，大幅缩短启动等待）
  const queue = missing.slice();
  const LIB_CONC = 12;
  async function libWorker(){
    while (queue.length){
      const m = queue.shift();
      logLine('info', '补全依赖：' + m.path);
      let url = m.url;
      if (!url && m.name){
        url = 'https://libraries.minecraft.net/' + libPathFromName(m.name);
      }
      if (!url) { logLine('warn', '缺少依赖且无下载地址：' + m.path); continue; }
      const dest = path.join(librariesDir(), m.path);
      try { await downloadWithRetry(mirrorUrl(url), dest, null, null, 2); }
      catch(e){ logLine('warn', '依赖下载失败：' + m.path + '（' + e.message + '）'); }
    }
  }
  await Promise.all(Array.from({ length: LIB_CONC }, libWorker));
}

async function ensureAssetIndex(meta, versionId){
  const idxId = meta.assetIndex ? meta.assetIndex.id : versionId;
  const dest = path.join(assetsDir(), 'indexes', idxId + '.json');
  if (fs.existsSync(dest)) return idxId;
  const url = meta.assetIndex && meta.assetIndex.url;
  if (!url) return idxId;
  logLine('info', '下载资源索引：' + idxId);
  try { await downloadWithRetry(mirrorUrl(url), dest, null, null, 2); }
  catch(e){ logLine('warn', '资源索引下载失败：' + e.message); }
  return idxId;
}

/* 18.2：写入游戏语言设置（PCL 同款）——版本隔离等全新游戏目录默认英文，启动前按用户设置写入 options.txt 语言
   20.3：显式确保 zh_cn.json 语言文件存在（26.x 语言文件在资源索引中，缺失时游戏回退英文，仅写 options.txt 不够） */
async function ensureGameLanguage(gd, meta, versionId){
  try {
    // 20.2：版本隔离/新装模组底层时游戏目录可能尚未创建，先补齐目录再写语言，避免 options.txt 写失败导致游戏英文
    fs.mkdirSync(gd, { recursive: true });
    const optPath = path.join(gd, 'options.txt');
    const want = cfg.lang || 'zh_cn';
    const mkLine = 'lang:' + want + '\n';
    if (fs.existsSync(optPath)){
      let txt = fs.readFileSync(optPath, 'utf8');
      if (/^lang:.*$/m.test(txt)){
        txt = txt.replace(/^lang:.*$/m, 'lang:' + want);
      } else {
        txt = txt.replace(/\s*$/, '\n') + mkLine;
      }
      fs.writeFileSync(optPath, txt, 'utf8');
    } else {
      fs.writeFileSync(optPath, mkLine, 'utf8');
      logLine('info', '已写入游戏语言：' + want + '（简体中文支持无需额外下载，Minecraft 官方语言文件随资源自动补齐）');
    }
    // 20.3：语言文件兜底——确保 minecraft/lang/zh_cn.json 在 assets 对象目录存在，缺失立即补齐
    try {
      const idxId = meta && meta.assetIndex ? meta.assetIndex.id : versionId;
      const idxPath = path.join(assetsDir(), 'indexes', idxId + '.json');
      if (fs.existsSync(idxPath)){
        const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
        const o = (idx.objects || {})['minecraft/lang/zh_cn.json'];
        if (o && o.hash){
          const dest = path.join(assetsDir(), 'objects', o.hash.slice(0,2), o.hash);
          if (!fs.existsSync(dest) || (fs.statSync(dest).size || 0) < (o.size || 1)){
            logLine('info', '中文语言文件缺失，正在补齐 zh_cn.json …');
            let langOk = false;
            try {
              await downloadWithRetry('https://resources.download.minecraft.net/' + o.hash.slice(0,2) + '/' + o.hash, dest, null, null, 3);
              langOk = (fs.statSync(dest).size || 0) >= (o.size || 1);
              if (langOk) logLine('info', '中文语言文件已补齐：' + o.hash);
            } catch(err){ logLine('warn', '官方源中文语言文件下载失败：' + err.message); }
            // 28：官方源失败 → 内置兜底语言文件（随安装包分发，保证主界面中文）
            if (!langOk){
              try {
                const fb = path.join(__dirname, 'assets', 'zh_cn_fallback.json');
                if (fs.existsSync(fb)){
                  fs.mkdirSync(path.dirname(dest), { recursive: true });
                  fs.copyFileSync(fb, dest);
                  logLine('info', '中文语言文件已由内置兜底补齐（' + o.hash + '，部分新词条可能缺失）');
                  langOk = true;
                }
              } catch(ef){ logLine('warn', '内置语言文件补齐失败：' + ef.message); }
            }
          }
        }
      }
    } catch(e){}
  } catch(e){ logLine('warn', '写入游戏语言失败：' + e.message); }
}

/* 18.1：启动前校验并补齐缺失的游戏资源（PCL 同款做法，防止启动时缺文件崩溃） */
async function ensureAssetObjects(meta, versionId){
  // 18.4：若下载任务正在进行，避免与下载流程并发写同一批资源文件（Windows EPERM），提示等待
  if (dlToken){
    logLine('warn', '检测到下载任务正在进行，为避免资源文件冲突，请等待下载完成后启动游戏');
    throw new Error('下载任务进行中，请等待其完成后启动游戏');
  }
  let res = { ok: true, missing: 0 };
  await withAssetPhaseLock(async () => { res = await ensureAssetObjectsInner(meta, versionId); });
  return res;
}
async function ensureAssetObjectsInner(meta, versionId){
  const idxId = meta.assetIndex ? meta.assetIndex.id : versionId;
  const idxDest = path.join(assetsDir(), 'indexes', idxId + '.json');
  if (!fs.existsSync(idxDest)) return { ok: true, missing: 0 };
  const idx = JSON.parse(fs.readFileSync(idxDest, 'utf8'));
  const objs = Object.keys(idx.objects || {});
  const missing = [];
  for (const key of objs){
    const obj = idx.objects[key];
    const realHash = (obj && obj.hash) || key;
    const dest = path.join(assetsDir(), 'objects', realHash.slice(0,2), realHash);
    if (!fs.existsSync(dest) || (fs.statSync(dest).size || 0) < (obj.size || 1)) missing.push(realHash);
  }
  if (!missing.length) return { ok: true, missing: 0 };
  logLine('info', '检测到 ' + missing.length + ' 个资源缺失，启动前自动补齐（镜像 + 官方多源）…');
  send('game:progress', { stage: 'asset', done: 0, total: missing.length });
  const CONC = 32; // 28：资源补齐并发 16→32，配合单源探测，资源下载提速
  const queue = missing.slice();
  let doneCount = 0;
  const failed = [];
  async function worker(){
    while (queue.length){
      const h = queue.shift();
      const dest = path.join(assetsDir(), 'objects', h.slice(0,2), h);
      const url = 'https://resources.download.minecraft.net/' + h.slice(0,2) + '/' + h;
      try {
        await downloadWithRetry(url, dest, null, null, 3);
      } catch(e){ failed.push(h); }
      doneCount++;
      send('game:progress', { stage: 'asset', done: doneCount, total: missing.length });
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  for (const h of failed){
    const dest = path.join(assetsDir(), 'objects', h.slice(0,2), h);
    try { await downloadWithRetry('https://resources.download.minecraft.net/' + h.slice(0,2) + '/' + h, dest, null, null, 5); }
    catch(e){ logLine('error', '资源补齐失败：' + h + '（' + (e.message || e) + '）'); }
  }
  if (failed.length) logLine('warn', '仍有 ' + failed.length + ' 个资源无法下载（多为音效等非关键文件），游戏仍将启动');
  return { ok: failed.length === 0, missing: failed.length };
}

async function launchGame(versionId){
  if (launchProc) throw new Error('已有游戏正在运行');
  const jf = path.join(versionsDir(), versionId, versionId + '.json');
  if (!fs.existsSync(jf)) throw new Error('版本不存在：' + versionId);
  const rawMeta = JSON.parse(fs.readFileSync(jf, 'utf8'));
  if (metaIsDemo(rawMeta)) throw new Error('该版本为试玩（demo）版本，无法正式游玩。AOURA 已在下载与版本列表中自动过滤试玩版本，请选择列表中的正式版本');
  // modloader 版本继承原版：合并解析（库/主类/参数/资产）
  const rvm = resolveVersionMeta(versionId);
  const meta = rvm ? rvm.merged : rawMeta;
  cfg.currentVersion = versionId; saveConfig();

  // 离线模式强制英文账户名（Minecraft 会话规范）
  if (cfg.authType !== 'msa'){
    const name = (cfg.offlineName || '').trim();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(name)){
      throw new Error('离线账户名必须为英文（仅允许字母、数字、下划线，1-16 个字符）。当前名称为“' + (name || '空') + '”，请在设置中修改后重试');
    }
  }

  // 正版模式：启动前确保 token 有效（自动刷新）
  const auth = currentAuth();
  if (auth.type === 'msa'){
    logLine('info', '正版账户验证中：' + auth.name + ' …');
    try { await ensureMsAuth(); } catch(e){ logLine('error', e.message); throw e; }
  }
  logLine('info', '════════ AOURA 启动器 ════════');
  logLine('info', '版本：' + versionId + ' · 目录：' + gameDir());
  logLine('info', '账户：' + auth.name + (auth.type === 'msa' ? '（微软正版）' : '（离线模式）') + ' · 内存：' + cfg.memory + ' MB');
  await ensureLibraries(meta, versionId);
  await ensureAssetIndex(meta, versionId);
  // 28：Forge/NeoForge 启动前自动检查处理产物（srg/extra/client）——存量版本缺失时自动补齐，
  // 不再需要手动点「待补齐」，也不会再出现 ModJarMetadata 的 Invalid paths 启动崩溃
  if (versionId.includes('-forge-') || versionId.includes('-neoforge-')){
    const isNeo = versionId.includes('-neoforge-');
    const baseId = meta.inheritsFrom || versionId;
    if (!probeForgeProcessed(versionId, baseId, isNeo)){
      logLine('info', versionId + ' 缺少 Forge 处理产物（srg/extra/client），启动前自动补齐…');
      try {
        const g = isNeo ? 'net/neoforged/neoforge' : 'net/minecraftforge/forge';
        // 28：installer 路径段 = {mc}-{ver}（如 1.20.1-47.3.39），不是 versionId（1.20.1-forge-47.3.39）
        const vtag = versionId.replace(isNeo ? '-neoforge-' : '-forge-', '-');
        const tmpI = path.join(cacheDir(), 'prelaunch-' + Date.now().toString(36) + '-installer.jar');
        fs.mkdirSync(path.dirname(tmpI), { recursive: true });
        const u1 = 'https://bmclapi2.bangbang93.com/maven/' + g + '/' + vtag + '/' + (isNeo ? 'neoforge-' : 'forge-') + vtag + '-installer.jar';
        const u2 = isNeo
          ? 'https://maven.neoforged.net/releases/' + g + '/' + vtag + '/' + (isNeo ? 'neoforge-' : 'forge-') + vtag + '-installer.jar'
          : 'https://maven.minecraftforge.net/net/minecraftforge/forge/' + vtag + '/forge-' + vtag + '-installer.jar';
        const f = await pickFastSource([u1, u2], 8000);
        await multiSourceDownload([f, f === u2 ? u1 : u2].filter(Boolean), tmpI, null, 3);
        await runForgeInstaller({ installerPath: tmpI, versionId, mc: baseId });
        logLine('info', versionId + ' 处理产物已补齐（srg/extra/client）');
      } catch(ie){
        logLine('error', versionId + ' 启动前补齐处理产物失败：' + (ie.message || ie) + '（游戏可能无法启动，可重新安装底层后重试）');
        throw new Error(versionId + ' 缺少 Forge 处理产物且自动补齐失败：' + (ie.message || ie) + '。请检查网络后重试，或重新安装该底层');
      }
    }
  }
  await ensureAssetObjects(meta, versionId);
  let cmd = await buildLaunchCommand(meta, versionId);
  // 28：新版（1.21+/26.x）需要 Java 21+——检测到当前 Java 版本过低时自动下载 Java 21（国内镜像），装完自动继续启动
  if (needsJava21(versionId) && cmd.exe && detectJavaMajor(cmd.exe) < 21){
    const j21 = path.join(dataRoot(), 'java', 'jdk-21', process.platform === 'win32' ? 'bin/java.exe' : 'bin/java');
    if (!fs.existsSync(j21)){
      logLine('info', versionId + ' 需要 Java 21+，当前 Java 版本过低，正在自动下载 Java 21…');
      try {
        await installJava(21);
        if (fs.existsSync(j21)){
          cmd.exe = j21;
          logLine('info', 'Java 21 安装完成：' + j21);
        } else {
          throw new Error('Java 21 安装后未找到可执行文件');
        }
      } catch(je){
        logLine('error', 'Java 21 自动下载失败：' + (je.message || je) + '（已回退旧版 Java 并过滤不兼容参数，可稍后在设置中重试）');
      }
    } else if (cmd.exe !== j21){
      cmd.exe = j21;
    }
  }
  await ensureGameLanguage(cmd.gameDir || (cfg.isolation ? path.join(versionsDir(), versionId) : gameDir()), meta, versionId);
  if (cmd.exe === 'java'){
    // 系统 PATH 探测：确保 'java' 命令真实可用，避免 spawn java ENOENT 的晦涩报错
    try {
      const probe = require('child_process').spawnSync('java', ['-version'], { timeout: 8000, encoding: 'utf8' });
      if (probe.error || probe.status !== 0){
        throw new Error('未检测到可用的 Java 运行时。请在 设置 → Java 环境 点击「下载 Java」自动安装，或在设置中手动指定 Java 路径');
      }
    } catch(e){
      if (e.message && e.message.includes('未检测到可用的 Java')) throw e;
      throw new Error('未检测到可用的 Java 运行时。请在 设置 → Java 环境 点击「下载 Java」自动安装，或在设置中手动指定 Java 路径');
    }
  } else if (!fs.existsSync(cmd.exe)){
    throw new Error('Java 路径无效：' + cmd.exe + '，请在设置中重新指定 Java 或点击「下载 Java」');
  }
  logLine('info', 'Java：' + cmd.exe);
  logLine('info', '正在启动游戏…');

  return new Promise((resolve, reject) => {
    launchProcKilled = false;
    launchProc = spawn(cmd.exe, cmd.args, { cwd: cmd.gameDir, windowsHide: false });
    // 18.5：仅在进程真正拉起成功后累计启动次数（供"每 10 次弹正版引导"使用），启动失败不再虚高计数
    launchProc.on('spawn', () => { cfg.launchCount = (cfg.launchCount || 0) + 1; saveConfig(); });
    const onData = d => { const t = d.toString().replace(/\r?\n$/, ''); if (t) logLine('game', t); };
    launchProc.stdout.on('data', onData);
    launchProc.stderr.on('data', onData);
    launchProc.on('error', err => {
      launchProc = null;
      reject(new Error('启动失败：' + err.message));
    });
    launchProc.on('close', code => {
      launchProc = null;
      try { fs.rmSync(cmd.nativesDir, { recursive: true, force: true }); } catch(e){}
      send('launch:status', { state: 'exited', code });
      resolve({ code });
    });
    send('launch:status', { state: 'running', versionId });
    // 启动后自动关闭启动器窗口
    if (cfg.closeAfterLaunch && win && !win.isDestroyed()){
      setTimeout(() => { if (launchProc) win.close(); }, 1200);
    }
  });
}
function stopGame(){
  if (launchProc){
    launchProcKilled = true;
    if (process.platform === 'win32'){
      try { spawn('taskkill', ['/pid', String(launchProc.pid), '/T', '/F']); } catch(e){}
    } else {
      try { launchProc.kill('SIGTERM'); } catch(e){}
    }
    launchProc = null;
  }
}

/* ================= 下载中心 ================= */
let dlToken = null;
let resToken = null; // 20.2：当前资源（模组/光影/整合包）下载令牌
async function fetchJson(url){
  const res = await httpFetch(url, { headers: { 'User-Agent': 'AOURA-Launcher/4.0' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
// 19.3：JSON 请求带重试（Modrinth 等 API 偶发瞬断/限流，自动退避重试）
async function retryJson(url, tries){
  let lastErr;
  for (let i = 0; i < (tries || 3); i++){
    try { return await fetchJson(url); } catch(e){ lastErr = e; await sleepMs(400 * (i + 1)); }
  }
  throw lastErr || new Error('请求失败');
}
async function fetchText(url){
  const res = await httpFetch(url, { headers: { 'User-Agent': 'AOURA-Launcher/4.0' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}
/* 文件名版本比较：按数字段逐段比较（8u504b01 / 21.0.12.1_1 均可） */
function verCmp(a, b){
  const nums = s => (s.match(/\d+/g) || []).map(Number);
  const A = nums(a), B = nums(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++){
    const x = A[i] || 0, y = B[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}
/* 国内 Adoptium 镜像源（按优先级；清华对部分网络会 403，需多源冗余） */
const JAVA_MIRRORS = [
  { base: 'https://mirror.nju.edu.cn/adoptium', tag: '南大' },
  { base: 'https://mirrors.huaweicloud.com/adoptium', tag: '华为云' },
  { base: 'https://mirror.lzu.edu.cn/adoptium', tag: '兰大' },
  { base: 'https://mirrors.tuna.tsinghua.edu.cn/Adoptium', tag: '清华' }
];
/* 多镜像冗余：列出可用 Java 大版本 */
async function javaMajorList(){
  let lastErr = null;
  for (const m of JAVA_MIRRORS){
    try {
      const html = await fetchText(m.base + '/');
      const majors = [...html.matchAll(/href="(\d+)\/"/g)].map(x => parseInt(x[1], 10)).filter(v => [8, 11, 17, 21, 25].includes(v));
      if (majors.length) return majors.sort((a, b) => b - a);
    } catch(e){ lastErr = e; logLine('warn', m.tag + '镜像 Java 列表解析失败：' + e.message); }
  }
  throw lastErr || new Error('所有 Java 镜像均不可达');
}
/* 多镜像冗余：取某大版本目录中最新的 JDK 文件名 */
async function javaFileName(major, arch, osName){
  let lastErr = null;
  for (const m of JAVA_MIRRORS){
    try {
      const html = await fetchText(m.base + '/' + major + '/jdk/' + arch + '/' + osName + '/');
      const names = [...html.matchAll(/href="([^"]+\.zip)"/g)].map(x => decodeURIComponent(x[1]));
      if (names.length){
        names.sort((a, b) => verCmp(b, a) || (a < b ? 1 : -1));
        return names[0];
      }
    } catch(e){ lastErr = e; logLine('warn', m.tag + '镜像目录解析失败：' + e.message); }
  }
  throw lastErr || new Error('所有 Java 镜像目录均不可达');
}
async function fetchJsonBest(url, alt){
  const mirrored = mirrorUrl(url);
  let attempts = mirrored !== url ? [mirrored, url] : [url];
  if (alt && !attempts.includes(alt)) attempts = [alt].concat(attempts);
  let lastErr;
  for (const u of attempts){
    try { return await fetchJson(u); } catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('请求失败');
}
async function getManifest(){
  const urls = cfg.mirror === 'bmclapi'
    ? ['https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json', 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json']
    : cfg.mirror === 'fastmc'
    ? ['https://launchermeta.fastmcmirror.org/mc/game/version_manifest_v2.json', 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json']
    : ['https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'];
  // 测速选源：并行请求，任一成功即返回
  try {
    return await Promise.any(urls.map(async u => {
      try { return await fetchJson(u); } catch(e){ throw e; }
    }));
  } catch(e){
    throw new Error('无法获取版本清单（' + urls.length + ' 个源均不可达）');
  }
}
async function downloadVersion(versionId, opts){
  if (dlToken) throw new Error('已有下载任务进行中');
  const markOriginal = !opts || opts.markOriginal !== false;
  // 19.0：支持自定义版本名称（仅影响版本目录/文件名，版本元数据 id 保持官方原值以保证继承链正确）
  const dirName = (opts && opts.name && String(opts.name).trim()) || versionId;
  if (dirName !== versionId && /[\\/:*?"<>|]/.test(dirName)){
    throw new Error('版本名称不能包含字符 \\ / : * ? " < > |');
  }
  dlToken = makeToken();
  let vdir = null; // 19.0：记录本次下载创建的版本目录，取消时自动清理
  try {
    const manifest = await getManifest();
    const v = manifest.versions.find(x => x.id === versionId);
    if (!v) throw new Error('版本不存在：' + versionId);
    // 支持全部官方类型：正式版 / 快照 / 特色（愚人节等）/ 远古版本均可下载游玩；仅拒绝 demo
    // manifest 中的试玩（demo）标记直接拒绝
    if (/^demo/i.test(v.id || '')){
      throw new Error('该版本为试玩（demo）版本，请下载正式版本');
    }
    send('download:progress', { task: '版本信息', phase: 'start', loc: vdir || versionsDir() });
    const meta = await fetchJsonBest(v.url, 'https://bmclapi2.bangbang93.com/version/' + versionId + '/json');
    if (metaIsDemo(meta)){
      fs.rmSync(path.join(versionsDir(), versionId), { recursive: true, force: true });
      throw new Error('检测到该版本为试玩（demo）版本，已自动移除，请下载正式版本');
    }
    vdir = path.join(versionsDir(), dirName);
    fs.mkdirSync(vdir, { recursive: true });
    fs.writeFileSync(path.join(vdir, dirName + '.json'), JSON.stringify(meta, null, 2));
    // 16.0：纯原版主动下载标记（作为模组底层自动创建的原版不标记，避免版本管理重复展示）
    if (markOriginal) fs.writeFileSync(path.join(vdir, '.aoura-original'), '1');

    // 1. 主 jar
    const jarUrl = meta.downloads && meta.downloads.client && meta.downloads.client.url;
    if (jarUrl){
      const dest = path.join(vdir, dirName + '.jar');
      // 18.0：测速选主源（BMCLAPI 正确格式 vs 官方 piston-data），PCL 同款单主源分段
      const fast = await pickFastSource([
        'https://bmclapi2.bangbang93.com/version/' + versionId + '/client',
        jarUrl
      ]);
      await downloadWithRetry(fast, dest, dlToken, p => {
        send('download:progress', { task: versionId, loc: vdir, phase: 'jar', received: p.received, total: p.total });
      }, 3, fast === jarUrl ? 'https://bmclapi2.bangbang93.com/version/' + versionId + '/client' : jarUrl);
      send('download:progress', { task: versionId, loc: vdir, phase: 'jar', done: true });
    }

    // 2. 依赖库（19.3：12 路并发下载，PCL 同款，避免逐库串行导致的龟速）
    let libTotal = (meta.libraries || []).length;
    let libIdx = 0;
    const libQueue = [];
    for (const lib of meta.libraries || []){
      if (!rulesAllowed(lib.rules)) continue;
      if (lib.natives && lib.natives.windows) continue;
      const art = lib.downloads && lib.downloads.artifact;
      const lp = art ? art.path : (lib.name ? libPathFromName(lib.name) : null);
      if (!lp) continue;
      const dest = path.join(librariesDir(), lp);
      if (fs.existsSync(dest)) continue;
      let url = art && art.url;
      if (!url && lib.name) url = 'https://libraries.minecraft.net/' + libPathFromName(lib.name);
      if (!url) continue;
      libQueue.push({ dest, url, lp });
    }
    const LIB_CONC = 12;
    const libFailed = [];
    async function libWorker(){
      while (libQueue.length){
        if (isCancelled(dlToken)) throw new Error('CANCELLED');
        const item = libQueue.shift();
        libIdx++;
        try {
          await downloadWithRetry(mirrorUrl(item.url), item.dest, dlToken, p => {
            send('download:progress', { task: versionId, loc: vdir, phase: 'lib', name: item.lp, received: p.received, total: p.total, index: libIdx, totalLibs: libTotal });
          }, 3);
        } catch(e){
          if (e.message === 'CANCELLED') throw e;
          libFailed.push(item);
          logLine('warn', '库下载失败（稍后补）：' + item.lp + ' ' + e.message);
        }
        send('download:progress', { task: versionId, loc: vdir, phase: 'lib', done: true, index: libIdx, totalLibs: libTotal });
      }
    }
    await Promise.all(Array.from({ length: LIB_CONC }, libWorker));
    // 19.3：失败库补一轮（避免启动时缺库导致无法进入游戏）
    for (const item of libFailed){
      if (isCancelled(dlToken)) throw new Error('CANCELLED');
      try { await downloadWithRetry(mirrorUrl(item.url), item.dest, dlToken, null, 3); }
      catch(e){ logLine('error', '库下载失败：' + item.lp + '（' + (e.message || e) + '）'); }
    }
    send('download:progress', { task: versionId, loc: vdir, phase: 'lib', allDone: true });

    // 3. 资产索引 + 资产文件（18.4：与启动前补齐互斥，防止并发写同文件 EPERM）
    await withAssetPhaseLock(async () => { await downloadAssetsPhase(meta, versionId, dlToken); });
    send('download:progress', { task: versionId, loc: vdir, phase: 'allDone' });
  } finally {
    const cancelled = !!dlToken && isCancelled(dlToken);
    if (dlToken) cancelToken(dlToken);
    dlToken = null;
    // 19.0：取消下载时自动清理本次下载创建的版本目录（半成品），避免残留版本再次出现在主页/版本管理
    if (cancelled && vdir){
      try {
        fs.rmSync(vdir, { recursive: true, force: true });
        logLine('warn', '下载已取消，已自动清理未完成的版本文件：' + dirName);
      } catch(e){}
    }
  }
}
/* 资产索引 + 资产文件（下载任务的资产阶段，独立函数便于互斥锁包裹） */
async function downloadAssetsPhase(meta, versionId, dlToken){
    const idxId = meta.assetIndex ? meta.assetIndex.id : versionId;
    const idxDest = path.join(assetsDir(), 'indexes', idxId + '.json');
    if (!fs.existsSync(idxDest) && meta.assetIndex && meta.assetIndex.url){
      await downloadWithRetry(mirrorUrl(meta.assetIndex.url), idxDest, dlToken, p => {
        send('download:progress', { task: versionId, phase: 'index', received: p.received, total: p.total });
      }, 3);
    }
    if (fs.existsSync(idxDest)){
      const idx = JSON.parse(fs.readFileSync(idxDest, 'utf8'));
      const objs = Object.keys(idx.objects || {});
      const totalObjs = objs.length;
      let doneObjs = 0;
      const CONC = 16;
      const queue = objs.slice();
      const failedAssets = [];
      async function worker(){
        while (queue.length){
          if (isCancelled(dlToken)) return;
          const key = queue.shift();
          const obj = idx.objects[key];
          const realHash = (obj && obj.hash) || key;
          const dest = path.join(assetsDir(), 'objects', realHash.slice(0,2), realHash);
          if (fs.existsSync(dest)) { doneObjs++; continue; }
          const url = 'https://resources.download.minecraft.net/' + realHash.slice(0,2) + '/' + realHash;
          try {
            await downloadWithRetry(mirrorUrl(url), dest, dlToken, p => {
              send('download:progress', { task: versionId, phase: 'asset', received: p.received, total: p.total, index: doneObjs, totalObjs });
            }, 3);
          } catch(e){ failedAssets.push({ realHash, url }); }
          doneObjs++;
          send('download:progress', { task: versionId, phase: 'asset', done: true, index: doneObjs, totalObjs });
        }
      }
      await Promise.all(Array.from({ length: CONC }, worker));
      // 18.1：失败资产补一轮（镜像+官方多源），避免游戏启动时缺文件崩溃
      if (failedAssets.length){
        logLine('warn', failedAssets.length + ' 个资源首次下载失败，正在重试补齐…');
        for (const fa of failedAssets){
          if (isCancelled(dlToken)) break;
          const dest = path.join(assetsDir(), 'objects', fa.realHash.slice(0,2), fa.realHash);
          try { await downloadWithRetry(fa.url, dest, dlToken, null, 5); }
          catch(e){ logLine('error', '资源下载失败：' + fa.realHash + '（' + (e.message || e) + '）'); }
        }
      }
      if (isCancelled(dlToken)) throw new Error('CANCELLED');
    }
}
function cancelDownload(){ if (dlToken) cancelToken(dlToken); if (resToken) cancelToken(resToken); }

/* ================= Modrinth 资源 ================= */
async function modrinthSearch(query, type, limit, version, loader){
  // facets：project_type + 游戏版本 + 支持的底层（数组内 OR，数组间 AND）
  const f = [['project_type:' + (type || 'mod')]];
  if (version && version !== 'all') f.push(['versions:' + version]);
  if (loader && loader !== 'all') f.push(['categories:' + loader]);
  const facets = JSON.stringify(f);
  const url = 'https://api.modrinth.com/v2/search?query=' + encodeURIComponent(query || '') +
    '&limit=' + (limit || 16) + '&facets=' + encodeURIComponent(facets);
  const data = await fetchJson(url);
  return (data.hits || []).map(h => ({
    id: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    downloads: h.downloads,
    author: h.author,
    icon: h.icon_url,
    type: h.project_type,
    versions: h.versions || [],
    categories: h.categories || []
  }));
}
/* 项目详情 + 全部版本（含支持源与版本文件） */
async function modrinthProject(projectId){
  const proj = await fetchJson('https://api.modrinth.com/v2/project/' + projectId);
  const vers = await fetchJson('https://api.modrinth.com/v2/project/' + projectId + '/version');
  // 20.3：收集 required 前置依赖（部分模组必须安装前置才能运行），供详情页一键跳转下载
  const depIds = [];
  for (const v of vers){
    for (const d of (v.dependencies || [])){
      if (d.dependency_type === 'required' && d.project_id && !depIds.includes(d.project_id)) depIds.push(d.project_id);
    }
  }
  let deps = [];
  if (depIds.length){
    try {
      const arr = await fetchJson('https://api.modrinth.com/v2/projects?ids=' + encodeURIComponent(JSON.stringify(depIds)));
      deps = (arr || []).map(x => ({ id: x.id, title: x.title, icon: x.icon_url || '', downloads: x.downloads || 0, author: x.author || '' }));
    } catch(e){ logLine('warn', '获取前置模组信息失败：' + e.message); }
  }
  return {
    id: proj.id,
    slug: proj.slug,
    title: proj.title,
    description: proj.description,
    body: (proj.body || '').replace(/<[^>]+>/g, ' ').slice(0, 600),
    downloads: proj.downloads,
    followers: proj.followers,
    author: proj.author,
    icon: proj.icon_url,
    type: proj.project_type,
    loaders: proj.loaders || [],
    game_versions: proj.game_versions || [],
    versions: (vers || []).map(v => ({
      id: v.id,
      name: v.name,
      version_number: v.version_number,
      game_versions: v.game_versions || [],
      loaders: v.loaders || [],
      files: (v.files || []).map(f => ({ url: f.url, filename: f.filename, size: f.size })),
      date: v.date_published || ''
    })),
    deps
  };
}
async function modrinthDownloadVersion(projectId, versionId, type){
  const sub = type === 'shader' ? 'shaderpacks' : type === 'resourcepack' ? 'resourcepacks' : type === 'modpack' ? 'modpacks' : 'mods';
  // 20.4：模组/光影/资源包下载目录跟随「当前版本」——版本隔离时进入该版本的独立目录，与游戏实际读取位置一致；
  // 整合包（modpacks）为导入用中转区，保持共享目录不变
  const destDir = sub === 'modpacks'
    ? path.join(gameDir(), sub)
    : (cfg.isolation && cfg.currentVersion
      ? path.join(versionsDir(), cfg.currentVersion, sub)
      : path.join(gameDir(), sub));
  fs.mkdirSync(destDir, { recursive: true });
  const ver = await retryJson('https://api.modrinth.com/v2/version/' + versionId, 4);
  const f = ver.files && ver.files[0];
  if (!f) throw new Error('该版本暂无可用文件');
  const token = makeToken();
  resToken = token; // 20.2：挂全局，任务中心取消时一并取消资源下载
  const dest = path.join(destDir, f.filename);
  // 19.0：优先官方 CDN（cdn.modrinth.com）下载；失败自动切换 Modrinth 官方下载端点（302 重定向至文件），多源轮询兜底
  const urls = [f.url];
  if (/cdn\.modrinth\.com/i.test(f.url)){
    urls.push('https://api.modrinth.com/v2/version/' + versionId + '/download');
  }
  // 19.4：双源实测测速选最快者作主源（CDN 与 API 端点可能走不同边缘节点，国内速度差异明显）
  try {
    const fast = await pickFastSource(urls, 6000);
    if (fast && fast !== urls[0]) urls.unshift(urls.splice(urls.indexOf(fast), 1)[0]);
  } catch(e){}
  await multiSourceDownload(urls, dest, p => {
    send('download:progress', { task: '资源下载', phase: sub, name: f.filename, received: p.received, total: p.total, loc: destDir });
  }, 4);
  cancelToken(token);
  // 19.2：整合包下载完成后自动导入（弹窗必现+成败必达），压缩包保留在 modpacks 目录并告知用户
  if (type === 'modpack'){
    const pkName = f.filename || path.basename(dest);
    send('pack:importProgress', { name: pkName, pct: 0, status: '开始导入整合包…', path: destDir });
    try {
      const imp = await importPackFromFile(dest, prog => {
        send('pack:importProgress', { name: pkName, pct: prog.pct, status: prog.status, path: destDir });
      });
      if (imp && imp.ok){
        send('pack:importProgress', { name: pkName, pct: 100, status: '导入完成：' + (imp.name || pkName), ok: true, path: destDir });
        return { file: f.filename, dir: destDir, imported: true, importOk: true, importName: imp.name };
      }
      const msg = (imp && imp.msg) || '导入失败';
      send('pack:importProgress', { name: pkName, pct: 100, status: msg, ok: false, path: destDir });
      logLine('warn', '整合包导入失败：' + msg + '（压缩包保留在 ' + destDir + '）');
      return { file: f.filename, dir: destDir, imported: true, importOk: false, importErr: msg };
    } catch(e){
      const msg = String(e && e.message || e);
      send('pack:importProgress', { name: pkName, pct: 100, status: '导入失败：' + msg, ok: false, path: destDir });
      logLine('warn', '整合包导入异常：' + msg);
      return { file: f.filename, dir: destDir, imported: true, importOk: false, importErr: msg };
    }
  }
  return { file: f.filename, dir: destDir };
}
async function modrinthDownload(projectId, type){
  const ver = await retryJson('https://api.modrinth.com/v2/project/' + projectId + '/version', 4);
  if (!ver || !ver.length) throw new Error('该项目暂无可用文件');
  return modrinthDownloadVersion(projectId, ver[0].id, type);
}

/* ================= 模组加载器安装（Fabric / Forge / NeoForge） ================= */
let loaderBusy = false;
let loaderProc = null;
function runInstaller(exe, args, cwd){
  return new Promise((resolve, reject) => {
    logLine('info', '运行安装器：' + exe + ' ' + args.join(' '));
    loaderProc = spawn(exe, args, { cwd, windowsHide: true });
    const onData = d => { const t = d.toString().replace(/\r?\n$/, ''); if (t) logLine('loader', t); };
    loaderProc.stdout.on('data', onData);
    loaderProc.stderr.on('data', onData);
    loaderProc.on('error', err => reject(new Error('安装器无法运行：' + err.message)));
    loaderProc.on('close', code => resolve(code));
  });
}
async function fabricLoaderVersions(mc){
  const list = await fetchJson('https://meta.fabricmc.net/v2/versions/loader/' + mc);
  return (list || []).filter(x => x.loader && x.loader.stable).slice(0, 30).map(x => x.loader.version);
}
async function forgeVersionsFor(mc){
  try {
    const list = await fetchJson('https://bmclapi2.bangbang93.com/forge/minecraft/' + mc);
    if (!Array.isArray(list) || !list.length) return [];
    return list
      .filter(x => x && x.version && !x.branch)
      .sort((a,b) => (b.build || 0) - (a.build || 0))
      .map(x => mc + '-' + x.version)
      .slice(0, 30);
  } catch(e){ return []; }
}
async function forgeFallbackCandidates(mc, want){
  // 28：返回与 want 同系列的候选版本（排除 want 本身——它的 installer 已确认 404），
  // 按「同 minor > 同 major > 最新」优先级排序，供导入流程逐个尝试
  try {
    const list = await retryJson('https://bmclapi2.bangbang93.com/forge/minecraft/' + mc, 2);
    const builds = (list || []).filter(b => b && b.version).sort((a,b) => (b.build||0) - (a.build||0));
    const versions = builds.map(b => String(b.version));
    if (!versions.length) return [];
    const w = String(want).split('.').map(Number);
    const cand = versions.filter(v => v !== want);
    const rank = v => { const p = String(v).split('.').map(Number); let s = 0; if (p[0] === w[0]) s += 100; if (p[1] === w[1]) s += 50; return s; };
    return cand.sort((a,b) => (rank(b) - rank(a)) || verCmp(b,a));
  } catch(e){ logLine('warn', 'Forge 回退版本列表获取失败：' + e.message); return []; }
}
async function forgePromos(mc){
  try {
    const p = await fetchJsonBest('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', 'https://bmclapi2.bangbang93.com/forge/promotions_slim.json');
    const promos = p.promos || {};
    const out = [];
    const seen = {};
    Object.keys(promos).forEach(k => {
      const m = k.match(/^([\d.]+)-(recommended|latest)$/);
      if (!m) return;
      const [mcv, tier] = [m[1], m[2]];
      const ver = promos[k];
      if (!ver) return;
      if (!seen[mcv] || (tier === 'recommended' && seen[mcv].tier !== 'recommended')) seen[mcv] = { ver, tier };
    });
    Object.keys(seen).forEach(mcv => out.push({ mc: mcv, forge: seen[mcv].ver, tier: seen[mcv].tier }));
    out.sort((a,b) => a.mc.localeCompare(b.mc, undefined, { numeric: true }));
    if (out.length) return out.slice(-30);
    throw new Error('promotions 为空');
  } catch(e){
    // 20.5：files.minecraftforge.net 当前不可达、bmclapi2 的 promotions_slim.json 已下线（404），
    // 改用其 forge/minecraft/{mc} 版本列表兜底（实测可用），推荐分支优先、无则取最新 build
    try {
      if (!mc) return [];
      const list = await fetchJson('https://bmclapi2.bangbang93.com/forge/minecraft/' + mc);
      const builds = (list || []).filter(b => b && b.version).sort((a,b) => (b.build||0) - (a.build||0));
      const best = builds.find(b => b.branch === 'recommended') || builds[0];
      if (best) return [{ mc, forge: String(best.version), tier: 'recommended' }];
    } catch(e2){ logLine('warn', 'Forge 版本列表兜底失败：' + e2.message); }
    return [];
  }
}
async function neoforgeVersions(mc){
  try {
    const xml = await (await httpFetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', { headers: { 'User-Agent': 'AOURA-Launcher/4.0' } })).text();
    const vers = Array.from(xml.matchAll(/<version>([^<]+)<\/version>/g)).map(m => m[1]);
    const prefix = mc.startsWith('1.') ? mc.slice(2) + '.' : mc + '.';
    return vers.filter(v => v.startsWith(prefix)).slice(-20);
  } catch(e){ return []; }
}
function javaBin(){
  if (cfg.javaPath && fs.existsSync(cfg.javaPath)) return cfg.javaPath;
  const probe = require('child_process').spawnSync('java', ['-version'], { timeout: 8000, encoding: 'utf8' });
  if (!probe.error && probe.status === 0) return 'java';
  return '';
}
async function patchForgeClient({ mc, versionTag, installerPath, outPath }){
  // 新版 Forge（26.x）：maven 上不存在 forge:...:client（patched minecraft），
  // 必须用安装器内置的 binarypatcher 对原版 jar 本地打补丁生成。
  const jbin = javaBin();
  if (!jbin) throw new Error('安装该 Forge 底层需要 Java 运行时，请先在「设置 → Java 环境」下载 Java 后重试');
  // 原版 client jar：优先 libraries 位置，否则从 versions 复制
  const libClient = path.join(librariesDir(), 'net/minecraft/client/' + mc + '/client-' + mc + '.jar');
  const verJar = path.join(versionsDir(), mc, mc + '.jar');
  if (!fs.existsSync(libClient)){
    if (!fs.existsSync(verJar)) throw new Error('缺少原版 ' + mc + ' 主程序（请先在下载中心下载原版 ' + mc + '）');
    fs.mkdirSync(path.dirname(libClient), { recursive: true });
    fs.copyFileSync(verJar, libClient);
  }
  // 解出 binpatch 与 install_profile
  const zip = new AdmZip(installerPath);
  const dataEntry = zip.getEntries().find(e => e.entryName === 'data/client.lzma');
  if (!dataEntry) throw new Error('安装器缺少 data/client.lzma（不是新版 Forge 结构）');
  const lzmaPath = path.join(path.dirname(installerPath), 'client.lzma');
  fs.writeFileSync(lzmaPath, dataEntry.getData());
  const profEntry = zip.getEntries().find(e => e.entryName === 'install_profile.json');
  if (!profEntry) throw new Error('安装信息缺少 install_profile.json');
  const prof = JSON.parse(zip.readAsText(profEntry));
  const cp = (prof.processors || []).find(p => p.sides && p.sides.includes('client'));
  if (!cp || !cp.jar) throw new Error('安装信息缺少 client 处理步骤');
  // binarypatcher 及其依赖
  const cpItems = [cp.jar, ...(cp.classpath || [])].filter(Boolean);
  const cpDir = path.join(path.dirname(installerPath), 'cp');
  fs.mkdirSync(cpDir, { recursive: true });
  for (const c of cpItems){
    const rel = libPathFromName(c);
    if (!rel) continue;
    const p = path.join(cpDir, path.basename(rel));
    if (!fs.existsSync(p)){
      await multiSourceDownload([mirrorUrl('https://maven.minecraftforge.net/' + rel), 'https://maven.minecraftforge.net/' + rel], p, null, 2);
    }
  }
  const classpath = cpItems.map(c => path.join(cpDir, path.basename(libPathFromName(c)))).join(path.delimiter);
  // 参数替换
  const args = (cp.args || []).map(a => {
    if (typeof a !== 'string') return String(a);
    return a
      .replace('{MINECRAFT_JAR}', libClient)
      .replace('{PATCHED}', outPath)
      .replace('{BINPATCH}', lzmaPath)
      .replace(/\{([A-Z_]+)\}/g, (m, k) => {
        const v = prof.data && prof.data[k];
        return v && typeof v.client === 'string' ? v.client : m;
      });
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const r = require('child_process').spawnSync(jbin, ['-cp', classpath, 'net.minecraftforge.binarypatcher.ConsoleTool', ...args], { timeout: 180000, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.error) throw new Error('运行 Forge patcher 失败：' + r.error.message);
  if (r.status !== 0){
    const tail = String(r.stderr || r.stdout || '').slice(-400);
    throw new Error('Forge patcher 退出码 ' + r.status + '：' + tail);
  }
  if (!fs.existsSync(outPath) || (fs.statSync(outPath).size || 0) < 1000) throw new Error('patcher 未生成 client 主程序');
  return outPath;
}
/* ============ Forge/NeoForge 处理产物（srg/extra/client jar）——官方安装器 processors ============ */
// 1.20+ 的 Forge 安装 = 下载库（installLoader 已做） + 官方安装器处理器：
//   jarsplitter 从原版 client.jar 拆出 slim/extra → ForgeAutoRenamingTool 重命名出 srg → binarypatcher 打出 forge-client.jar。
//   三个产物缺失时游戏在 ModJarMetadata 扫描即崩（Invalid paths argument）。PCL 同款做法：直接运行官方安装器。
function probeForgeProcessed(versionId, mc, isNeo){
  const L = librariesDir();
  let srg = '', extra = '';
  try {
    const dirs = fs.readdirSync(path.join(L, 'net/minecraft/client')).filter(d => d.startsWith(mc + '-'));
    for (const d of dirs){
      const files = fs.readdirSync(path.join(L, 'net/minecraft/client', d));
      const s = files.find(x => x.endsWith('-srg.jar'));
      const e = files.find(x => x.endsWith('-extra.jar'));
      if (s && !srg) srg = path.join(L, 'net/minecraft/client', d, s);
      if (e && !extra) extra = path.join(L, 'net/minecraft/client', d, e);
    }
  } catch(e){}
  const g = isNeo ? 'net/neoforged/neoforge' : 'net/minecraftforge/forge';
  const clientJar = path.join(L, g, versionId, (isNeo ? 'neoforge-' : 'forge-') + versionId + '-client.jar');
  if (!srg || !extra || !fs.existsSync(clientJar)) return false;
  try {
    return fs.statSync(srg).size > 1000 && fs.statSync(extra).size > 1000 && fs.statSync(clientJar).size > 1000;
  } catch(e){ return false; }
}
function forgeProcessedJarPaths(installerPath, versionId, mc){
  const zip = new AdmZip(installerPath);
  const profEntry = zip.getEntries().find(e => e.entryName === 'install_profile.json');
  if (!profEntry) throw new Error('安装信息缺少 install_profile.json');
  const prof = JSON.parse(zip.readAsText(profEntry));
  const isNeo = String(prof.json || '').includes('neoforge') || (prof.processors || []).some(p => String(p.jar || '').includes('neoforge'));
  const mcpRaw = (prof.data && prof.data.MCP_VERSION && prof.data.MCP_VERSION.client) || '';
  const mcpVer = String(mcpRaw).replace(/^'+|'+$/g, '');
  const L = librariesDir();
  const group = isNeo ? 'net/neoforged/neoforge' : 'net/minecraftforge/forge';
  return {
    isNeo,
    mcpVer,
    srg: path.join(L, 'net/minecraft/client/' + mc + '-' + mcpVer + '/client-' + mc + '-' + mcpVer + '-srg.jar'),
    extra: path.join(L, 'net/minecraft/client/' + mc + '-' + mcpVer + '/client-' + mc + '-' + mcpVer + '-extra.jar'),
    client: path.join(L, group + '/' + versionId + '/' + (isNeo ? 'neoforge-' : 'forge-') + versionId + '-client.jar'),
  };
}
async function runForgeInstaller({ installerPath, versionId, mc }){
  const pp = forgeProcessedJarPaths(installerPath, versionId, mc);
  const ok = [pp.srg, pp.extra, pp.client].every(p => fs.existsSync(p) && (fs.statSync(p).size || 0) > 1000);
  if (ok) return pp;
  const jbin = javaBin();
  if (!jbin) throw new Error('运行安装器需要 Java 运行时，请先在「设置 → Java 环境」下载 Java 后重试');
  // 官方安装器要求 launcher_profiles.json 存在（否则报 There is no minecraft launcher profile）
  const launcherProf = path.join(gameDir(), 'launcher_profiles.json');
  if (!fs.existsSync(launcherProf)){
    fs.mkdirSync(gameDir(), { recursive: true });
    const crypto = require('crypto');
    const cid = (crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000');
    fs.writeFileSync(launcherProf, JSON.stringify({ profiles: {}, selectedProfile: '(Default)', clientToken: cid, launcherVersion: 27 }, null, 2));
  }
  logLine('info', '运行官方 ' + (pp.isNeo ? 'NeoForge' : 'Forge') + ' 安装器生成客户端补丁（首次 1-5 分钟，库已预置仅补处理产物）…');
  send('installer:progress', { type: pp.isNeo ? 'neoforge' : 'forge', mc, loader: versionId, stage: 'installer', status: '正在生成客户端补丁（官方安装器）…' });
  const r = require('child_process').spawnSync(jbin, ['-jar', installerPath, '--installClient', gameDir()], { timeout: 600000, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.error) throw new Error('运行 ' + (pp.isNeo ? 'NeoForge' : 'Forge') + ' 安装器失败：' + r.error.message);
  if (r.status !== 0){
    const tail = String(r.stderr || r.stdout || '').slice(-600);
    throw new Error((pp.isNeo ? 'NeoForge' : 'Forge') + ' 安装器退出码 ' + r.status + '：' + tail);
  }
  const ok2 = [pp.srg, pp.extra, pp.client].every(p => fs.existsSync(p) && (fs.statSync(p).size || 0) > 1000);
  if (!ok2) throw new Error('安装器执行完成但未生成全部客户端补丁（srg/extra/client），请重试');
  return pp;
}
async function installLoader(opts){
  if (loaderBusy) throw new Error('已有加载器安装任务进行中');
  loaderBusy = true;
  const { type, mc, loader } = opts;
  const tmp = path.join(cacheDir(), 'loader-' + Date.now().toString(36));
  fs.mkdirSync(tmp, { recursive: true });
  try {
    let versionId = '', jsonObj = null, libs = [], useMavenPath = true;
    let instJarPath = ''; // 28：Forge 安装器 jar 路径（子块内声明，供集成点使用）
    if (type === 'fabric'){
      // Fabric：官方 meta 直接给出完整 profile（无需运行安装器）；28 加重试防瞬断
      const meta = await retryJson('https://meta.fabricmc.net/v2/versions/loader/' + mc, 3);
      const picked = meta.find(x => x.loader.version === loader) || meta.find(x => x.loader.stable) || meta[0];
      if (!picked || !picked.loader) throw new Error('未找到 ' + mc + ' 的 Fabric 加载器版本');
      const prof = await retryJson('https://meta.fabricmc.net/v2/versions/loader/' + mc + '/' + picked.loader.version + '/profile/json', 3);
      if (!prof || !prof.id) throw new Error('Fabric 版本描述解析失败（请检查网络后重试）');
      versionId = prof.id;
      jsonObj = prof;
      libs = (prof.libraries || []).filter(l => l.name).map(l => ({
        name: l.name,
        url: (l.url || 'https://maven.fabricmc.net/') + libPathFromName(l.name)
      }));
      useMavenPath = true;
    } else if (type === 'quilt'){
      // 20.1：Quilt（兼容 Fabric 模组的加载器）：官方 meta 直接给出完整 profile；28 加重试防瞬断
      const meta = await retryJson('https://meta.quiltmc.org/v3/versions/loader/' + mc, 3);
      const picked = meta.find(x => x.loader.version === loader) || meta.find(x => x.loader.stable) || meta[0];
      if (!picked || !picked.loader) throw new Error('未找到 ' + mc + ' 的 Quilt 加载器版本');
      const prof = await retryJson('https://meta.quiltmc.org/v3/versions/loader/' + mc + '/' + picked.loader.version + '/profile/json', 3);
      if (!prof || !prof.id) throw new Error('Quilt 版本描述解析失败（请检查网络后重试）');
      versionId = prof.id;
      jsonObj = prof;
      libs = (prof.libraries || []).filter(l => l.name).map(l => ({
        name: l.name,
        url: (l.url || 'https://maven.quiltmc.org/repository/release/') + libPathFromName(l.name)
      }));
      useMavenPath = true;
    } else {
      // Forge / NeoForge：下载官方安装器 jar（镜像多源）→ 解出版本描述与库清单，免运行安装器
      const isNeo = type === 'neoforge';
      let versionTag = loader;
      if (isNeo){
        if (!versionTag){
          const list = await neoforgeVersions(mc);
          versionTag = list[list.length - 1] || '';
        }
        if (!versionTag) throw new Error('未找到 ' + mc + ' 的 NeoForge 版本');
      } else {
        if (!versionTag){
          const promos = await forgePromos(mc);
          const hit = promos.find(p => p.mc === mc) || promos.find(p => mc.startsWith(p.mc + '-'));
          versionTag = hit ? mc + '-' + hit.forge : '';
        }
        if (!versionTag) throw new Error('未找到 ' + mc + ' 的 Forge 推荐版本');
      }
      // 28：与 PCL 同款下载源——BMCLAPI maven 代理（国内可达、有缓存）首选，官方 maven / files 存档备选
      const jarBmcl = isNeo
        ? 'https://bmclapi2.bangbang93.com/maven/net/neoforged/neoforge/' + versionTag + '/neoforge-' + versionTag + '-installer.jar'
        : 'https://bmclapi2.bangbang93.com/maven/net/minecraftforge/forge/' + versionTag + '/forge-' + versionTag + '-installer.jar';
      const jarOfficial = isNeo
        ? 'https://maven.neoforged.net/releases/net/neoforged/neoforge/' + versionTag + '/neoforge-' + versionTag + '-installer.jar'
        : 'https://maven.minecraftforge.net/net/minecraftforge/forge/' + versionTag + '/forge-' + versionTag + '-installer.jar';
      const jarFiles = isNeo ? '' : 'https://files.minecraftforge.net/maven/net/minecraftforge/forge/' + versionTag + '/forge-' + versionTag + '-installer.jar';
      send('installer:progress', { type, mc, loader: versionTag, stage: 'download' });
      const dest = path.join(tmp, (isNeo ? 'neoforge' : 'forge') + '-installer.jar');
      instJarPath = dest;
      let versionTagFinal = versionTag;
      try {
        const instFast = await pickFastSource([jarBmcl, jarOfficial, jarFiles].filter(Boolean), 10000);
        await multiSourceDownload([jarBmcl, jarOfficial, jarFiles].filter(Boolean), dest, p => {
          send('installer:progress', { type, mc, loader: versionTag, stage: 'download', received: p.received, total: p.total });
        }, 3);
      } catch(e){
        // 28/28：installer 404/网络失败 → 候选版本逐个下载（整合包常声明已撤下的小版本）
        if (isNeo) throw e;
        const cands = await forgeFallbackCandidates(mc, versionTag);
        let altOk = '', altErr = e;
        for (const c of cands.slice(0, 6)){
          const cBmcl = 'https://bmclapi2.bangbang93.com/maven/net/minecraftforge/forge/' + mc + '-' + c + '/forge-' + mc + '-' + c + '-installer.jar';
          const cOff = 'https://maven.minecraftforge.net/net/minecraftforge/forge/' + mc + '-' + c + '/forge-' + mc + '-' + c + '-installer.jar';
          try {
            const cFast = await pickFastSource([cBmcl, cOff], 8000);
            await multiSourceDownload([cBmcl, cOff].filter(Boolean), dest, p => {
              send('installer:progress', { type, mc, loader: c, stage: 'download', received: p.received, total: p.total });
            }, 3);
            altOk = c; break;
          } catch(ce){ altErr = ce; logLine('warn', 'Forge 回退候选 ' + c + ' 仍失败：' + ce.message); }
        }
        if (!altOk) throw altErr;
        logLine('warn', 'Forge ' + versionTag + ' 安装器不可用，自动回退至 ' + altOk);
        versionTagFinal = altOk;
      }
      // 解压安装描述：install_profile.json（库清单）+ version.json（版本描述，inheritsFrom 原版）
      let zip;
      try { zip = new AdmZip(dest); } catch(e){ throw new Error(versionTagFinal + ' 安装器文件损坏：' + e.message); }
      const profEntry = zip.getEntries().find(e => e.entryName === 'install_profile.json');
      if (!profEntry) throw new Error(versionTagFinal + ' 安装信息解析失败（缺少 install_profile.json）');
      const prof = JSON.parse(zip.readAsText(profEntry));
      const vjName = String(prof.json || 'version.json').replace(/^\//, '');
      const vjEntry = zip.getEntries().find(e => e.entryName === vjName || e.entryName === 'version.json');
      if (!vjEntry) throw new Error(versionTagFinal + ' 安装信息解析失败（缺少版本描述文件）');
      const vj = JSON.parse(zip.readAsText(vjEntry));
      if (!vj.id) throw new Error(versionTagFinal + ' 版本描述不完整');
      versionId = vj.id;
      jsonObj = vj;
      const profLibs = (prof.libraries || []).filter(l => l.downloads && l.downloads.artifact && l.downloads.artifact.url).map(l => ({
        name: l.name,
        url: l.downloads.artifact.url
      }));
      // 运行时库（version.json）可能与安装清单不同：优先库自身声明的 URL（libraries.minecraft.net / maven 各有归属），
      // 缺省按官方仓库根拼接；下载时 mirrorUrl 自动映射 BMCLAPI（/maven/、/libraries/），
      // 镜像缺失的库（BMCLAPI 部分缓存 404）自动回退官方源 —— 与 PCL 完全同款的多源容错
      const repoRoot = isNeo ? 'https://maven.neoforged.net/releases/' : 'https://maven.minecraftforge.net/';
      const vjLibs = (vj.libraries || []).filter(l => l.name && !l.natives).map(l => {
        const art = l.downloads && l.downloads.artifact;
        return {
          name: l.name,
          url: (art && art.url) ? art.url : (repoRoot + libPathFromName(l.name))
        };
      });
      const seenRel = {};
      libs = [];
      [...profLibs, ...vjLibs].forEach(l => {
        const rel = libPathFromName(l.name);
        if (!rel || seenRel[rel]) return;
        seenRel[rel] = 1;
        libs.push({ name: l.name, url: l.url });
      });
      useMavenPath = true;
    }
    if (!libs.length) throw new Error(type.toUpperCase() + ' 安装清单为空，请检查网络后重试');

    // 预下载全部库：镜像优先 → 官方兜底，多源重试；12 路并发（大幅提速并降低单库超时概率），失败库统一补两轮
    const total = libs.length;
    send('installer:progress', { type, mc, loader: versionId, stage: 'download', libTotal: total, libDone: 0 });
    let done = 0;
    const failed = [];
    const libQueue = libs.slice();
    const CONC_LOADER = 12;
    async function libWorker(){
      while (libQueue.length){
        const l = libQueue.shift();
        if (!l) return;
        const rel = useMavenPath ? (l.rel || libPathFromName(l.name)) : (l.rel || (l.path || libPathFromName(l.name)));
        const destPath = path.join(librariesDir(), rel);
        if (fs.existsSync(destPath) && (fs.statSync(destPath).size || 0) > 1000){
          done++;
          continue;
        }
        try {
          const libFast = await pickFastSource([mirrorUrl(l.url), l.url], 8000);
          await multiSourceDownload([libFast, libFast === l.url ? mirrorUrl(l.url) : l.url].filter(Boolean), destPath, null, 3);
        } catch(e){
          // 新版 Forge（26.x）：forge:...:client（patched minecraft）在 maven 上不存在，
          // 必须用安装器内置 binarypatcher 对原版 jar 本地打补丁生成
          const cm = l.name && l.name.match(/^net\.minecraftforge:forge:([^:]+):client$/);
          if (cm){
            send('installer:progress', { type, mc, loader: versionId, stage: 'patch' });
            try {
              await patchForgeClient({ mc, versionTag: versionTagFinal, installerPath: dest, outPath: destPath });
              logLine('info', l.name + ' 已由 Forge patcher 本地生成（patched minecraft）');
              done++;
              continue;
            } catch(pe){
              failed.push({ name: l.name, rel: rel, url: l.url });
              logLine('error', l.name + ' 本地生成失败：' + pe.message);
              done++;
              continue;
            }
          }
          failed.push({ name: l.name, rel: rel, url: l.url });
        }
        done++;
        send('installer:progress', { type, mc, loader: versionId, stage: 'download', libTotal: total, libDone: done });
      }
    }
    await Promise.all(Array.from({ length: CONC_LOADER }, libWorker));
    // 补两轮失败的库（第二轮起反序：官方优先、镜像兜底，提升镜像抖动期的成功率）
    for (let round = 0; round < 2 && failed.length; round++){
      const pend = failed.splice(0);
      await Promise.all(pend.map(async f => {
        const destPath = path.join(librariesDir(), f.rel);
        try {
          const fFast = await pickFastSource([f.url, mirrorUrl(f.url)], 8000);
          await multiSourceDownload([fFast, fFast === f.url ? mirrorUrl(f.url) : f.url].filter(Boolean), destPath, null, 5);
        } catch(e){ logLine('error', '库文件下载失败：' + f.name + ' ' + f.rel + '（' + (e.message || e) + '）'); failed.push(f); }
      }));
    }
    if (failed.length){
      throw new Error(failed.length + ' 个依赖库下载失败（网络或文件问题），详见日志。可切换 设置 → 下载源 或稍后重试（已下载部分可续传）');
    }

    // 写入版本描述（modloader 版本无主 jar，启动时经 resolveVersionMeta 继承原版 jar）
    const vDir = path.join(versionsDir(), versionId);
    fs.mkdirSync(vDir, { recursive: true });
    fs.writeFileSync(path.join(vDir, versionId + '.json'), JSON.stringify(jsonObj, null, 2));

    // 28：安装完成后立即补齐原版主程序（Forge/NeoForge 的 version.json 无 downloads.client，继承原版，
    // 依次从 自身 json → 底层原版 json → BMCLAPI /version/{mc}/json 取 client），版本管理不再显示「缺主程序」，
    // 底层原版目录一并补齐，启动即点即玩
    try {
      const baseId = jsonObj.inheritsFrom || versionId;
      const mainJar = path.join(vDir, versionId + '.jar');
      let dj = jsonObj.downloads && jsonObj.downloads.client;
      if (!dj || !dj.url){
        try {
          const bm = JSON.parse(fs.readFileSync(path.join(versionsDir(), baseId, baseId + '.json'), 'utf8'));
          dj = bm.downloads && bm.downloads.client;
        } catch(e){}
      }
      if (!dj || !dj.url){
        try {
          const bmJson = await fetchJson('https://bmclapi2.bangbang93.com/version/' + baseId + '/json');
          dj = bmJson && bmJson.downloads && bmJson.downloads.client;
          if (dj && dj.url){
            const baseDir = path.join(versionsDir(), baseId);
            fs.mkdirSync(baseDir, { recursive: true });
            fs.writeFileSync(path.join(baseDir, baseId + '.json'), JSON.stringify(bmJson, null, 2));
          }
        } catch(e){}
      }
      if (dj && dj.url && (!fs.existsSync(mainJar) || (fs.statSync(mainJar).size || 0) < 100000)){
        send('installer:progress', { type, mc, loader: versionId, stage: 'mainjar', status: '正在补齐原版主程序…' });
        const bmclUrl = 'https://bmclapi2.bangbang93.com/version/' + baseId + '/client';
        const fast = await pickFastSource([bmclUrl, dj.url]);
        await downloadWithRetry(fast, mainJar, null, p => {
          send('installer:progress', { type, mc, loader: versionId, stage: 'mainjar', received: p.received, total: p.total });
        }, 3, fast === dj.url ? bmclUrl : dj.url);
        const baseJar = path.join(versionsDir(), baseId, baseId + '.jar');
        if (!fs.existsSync(baseJar)){
          fs.mkdirSync(path.dirname(baseJar), { recursive: true });
          fs.copyFileSync(mainJar, baseJar);
        }
        logLine('info', versionId + ' 原版主程序已补齐');
      }
    } catch(me){ logLine('warn', versionId + ' 主程序补齐失败（启动时会再次尝试）：' + (me.message || me)); }

    logLine('info', type.toUpperCase() + ' 底层安装完成：' + versionId + '（' + total + ' 个库文件已就位）');
    // 28：Forge/NeoForge 客户端处理产物（client-srg.jar / client-extra.jar / forge-client.jar）
    // 只能由官方安装器的 processors（jarsplitter→重命名→binarypatcher）生成。此前仅下载库+写 json，
    // 启动时 ModJarMetadata 扫描即崩（Invalid paths argument, contained no existing paths）。
    // 此处自动运行官方安装器（PCL 同款方式）补齐三个产物；Fabric/Quilt 无此步骤，跳过。
    if (type === 'forge' || type === 'neoforge'){
      try {
        if (dest && fs.existsSync(dest)){
          const pp = await runForgeInstaller({ installerPath: instJarPath, versionId, mc });
          logLine('info', versionId + ' 处理产物已就位（srg/extra/client，由官方安装器生成）');
          send('installer:progress', { type, mc, loader: versionId, stage: 'installer', status: '处理产物已生成（srg/extra/client）' });
        }
      } catch(ie){
        logLine('error', versionId + ' 官方安装器生成处理产物失败：' + (ie.message || ie) + '（游戏将无法启动，请检查网络与 Java 后重试）');
        send('installer:progress', { type, mc, loader: versionId, stage: 'installer', status: '失败：' + (ie.message || ie).slice(0, 120) });
        throw ie;
      }
    }
    send('installer:progress', { type, mc, loader: versionId, stage: 'done' });
    return scanVersions();
  } catch(e){
    logLine('error', '[' + type.toUpperCase() + ' 加载器安装失败] ' + (e && e.message ? e.message : String(e)));
    throw e;
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch(e){}
    loaderBusy = false;
  }
}

/* ================= 加载器源检测 / 原版+加载器一键下载 ================= */
async function loaderSourceOk(){
  const checks = {
    fabric: 'https://meta.fabricmc.net/v2/versions/loader',
    forge: 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
    neoforge: 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml'
  };
  const out = {};
  await Promise.all(Object.keys(checks).map(async k => {
    try {
      const res = await httpFetch(checks[k], { headers: { 'User-Agent': 'AOURA-Launcher/4.0' }, signal: AbortSignal.timeout(8000) });
      out[k] = !!res.ok;
    } catch(e){ out[k] = false; }
  }));
  return out;
}
async function downloadVersionWithLoader(versionId, loaderType, loaderVersion){
  if (dlToken) throw new Error('已有下载任务进行中');
  await downloadVersion(versionId, { markOriginal: false });
  if (!loaderType) return { ok: true, loader: null };
  const after = await installLoader({ type: loaderType, mc: versionId, loader: loaderVersion || '' });
  return { ok: true, loader: after.length ? after.filter(v => v.installed).map(v => v.id) : [] };
}

/* ================= Java 自动下载（Adoptium） ================= */
async function adoptiumJavaList(){
  try {
    const majors = await javaMajorList();
    if (majors.length) return majors;
  } catch(e){ logLine('warn', '国内镜像 Java 列表解析失败：' + e.message); }
  try {
    const rel = await fetchJson('https://api.adoptium.net/v3/info/available_releases');
    return (rel.available_releases || []).filter(v => [8, 11, 17, 21, 25].includes(v)).reverse();
  } catch(e){ return []; }
}
async function installJava(major){
  const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'aarch64' : 'x64';
  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
  // 1) 多镜像冗余解析最新文件名（清华/南大/华为云/兰大，绕开被墙的 api.adoptium.net）
  let pkgName = null, binName = 'Java ' + major;
  try {
    pkgName = await javaFileName(major, arch, osName);
    binName = pkgName.replace(/\.(zip|tar\.gz)$/, '');
    logLine('info', 'Java ' + major + ' 国内镜像命中：' + pkgName);
  } catch(e){
    logLine('warn', '国内镜像目录解析失败：' + e.message + '，改用 Adoptium API');
    try {
      const meta = await fetchJson('https://api.adoptium.net/v3/assets/latest/' + major + '/hotspot?os=' + osName + '&architecture=' + arch + '&image_type=jdk');
      const asset = meta && meta[0];
      if (asset && asset.binary && asset.binary.package){
        pkgName = asset.binary.package.name;
        binName = asset.binary.image_name || binName;
      }
    } catch(e2){ logLine('warn', 'Adoptium API 查询失败：' + e2.message); }
  }
  if (!pkgName) throw new Error('未找到可用的 Java ' + major + ' 下载（请检查网络后重试）');
  // 2) 构建多下载源：清华/南大/华为云/兰大 轮询，全部 403/失败自动换下一源
  const urls = JAVA_MIRRORS.map(m => m.base + '/' + major + '/jdk/' + arch + '/' + osName + '/' + pkgName);
  const destDir = path.join(dataRoot(), 'java', 'jdk-' + major);
  fs.mkdirSync(destDir, { recursive: true });
  const tmpZip = path.join(cacheDir(), 'jdk-' + major + '-' + Date.now().toString(36) + '.' + ext);
  send('java:progress', { major, stage: 'download', name: binName });
  await downloadTryUrls(urls, tmpZip, null, p => {
    send('java:progress', { major, stage: 'download', received: p.received, total: p.total });
  });
  send('java:progress', { major, stage: 'extract' });
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  try {
    if (ext === 'tar.gz'){
      await extractTarGz(tmpZip, path.dirname(destDir));
    } else {
      const zip = new AdmZip(tmpZip);
      zip.extractAllTo(path.dirname(destDir), true);
    }
  } catch(e){ throw new Error('解压失败：' + e.message); }
  // 找到真正的 jdk 目录（兼容顶层目录名带 + 号等格式）
  const inner = fs.readdirSync(path.dirname(destDir)).find(n => /^jdk/i.test(n) && fs.existsSync(path.join(path.dirname(destDir), n, 'bin', javaExeName())));
  const finalDir = inner ? path.join(path.dirname(destDir), inner) : destDir;
  if (!fs.existsSync(path.join(finalDir, 'bin', javaExeName()))) throw new Error('Java 解压后未找到 java 可执行文件，请重试');
  try { fs.rmSync(tmpZip, { force: true }); } catch(e){}
  send('java:progress', { major, stage: 'done', dir: finalDir });
  return finalDir;
}

/* 内置 tar.gz 解压（跨平台兜底，Windows 主路径为 zip） */
const zlib = require('zlib');
function extractTarGz(file, destDir){
  return new Promise((resolve, reject) => {
    const chunks = [];
    fs.createReadStream(file).on('data', c => chunks.push(c)).on('end', () => {
      zlib.gunzip(Buffer.concat(chunks), (err, buf) => {
        if (err) return reject(err);
        try { untarBuffer(buf, destDir); resolve(); } catch(e){ reject(e); }
      });
    }).on('error', reject);
  });
}
function untarBuffer(buf, destDir){
  let off = 0;
  const dec = new TextDecoder();
  while (off + 512 <= buf.length){
    const h = buf.slice(off, off + 512);
    if (h.every(b => b === 0)) break;
    const name = dec.decode(h.slice(0, 100)).replace(/\0.*$/, '');
    const size = parseInt(dec.decode(h.slice(124, 136)).replace(/\0.*$/, '').trim(), 8) || 0;
    const type = String.fromCharCode(h[156]);
    const target = path.join(destDir, name);
    if (type === '5'){ fs.mkdirSync(target, { recursive: true }); }
    else if (name && type !== '0' && type !== '\0'){ /* 忽略非普通文件 */ }
    else if (name){
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf.slice(off + 512, off + 512 + size));
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
}

/* ================= 模组管理 ================= */
function modsDirFor(versionId){
  // 版本隔离：模组目录跟随所选版本；否则使用共享 mods 目录
  return cfg.isolation && versionId ? path.join(versionsDir(), versionId, 'mods') : path.join(gameDir(), 'mods');
}
function listMods(versionId){
  const dir = modsDirFor(versionId);
  try { fs.mkdirSync(dir, { recursive: true }); } catch(e){}
  if (versionId && !cfg.isolation){ /* 非隔离时仍展示共享目录，dir 不变 */ }
  const out = [];
  try {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      if (!e.isFile()) return;
      if (!/\.jar(\.disabled)?$/i.test(e.name)) return;
      const full = path.join(dir, e.name);
      const st = fs.statSync(full);
      const disabled = /\.disabled$/i.test(e.name);
      out.push({
        name: e.name,
        display: disabled ? e.name.replace(/\.disabled$/i, '') : e.name,
        size: st.size,
        enabled: !disabled,
        path: full
      });
    });
  } catch(e){}
  out.sort((a,b) => b.size - a.size);
  return out;
}
function setModEnabled(name, enabled, versionId){
  const dir = modsDirFor(versionId);
  const base = path.join(dir, name);
  const disabled = base + '.disabled';
  if (enabled && fs.existsSync(disabled)) fs.renameSync(disabled, base);
  if (!enabled && fs.existsSync(base)) fs.renameSync(base, disabled);
  return listMods();
}
function deleteMod(name, versionId){
  const dir = modsDirFor(versionId);
  const base = path.join(dir, name);
  const disabled = base + '.disabled';
  if (fs.existsSync(base)) fs.rmSync(base, { force: true });
  if (fs.existsSync(disabled)) fs.rmSync(disabled, { force: true });
  return listMods();
}

/* ================= 版本操作 ================= */
function deleteVersion(id){
  const dir = path.join(versionsDir(), id);
  // 16.0：被其他已装版本引用为底层依赖时禁止删除，防止「带底层版本缺主程序」
  const all = scanVersions();
  const self = all.find(v => v.id === id);
  // baseRefs = 引用该版本的版本列表（scanVersions 中 refs[baseId] 收集所得）
  const users = (self && Array.isArray(self.baseRefs)) ? self.baseRefs.filter(u => u !== id).map(u => all.find(v => v.id === u)).filter(Boolean) : [];
  if (users.length){
    const names = users.slice(0, 3).map(u => '「' + u.id + '」').join('、');
    const more = users.length > 3 ? ' 等 ' + users.length + ' 个版本' : '';
    throw new Error(id + ' 是 ' + names + more + ' 的底层依赖，删除后将导致其无法启动（已取消删除）');
  }
  if (id === cfg.currentVersion) cfg.currentVersion = '';
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  saveConfig();
  return scanVersions();
}
function duplicateVersion(id, newId){
  const src = path.join(versionsDir(), id);
  const dst = path.join(versionsDir(), newId);
  if (!fs.existsSync(src)) throw new Error('版本不存在：' + id);
  if (fs.existsSync(dst)) throw new Error('目标版本已存在：' + newId);
  fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src).forEach(f => {
    fs.copyFileSync(path.join(src, f), path.join(dst, f));
  });
  const jf = path.join(dst, newId + '.json');
  const oldJf = path.join(dst, id + '.json');
  if (fs.existsSync(oldJf)){
    try {
      const meta = JSON.parse(fs.readFileSync(oldJf, 'utf8'));
      fs.writeFileSync(jf, JSON.stringify(meta, null, 2));
      fs.rmSync(oldJf, { force: true });
    } catch(e){}
  }
  return scanVersions();
}

/* ================= 头像 ================= */
async function uploadAvatar(){
  const r = await dialog.showOpenDialog(win, {
    title: '选择头像图片',
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths.length) return null;
  const src = r.filePaths[0];
  fs.copyFileSync(src, avatarPath());
  return avatarPath();
}
function removeAvatar(){
  try { fs.rmSync(avatarPath(), { force: true }); } catch(e){}
  return true;
}

/* ================= IPC ================= */
let win = null;
function registerIpc(){
  ipcMain.handle('config:get', () => cfg);
  ipcMain.handle('config:set', (e, patch) => {
    Object.assign(cfg, patch || {});
    if (cfg.gameDir && !fs.existsSync(cfg.gameDir)) cfg.gameDir = '';
    saveConfig();
    return cfg;
  });
  ipcMain.handle('minecraft:detect', () => ({
    gameDir: gameDir(),
    exists: fs.existsSync(gameDir()),
    versions: scanVersions()
  }));
  ipcMain.handle('java:detect', () => detectJavaList());
  ipcMain.handle('versions:list', () => scanVersions());
  ipcMain.handle('launch:start', async (e, versionId) => {
    try {
      await launchGame(versionId);
      return { ok: true };
    } catch(err){
      send('launch:log', { level: 'error', text: '启动失败：' + err.message });
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('launch:stop', () => { stopGame(); return true; });
  // 28：下载功能已全面恢复——版本清单与下载入口完全可用（BMCLAPI / Mojang 多源加速）
  ipcMain.handle('download:manifest', () => getManifest());
  ipcMain.handle('download:versionStart', async (e, versionId, opts) => {
    try {
      await downloadVersion(versionId);
      return { ok: true };
    }
    catch(err){
      if (err.message !== 'CANCELLED') logLine('error', '下载 ' + versionId + ' 失败：' + err.message);
      return { ok: false, error: err.message === 'CANCELLED' ? '任务已取消' : err.message };
    }
  });
  ipcMain.handle('download:versionWithLoader', async (e, versionId, loaderType, loaderVersion) => {
    try {
      const r = await downloadVersionWithLoader(versionId, loaderType || '', loaderVersion || '');
      return { ok: true, loader: r.loader };
    }
    catch(err){
      if (err.message !== 'CANCELLED') logLine('error', '下载 ' + versionId + '（加载器 ' + (loaderType || '无') + '）失败：' + err.message);
      return { ok: false, error: err.message === 'CANCELLED' ? '任务已取消' : err.message };
    }
  });
  ipcMain.handle('loader:sourceOk', () => loaderSourceOk());
  ipcMain.handle('website:open', () => {
    const w = new BrowserWindow({
      width: 1280, height: 860, minWidth: 900, minHeight: 640,
      title: 'AOURA 启动器 · 官方网站 · 由珉爱制作',
      autoHideMenuBar: true,
      backgroundColor: '#03060c',
      icon: path.join(__dirname, 'assets', 'icon.ico')
    });
    w.loadFile(path.join(__dirname, 'renderer', 'website', 'index.html'));
    return { ok: true };
  });
  ipcMain.handle('terracotta:start', () => tcStart());
  ipcMain.handle('terracotta:stop', () => tcStop());
  ipcMain.handle('terracotta:state', () => tcRequest('/state', 5000));
  ipcMain.handle('terracotta:scan', (e, player) => tcRequest('/state/scanning?player=' + encodeURIComponent(player || ''), 6000));
  ipcMain.handle('terracotta:guest', (e, room, player) => tcRequest('/state/guesting?room=' + encodeURIComponent(room || '') + '&player=' + encodeURIComponent(player || ''), 6000));
  ipcMain.handle('terracotta:ide', () => tcRequest('/state/ide', 5000));
  ipcMain.handle('terracotta:meta', () => tcRequest('/meta', 5000));
  ipcMain.handle('logs:export', async () => {
    const src = logFilePath();
    let content = '';
    try { content = fs.existsSync(src) ? fs.readFileSync(src, 'utf8') : ''; } catch(e){}
    let downloadsDir = dataRoot();
    try { downloadsDir = app.getPath('downloads'); } catch(e){}
    let r = null;
    try {
      r = await dialog.showSaveDialog(win, {
        title: '导出启动日志',
        defaultPath: path.join(downloadsDir, 'AOURA-launcher.log'),
        filters: [{ name: '日志文件', extensions: ['log', 'txt'] }]
      });
    } catch(e){
      // 对话框不可用（无桌面环境/权限等）：直接写入安装目录 logs，保证用户仍能拿到日志
      const fb = path.join(dataRoot(), 'logs', 'AOURA-launcher-export.log');
      try { fs.writeFileSync(fb, content, 'utf8'); return { ok: true, path: fb, note: '系统保存对话框不可用，已导出到安装目录 logs 下' }; }
      catch(e2){ return { ok: false, error: '导出失败：' + String(e && e.message || e) }; }
    }
    if (r.canceled || !r.filePath){
      // 用户取消对话框：也落一份到安装目录 logs，方便直接取用
      const fb = path.join(dataRoot(), 'logs', 'AOURA-launcher-export.log');
      try { fs.writeFileSync(fb, content, 'utf8'); return { ok: true, path: fb, note: '已同时导出到安装目录 logs 下' }; }
      catch(e){ return { ok: false, canceled: true }; }
    }
    try { fs.writeFileSync(r.filePath, content, 'utf8'); }
    catch(e){ return { ok: false, error: String(e && e.message || e) }; }
    return { ok: true, path: r.filePath };
  });
  ipcMain.handle('app:info', () => ({
    version: '28.0.1',
    electron: process.versions.electron || '',
    chrome: process.versions.chrome || '',
    node: process.versions.node || '',
    // 28：鸿蒙 PC 适配——上报运行平台，前端关于页据此展示系统支持状态
    platform: process.platform,
    osName: (function(){
      if (process.platform === 'win32') return 'Windows';
      if (process.platform === 'darwin') return 'macOS';
      if (process.platform === 'linux'){
        try {
          const osrel = require('fs').readFileSync('/etc/os-release', 'utf8');
          if (/HarmonyOS|OpenHarmony|ohos/i.test(osrel)) return 'HarmonyOS PC（鸿蒙 PC）';
        } catch(e){}
        return 'Linux';
      }
      return process.platform;
    })(),
    harmonyOs: (function(){
      // HarmonyOS NEXT / OpenHarmony 特征探测
      try {
        if (process.platform !== 'linux') return false;
        const osrel = require('fs').readFileSync('/etc/os-release', 'utf8');
        return /HarmonyOS|OpenHarmony|ohos/i.test(osrel);
      } catch(e){ return false; }
    })(),
    dataDir: dataRoot(),
    gameDir: gameDir(),
    exeDir: path.dirname(app.getPath('exe'))
  }));
  // 28.0.1：沙箱定位修正——沙箱为鸿蒙 PC 端专属创新特性（鸿蒙无法直跑 Java 时自动建容器沙箱运行游戏）
  // Windows 端原生直跑、无需沙箱。此处仅返回鸿蒙沙箱策略说明。
  ipcMain.handle('sandbox:info', () => ({
    ok: true,
    windows: 'Windows 原生直跑，无需沙箱',
    harmony: '鸿蒙 PC 专属沙箱：当系统无法直接运行 Java 游戏时，AOURA 自动创建容器沙箱（隔离 Java 运行时），游戏在沙箱内正常游玩'
  }));
  ipcMain.handle('ms:deviceCode', () => msDeviceCode());
  ipcMain.handle('ms:poll', async (e, d) => msPollToken(d && d.deviceCode, d && d.interval));
  ipcMain.handle('ms:complete', async (e, d) => msCompleteLogin(d.accessToken, d.refreshToken));
  ipcMain.handle('ms:logout', () => { msLogout(); return { ok: true }; });
  ipcMain.handle('ms:status', () => {
    const a = cfg.msAuth;
    return {
      authType: cfg.authType || 'offline',
      needClientId: !msClientId(),
      name: a ? a.mcName : (cfg.offlineName || 'Player'),
      owns: a ? !!a.owns : null,
      uuid: a ? a.mcUuid : null
    };
  });
  ipcMain.handle('ms:setClientId', (e, id) => {
    cfg.msClientId = String(id || '').trim();
    saveConfig();
    return { ok: true };
  });
  ipcMain.handle('download:cancel', () => { cancelDownload(); return true; });
  /* 20.2：任务中心删除已下载文件（限游戏目录/版本目录内，防误删其他文件） */
  ipcMain.handle('res:removeFile', (e, dir, name) => {
    try {
      if (!dir || !name) return { ok: false, error: '参数不完整' };
      const d = path.resolve(String(dir));
      const safe1 = path.resolve(gameDir());
      const safe2 = path.resolve(versionsDir());
      if (d.indexOf(safe1) !== 0 && d.indexOf(safe2) !== 0) return { ok: false, error: '路径不在游戏/版本目录内，已拒绝' };
      if (/[\\/:*?"<>|]/.test(String(name))) return { ok: false, error: '非法文件名' };
      const f = path.join(d, path.basename(String(name)));
      if (!fs.existsSync(f)) return { ok: false, error: '文件不存在' };
      fs.unlinkSync(f);
      logLine('info', '任务中心已删除文件：' + f);
      return { ok: true };
    } catch(err){ return { ok: false, error: err.message }; }
  });
  ipcMain.handle('modrinth:search', (e, q, type, version, loader) => modrinthSearch(q, type, 24, version, loader));
  ipcMain.handle('modrinth:project', (e, id) => modrinthProject(id));
  ipcMain.handle('modrinth:download', (e, id, type) => modrinthDownload(id, type));
  ipcMain.handle('modrinth:downloadVersion', (e, id, versionId, type) => modrinthDownloadVersion(id, versionId, type));
  /* 加载器安装 */
  ipcMain.handle('loader:fabricVersions', (e, mc) => fabricLoaderVersions(mc));
  ipcMain.handle('translate:text', async (e, text) => {
    if (!text || !text.trim()) return { ok: false, msg: '空文本' };
    try {
      const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.slice(0, 500)) + '&langpair=en|zh-CN';
      const res = await httpFetch(url, { headers: { 'User-Agent': 'AOURA-Launcher/4.0' } });
      if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
      const j = await res.json();
      const t = j && j.responseData && j.responseData.translatedText;
      if (t && t !== text) return { ok: true, text: t };
      throw new Error('翻译无结果');
    } catch(e){
      try {
        const u2 = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=' + encodeURIComponent(text.slice(0, 1500));
        const r2 = await httpFetch(u2, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const j2 = await r2.json();
        const segs = (j2 && j2[0] || []).map(s => s && s[0]).filter(Boolean);
        if (segs.length) return { ok: true, text: segs.join('') };
      } catch(e2){}
      return { ok: false, msg: e.message };
    }
  });
  /* 20.1：OptiFine 一键安装（BMCLAPI /optifine API，实测可用；要求对应原版已安装） */
  ipcMain.handle('optifine:list', async (e, mc) => {
    try {
      const arr = await retryJson('https://bmclapi2.bangbang93.com/optifine/' + encodeURIComponent(mc), 3);
      if (!Array.isArray(arr)) throw new Error('未获取到 OptiFine 版本列表');
      return { ok: true, list: arr.map(x => ({ filename: x.filename, type: x.type, patch: x.patch, forge: x.forge || '' })).slice(0, 60) };
    } catch(err){ return { ok: false, error: err.message }; }
  });
  ipcMain.handle('optifine:install', async (e, mc, type, patch) => {
    try {
      mc = String(mc || '').trim(); type = String(type || '').trim(); patch = String(patch || '').trim();
      if (!mc || !type || !patch) return { ok: false, error: '参数不完整' };
      const base = path.join(versionsDir(), mc);
      if (!fs.existsSync(base) || !fs.existsSync(path.join(base, mc + '.json'))){
        return { ok: false, error: '请先下载并安装原版 ' + mc + '，再安装 OptiFine（OptiFine 基于原版运行）' };
      }
      const tag = type + '_' + patch;
      const vid = 'OptiFine_' + mc + '_' + tag;
      const vdir = path.join(versionsDir(), vid);
      if (fs.existsSync(path.join(vdir, vid + '.json'))) return { ok: false, error: '已安装过该版本：' + vid };
      fs.mkdirSync(vdir, { recursive: true });
      const libPath = 'optifine/OptiFine/' + mc + '_' + tag + '/OptiFine-' + mc + '_' + tag + '.jar';
      const jarDest = path.join(vdir, libPath);
      fs.mkdirSync(path.dirname(jarDest), { recursive: true });
      const dl = 'https://bmclapi2.bangbang93.com/optifine/' + encodeURIComponent(mc) + '/' + encodeURIComponent(type) + '/' + encodeURIComponent(patch);
      await downloadWithRetry(dl, jarDest, null, null, 3);
      const json = {
        id: vid,
        inheritsFrom: mc,
        time: new Date().toISOString(),
        releaseTime: new Date().toISOString(),
        type: 'release',
        mainClass: 'optifine.OptiFineTweaker',
        minecraftArguments: '--tweakClass optifine.OptiFineTweaker',
        libraries: [
          { name: 'net.minecraft:launchwrapper:1.12', url: 'https://libraries.minecraft.net/' },
          { name: 'optifine:OptiFine:' + mc + '_' + tag, url: 'file:///' + vdir.replace(/\\/g, '/') + '/' }
        ]
      };
      fs.writeFileSync(path.join(vdir, vid + '.json'), JSON.stringify(json, null, 2));
      logLine('info', 'OptiFine 安装完成：' + vid);
      return { ok: true, name: vid };
    } catch(err){ return { ok: false, error: err.message }; }
  });
  ipcMain.handle('loader:forgePromos', () => forgePromos());
  ipcMain.handle('loader:forgeVersions', (e, mc) => forgeVersionsFor(mc));
  ipcMain.handle('loader:neoforgeVersions', (e, mc) => neoforgeVersions(mc));
  ipcMain.handle('loader:install', async (e, opts) => {
    try { return { ok: true, versions: await installLoader(opts) }; }
    catch(err){ return { ok: false, error: err.message }; }
  });
  /* Java 自动下载 */
  ipcMain.handle('java:available', () => adoptiumJavaList());
  ipcMain.handle('java:install', async (e, major) => {
    try { return { ok: true, dir: await installJava(major) }; }
    catch(err){ return { ok: false, error: err.message }; }
  });
  /* 模组管理 */
  ipcMain.handle('mods:list', (e, versionId) => listMods(versionId || ''));
  ipcMain.handle('mods:setEnabled', (e, name, enabled, versionId) => setModEnabled(name, enabled, versionId || ''));
  ipcMain.handle('mods:delete', (e, name, versionId) => deleteMod(name, versionId || ''));
  /* 版本操作 */
  ipcMain.handle('versions:delete', (e, id) => deleteVersion(id));
  ipcMain.handle('versions:duplicate', (e, id, newId) => duplicateVersion(id, newId));
  /* 28：版本主程序补齐（旧安装的加载器版本缺主 jar 时一键补下，BMCLAPI 同款源） */
  ipcMain.handle('versions:repairMain', async (e, versionId) => {
    try {
      const vDir = path.join(versionsDir(), versionId);
      const jf = path.join(vDir, versionId + '.json');
      if (!fs.existsSync(jf)) return { ok: false, msg: '版本不存在：' + versionId };
      const meta = JSON.parse(fs.readFileSync(jf, 'utf8'));
      const dj = meta.downloads && meta.downloads.client;
      if (!dj || !dj.url) return { ok: false, msg: '该版本缺少主程序下载信息' };
      const baseId = meta.inheritsFrom || versionId;
      const mainJar = path.join(vDir, versionId + '.jar');
      fs.mkdirSync(vDir, { recursive: true });
      const bmclUrl = 'https://bmclapi2.bangbang93.com/version/' + baseId + '/client';
      const fast = await pickFastSource([bmclUrl, dj.url]);
      await downloadWithRetry(fast, mainJar, null, null, 3, fast === dj.url ? bmclUrl : dj.url);
      const baseJar = path.join(versionsDir(), baseId, baseId + '.jar');
      if (!fs.existsSync(baseJar)){
        fs.mkdirSync(path.dirname(baseJar), { recursive: true });
        fs.copyFileSync(mainJar, baseJar);
      }
      logLine('info', versionId + ' 主程序已补齐（' + Math.round(fs.statSync(mainJar).size / 1048576 * 10) / 10 + ' MB）');
      // 28：Forge/NeoForge 版本同时补齐 3 个处理产物（srg/extra/client）——重新拉取安装器运行
      const isForge = versionId.includes('-forge-') || versionId.includes('-neoforge-');
      if (isForge){
        try {
          const isNeo = versionId.includes('-neoforge-');
          const g = isNeo ? 'net/neoforged/neoforge' : 'net/minecraftforge/forge';
          // 28：installer 路径段 = {mc}-{ver}（如 1.20.1-47.3.39），不是 versionId（1.20.1-forge-47.3.39）
          const vtag = versionId.replace(isNeo ? '-neoforge-' : '-forge-', '-');
          const tmpI = path.join(cacheDir(), 'repair-' + Date.now().toString(36) + (isNeo ? '-neo' : '-forge') + '-installer.jar');
          fs.mkdirSync(path.dirname(tmpI), { recursive: true });
          const u1 = 'https://bmclapi2.bangbang93.com/maven/' + g + '/' + vtag + '/' + (isNeo ? 'neoforge-' : 'forge-') + vtag + '-installer.jar';
          const u2 = isNeo
            ? 'https://maven.neoforged.net/releases/' + g + '/' + vtag + '/' + (isNeo ? 'neoforge-' : 'forge-') + vtag + '-installer.jar'
            : 'https://maven.minecraftforge.net/net/minecraftforge/forge/' + vtag + '/forge-' + vtag + '-installer.jar';
          const f = await pickFastSource([u1, u2], 8000);
          await multiSourceDownload([f, f === u2 ? u1 : u2].filter(Boolean), tmpI, null, 3);
          const baseId = meta.inheritsFrom || versionId;
          await runForgeInstaller({ installerPath: tmpI, versionId, mc: baseId });
          logLine('info', versionId + ' 处理产物已补齐（srg/extra/client）');
        } catch(ie){
          logLine('warn', versionId + ' 处理产物补齐失败（下次重装底层可自动补齐）：' + (ie.message || ie));
        }
      }
      return { ok: true, versions: scanVersions() };
    } catch(err){
      logLine('error', versionId + ' 主程序补齐失败：' + (err.message || err));
      return { ok: false, msg: (err.message || err) + '（可稍后重试或切换下载源）' };
    }
  });
  /* 头像 */
  ipcMain.handle('avatar:default', () => {
    try {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4de3ff"/><stop offset="0.55" stop-color="#4fb2ff"/><stop offset="1" stop-color="#a78bff"/></linearGradient></defs><rect width="128" height="128" rx="32" fill="url(#g)"/><circle cx="64" cy="54" r="22" fill="rgba(255,255,255,.85)"/><path d="M30 104c6-20 19-31 34-31s28 11 34 31" fill="rgba(255,255,255,.85)"/></svg>';
      const img = require('electron').nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
      fs.writeFileSync(avatarPath(), img.toPNG());
      return true;
    } catch (e) { return false; }
  });
  ipcMain.handle('avatar:upload', () => uploadAvatar());
  ipcMain.handle('avatar:remove', () => removeAvatar());
  ipcMain.handle('avatar:path', () => (fs.existsSync(avatarPath()) ? avatarPath() : ''));
  ipcMain.handle('dialog:pickDir', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: '选择 .minecraft 游戏目录' });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  });
  /* ============ 版本资源管理：模组 / 存档 / 光影 / 整合包 ============ */
  ipcMain.handle('mgr:list', (e, { kind, versionId }) => {
    const base = mgrBase(kind, versionId);
    if (!fs.existsSync(base)) return [];
    const isMod = kind === 'mods', isSave = kind === 'saves', isShade = kind === 'shaderpacks', isPack = kind === 'packs';
    let names;
    try { names = fs.readdirSync(base); } catch (err) { return []; }
    const out = [];
    for (const n of names.sort((a, b) => a.localeCompare(b))){
      const p = path.join(base, n);
      let st = null; try { st = fs.statSync(p); } catch (err) {}
      if (!st) continue;
      const isDir = st.isDirectory();
      if (isMod){
        if (!/\.jar(\.disabled)?$/i.test(n)) continue;
        out.push({ name: n.replace(/\.disabled$/i, ''), enabled: !/\.disabled$/i.test(n), dir: false, size: st.size, mtime: st.mtimeMs });
      } else if (isSave){
        if (!isDir) continue;
        if (!fs.existsSync(path.join(p, 'level.dat'))) continue;
        const tag = saveDisplayName(p);
        out.push({ name: n, label: tag || n, dir: true, size: st.size, mtime: st.mtimeMs });
      } else if (isShade){
        if (!isDir && !/\.zip$/i.test(n)) continue;
        out.push({ name: n, dir: isDir, size: st.size, mtime: st.mtimeMs });
      } else if (isPack){
        if (!isDir) continue;
        const hasJson = fs.existsSync(path.join(p, 'version.json')) || fs.existsSync(path.join(p, 'mcdir'));
        if (!hasJson) continue;
        out.push({ name: n, dir: true, size: st.size, mtime: st.mtimeMs });
      }
    }
    return out;
  });
  ipcMain.handle('mgr:toggle', (e, { kind, name }) => {
    if (kind !== 'mods') return { ok: false, msg: '仅模组支持启用/禁用' };
    const base = mgrBase('mods', '');
    const on = path.join(base, name + '.jar');
    const off = path.join(base, name + '.jar.disabled');
    if (fs.existsSync(on)){ fs.renameSync(on, off); return { ok: true, enabled: false }; }
    if (fs.existsSync(off)){ fs.renameSync(off, on); return { ok: true, enabled: true }; }
    return { ok: false, msg: '模组文件不存在：' + name };
  });
  ipcMain.handle('mgr:delete', (e, { kind, name, versionId }) => {
    const base = mgrBase(kind, versionId);
    const p = kind === 'mods'
      ? (fs.existsSync(path.join(base, name + '.jar')) ? path.join(base, name + '.jar') : path.join(base, name + '.jar.disabled'))
      : path.join(base, name);
    if (!fs.existsSync(p)) return { ok: false, msg: '文件不存在' };
    fs.rmSync(p, { recursive: true, force: true });
    return { ok: true };
  });
  ipcMain.handle('mgr:open', (e, { kind, versionId }) => {
    const base = mgrBase(kind, versionId);
    fs.mkdirSync(base, { recursive: true });
    shell.openPath(base);
    return true;
  });
  ipcMain.handle('mgr:importSaves', async (e, versionId) => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      title: '导入存档（zip，内含世界文件夹或 level.dat）',
      filters: [{ name: '存档压缩包', extensions: ['zip'] }]
    });
    if (r.canceled || !r.filePaths.length) return { ok: false, msg: '已取消' };
    const src = r.filePaths[0];
    const savesDir = mgrBase('saves', versionId || '');
    fs.mkdirSync(savesDir, { recursive: true });
    const tmp = path.join(cacheDir(), 'save-' + Date.now().toString(36));
    fs.mkdirSync(tmp, { recursive: true });
    try {
      const saveName = path.basename(src);
      send('save:importProgress', { name: saveName, pct: 5, status: '解压存档压缩包…', path: savesDir });
      await extractZip(src, tmp);
      // 层级识别：找到所有含 level.dat 的世界目录
      const worlds = [];
      const walk = (d, rel) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })){
          if (!e.isDirectory()) continue;
          const p = path.join(d, e.name);
          if (fs.existsSync(path.join(p, 'level.dat'))){ worlds.push({ dir: p, name: rel ? rel + '/' + e.name : e.name }); }
          else walk(p, rel ? rel + '/' + e.name : e.name);
        }
      };
      walk(tmp, '');
      if (!worlds.length){
        send('save:importProgress', { name: saveName, pct: 100, status: '压缩包内未找到世界存档（缺少 level.dat）', ok: false, path: savesDir });
        fs.rmSync(tmp, { recursive: true, force: true });
        return { ok: false, msg: '压缩包内未找到世界存档（缺少 level.dat）' };
      }
      send('save:importProgress', { name: saveName, pct: 55, status: '识别到 ' + worlds.length + ' 个世界，开始归置…', path: savesDir });
      let count = 0;
      for (const w of worlds){
        const baseName = path.basename(w.dir);
        let target = path.join(savesDir, baseName), n = 2;
        while (fs.existsSync(target)){ target = path.join(savesDir, baseName + '_' + n); n++; }
        fs.renameSync(w.dir, target);
        count++;
        send('save:importProgress', { name: saveName, pct: 55 + Math.round(count / worlds.length * 40), status: '归置存档 ' + count + '/' + worlds.length, path: savesDir });
      }
      fs.rmSync(tmp, { recursive: true, force: true });
      send('save:importProgress', { name: saveName, pct: 100, status: '导入完成：' + count + ' 个世界存档', ok: true, path: savesDir });
      return { ok: true, name: count + ' 个世界存档', count };
    } catch (err) {
      try { send('save:importProgress', { name: path.basename(src), pct: 100, status: '导入失败：' + (err.message || err), ok: false }); } catch(e){}
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch(e){}
      return { ok: false, msg: '导入失败：' + (err.message || err) };
    }
  });
async function importPackFromFile(src, onProgress){
  const base = path.basename(src).replace(/\.(zip|mrpack)$/i, '');
  const target = path.join(versionsDir(), base);
  const step = (pct, status) => { try { if (onProgress) onProgress({ pct, status }); } catch(e){} };
  if (fs.existsSync(target)) return { ok: false, msg: '已存在同名版本目录：' + base + '，请重命名后重试' };
  fs.mkdirSync(target, { recursive: true });
  try {
    step(8, '解压整合包…');
    await extractZip(src, target);
    step(30, '解析整合包…');
    const json = path.join(target, 'version.json');
    if (!fs.existsSync(json)){
      // CurseForge 包：version.json 常在 minecraft/ 子目录，搬移上来
      const subJson = path.join(target, 'minecraft', 'version.json');
      if (fs.existsSync(subJson)){
        fs.renameSync(subJson, json);
        try { fs.rmSync(path.join(target, 'minecraft'), { recursive: true, force: true }); } catch(e){}
      }
    }
    if (fs.existsSync(json)){
      // 20.7：version.json 存在但仅含官方版本元数据（无 mods/overrides）时，直接归置同结构文件
      step(100, '导入完成');
      return { ok: true, name: base, needLoader: false };
    }
    // CurseForge 整合包：解析 manifest.json（根目录 mods/*.jar + overrides/），自动安装模组加载器
    const cfManifest = path.join(target, 'manifest.json');
    if (fs.existsSync(cfManifest)){
      try {
        const idx = JSON.parse(fs.readFileSync(cfManifest, 'utf8'));
        const mc = (idx.minecraft && idx.minecraft.version) || '';
        const mls = (idx.minecraft && idx.minecraft.modLoaders) || [];
        const ml = (mls.find && mls.find(m => m && m.primary)) || mls[0] || null;
        let loaderType = '', loaderId = '';
        if (ml && ml.id){
          const m = String(ml.id).match(/^(forge|fabric|neoforge|quilt)-?(.*)$/i);
          if (m){ loaderType = m[1].toLowerCase(); loaderId = m[2] || ''; }
        }
        if (!mc){ fs.rmSync(target, { recursive: true, force: true }); return { ok: false, msg: '整合包未声明 Minecraft 版本' }; }
        const overTmp = path.join(target, idx.overrides || 'overrides');
        // CF 包 mods 位于包根目录 mods/
        const modsTmp = path.join(target, 'mods');
        if (loaderType){
          step(35, '正在自动安装模组加载器（' + loaderType + '）…');
          let loadErr = null;
          let vid = '';
          try {
            const after = await installLoader({ type: loaderType, mc, loader: loaderId });
            // 28：加载器版本已写入即视为安装成功（installed 表示主程序已补齐；即便未补齐也可启动时自动补）
            const hit = (after || []).find(v => v.installed && v.id.includes(mc)) || (after || []).find(v => v.id.includes(mc));
            vid = hit ? hit.id : '';
            if (!vid) loadErr = new Error('加载器安装未返回版本');
          } catch(le){
            loadErr = le;
            logLine('error', '[' + loaderType + ' 加载器安装失败] ' + (le && le.message ? le.message : String(le)));
          }
          if (loadErr){
            fs.rmSync(target, { recursive: true, force: true });
            return { ok: false, msg: '自动安装 ' + loaderType + ' 加载器失败：' + (loadErr.message || loadErr) + '（详见日志，可切换下载源后重试）' };
          }
          step(80, '归置模组与文件…');
          const modsDest = mgrBase('mods', vid);
          fs.mkdirSync(modsDest, { recursive: true });
          if (fs.existsSync(modsTmp)){
            for (const f of fs.readdirSync(modsTmp)){
              const s0 = path.join(modsTmp, f);
              if (fs.statSync(s0).isFile() && /\.jar$/i.test(f)) fs.copyFileSync(s0, path.join(modsDest, f));
            }
          }
          const gd = cfg.isolation ? path.join(versionsDir(), vid) : gameDir();
          if (fs.existsSync(overTmp)) copyTree(overTmp, gd);
          fs.rmSync(target, { recursive: true, force: true });
          step(100, '导入完成');
          return { ok: true, name: vid, needLoader: true };
        }
        step(80, '归置模组与文件…');
        const modsDest = mgrBase('mods', mc);
        fs.mkdirSync(modsDest, { recursive: true });
        if (fs.existsSync(modsTmp)){
          for (const f of fs.readdirSync(modsTmp)){
            const s0 = path.join(modsTmp, f);
            if (fs.statSync(s0).isFile() && /\.jar$/i.test(f)) fs.copyFileSync(s0, path.join(modsDest, f));
          }
        }
        const gd = cfg.isolation ? path.join(versionsDir(), mc) : gameDir();
        if (fs.existsSync(overTmp)) copyTree(overTmp, gd);
        fs.rmSync(target, { recursive: true, force: true });
        step(100, '导入完成');
        return { ok: true, name: mc + '（CurseForge 整合包）', needLoader: false };
      } catch (err) {
        try { fs.rmSync(target, { recursive: true, force: true }); } catch(e){}
        return { ok: false, msg: 'CurseForge 整合包解析失败：' + (err.message || err) };
      }
    }
    // 纯 zip 结构：整个 .minecraft 目录被打包（含 mods/saves/config/options.txt 等）
    const mcDir = path.join(target, '.minecraft');
    if (fs.existsSync(mcDir)){
      const gd = cfg.isolation && cfg.currentVersion ? path.join(versionsDir(), cfg.currentVersion) : gameDir();
      fs.mkdirSync(gd, { recursive: true });
      copyTree(mcDir, gd);
      fs.rmSync(target, { recursive: true, force: true });
      step(100, '导入完成');
      return { ok: true, name: base + '（.minecraft 结构包）', needLoader: false };
    }
    // Modrinth mrpack：解析 modrinth.index.json，自动安装模组加载器并归置 mods/overrides，确保可直接启动
    const indexFile = path.join(target, 'modrinth.index.json');
    if (fs.existsSync(indexFile)){
      try {
        const idx = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        const deps = (idx && idx.dependencies) || {};
        const mc = deps['minecraft'] || '';
        const fabric = deps['fabric-loader'] || '';
        const forge = deps['forge'] || '';
        const neo = deps['neoforge'] || '';
        if (!mc){ fs.rmSync(target, { recursive: true, force: true }); return { ok: false, msg: '整合包未声明 Minecraft 版本' }; }
        let loaderType = '';
        let loaderId = '';
        if (fabric){ loaderType = 'fabric'; loaderId = fabric; }
        else if (forge){ loaderType = 'forge'; loaderId = forge; }
        else if (neo){ loaderType = 'neoforge'; loaderId = neo; }
        // 解包 mods/ 到临时，再交给加载器版本目录
        const modsTmp = path.join(target, 'mods');
        const overTmp = path.join(target, 'overrides');
        // 20.0：下载 modrinth.index.json 声明但未打包的依赖文件（files 数组，多源+重试），
        // 避免整合包导入后缺少模组导致无法使用（参考主流启动器的依赖补全做法）
        const packFiles = (idx.files || []).filter(f => f && f.path && f.downloads && f.downloads.length);
        let packDepDone = 0, packDepFailed = 0;
        for (const pf of packFiles){
          step(48 + Math.round(packDepDone / Math.max(packFiles.length, 1) * 32), '下载整合包依赖：' + path.basename(pf.path));
          const pDest = path.join(target, pf.path.replace(/^\/+/, ''));
          try {
            fs.mkdirSync(path.dirname(pDest), { recursive: true });
            await multiSourceDownload(pf.downloads.slice(0, 3), pDest, null, 3);
            packDepDone++;
          } catch(e){
            packDepFailed++;
            logLine('warn', '整合包依赖下载失败（不影响主包导入）：' + pf.path + ' ' + (e.message || e));
          }
        }
        if (packDepFailed) logLine('warn', '整合包有 ' + packDepFailed + ' 个依赖文件下载失败，已跳过（可在资源中心手动补装）');
        if (loaderType){
          step(35, '正在自动安装模组加载器（' + loaderType + '）…');
          let loadErr = null;
          let vid = '';
          try {
            const after = await installLoader({ type: loaderType, mc, loader: loaderId });
            // 28：加载器版本已写入即视为安装成功（installed 表示主程序已补齐；即便未补齐也可启动时自动补）
            const hit = (after || []).find(v => v.installed && v.id.includes(mc)) || (after || []).find(v => v.id.includes(mc));
            vid = hit ? hit.id : '';
            if (!vid) loadErr = new Error('加载器安装未返回版本');
          } catch(le){
            loadErr = le;
            logLine('error', '[' + loaderType + ' 加载器安装失败] ' + (le && le.message ? le.message : String(le)));
          }
          if (loadErr){
            fs.rmSync(target, { recursive: true, force: true });
            return { ok: false, msg: '自动安装 ' + loaderType + ' 加载器失败：' + (loadErr.message || loadErr) + '（详见日志，可切换下载源后重试）' };
          }
          step(80, '归置模组与文件…');
          // 模组 → 加载器版本的隔离 mods 目录（未隔离则共享 mods）
          const modsDest = mgrBase('mods', vid);
          fs.mkdirSync(modsDest, { recursive: true });
          if (fs.existsSync(modsTmp)){
            for (const f of fs.readdirSync(modsTmp)){
              const s0 = path.join(modsTmp, f);
              if (fs.statSync(s0).isFile() && /\.jar$/i.test(f)) fs.copyFileSync(s0, path.join(modsDest, f));
            }
          }
          // overrides → 游戏目录（资源包/配置/存档等）
          const gd = cfg.isolation ? path.join(versionsDir(), vid) : gameDir();
          if (fs.existsSync(overTmp)) copyTree(overTmp, gd);
          fs.rmSync(target, { recursive: true, force: true });
          step(100, '导入完成');
          return { ok: true, name: vid, needLoader: true };
        }
        // 纯原版整合包：mods 归置共享目录，overrides 合并
        step(80, '归置模组与文件…');
        const modsDest = mgrBase('mods', mc);
        fs.mkdirSync(modsDest, { recursive: true });
        if (fs.existsSync(modsTmp)){
          for (const f of fs.readdirSync(modsTmp)){
            const s0 = path.join(modsTmp, f);
            if (fs.statSync(s0).isFile() && /\.jar$/i.test(f)) fs.copyFileSync(s0, path.join(modsDest, f));
          }
        }
        const gd = cfg.isolation ? path.join(versionsDir(), mc) : gameDir();
        if (fs.existsSync(overTmp)) copyTree(overTmp, gd);
        fs.rmSync(target, { recursive: true, force: true });
        step(100, '导入完成');
        return { ok: true, name: mc + '（纯原版整合包）', needLoader: false };
      } catch (err) {
        try { fs.rmSync(target, { recursive: true, force: true }); } catch(e){}
        return { ok: false, msg: '整合包解析失败：' + (err.message || err) };
      }
    }
    fs.rmSync(target, { recursive: true, force: true });
    return { ok: false, msg: '该压缩包未找到 version.json 或 modrinth.index.json，不是可识别的整合包' };
  } catch (err) {
    try { fs.rmSync(target, { recursive: true, force: true }); } catch(e){}
    return { ok: false, msg: '整合包导入失败：' + (err.message || err) };
  }
}

ipcMain.handle('versions:rename', async (e, oldId, newId) => {
    oldId = String(oldId || '').trim(); newId = String(newId || '').trim();
    if (!oldId || !newId) return { ok: false, msg: '版本名不能为空' };
    if (oldId === newId) return { ok: true, name: newId };
    if (/[\\/:*?"<>|]/.test(newId)) return { ok: false, msg: '名称不能包含字符 \\ / : * ? " < > |' };
    if (launchProc) return { ok: false, msg: '有游戏正在运行，请先退出游戏再重命名' };
    if (dlToken) return { ok: false, msg: '有下载任务进行中，请等待完成或取消后再重命名' };
    const src = path.join(versionsDir(), oldId);
    const dst = path.join(versionsDir(), newId);
    if (!fs.existsSync(src)) return { ok: false, msg: '版本目录不存在：' + oldId };
    if (fs.existsSync(dst)) return { ok: false, msg: '已存在同名版本：' + newId };
    try {
      // 目录 + json + jar 一并改名；版本元数据 id 保持官方原值（不影响继承链）
      fs.renameSync(src, dst);
      const jOld = path.join(dst, oldId + '.json'), jNew = path.join(dst, newId + '.json');
      if (fs.existsSync(jOld)) fs.renameSync(jOld, jNew);
      const jarOld = path.join(dst, oldId + '.jar'), jarNew = path.join(dst, newId + '.jar');
      if (fs.existsSync(jarOld)) fs.renameSync(jarOld, jarNew);
      // 当前选中版本同步
      if (cfg.currentVersion === oldId){
        cfg.currentVersion = newId;
        try { saveConfig(); } catch(e){}
      }
      logLine('info', '版本重命名：' + oldId + ' → ' + newId);
      return { ok: true, name: newId };
    } catch(err){
      return { ok: false, msg: '重命名失败：' + (err.message || err) };
    }
  });
ipcMain.handle('mgr:import', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    title: '导入整合包（zip / mrpack / CurseForge）',
    filters: [{ name: '整合包', extensions: ['zip', 'mrpack'] }]
  });
  if (r.canceled || !r.filePaths.length) return { ok: false, msg: '已取消' };
  const src = r.filePaths[0];
  const pkName = path.basename(src).replace(/\.(zip|mrpack)$/i, '');
  const res = await importPackFromFile(src, prog => {
    send('pack:importProgress', { name: pkName, pct: prog.pct, status: prog.status, path: path.join(gameDir(), 'modpacks') });
  });
  if (res && res.ok){
    send('pack:importProgress', { name: pkName, pct: 100, status: '导入完成：' + (res.name || pkName), ok: true, path: path.join(gameDir(), 'modpacks') });
  } else {
    send('pack:importProgress', { name: pkName, pct: 100, status: (res && res.msg) || '导入失败', ok: false, path: path.join(gameDir(), 'modpacks') });
  }
  return res;
});
  ipcMain.handle('shell:openPath', (e, p) => {
    if (!p) return true;
    // URL 用系统浏览器打开；本地路径用资源管理器打开
    if (/^https?:\/\//i.test(p)){ shell.openExternal(p); }
    else if (fs.existsSync(p)){ shell.openPath(p); }
    return true;
  });
  ipcMain.handle('window:min', () => win && win.minimize());
  ipcMain.handle('window:max', () => { if (!win) return; win.isMaximized() ? win.unmaximize() : win.maximize(); });
  ipcMain.handle('window:close', () => win && win.close());
}

/* ================= 联机引擎 · Terracotta | 陶瓦联机 =================
   联机功能由 Terracotta | 陶瓦联机（AGPL-3.0 · Burning_TNT 开发 · 基于 EasyTier）提供。
   集成方式遵循其 AGPL 例外条款：打包未经修改的二进制 + 仅通过 HTTP API 交互 + 界面标注版权信息。
*/
let tcProc = null;          // terracotta 子进程（--hmcl 委托进程，Linux 下即服务进程）
let tcBase = '';            // http://127.0.0.1:<port>
let tcPortFile = '';
function terracottaDir(){ return path.join(dataRoot(), 'terracotta'); }
function terracottaExe(){
  const d = terracottaDir();
  return process.platform === 'win32' ? path.join(d, 'terracotta-0.4.2-windows-x86_64.exe') : path.join(d, 'terracotta-0.4.2-linux-x86_64');
}
function tcEnsureBinary(){
  try {
    const dest = terracottaDir();
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const exe = terracottaExe();
    if (fs.existsSync(exe)) return exe;
    // 从打包资源复制（extraResources -> resources/terracotta/）
    const srcDir = path.join(process.resourcesPath, 'terracotta');
    if (!fs.existsSync(srcDir)) return null;
    const files = fs.readdirSync(srcDir);
    for (const f of files){
      const sp = path.join(srcDir, f);
      if (fs.statSync(sp).isFile()) fs.copyFileSync(sp, path.join(dest, f));
    }
    if (process.platform !== 'win32') { try { fs.chmodSync(exe, 0o755); } catch(e){} }
    return fs.existsSync(exe) ? exe : null;
  } catch(e){ return null; }
}
function tcIsRunning(){
  if (!tcBase) return false;
  try {
    const url = tcBase + '/meta';
    const r = httpFetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(2000) });
    return true; // 乐观：请求失败由上层轮询兜底
  } catch(e){ return false; }
}
function tcReadPort(){
  try {
    const raw = fs.readFileSync(tcPortFile, 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j.port === 'number') return j.port;
  } catch(e){}
  return 0;
}
function tcStart(){
  return new Promise((resolve) => {
    const exe = tcEnsureBinary();
    if (!exe){ resolve({ ok: false, error: '联机引擎文件缺失，请重新安装启动器' }); return; }
    const dir = terracottaDir();
    tcPortFile = path.join(dir, 'port.json');
    try { fs.rmSync(tcPortFile, { force: true }); } catch(e){}
    // 已运行则复用
    if (tcBase){
      httpFetch(tcBase + '/meta', { cache: 'no-store', signal: AbortSignal.timeout(1500) }).then(() => {
        resolve({ ok: true, base: tcBase, reused: true });
      }).catch(() => { tcBase = ''; tcStartResolve(exe, resolve); });
      return;
    }
    tcStartResolve(exe, resolve);
  });
}
function tcStartResolve(exe, resolve){
  const args = process.platform === 'win32' ? ['--hmcl', tcPortFile] : ['--hmcl', tcPortFile];
  try { if (tcProc) tcProc.kill(); } catch(e){}
  tcProc = spawn(exe, args, { cwd: terracottaDir(), windowsHide: true, stdio: 'ignore' });
  tcProc.on('error', err => { resolve({ ok: false, error: '联机引擎启动失败：' + err.message }); });
  const t0 = Date.now();
  const poll = () => {
    const port = tcReadPort();
    if (port){
      tcBase = 'http://127.0.0.1:' + port;
      resolve({ ok: true, base: tcBase, port });
      return;
    }
    if (Date.now() - t0 > 15000){ resolve({ ok: false, error: '联机引擎启动超时' }); return; }
    setTimeout(poll, 300);
  };
  poll();
}
async function tcRequest(pathname, timeoutMs){
  if (!tcBase) return { ok: false, error: '联机引擎未启动' };
  try {
    const r = await httpFetch(tcBase + pathname, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs || 6000) });
    if (!r.ok){
      if (r.status === 400) return { ok: false, status: 400, error: '请求格式错误' };
      return { ok: false, status: r.status, error: '联机引擎错误 ' + r.status };
    }
    const text = await r.text();
    try { return { ok: true, json: JSON.parse(text) }; } catch(e){ return { ok: true, text }; }
  } catch(e){ return { ok: false, error: '联机引擎无响应（可能已闲置退出）' }; }
}
async function tcStop(){
  try { if (tcBase){ await httpFetch(tcBase + '/panic?peaceful=true', { cache: 'no-store', signal: AbortSignal.timeout(2500) }).catch(() => {}); } } catch(e){}
  try { if (tcProc) tcProc.kill(); } catch(e){}
  tcBase = '';
  tcProc = null;
  return true;
}

/* ================= 窗口 ================= */
function createWindow(){
  win = new BrowserWindow({
    width: 1180, height: 760, minWidth: 1000, minHeight: 660,
    frame: false, backgroundColor: '#04070e',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => win.webContents.send('window:maximized', true));
  win.on('unmaximize', () => win.webContents.send('window:maximized', false));
}

app.whenReady().then(() => {
  loadConfig();
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !launchProc) app.quit(); });
app.on('will-quit', () => { try { if (tcBase){ httpFetch(tcBase + '/panic?peaceful=true', { cache: 'no-store', signal: AbortSignal.timeout(1500) }).catch(() => {}); } } catch(e){} try { if (tcProc) tcProc.kill(); } catch(e){} });
