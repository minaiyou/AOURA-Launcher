/* AOURA 启动器 v18.2 · 渲染层逻辑 由珉爱制作 */
/* --- 轮换字幕（每次启动都不一样） --- */
const QUOTES = [
  '每一次启动，都是一场光的旅行',
  '光会记住每一个方块的故事',
  '在方块之间，寻光而行',
  '让每一次冒险，都有光相伴',
  '光是地图，也是归途',
  '愿你的世界，永远亮着',
  '把极光装进启动器，把世界握在手中',
  '光在方块上跳舞，冒险从这里开始',
  '每一次点击，都是新旅程的起点',
  '极光为引，方块为路',
  '探索无界，光芒常伴',
  '点亮方块，也点亮自己'
];
function pickQuote(){
  const last = localStorage.getItem('aoura_quote') || '';
  let q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  if (QUOTES.length > 1 && q === last) q = QUOTES[(QUOTES.indexOf(q) + 1) % QUOTES.length];
  localStorage.setItem('aoura_quote', q);
  return q;
}
function applyQuote(){
  const q = pickQuote();
  const sq = document.getElementById('splashQuote');
  const hq = document.getElementById('homeQuote');
  const hr = document.getElementById('hrQuote');
  if (sq) sq.textContent = q;
  if (hq) hq.textContent = q;
  if (hr) hr.textContent = q;
}
'use strict';
const A = window.aoura;
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

let cfg = {};
let gameDir = '';
let versions = [];
let javaList = [];
let manifest = null;
let manifestLoaded = false;
let launching = false;
let loaderBusy = false;
let rsType = 'mod';
let currentRs = null;
let avatarUrl = '';
let dlWithLoader = null; // {id, type} 正在"原版+加载器"下载
let dlCurrentId = '';    // 当前主进程下载的版本 id

/* ================= Toast ================= */
const T_ICONS = {
  ok: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  info: '<svg viewBox="0 0 24 24"><path d="M12 8h.01"/><path d="M12 11.5V17"/><circle cx="12" cy="12" r="9"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 4 3 19.5h18z"/><path d="M12 10v4.5"/><path d="M12 16.8h.01"/></svg>'
};
function toast(title, sub, type){
  type = type || 'info';
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<div class="t-ico ' + (type === 'ok' ? 'ok' : type === 'warn' ? 'warn' : '') + '">' + T_ICONS[type] + '</div><div class="t-body"><div class="t-title"></div><div class="t-sub"></div></div>';
  el.querySelector('.t-title').textContent = title;
  if (sub) el.querySelector('.t-sub').textContent = sub; else el.querySelector('.t-sub').remove();
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3800);
}

/* ================= 通用弹层 ================= */
function modal(title, opts){
  opts = opts || {};
  const m = document.createElement('div');
  m.className = 'modal-mask';
  m.innerHTML = '<div class="modal"><div class="modal-title">' + title + '</div>' +
    '<input type="text" class="modal-input" placeholder="' + (opts.placeholder || '') + '" value="' + (opts.value || '') + '">' +
    '<div class="modal-btns"><button class="btn btn-mini modal-cancel">取消</button><button class="btn btn-mini btn-primary modal-ok">确定</button></div></div>';
  document.body.appendChild(m);
  const input = m.querySelector('.modal-input');
  setTimeout(() => input.focus(), 60);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') close(); });
  m.querySelector('.modal-cancel').addEventListener('click', close);
  m.querySelector('.modal-ok').addEventListener('click', ok);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  let done = false;
  function close(){ if (done) return; done = true; m.remove(); opts.onCancel && opts.onCancel(); }
  function ok(){
    const v = input.value.trim();
    if (opts.required && !v){ input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 400); return; }
    if (done) return; done = true;
    m.remove();
    opts.onOk && opts.onOk(v);
  }
  return { close };
}
function confirmDlg(text, onOk){
  const m = document.createElement('div');
  m.className = 'modal-mask';
  m.innerHTML = '<div class="modal modal-sm"><div class="modal-title">' + text + '</div>' +
    '<div class="modal-btns"><button class="btn btn-mini modal-cancel">取消</button><button class="btn btn-mini btn-primary modal-ok">确定</button></div></div>';
  document.body.appendChild(m);
  let done = false;
  const close = () => { if (done) return; done = true; m.remove(); };
  m.querySelector('.modal-cancel').addEventListener('click', close);
  m.querySelector('.modal-ok').addEventListener('click', () => { close(); onOk && onOk(); });
  m.addEventListener('click', e => { if (e.target === m) close(); });
}

/* ================= 路由（底部 Dock） ================= */
const VIEWS = ['home', 'versions', 'download', 'resources', 'mods', 'multiplayer', 'tech', 'settings', 'about', 'account'];
/* ===== 闪光粒子系统 v10.3 ===== */
const SPK_COLORS = ['#9ff6ff', '#c9b8ff', '#ffd98a', '#7dffd9', '#ffffff'];
function mkSpark(sizeMin, sizeMax, colors, dot){
  const p = document.createElement('span');
  p.className = 'spk' + (dot ? ' dot' : '');
  p.style.left = (Math.random() * 100).toFixed(1) + '%';
  p.style.top = (Math.random() * 100).toFixed(1) + '%';
  const sz = sizeMin + Math.random() * (sizeMax - sizeMin);
  p.style.width = sz.toFixed(1) + 'px';
  p.style.height = sz.toFixed(1) + 'px';
  p.style.setProperty('--c', colors[Math.floor(Math.random() * colors.length)]);
  p.style.setProperty('--d', (1.6 + Math.random() * 2.2).toFixed(2) + 's');
  p.style.setProperty('--d2', (9 + Math.random() * 14).toFixed(1) + 's');
  p.style.animationDelay = (Math.random() * 4).toFixed(2) + 's';
  return p;
}
function spawnBgSparkles(){
  const box = $('#sparkleBg');
  if (!box) return;
  for (let i = 0; i < 34; i++) box.appendChild(mkSpark(5, 11, SPK_COLORS, i % 4 === 0));
}
function spawnButtonSparkles(){
  const btn = $('#btnPlay');
  if (!btn) return;
  for (let i = 0; i < 16; i++){
    const p = mkSpark(4, 9, SPK_COLORS, i % 3 === 0);
    p.style.left = (18 + Math.random() * 64).toFixed(1) + '%';
    p.style.top = (14 + Math.random() * 72).toFixed(1) + '%';
    btn.appendChild(p);
  }
}
function spawnDockSparkles(){
  $$('.dock-item').forEach(d => {
    for (let i = 0; i < 2; i++){
      const p = mkSpark(4, 7, ['#ffd98a', '#9ff6ff', '#c9b8ff'], i === 0);
      p.style.left = (20 + Math.random() * 60).toFixed(1) + '%';
      p.style.top = (18 + Math.random() * 62).toFixed(1) + '%';
      d.appendChild(p);
    }
  });
}
function burst(el, n, colors){
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  for (let i = 0; i < n; i++){
    const p = document.createElement('i');
    p.className = 'spk-burst' + (Math.random() < 0.45 ? ' star' : '');
    const col = colors[Math.floor(Math.random() * colors.length)];
    p.style.background = col;
    p.style.boxShadow = '0 0 9px ' + col;
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    p.style.setProperty('--dx', (Math.random() * 230 - 115).toFixed(0) + 'px');
    p.style.setProperty('--dy', (-Math.random() * 150 - 15).toFixed(0) + 'px');
    const sz = (5 + Math.random() * 6).toFixed(1);
    p.style.width = sz + 'px';
    p.style.height = sz + 'px';
    p.style.animationDelay = (Math.random() * 0.18).toFixed(2) + 's';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1100);
  }
}

function go(view, trigger){
  if (!VIEWS.includes(view)) view = 'home';
  VIEWS.forEach(v => $('#view-' + v).classList.toggle('active', v === view));
  $$('.dock-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  $('#main').scrollTop = 0;
  $('#dlOptMask').classList.remove('open');
  if (currentRs) closeRsDetail();
  if (view === 'download' && !manifestLoaded) loadManifest();
  if (view === 'resources' && $('#rsGrid').children.length === 0) searchRs('');
  if (view === 'mods') refreshMods();
  if (trigger){
    const names = { home: '主页', versions: '版本管理', download: '下载中心', resources: '资源中心', mods: '模组', multiplayer: '联机', tech: '技术说明', settings: '设置', about: '关于', account: '账户' };
    toast('已进入' + names[view]);
    const it = document.querySelector('.dock-item[data-view="' + view + '"]');
    if (it) burst(it, 18, SPK_COLORS);
  }
}
$$('.dock-item[data-view]').forEach(n => n.addEventListener('click', () => go(n.dataset.view)));
$('#dockAcc').addEventListener('click', () => go('account'));

/* ================= 时间 ================= */
function tick(){
  const d = new Date();
  const h = d.getHours();
  const g = h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
  $('#greet').textContent = g + '，' + (cfg.offlineName || '玩家');
  $('#todayStr').textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + ['日','一','二','三','四','五','六'][d.getDay()];
}
setInterval(tick, 1000);

/* ================= 头像 ================= */
function fileUrl(p){
  if (!p) return '';
  return 'file:///' + String(p).replace(/\\/g, '/').replace(/^\/+/, '');
}
async function refreshAvatar(){
  const p = await A.getAvatarPath();
  avatarUrl = p ? fileUrl(p) : '';
  [['homeAvatarImg', 'homeAvatarWrap'], ['dockAvatarImg', 'dockAvatarWrap'], ['avPreviewImg', 'avPreviewWrap'], ['avSetupImg', 'avSetupAvWrap']].forEach(([imgId, wrapId]) => {
    const img = $('#' + imgId), wrap = $('#' + wrapId);
    if (img && wrap){
      if (avatarUrl){ img.src = avatarUrl; wrap.classList.add('has-img'); }
      else { img.removeAttribute('src'); wrap.classList.remove('has-img'); }
    }
  });
}

/* ================= 环境初始化 ================= */
async function refreshEnv(){
  const det = await A.detectMinecraft();
  gameDir = det.gameDir;
  versions = det.versions || [];
  const exists = det.exists;
  $('#gameDirDesc').textContent = gameDir;
  const chip = $('#envChip');
  chip.innerHTML = exists
    ? '<i class="cd"></i>游戏环境已就绪'
    : '<i class="cd off"></i>未检测到游戏目录';
  $('#netText').textContent = exists ? '已就绪' : '待配置';
  $('#netDot').classList.toggle('on', exists);

  if (!cfg.currentVersion || !versions.find(v => v.id === cfg.currentVersion)){
    if (versions.length) cfg.currentVersion = versions[0].id;
    else cfg.currentVersion = '';
  }
  renderVersions();
  renderLdMc();
  updateHome();

  javaList = await A.detectJava();
  renderJavaSel();
  updateJavaStat();
  renderJavaAvail();
  updateJavaGuide();
}
// Java 缺失引导：用户下载好版本后自动检测，未安装则引导前往设置
function updateJavaGuide(){
  const need = (!javaList || !javaList.length) && !cfg.javaPath;
  const show = need && versions.length > 0;
  const bars = ['#javaGuideBar', '#javaGuideBarHome'];
  bars.forEach(sel => {
    const el = $(sel);
    if (!el) return;
    if (show) el.style.display = '';
    else el.style.display = 'none';
  });
}
function splashParticles(){
  const box = $('#sPart');
  box.innerHTML = '';
  const n = 44;
  for (let i = 0; i < n; i++){
    const p = document.createElement('i');
    const sx = Math.random() * 100, sy = Math.random() * 100;
    p.style.left = sx + '%';
    p.style.top = sy + '%';
    p.style.setProperty('--tx', ((50 - sx) * 7).toFixed(1) + 'px');
    p.style.setProperty('--ty', ((50 - sy) * 7).toFixed(1) + 'px');
    p.style.animationDuration = (2 + Math.random() * 2).toFixed(1) + 's';
    p.style.animationDelay = (Math.random() * 1.2).toFixed(2) + 's';
    box.appendChild(p);
  }
}
/* ===== 主题系统 v10：预装 5 套配色 ===== */
const THEMES = ['aurora','nebula','sunset','emerald','crimson','moonlight','sakura','deepsea','golden','midnight','frost','violet','ocean','rosegold','galaxy','sunrise','mint','ruby','sky','amber'];
function applyTheme(id){
  if (!THEMES.includes(id)) id = 'aurora';
  document.body.dataset.theme = id;
  cfg.theme = id;
  $$('#themeGrid .th-card').forEach(c => {
    c.classList.toggle('on', c.dataset.theme === id);
    c.setAttribute('aria-pressed', c.dataset.theme === id ? 'true' : 'false');
  });
}
async function init(){
  splashParticles();
  spawnBgSparkles();
  spawnButtonSparkles();
  spawnDockSparkles();
  cfg = await A.getConfig();
  applyTheme(cfg.theme || 'aurora');
  $('#memRange').value = cfg.memory || 4096;
  const langSel0 = $('#langSel');
  if (langSel0) langSel0.value = cfg.lang || 'zh_cn';
  syncMem();
  $('#offlineName').value = (cfg.offlineName && NAME_RE.test(cfg.offlineName)) ? cfg.offlineName : 'Player';
  $('#jvmArgs').value = cfg.jvmArgs || '';
  $('#gameArgs').value = cfg.gameArgs || '';
  $('#mirrorSel').value = cfg.mirror === 'mojang' ? 'mojang' : 'bmclapi';
  $('#swLight').classList.toggle('on', cfg.lightEffect !== false);
  $('#swAurora').classList.toggle('on', cfg.dynamicWallpaper !== false);
  $('#swCursor').classList.toggle('on', cfg.cursorGlow !== false);
  $('#swBlur').classList.toggle('on', cfg.panelBlur !== false);
  $('#swIsolation').classList.toggle('on', !!cfg.isolation);
  $('#swCloseAfter').classList.toggle('on', !!cfg.closeAfterLaunch);
  applyVisualPrefs();
  tick();
  renderAbout();
  await Promise.all([refreshEnv(), refreshAvatar(), renderMsStatus()]);
  // 首次启动：选择账户模式
  const msSt = await A.msStatus();
  if (cfg.firstRun === undefined && msSt.authType !== 'msa'){
    $('#firstRunMask').classList.add('open');
  }
  if (cfg.msClientId) $('#msClientId').value = cfg.msClientId;
  // 启动页进度条推进后淡出
  const bar = $('#splashBar');
  let pct = 0;
  const iv = setInterval(() => {
    pct = Math.min(100, pct + 8 + Math.random() * 14);
    bar.style.width = pct + '%';
    if (pct >= 100){ clearInterval(iv); setTimeout(() => { $('#splash').classList.add('done'); setTimeout(() => { const s = $('#splash'); if (s) s.remove(); }, 800); }, 260); }
  }, 190);
  document.body.classList.add('light-ready');
  applyQuote(); // 每次启动仅选一句，整个会话保持不变
  // 14.0：先让用户选择账户模式；确认离线后（acOffline）才进入头像设置
  if (cfg.firstRun === true && cfg.authType === 'offline') maybeShowAvSetup();
}
function maybeShowAvSetup(){
  if (cfg.authType === 'msa') return;
  if (cfg.firstRun !== true) return; // 首登弹窗未选择完成前不打扰
  if (cfg.needsAvatarSetup === false) return;
  if (avatarUrl && cfg.offlineName && NAME_RE.test(cfg.offlineName)){ A.setConfig({ needsAvatarSetup: false }); return; }
  $('#avSetupName').value = (cfg.offlineName && NAME_RE.test(cfg.offlineName)) ? cfg.offlineName : '';
  $('#avSetupTip').textContent = '';
  $('#avSetupMask').classList.add('open');
  const nm = $('#avSetupName');
  setTimeout(() => nm && nm.focus(), 60);
}
/* 离线首登强制设置：用户名 + 头像 */
$('#avSetupUpload').addEventListener('click', async () => {
  const p = await A.uploadAvatar();
  if (p){ await refreshAvatar(); A.setConfig({ needsAvatarSetup: false }); $('#avSetupTip').textContent = '头像已就绪'; }
});
$('#avSetupPick').addEventListener('click', async () => {
  const ok = await A.useDefaultAvatar();
  if (ok){ await refreshAvatar(); A.setConfig({ needsAvatarSetup: false }); $('#avSetupTip').textContent = '已使用默认头像'; }
  else { $('#avSetupTip').textContent = '生成默认头像失败，请尝试上传'; }
});
$('#avSetupOk').addEventListener('click', async () => {
  const nm = $('#avSetupName').value.trim();
  if (!NAME_RE.test(nm)){
    $('#avSetupTip').textContent = '玩家名仅限 1-16 位英文、数字或下划线';
    const el = $('#avSetupName'); el.classList.add('bad'); setTimeout(() => el.classList.remove('bad'), 500);
    return;
  }
  if (!avatarUrl){
    $('#avSetupTip').textContent = '请先上传头像或使用默认头像（必填）';
    return;
  }
  cfg.offlineName = nm;
  await A.setConfig({ offlineName: nm, needsAvatarSetup: false });
  cfg = await A.getConfig();
  $('#avSetupMask').classList.remove('open');
  tick(); $('#offlineName').value = nm;
  toast('离线账户设置完成', nm + ' · 已就绪', 'ok');
});
async function renderAbout(){
  try {
    const info = await A.appInfo();
    $('#abVer').textContent = 'AOURA 启动器 v' + info.version + ' · 面向我的世界玩家';
    $('#abEngine').textContent = 'AOURA 启动引擎 v' + info.version + ' · Electron ' + info.electron + ' / Chromium ' + info.chrome + ' / Node ' + info.node;
    if ($('#aboutVer')) $('#aboutVer').textContent = info.version;
    if ($('#abEngine2')) $('#abEngine2').textContent = 'Electron ' + info.electron + ' / Chromium ' + info.chrome + ' / Node ' + info.node;
    if ($('#dataDirDesc')){
      const dd = info.dataDir || '';
      $('#dataDirDesc').innerHTML = '<span style="font-family:Cascadia Code,Consolas,monospace;font-size:11px;color:var(--txt-2);word-break:break-all">' + escapeHtml(dd) + '</span><br>配置 · 缓存 · 日志 · Java 均位于启动器安装目录下';
    }
  } catch(e){}
}
init();

/* ================= 主页 ================= */
function updateHome(){
  const ver = versions.find(v => v.id === cfg.currentVersion);
  const canLaunch = !!ver;
  $('#btnPlay').disabled = !canLaunch;
  if (ver){
    $('#curVerName').textContent = ver.id;
    $('#statVer').textContent = ver.id.split('-')[0];
    $('#curVerMeta').innerHTML =
      '<span>Java ' + (ver.javaMajor || '自动') + '</span>' +
      '<span>' + (ver.installed ? '文件完整' : '缺少主程序') + '</span>' +
      '<span>' + (ver.type || 'release') + '</span>';
    $('#btnPlay').disabled = !ver.installed;
  } else {
    $('#curVerName').textContent = '未选择版本';
    $('#curVerMeta').innerHTML = '<span>请先在下载中心安装一个版本</span>';
    $('#statVer').textContent = '—';
  }
  $('#statAcc').textContent = cfg.offlineName || '—';
  $('#dockName').textContent = cfg.offlineName || '离线账户';
  $('#verCount').textContent = versions.length;
  renderDrop();
}
function renderDrop(){
  const drop = $('#verDrop');
  drop.innerHTML = versions.map(v => {
    const tag = v.type === 'release' ? '' : '<span class="vd-type">' + (v.type || '') + '</span>';
    return '<div class="vd-item' + (v.id === cfg.currentVersion ? ' cur' : '') + '" data-ver="' + v.id + '">' +
      '<span class="vd-name">' + v.id + '</span>' + tag +
      '<svg class="vd-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>';
  }).join('') || '<div class="vd-item"><span class="vd-name" style="color:var(--txt-faint)">暂无已安装版本</span></div>';
  $$('#verDrop .vd-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      const id = item.dataset.ver;
      if (!id) return;
      cfg.currentVersion = id;
      A.setConfig({ currentVersion: id });
      updateHome();
      closeDrop();
      toast('已切换版本', id, 'ok');
    });
  });
}
const verSelect = $('#verSelect'), verDrop = $('#verDrop');
const envBubVer = $('#envBubVer');
if (envBubVer) envBubVer.addEventListener('click', e => { e.stopPropagation(); verDrop.classList.contains('open') ? closeDrop() : openDrop(); });
function openDrop(){
  // 14.0：版本下拉在屏幕中央弹出（CSS .ver-drop 已居中，不再跟随按钮）
  verDrop.classList.add('open');
}
function closeDrop(){ verDrop.classList.remove('open'); }
verSelect.addEventListener('click', e => { e.stopPropagation(); verDrop.classList.contains('open') ? closeDrop() : openDrop(); });
// ◀ ▶ 快捷切换版本（循环）
function cycleVersion(dir){
  if (!versions.length){ toast('暂无版本', '请先在下载中心安装一个版本', 'warn'); return; }
  const idx = versions.findIndex(v => v.id === cfg.currentVersion);
  let next = dir > 0 ? (idx < 0 ? 0 : (idx + 1) % versions.length) : (idx <= 0 ? versions.length - 1 : idx - 1);
  if (idx < 0) next = dir > 0 ? 0 : versions.length - 1;
  const v = versions[next];
  cfg.currentVersion = v.id;
  A.setConfig({ currentVersion: v.id });
  updateHome();
  toast('已切换版本', v.id, 'ok');
}
document.addEventListener('click', e => { if (!verDrop.contains(e.target)) closeDrop(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrop(); });
$('#main').addEventListener('scroll', closeDrop);
window.addEventListener('resize', closeDrop);
$$('#btnGoVersions').forEach(b => b.addEventListener('click', () => go('versions')));
$$('#btnGoDownload').forEach(b => b.addEventListener('click', () => go('download')));
$$('#btnGoResources').forEach(b => b.addEventListener('click', () => go('resources')));
$$('#btnGoMods').forEach(b => b.addEventListener('click', () => go('mods')));

/* ================= 启动 ================= */
function logLine(level, text){
  const box = $('#logBody');
  const div = document.createElement('div');
  div.className = 'log-line ' + (level || 'info');
  const d = new Date();
  div.innerHTML = '<span class="t">[' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0') + ']</span>' + escapeHtml(text);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function setPlayState(playing, versionId){
  if (playing){
    $('#playTxt').textContent = '游戏中';
    $('#btnPlay').disabled = true;
    $('#btnStop').style.display = '';
  } else {
    $('#playTxt').textContent = '启动游戏';
    $('#btnStop').style.display = 'none';
    const ver = versions.find(v => v.id === cfg.currentVersion);
    $('#btnPlay').disabled = !(ver && ver.installed) || launching;
  }
}
$('#btnPlay').addEventListener('click', async () => {
  burst($('#btnPlay'), 44, ['#9ff6ff', '#7dffd9', '#ffffff', '#c9b8ff', '#ffd98a']);
  if (launching || !cfg.currentVersion) return;
  launching = true;
  const btn = $('#btnPlay');
  btn.disabled = true;
  $('#playTxt').textContent = '正在启动…';
  $('#logDrawer').classList.add('open');
  syncLogUI();
  $('#logLed').className = 'log-led running';
  $('#logState').textContent = '正在启动 ' + cfg.currentVersion;
  logLine('info', '请求启动：' + cfg.currentVersion);
  const res = await A.launch(cfg.currentVersion);
  if (!res.ok){
    launching = false;
    $('#logLed').className = 'log-led error';
    $('#logState').textContent = '启动失败';
    setPlayState(false);
    toast('启动失败', res.error || '未知错误', 'warn');
  }
});
$('#btnStop').addEventListener('click', () => { A.stopLaunch(); logLine('warn', '已请求停止游戏'); });
A.onLaunchStatus(st => {
  if (st.state === 'running'){
    $('#logState').textContent = '游戏运行中 · ' + st.versionId;
    $('#logLed').className = 'log-led running';
    setPlayState(true, st.versionId);
  } else if (st.state === 'exited'){
    launching = false;
    $('#logLed').className = 'log-led';
    $('#logState').textContent = '游戏已退出（代码 ' + st.code + '）';
    setPlayState(false);
    logLine(st.code === 0 ? 'info' : 'warn', '游戏进程已退出，退出码 ' + st.code);
    maybeShowSupportTip(cfg.authType === 'msa' ? 'msa' : 'legacy');
  }
});
A.onLaunchLog(d => logLine(d.level, d.text));
/* ===== 联机引擎 · Terracotta | 陶瓦联机 ===== */
let tcTimer = null, tcLastIndex = -1, tcMode = '', tcState = null;
const TC_ERR = {
  0: ['加入房间失败', '房间已关闭或网络不稳定'],
  1: ['房间连接断开', '房间已关闭或网络不稳定'],
  2: ['加入房间失败', 'EasyTier 已崩溃，请向开发者反馈'],
  3: ['创建房间失败', 'EasyTier 已崩溃，请向开发者反馈'],
  4: ['房间已关闭', '您已退出游戏存档，房间已自动关闭'],
  5: ['协议错误', '房主发送了错误的响应数据，请向开发者反馈']
};
function mpAccName(){ return (cfg.offlineName && NAME_RE.test(cfg.offlineName)) ? cfg.offlineName : 'Player'; }
function mpSetEngine(on, txt){
  $('#mpEngine').classList.toggle('on', on);
  $('#mpEngineTxt').textContent = txt || (on ? '联机引擎运行中' : '联机引擎未开启');
}
function mpShowChoose(){ $('#mpChoose').style.display = 'grid'; $('#mpProgress').style.display = 'none'; }
function mpShowProgress(){ $('#mpChoose').style.display = 'none'; $('#mpProgress').style.display = 'block'; $('#mpServerBox').style.display = 'none'; }
function mpStopPoll(){ if (tcTimer){ clearInterval(tcTimer); tcTimer = null; } }
function mpStepsHtml(items){
  return items.map((t, i) => '<div class="mp-step"><i>' + (i + 1) + '</i><span>' + t + '</span></div>').join('');
}
async function mpEnsureEngine(){
  const st = await A.tcStart();
  if (!st.ok){ mpSetEngine(false); toast('联机引擎启动失败', st.error, 'error'); return false; }
  mpSetEngine(true, st.reused ? '联机引擎已就绪（复用）' : '联机引擎运行中');
  return true;
}
/* 16.0：联机房间气泡——房主居中，成员环绕（支持陶瓦 peers/online 成员数据） */
function mpBub(name, sub, cls){
  return '<div class="mp-bub ' + (cls || '') + '"><span class="mp-bub-av"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg></span><b>' + escapeHtml(name) + '</b><i>' + escapeHtml(sub || '') + '</i></div>';
}
function mpPeersOf(st){
  // 陶瓦 /state 若提供成员列表则展示；否则返回空
  const p = st && (st.peers || st.online || st.players || []);
  return Array.isArray(p) ? p : [];
}
function mpBubbleRender(st){
  const stage = $('#mpBubbles'), orbit = $('#mpBubOrbit'), center = $('#mpBubCenter');
  const peers = mpPeersOf(st);
  const me = mpAccName();
  if (st.state === 'host-ok' || st.state === 'host-starting' || st.state === 'host-scanning'){
    stage.style.display = 'block';
    center.innerHTML = mpBub(me + ' · 房主', st.state === 'host-ok' ? '邀请好友加入' : '房间准备中…', 'mp-bub-host');
    let inner = '';
    const known = peers.map(p => (typeof p === 'string' ? p : (p && (p.name || p.player || p.nickname)) || '好友')).filter(Boolean);
    for (let i = 0; i < Math.max(3, known.length); i++){
      if (i < known.length) inner += mpBub(known[i], '已加入', 'mp-bub-peer');
      else inner += mpBub('空位', '等待好友加入', 'mp-bub-wait');
    }
    orbit.innerHTML = inner;
    return;
  }
  if (st.state === 'guest-ok' || st.state === 'guest-connecting' || st.state === 'guest-starting'){
    stage.style.display = 'block';
    center.innerHTML = mpBub('房主', st.room || '', 'mp-bub-host');
    let inner = mpBub(me + ' · 房客', st.state === 'guest-ok' ? '已加入房间' : '连接中…', 'mp-bub-me');
    const known = peers.map(p => (typeof p === 'string' ? p : (p && (p.name || p.player || p.nickname)) || '好友')).filter(Boolean);
    for (let i = 0; i < Math.max(2, known.length); i++){
      if (i < known.length && known[i] !== me) inner += mpBub(known[i], '成员', 'mp-bub-peer');
      else inner += mpBub('空位', '等待成员', 'mp-bub-wait');
    }
    orbit.innerHTML = inner;
    return;
  }
  stage.style.display = 'none';
}
function mpRender(st){
  tcState = st;
  const t = $('#mpStateTitle'), s = $('#mpStateSub'), led = $('#mpStateLed');
  const roomBox = $('#mpRoomBox'), steps = $('#mpSteps');
  mpBubbleRender(st);
  if (st.state === 'host-scanning'){
    t.textContent = '正在扫描你的局域网世界…';
    s.textContent = '请进入游戏存档，按下 ESC → 对局域网开放 → 创建局域网世界，陶瓦将自动接入';
    led.style.background = 'var(--gold)';
    roomBox.style.display = 'none';
    steps.innerHTML = mpStepsHtml(['在启动器中选择好版本并启动游戏', '进入单人存档，按 ESC 打开菜单', '点击「对局域网开放」并创建']);
  } else if (st.state === 'host-starting'){
    t.textContent = '正在启动房间…';
    s.textContent = '陶瓦正在组建 P2P 网络，请稍候';
    led.style.background = 'var(--gold)';
    roomBox.style.display = 'none';
    steps.innerHTML = mpStepsHtml(['启动游戏并进入存档', '按 ESC → 对局域网开放', '等待房间就绪后分享邀请码']);
  } else if (st.state === 'host-ok'){
    t.textContent = '房间已就绪，邀请好友加入吧';
    s.textContent = '分享下方邀请码，好友在任意支持陶瓦的启动器中输入即可加入';
    led.style.background = 'var(--teal)';
    roomBox.style.display = 'block';
    $('#mpServerBox').style.display = 'none';
    $('#mpRoomCode').textContent = st.room;
    steps.innerHTML = mpStepsHtml(['在游戏中点击「对局域网开放」创建世界', '将邀请码分享给好友', '好友加入后即可一起游玩'], 2);
  } else if (st.state === 'guest-connecting' || st.state === 'guest-starting'){
    t.textContent = '正在加入房间…';
    s.textContent = '陶瓦正在建立 P2P 连接（' + (st.state === 'guest-starting' ? '难度 ' + (st.difficulty || '') : '寻找房主') + '），请稍候';
    led.style.background = 'var(--gold)';
    roomBox.style.display = 'none';
    steps.innerHTML = mpStepsHtml(['启动 Minecraft', '选择「多人游戏」，双击进入陶瓦联机大厅', '或使用备用地址 ' + (tcStateUrl(st) || '127.0.0.1')]);
  } else if (st.state === 'guest-ok'){
    t.textContent = '已加入房间，前往游戏连接吧';
    s.textContent = '在游戏多人游戏列表双击「陶瓦联机大厅」，或复制下方地址添加服务器';
    led.style.background = 'var(--teal)';
    roomBox.style.display = 'none';
    $('#mpServerBox').style.display = 'block';
    $('#mpServerAddr').textContent = st.url || '127.0.0.1:25565';
    steps.innerHTML = mpStepsHtml(['启动 Minecraft', '多人游戏 → 双击「陶瓦联机大厅」', '备用：添加服务器 ' + (st.url || '127.0.0.1:25565')], 2);
  } else if (st.state === 'exception'){
    $('#mpServerBox').style.display = 'none';
    const e = TC_ERR[st.type] || ['联机失败', '未知错误，请重试'];
    t.textContent = e[0];
    s.textContent = e[1];
    led.style.background = '#ff7b72';
    roomBox.style.display = 'none';
    steps.innerHTML = '<div class="mp-step"><i>!</i><span>点击「关闭联机」后重新开启，或检查网络后重试</span></div>';
  } else {
    $('#mpServerBox').style.display = 'none';
    t.textContent = '已就绪';
    s.textContent = '联机引擎运行正常，可以创建房间或加入房间';
    led.style.background = 'var(--teal)';
    roomBox.style.display = 'none';
  }
}
function tcStateUrl(st){ return st.url || ''; }
async function tcPoll(){
  mpStopPoll();
  tcTimer = setInterval(async () => {
    const r = await A.tcState();
    if (!r.ok){
      mpStopPoll();
      mpSetEngine(false, '联机引擎已退出');
      $('#mpStateTitle').textContent = '联机引擎已退出';
      $('#mpStateSub').textContent = r.error || '引擎可能因闲置自动退出，请重新开启';
      $('#mpStateLed').style.background = '#ff7b72';
      $('#mpRoomBox').style.display = 'none';
      toast('联机引擎已退出', '闲置 10 分钟会自动退出，请重新开启', 'warn');
      return;
    }
    const st = r.json;
    if (st.state !== 'waiting' && st.index === tcLastIndex) return;
    tcLastIndex = st.index;
    mpRender(st);
  }, 1500);
}
async function mpStartHost(){
  if (!await mpEnsureEngine()) return;
  tcMode = 'host'; tcLastIndex = -1;
  mpShowProgress();
  $('#mpStateTitle').textContent = '正在准备房间…';
  $('#mpStateSub').textContent = '正在启动联机引擎并扫描局域网';
  $('#mpRoomBox').style.display = 'none';
  const res = await A.tcScan(mpAccName());
  if (!res.ok){ toast('创建房间失败', res.error, 'error'); return; }
  tcPoll();
}
async function mpStartGuest(){
  const code = $('#mpCodeInput').value.trim();
  if (!code){ $('#mpCodeHint').textContent = '请输入房主的邀请码'; return; }
  if (!await mpEnsureEngine()) return;
  const res = await A.tcGuest(code, mpAccName());
  if (!res.ok){
    if (res.status === 400){ $('#mpCodeHint').textContent = '邀请码格式错误（应为 U/XXXX-XXXX-XXXX-XXXX）'; return; }
    toast('加入房间失败', res.error, 'error');
    return;
  }
  tcMode = 'guest'; tcLastIndex = -1;
  mpShowProgress();
  $('#mpStateTitle').textContent = '正在加入房间…';
  $('#mpStateSub').textContent = '正在通过陶瓦网络连接房主';
  $('#mpRoomBox').style.display = 'none';
  tcPoll();
}
async function mpClose(){
  await A.tcIde();
  await A.tcStop();
  mpStopPoll();
  mpSetEngine(false);
  tcState = null; tcLastIndex = -1;
  mpShowChoose();
  $('#mpServerBox').style.display = 'none';
  $('#mpCodeHint').textContent = '';
  toast('已关闭联机', '联机引擎已停止');
}
$('#mpCreateBtn').addEventListener('click', mpStartHost);
$('#mpJoinBtn').addEventListener('click', mpStartGuest);
$('#mpCloseBtn').addEventListener('click', mpClose);
$('#mpCopyBtn').addEventListener('click', async () => {
  const btn = $('#mpCopyBtn');
  try {
    await navigator.clipboard.writeText($('#mpRoomCode').textContent);
    toast('已复制邀请码', '发送给好友即可加入');
    btn.textContent = '已复制 ✓';
    btn.style.pointerEvents = 'none';
    setTimeout(() => { btn.textContent = '复制邀请码'; btn.style.pointerEvents = ''; }, 1600);
  }
  catch(e){ toast('复制失败', '请手动选择复制', 'warn'); }
});
$('#mpRoomCode').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#mpRoomCode').textContent); toast('已复制邀请码', '点击房间码也能复制'); }
  catch(e){}
});
$('#mpServerCopy').addEventListener('click', async () => {
  const btn = $('#mpServerCopy');
  try {
    await navigator.clipboard.writeText($('#mpServerAddr').textContent);
    toast('已复制服务器地址', '在游戏多人游戏中添加服务器即可进入');
    btn.textContent = '已复制 ✓';
    btn.style.pointerEvents = 'none';
    setTimeout(() => { btn.textContent = '复制服务器地址'; btn.style.pointerEvents = ''; }, 1600);
  }
  catch(e){ toast('复制失败', '请手动选择复制', 'warn'); }
});
$('#mpCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') mpStartGuest(); });
$('#mpCodeInput').addEventListener('input', e => {
  $('#mpCodeHint').textContent = '';
  // UX：邀请码自动转大写，降低输入错误率
  const v = e.target.value;
  const up = v.replace(/[a-z]/g, c => c.toUpperCase());
  if (up !== v) e.target.value = up;
});
$('#logClear').addEventListener('click', e => { e.stopPropagation(); $('#logBody').innerHTML = ''; });

$('#logExport').addEventListener('click', async e => {
  e.stopPropagation();
  try {
    const r = await A.exportLogs();
    if (r && r.ok) toast('日志已导出', r.path, 'ok');
    else if (r && r.error) toast('导出失败', r.error, 'err');
  } catch(err){ toast('导出失败', err && err.message || String(err), 'err'); }
});
function syncLogUI(){
  const open = $('#logDrawer').classList.contains('open');
  document.body.classList.toggle('log-open', open);
  $('#logToggle svg').innerHTML = open
    ? '<path d="m6 9.5 6 6 6-6"/>'
    : '<path d="m6 15 6-6 6 6"/>';
  $('#logToggleText').textContent = open ? '收起' : '展开';
}
function toggleLog(){
  $('#logDrawer').classList.toggle('open');
  syncLogUI();
}
$('#logToggle').addEventListener('click', e => { e.stopPropagation(); toggleLog(); });
$('#logHead').addEventListener('click', toggleLog);

/* ================= 版本管理页 ================= */
function typeTag(v){
  if (v.id === cfg.currentVersion) return '<span class="tag tag-cur">当前</span>';
  if (v.type === 'release') return '<span class="tag tag-new">正式版</span>';
  if (v.type === 'snapshot') return '<span class="tag tag-snap">快照</span>';
  return '<span class="tag tag-old">' + (v.type || '版本') + '</span>';
}
// 模组底层标注：原版 / Fabric / Forge / NeoForge
function loaderTag(v){
  const l = v.loader || loaderOfId(v.id);
  if (l === 'fabric') return '<span class="tag tag-fabric">Fabric</span>';
  if (l === 'forge') return '<span class="tag tag-forge">Forge</span>';
  if (l === 'neoforge') return '<span class="tag tag-neoforge">NeoForge</span>';
  return '<span class="tag tag-vanilla">原版</span>';
}
function loaderOfId(id){
  const t = String(id).toLowerCase();
  if (t.includes('neoforge')) return 'neoforge';
  if (t.includes('forge')) return 'forge';
  if (t.includes('fabric')) return 'fabric';
  return 'vanilla';
}
function vrRow(v, isBase){
  return '<div class="vr-row' + (v.id === cfg.currentVersion ? ' cur' : '') + '" data-ver="' + v.id + '">' +
      '<div class="vr-ico"><svg viewBox="0 0 24 24"><path d="M12 2.8 21 7.5v9L12 21.2 3 16.5v-9z"/><path d="M3 7.5l9 4.7 9-4.7"/><path d="M12 12.2v9"/></svg></div>' +
      '<div class="vr-info">' +
        '<div class="vr-name">' + v.id + ' ' + loaderTag(v) + ' ' + typeTag(v) + (v.installed ? '' : '<span class="tag tag-old">缺主程序</span>') + (isBase ? '<span class="tag tag-base">底层依赖</span>' : '') + '</div>' +
        '<div class="vr-meta"><span>Java ' + (v.javaMajor || '自动') + '</span><span>' + (v.type || 'release') + '</span>' + (v.releaseTime ? '<span>' + v.releaseTime.slice(0,10) + '</span>' : '') + (isBase ? '<span>' + v.baseRefs.length + ' 个版本依赖</span>' : '') + '</div>' +
      '</div>' +
      '<div class="vr-actions">' +
        (v.id === cfg.currentVersion ? '' : '<button class="btn btn-mini" data-act="set" data-ver="' + v.id + '">设为当前</button>') +
        '<button class="btn btn-mini" data-act="dup" data-ver="' + v.id + '" title="复制版本">复制</button>' +
        '<button class="btn btn-mini" data-act="launch" data-ver="' + v.id + '" ' + (v.installed ? '' : 'disabled') + '>启动</button>' +
        (isBase
          ? '<button class="btn btn-mini" disabled title="该版本是其他版本的底层依赖，删除会导致其无法启动">删除</button>'
          : '<button class="btn btn-mini" data-act="del" data-ver="' + v.id + '" title="删除版本" style="color:#ff8a94">删除</button>') +
      '</div>' +
    '</div>';
}
function renderVersions(){
  const q = ($('#verSearch').value || '').trim().toLowerCase();
  const all = versions.filter(v => !q || v.id.toLowerCase().includes(q));
  const list = all.filter(v => !(v.isBase && !v.userOriginal));       // 主版本（含用户主动下载的原版）
  const baseGroup = all.filter(v => v.isBase && !v.userOriginal);      // 底层依赖（随加载器自动创建的原版）
  const total = versions.length;
  $('#verCount').textContent = total + (baseGroup.length ? '（含底层 ' + baseGroup.length + '）' : '');
  const box = $('#vrList');
  if (!versions.length){
    box.innerHTML = '<div class="vr-empty">尚未安装任何游戏版本<br><b>前往「下载中心」选择并下载一个版本</b></div>';
    return;
  }
  let html = list.map(v => vrRow(v, false)).join('');
  if (baseGroup.length){
    html += '<div class="vr-base-folder">' +
      '<button class="vr-base-head" data-act="toggleBase">' +
        '<svg class="vr-base-arrow" viewBox="0 0 24 24"><path d="m6 9.5 6 6 6-6"/></svg>' +
        '<span>底层依赖（' + baseGroup.length + '）· 随加载器自动下载，不可单独删除</span>' +
      '</button>' +
      '<div class="vr-base-body">' + baseGroup.map(v => vrRow(v, true)).join('') + '</div>' +
    '</div>';
  }
  box.innerHTML = html || '<div class="vr-empty">没有匹配「' + q + '」的版本</div>';
  $$('#vrList [data-act="toggleBase"]').forEach(b => {
    b.addEventListener('click', () => {
      const body = b.parentElement.querySelector('.vr-base-body');
      b.parentElement.classList.toggle('open');
      body.style.display = b.parentElement.classList.contains('open') ? 'block' : 'none';
    });
  });
  $$('#vrList [data-act]').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      const id = b.dataset.ver;
      const act = b.dataset.act;
      if (act === 'set'){
        cfg.currentVersion = id;
        A.setConfig({ currentVersion: id });
        renderVersions(); updateHome(); renderDrop();
        toast('已设为当前版本', id, 'ok');
      } else if (act === 'dup'){
        modal('复制版本为（新版本 ID）', {
          value: id + '-copy',
          required: true,
          onOk: async newId => {
            try {
              await A.duplicateVersion(id, newId);
              toast('版本复制完成', newId, 'ok');
              await refreshEnv();
            } catch(err){ toast('复制失败', err.message, 'warn'); }
          }
        });
      } else if (act === 'del'){
        confirmDlg('确定删除版本「' + id + '」吗？此操作不可恢复。', async () => {
          try {
            await A.deleteVersion(id);
            toast('版本已删除', id);
            await refreshEnv();
          } catch(err){ toast('删除失败', err.message, 'warn'); }
        });
      } else {
        cfg.currentVersion = id;
        A.setConfig({ currentVersion: id });
        updateHome(); renderDrop();
        $('#btnPlay').click();
      }
    });
  });
}
$('#verSearch').addEventListener('input', renderVersions);
let vFilter = 'all';
$$('.vr-toolbar .chip').forEach(ch => ch.addEventListener('click', () => {
  $$('.vr-toolbar .chip').forEach(c => c.classList.remove('on'));
  ch.classList.add('on');
  vFilter = ch.dataset.filter;
  applyVFilter();
}));
function applyVFilter(){
  $$('#vrList .vr-row').forEach(r => {
    const v = versions.find(x => x.id === r.dataset.ver);
    if (!v) return;
    const show = vFilter === 'all' ||
      (vFilter === 'release' && v.type === 'release') ||
      (vFilter === 'snapshot' && v.type === 'snapshot') ||
      (vFilter === 'old' && v.type !== 'release' && v.type !== 'snapshot');
    r.style.display = show ? '' : 'none';
  });
}

/* ================= 版本资源管理：模组 / 存档 / 光影 / 整合包 ================= */
const MGR_ICON = {
  mods: '<svg viewBox="0 0 24 24"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/></svg>',
  saves: '<svg viewBox="0 0 24 24"><path d="M4 5.5h16v13H4z"/><path d="M4 9.5h16"/><path d="M8 5.5v13"/></svg>',
  shaderpacks: '<svg viewBox="0 0 24 24"><path d="M4 17.5 8.5 6l3 8 2.5-5.5L17 17.5z"/><circle cx="16.5" cy="6.5" r="1.6"/></svg>',
  packs: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5"/><path d="M12 12v9"/></svg>'
};
const MGR_NAME = { mods: '模组管理', saves: '存档管理', shaderpacks: '光影管理', packs: '整合包管理' };
let mgrKind = 'mods';
function mgrSubText(){
  const ver = cfg.currentVersion || '';
  if (mgrKind === 'packs') return '已安装版本目录 · versions';
  return (ver ? '版本「' + ver + '」' : '当前游戏目录') + (cfg.isolation ? '（版本隔离）' : '') + ' · ' + mgrKind;
}
function openMgr(kind){
  mgrKind = kind;
  $('#mgrTitle').textContent = MGR_NAME[kind];
  $('#mgrSub').textContent = mgrSubText();
  $('#mgrIcon').innerHTML = MGR_ICON[kind];
  $('#mgrActions').innerHTML = kind === 'packs'
    ? '<button class="btn btn-glow" id="mgrImport"><svg viewBox="0 0 24 24"><path d="M12 5v10"/><path d="m7.5 11.5 4.5 4.5 4.5-4.5"/><path d="M4 19.5h16"/></svg>导入整合包（zip / mrpack）</button>'
    : kind === 'saves'
    ? '<button class="btn btn-glow" id="mgrImportSave"><svg viewBox="0 0 24 24"><path d="M12 5v10"/><path d="m7.5 11.5 4.5 4.5 4.5-4.5"/><path d="M4 19.5h16"/></svg>导入存档（zip）</button>'
    : '';
  $('#mgrMask').classList.add('open');
  $('#mgrPanel').classList.add('open');
  if ($('#mgrImport')) $('#mgrImport').addEventListener('click', importPack);
  if ($('#mgrImportSave')) $('#mgrImportSave').addEventListener('click', importSave);
  loadMgr();
}
function closeMgr(){
  $('#mgrMask').classList.remove('open');
  $('#mgrPanel').classList.remove('open');
}
$('#mgrMask').addEventListener('click', closeMgr);
$('#mgrClose').addEventListener('click', closeMgr);
$('#mgrOpen').addEventListener('click', () => {
  A.mgrOpen(mgrKind, cfg.currentVersion || '');
  toast('已打开文件夹', mgrSubText(), 'ok');
});
$$('.vm-btn').forEach(b => b.addEventListener('click', () => openMgr(b.dataset.mgr)));
async function loadMgr(){
  const list = await A.mgrList(mgrKind, cfg.currentVersion || '');
  const box = $('#mgrList');
  const empty = $('#mgrEmpty');
  if (!list || !list.length){ box.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  const fmt = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(0) + ' KB' : n + ' B';
  const d = e => new Date(e.mtime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  box.innerHTML = list.map(e => {
    const isMod = mgrKind === 'mods', isSave = mgrKind === 'saves';
    const ic = isMod
      ? '<svg viewBox="0 0 24 24"><path d="M12 3 5 5.8v5.4c0 4.4 3 8 7 9.8 4-1.8 7-5.4 7-9.8V5.8z"/></svg>'
      : isSave
      ? '<svg viewBox="0 0 24 24"><path d="M5 4.5h9.5L19 9v10.5H5z"/><path d="M14.5 4.5V9H19"/><path d="M8.5 14h7"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4 17.5 8.5 6l3 8 2.5-5.5L17 17.5z"/></svg>';
    return '<div class="mgr-item">' +
      '<div class="mgr-iico">' + ic + '</div>' +
      '<div class="mgr-info">' +
        '<div class="mgr-name">' + escapeHtml(isSave && e.label ? e.label : e.name) + '</div>' +
        '<div class="mgr-meta"><span>' + (isSave ? e.name : e.name) + '</span><span>' + fmt(e.size) + '</span><span>' + d(e) + '</span></div>' +
      '</div>' +
      '<div class="mgr-ops">' +
        (isMod
          ? '<span class="mgr-sw ' + (e.enabled ? 'on' : '') + '" data-act="tog" data-name="' + escapeHtml(e.name) + '" title="点击切换启用状态"><i></i>' + (e.enabled ? '已启用' : '已禁用') + '</span>'
          : '') +
        '<button class="btn btn-mini mgr-del" data-act="del" data-name="' + escapeHtml(e.name) + '">删除</button>' +
      '</div>' +
    '</div>';
  }).join('');
  $$('#mgrList [data-act]').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    const name = b.dataset.name;
    if (b.dataset.act === 'tog'){
      const r = await A.mgrToggle('mods', name);
      if (r && r.ok){ toast('模组已' + (r.enabled ? '启用' : '禁用'), name, 'ok'); loadMgr(); }
      else toast('操作失败', (r && r.msg) || '', 'warn');
    } else if (b.dataset.act === 'del'){
      confirmDlg('确定删除「' + name + '」吗？此操作不可恢复。', async () => {
        const r = await A.mgrDelete(mgrKind, name, cfg.currentVersion || '');
        if (r && r.ok){ toast('已删除', name); loadMgr(); }
        else toast('删除失败', (r && r.msg) || '', 'warn');
      });
    }
  }));
}
async function importPack(){
  const r = await A.mgrImport();
  if (r && r.ok){
    toast('整合包导入成功', r.name + (r.needLoader ? '（已自动安装加载器）' : ''), 'ok');
    loadMgr();
    refreshEnv();
  } else if (r){
    toast('导入失败', r.msg || '', 'warn');
  }
}
async function importSave(){
  const r = await A.mgrImportSaves(cfg.currentVersion || '');
  if (r && r.ok){
    toast('存档导入成功', r.name, 'ok');
    loadMgr();
  } else if (r){
    toast('导入失败', r.msg || '', 'warn');
  }
}

/* ================= 下载中心 ================= */
async function loadManifest(){
  try {
    $('#dlSub').textContent = '正在获取版本清单…';
    manifest = await A.getManifest();
    manifestLoaded = true;
    $('#dlSub').textContent = 'BMCLAPI / Mojang 官方 · 共 ' + manifest.versions.length + ' 个版本';
    renderDl();
  } catch(e){
    $('#dlSub').textContent = '获取版本清单失败：' + e.message;
    toast('版本清单获取失败', e.message, 'warn');
  }
}
let dlFilter = 'release';
// 特色版（愚人节等）：Mojang 清单中的特殊 id
function isSpecial(v){
  return /_or_|oneblockatatime|infinite$|^1\.RV/i.test(v.id);
}
const DL_TAG = { release: '正式版', snapshot: '快照', special: '特色版', old: '远古版' };
const DL_DESC = { release: '最新正式版本，稳定游玩体验', snapshot: '每周开发快照，抢先体验新内容', special: '愚人节等特色版本，官方特别整活内容', old: '远古 Alpha / Beta 版本，怀旧体验' };
/* 全部可下载版本：分页展示，每页 50 个，可一直加载到全部 */
const DL_PAGE_SIZE = 50;
let dlAll = [];
let dlShown = 0;
function renderDl(){
  if (!manifest) return;
  if (dlFilter === 'old'){
    dlAll = manifest.versions.filter(v => v.type === 'old_beta' || v.type === 'old_alpha');
  } else if (dlFilter === 'special'){
    dlAll = manifest.versions.filter(v => v.type === 'snapshot' && isSpecial(v));
  } else if (dlFilter === 'snapshot'){
    dlAll = manifest.versions.filter(v => v.type === 'snapshot' && !isSpecial(v));
  } else {
    dlAll = manifest.versions.filter(v => v.type === 'release');
  }
  dlShown = 0;
  renderDlMore(true);
}
function renderDlMore(forceAll){
  if (!manifest) return;
  const end = forceAll ? dlAll.length : Math.min(dlShown + DL_PAGE_SIZE, dlAll.length);
  const chunk = dlAll.slice(dlShown, end);
  dlShown = end;
  // 全量渲染先清空，避免与上一次渲染重复叠加
  const prev = forceAll ? '' : $('#dlGrid').innerHTML;
  const cards = chunk.map(v =>
    '<div class="dl-card" data-id="' + v.id + '" style="animation-delay:' + (chunk.indexOf(v) % 12 * 40) + 'ms">' +
      '<div class="dl-top">' +
        '<div class="dl-ico"><svg viewBox="0 0 24 24"><path d="M12 2.8 21 7.5v9L12 21.2 3 16.5v-9z"/><path d="M3 7.5l9 4.7 9-4.7"/><path d="M12 12.2v9"/></svg></div>' +
        '<div class="dl-name">' + v.id + '</div>' +
        '<span class="dl-tag">' + (DL_TAG[dlFilter] || '') + '</span>' +
      '</div>' +
      '<div class="dl-desc">' + (DL_DESC[dlFilter] || '') + '</div>' +
      '<div class="dl-meta"><span>' + (v.releaseTime || '').slice(0,10) + '</span><span>' + v.type + '</span>' +
        '<span class="dl-go">选择安装方式<svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg></span>' +
      '</div>' +
    '</div>'
  ).join('');
  $('#dlGrid').innerHTML = prev + cards;
  const empty = $('#dlGrid').querySelector('.rs-empty');
  if (empty) empty.remove();
  if (!dlAll.length){
    $('#dlGrid').innerHTML = '<div class="rs-empty">该分类暂无版本</div>';
  }
  $$('#dlGrid .dl-card').forEach(c => {
    if (!c._bound){ c._bound = true; c.addEventListener('click', () => openDlOpt(c.dataset.id)); }
  });
  const wrap = $('#dlMoreWrap');
  const info = $('#dlMoreInfo');
  if (dlShown >= dlAll.length){
    wrap.classList.add('done');
    info.textContent = '共 ' + dlAll.length + ' 个版本 · 已全部展示';
    const mb = $('#dlMoreBtn');
    if (mb){ mb.textContent = '已加载全部版本'; mb.disabled = true; }
  } else {
    wrap.classList.remove('done');
    info.textContent = '已展示 ' + dlShown + ' / ' + dlAll.length + ' 个版本';
    const mb = $('#dlMoreBtn');
    if (mb){ mb.disabled = false; mb.textContent = '加载更多版本'; }
  }
}
$('#dlMoreBtn').addEventListener('click', () => renderDlMore());
$$('.dl-filter .chip').forEach(ch => ch.addEventListener('click', () => {
  $$('.dl-filter .chip').forEach(c => c.classList.remove('on'));
  ch.classList.add('on');
  dlFilter = ch.dataset.dl;
  renderDl();
}));

/* --- 下载选项弹层：仅原版 / 原版+加载器 --- */
const LD_NAME = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' };
let dlOptBusy = false;
async function openDlOpt(id){
  if (dlOptBusy){ toast('已有下载任务进行中', '请等待当前任务完成', 'warn'); return; }
  $('#dlOptMask').classList.add('open');
  $('#dlOptTitle').textContent = '下载 Minecraft ' + id;
  $('#dlOptOpts').dataset.id = id;
  const opts = [
    { opt: '', name: '仅下载原版', desc: '纯净原版体验，推荐先确认可正常启动', ic: '<svg viewBox="0 0 24 24"><path d="M12 2.8 21 7.5v9L12 21.2 3 16.5v-9z"/><path d="M3 7.5l9 4.7 9-4.7"/></svg>' },
    { opt: 'fabric', name: '原版 + Fabric', desc: '轻量模组加载器，适配多数优化与功能模组', ic: '<svg viewBox="0 0 24 24"><path d="M12 3 5 5.8v5.4c0 4.4 3 8 7 9.8 4-1.8 7-5.4 7-9.8V5.8z"/></svg>' },
    { opt: 'forge', name: '原版 + Forge', desc: '经典模组加载器，兼容大量老牌大型模组', ic: '<svg viewBox="0 0 24 24"><path d="M12 3 5 5.8v5.4c0 4.4 3 8 7 9.8 4-1.8 7-5.4 7-9.8V5.8z"/></svg>' },
    { opt: 'neoforge', name: '原版 + NeoForge', desc: 'Forge 继任者，面向最新版本的模组生态', ic: '<svg viewBox="0 0 24 24"><path d="M12 3 5 5.8v5.4c0 4.4 3 8 7 9.8 4-1.8 7-5.4 7-9.8V5.8z"/></svg>' }
  ];
  $('#dlOptOpts').innerHTML = opts.map(o =>
    '<button class="dlopt-opt" data-opt="' + o.opt + '">' +
      '<span class="oo-ico">' + o.ic + '</span>' +
      '<span class="oo-txt"><b>' + o.name + '</b><i>' + o.desc + '</i></span>' +
      '<span class="oo-go">下载</span>' +
    '</button>'
  ).join('');
  // 12.0：点加载器选项 → 展开「底层版本」选择区；仅原版直接下载
  const sel = $('#dlOptLvSel');
  sel.innerHTML = '<option value="">正在获取版本列表…</option>';
  $('#dlOptVer').style.display = 'none';
  pendingLv = '';
  $$('#dlOptOpts .dlopt-opt').forEach(b => b.addEventListener('click', async () => {
    const id = $('#dlOptOpts').dataset.id, opt = b.dataset.opt;
    if (!opt){ startDlOpt(id, '', ''); return; }
    pendingLv = opt;
    $('#dlOptVer').style.display = 'block';
    $('#dlOptVer').classList.add('loading');
    sel.disabled = true;
    sel.innerHTML = '<option value="">正在获取版本列表…</option>';
    let list = [];
    try {
      if (opt === 'fabric') list = await A.fabricLoaderVersions(id) || [];
      else if (opt === 'forge'){
        // BMCLAPI 该 MC 的全部 Forge 版本（最新在前，启动器推荐第一个）
        list = await A.forgeVersions(id) || [];
      }
      else list = await A.neoforgeVersions(id) || [];
    } catch(e){ list = []; }
    sel.disabled = false;
    $('#dlOptVer').classList.remove('loading');
    if (!list.length){
      sel.innerHTML = '<option value="">暂不支持 · 可前往版本管理手动安装</option>';
      $('#dlOptLvTip').innerHTML = '未获取到可用版本，请稍后再试，或使用「仅原版」下载';
      return;
    }
    // 推荐版本 = 列表首个（主版本匹配已在 main 侧过滤）
    const rec = list[0];
    sel.innerHTML = list.map(v => '<option value="' + v + '"' + (v === rec ? ' selected' : '') + '>' + v + (v === rec ? '（推荐）' : '') + '</option>').join('');
    $('#dlOptLvTip').innerHTML = '<b>推荐版本：' + rec + '</b>（启动器已为你挑选兼容稳定的版本，也可自行选择其他版本）';
  }));
  // 后台探测加载器源：不可达的选项补标"暂不支持"
  A.loaderSourceOk().then(srcOk => {
    opts.forEach(o => {
      if (!o.opt || srcOk[o.opt]) return;
      const el = $('#dlOptOpts [data-opt="' + o.opt + '"]');
      if (el){
        el.classList.add('ns');
        el.disabled = true;
        el.querySelector('.oo-go').textContent = '暂不支持';
      }
    });
  }).catch(() => {});
}
$('#dlOptGo').addEventListener('click', () => {
  const id = $('#dlOptOpts').dataset.id;
  if (!id || !dlOptLvSelOk()) return;
  startDlOpt(id, pendingLv || '', $('#dlOptLvSel').value);
});
let pendingLv = '';
function dlOptLvSelOk(){ return true; }
$('#dlOptCancel').addEventListener('click', () => $('#dlOptMask').classList.remove('open'));
$('#dlOptMask').addEventListener('click', e => { if (e.target === $('#dlOptMask')) $('#dlOptMask').classList.remove('open'); });

function startDlOpt(id, opt, lv){
  if (opt && lv === ''){
    // 用户在版本选择区未确认时：取当前下拉值（含推荐）
    const sv = $('#dlOptLvSel').value;
    if (!sv || sv === '正在获取版本列表…'){ toast('正在获取底层版本列表', '请稍候再试', 'warn'); return; }
    lv = sv;
  }
  $('#dlOptMask').classList.remove('open');
  if (dlOptBusy){ toast('已有下载任务进行中', '请等待当前任务完成', 'warn'); return; }
  dlOptBusy = true;
  dlCurrentId = id;
  const key = 'ver:' + id;
  const it = dlEnsure(key, id + (opt ? ' · 原版+' + LD_NAME[opt] : ' · 仅原版'));
  it.status.textContent = '准备中…';
  dlWithLoader = opt ? { id, type: opt } : null;
  const p = opt ? A.downloadVersionWithLoader(id, opt, lv) : A.downloadVersion(id);
  toast(opt ? '开始下载并安装加载器' : '开始下载原版', id + (opt ? ' · ' + LD_NAME[opt] : ''), 'ok');
  p.then(res => {
    if (!res.ok){
      it.status.textContent = '失败';
      it.el.classList.add('done'); it.done = true;
      setTimeout(() => { it.el.remove(); dlItems.delete(key); updateDlCount(); }, 8000);
      toast('下载失败', res.error, 'warn');
    } else if (opt){
      it.status.textContent = '加载器安装完成';
      it.pct.textContent = '100%';
      it.bar.style.width = '100%';
      dlFinish(key);
      toast('原版与加载器安装完成', id + ' · ' + LD_NAME[opt] + ' 已就绪', 'ok');
      refreshEnv();
    } else {
      dlFinish(key);
      toast('版本下载完成', id, 'ok');
      refreshEnv();
    }
  }).catch(err => {
    it.status.textContent = '失败';
    it.el.classList.add('done'); it.done = true;
    setTimeout(() => { it.el.remove(); dlItems.delete(key); updateDlCount(); }, 8000);
    toast('下载失败', err.message, 'warn');
  }).finally(() => { dlOptBusy = false; dlWithLoader = null; dlCurrentId = ''; });
}

/* --- 下载任务队列 --- */
const dlItems = new Map(); // key -> {el, status, pct, done}
function dlKey(p){
  if (p.task === '版本信息') return dlCurrentId ? 'ver:' + dlCurrentId : '';
  return p.task === '资源下载' ? ('res:' + (p.name || '资源')) : ('ver:' + p.task);
}
function dlEnsure(key, name){
  let it = dlItems.get(key);
  if (it) return it;
  const el = document.createElement('div');
  el.className = 'queue-item';
  el.innerHTML = '<div class="qi-top"><span class="qi-name"></span><span class="qi-status"></span><span class="qi-pct"></span></div><div class="pbar"><div class="pb-fill"></div></div>';
  el.querySelector('.qi-name').textContent = name;
  $('#dlQueue').prepend(el);
  it = { el, status: el.querySelector('.qi-status'), pct: el.querySelector('.qi-pct'), bar: el.querySelector('.pb-fill'), done: false };
  dlItems.set(key, it);
  updateDlCount();
  return it;
}
function dlFinish(key){
  const it = dlItems.get(key);
  if (!it) return;
  it.done = true;
  it.el.classList.add('done');
  it.status.textContent = '已完成';
  it.pct.textContent = '100%';
  it.bar.style.width = '100%';
  setTimeout(() => { it.el.remove(); dlItems.delete(key); updateDlCount(); }, 8000);
  updateDlCount();
}
function updateDlCount(){
  const active = Array.from(dlItems.values()).filter(x => !x.done).length;
  const items = dlItems.size;
  const f = $('#dlFloat');
  if (items){
    f.style.display = '';
    $('#dlFloatCount').textContent = active + ' 个进行中 · 共 ' + items + ' 个任务';
  } else {
    f.style.display = 'none';
  }
}
A.onDownloadProgress(p => {
  const key = dlKey(p);
  if (!key) return;
  if (p.phase === 'allDone'){
    if (dlWithLoader && key === 'ver:' + dlWithLoader.id){
      const it = dlItems.get(key);
      if (it) it.status.textContent = '原版完成 · 正在安装 ' + LD_NAME[dlWithLoader.type] + '…';
      return;
    }
    const it = dlItems.get(key);
    if (it) dlFinish(key);
    return;
  }
  let it = dlItems.get(key);
  if (!it){
    it = dlEnsure(key, p.task === '资源下载' ? (p.name || '资源') : p.task);
  }
  if (p.name && key.startsWith('res:')) it.el.querySelector('.qi-name').textContent = p.name;
  let pv = 0, label = '';
  if (p.phase === 'start'){ label = '获取版本信息…'; pv = 0.02; }
  else if (p.phase === 'jar'){ label = '下载主程序'; pv = p.total ? p.received / p.total : 0; }
  else if (p.phase === 'lib'){ label = '下载依赖库 ' + ((p.index||0) + 1) + '/' + (p.totalLibs||'?'); pv = p.totalLibs ? ((p.index||0) + (p.total ? p.received/p.total : 0)) / p.totalLibs : 0; }
  else if (p.phase === 'index'){ label = '下载资源索引'; pv = p.total ? p.received / p.total : 0.5; }
  else if (p.phase === 'asset'){ label = '下载资源文件 ' + (p.index||0) + '/' + (p.totalObjs||'?'); pv = p.totalObjs ? (p.index||0) / p.totalObjs : 0; }
  else if (p.phase === 'mods' || p.phase === 'shaderpacks' || p.phase === 'resourcepacks' || p.phase === 'modpacks'){ label = '下载资源'; pv = p.total ? p.received / p.total : 0; }
  if (label) it.status.textContent = label;
  it.pct.textContent = Math.round(pv * 100) + '%';
  it.bar.style.width = Math.round(pv * 100) + '%';
});
$('#dlFloatCancel').addEventListener('click', () => {
  A.cancelDownload();
  toast('下载已取消', '可重新选择版本下载');
});
$('#dlFloatToggle').addEventListener('click', () => {
  const f = $('#dlFloat');
  const min = f.classList.toggle('min');
  $('#dlFloatToggle').textContent = min ? '展开' : '收起';
});
$('#dlFloatHead').addEventListener('click', e => {
  if (e.target.closest('button')) return;
  const f = $('#dlFloat');
  const min = f.classList.toggle('min');
  $('#dlFloatToggle').textContent = min ? '展开' : '收起';
});
$('#mirrorChip').addEventListener('click', () => go('settings'));
$('#javaGuideBar').addEventListener('click', () => go('settings'));
$('#javaGuideBarHome').addEventListener('click', () => go('settings'));

/* ================= 资源中心 ================= */
let rsVersion = 'all', rsLoader = 'all';
// 常用加载器标识（Modrinth categories）
const RS_LOADER_META = {
  fabric: { t: 'Fabric', c: '#3ee6ff' },
  forge: { t: 'Forge', c: '#ffb26b' },
  neoforge: { t: 'NeoForge', c: '#6bffb2' },
  quilt: { t: 'Quilt', c: '#c9b8ff' }
};
async function searchRs(q){
  $('#rsGrid').innerHTML = '<div class="rs-empty" style="grid-column:1/-1">正在从 Modrinth 搜索…</div>';
  try {
    const hits = await A.searchModrinth(q, rsType, rsVersion, rsLoader);
    if (!hits.length){
      $('#rsGrid').innerHTML = '<div class="rs-empty" style="grid-column:1/-1">没有找到相关资源 · 换个关键词或筛选条件试试</div>';
      return;
    }
    $('#rsGrid').innerHTML = hits.map(h =>
      '<div class="rs-card" data-id="' + h.id + '">' +
        '<div class="rs-top">' +
          (h.icon
            ? '<img class="rs-ico" src="' + escapeHtml(h.icon) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
            : '<div class="rs-ico"><svg viewBox="0 0 24 24"><rect x="3.5" y="10" width="17" height="11" rx="3"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"/></svg></div>') +
          '<div class="rs-name" title="' + escapeHtml(h.title) + '">' + escapeHtml(h.title) + '</div>' +
        '</div>' +
        '<div class="rs-desc">' + escapeHtml(h.description || '') + '</div>' +
        '<div class="rs-meta">' +
          rsLoaderBadges(h) + rsVersionBadges(h) +
        '</div>' +
        '<div class="rs-foot"><span>⬇ ' + fmtNum(h.downloads) + '</span><span>' + escapeHtml(h.author || '') + '</span>' +
          '<span class="rs-dl">详情<svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg></span>' +
        '</div>' +
      '</div>'
    ).join('');
    $$('#rsGrid .rs-card').forEach(c => c.addEventListener('click', () => openRsDetail(hits.find(x => x.id === c.dataset.id))));

  } catch(e){
    $('#rsGrid').innerHTML = '<div class="rs-empty" style="grid-column:1/-1">搜索失败：' + escapeHtml(e.message) + '</div>';
  }
}
/* 卡片直接展示支持的底层徽章 */
function rsLoaderBadges(h){
  const cats = h.categories || [];
  const loaders = cats.filter(c => RS_LOADER_META[c]);
  if (!loaders.length) return '';
  return '<span class="rs-badges">' + loaders.slice(0, 3).map(c => {
    const m = RS_LOADER_META[c];
    return '<span class="rs-badge" style="color:' + m.c + ';border-color:' + m.c + '55;background:' + m.c + '14">' + m.t + '</span>';
  }).join('') + '</span>';
}
/* 卡片直接展示支持的游戏版本 */
function rsVersionBadges(h){
  const vs = (h.versions || []).filter(v => /^\d+\.\d+(\.\d+)?$/.test(v));
  if (!vs.length) return '';
  const show = vs.slice(0, 3);
  const more = vs.length - show.length;
  return '<span class="rs-vers">' + show.join(' · ') + (more > 0 ? ' <i>+' + more + '</i>' : '') + '</span>';
}
function fmtNum(n){
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
function fmtSize(n){
  if (!n) return '';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  return Math.max(1, Math.round(n / 1024)) + ' KB';
}
$('#rsGo').addEventListener('click', () => searchRs($('#rsSearch').value.trim()));
$('#rsSearch').addEventListener('keydown', e => { if (e.key === 'Enter') searchRs(e.target.value.trim()); });
$('#rsVersion').addEventListener('change', () => { rsVersion = $('#rsVersion').value; searchRs($('#rsSearch').value.trim()); });
$('#rsLoader').addEventListener('change', () => { rsLoader = $('#rsLoader').value; searchRs($('#rsSearch').value.trim()); });
$$('.rs-tabs .chip').forEach(ch => ch.addEventListener('click', () => {
  $$('.rs-tabs .chip').forEach(c => c.classList.remove('on'));
  ch.classList.add('on');
  rsType = ch.dataset.rs;
  // 底层筛选仅对模组有意义，其他类型隐藏
  $('#rsfLoaderWrap').style.display = rsType === 'mod' ? '' : 'none';
  searchRs($('#rsSearch').value.trim());
}));

/* --- 资源详情抽屉：支持源 + 版本单独下载 --- */
async function openRsDetail(hit){
  const detail = $('#rsDetail'), mask = $('#rsMask');
  $('#rsdBody').innerHTML = '<div class="rs-empty">正在获取项目详情…</div>';
  $('#rsdIcon').innerHTML = '<svg viewBox="0 0 24 24"><rect x="3.5" y="10" width="17" height="11" rx="3"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"/></svg>';
  $('#rsdName').textContent = hit.title;
  $('#rsdMeta').textContent = fmtNum(hit.downloads) + ' 下载 · ' + (hit.author || '');
  currentRs = hit;
  detail.classList.add('open'); mask.classList.add('open');
  try {
    const p = await A.modrinthProject(hit.id);
    if (currentRs !== hit) return;
    $('#rsdName').textContent = p.title;
    $('#rsdMeta').textContent = fmtNum(p.downloads) + ' 下载 · ' + (p.followers || 0) + ' 收藏 · ' + p.author;
    $('#rsdIcon').innerHTML = p.icon
      ? '<img src="' + p.icon + '" alt="" onerror="this.style.display=\'none\'">'
      : '<svg viewBox="0 0 24 24"><rect x="3.5" y="10" width="17" height="11" rx="3"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"/></svg>';
    const chips = (arr, onSet) => arr.slice(0, 24).map(x => '<span' + (onSet && onSet.has(x) ? ' class="on"' : '') + '>' + escapeHtml(x) + '</span>').join('') || '<span style="opacity:.5">不限</span>';
    const loaderSet = new Set((p.versions || []).flatMap(v => v.loaders || []));
    const gameSet = new Set((p.versions || []).flatMap(v => v.game_versions || []));
    $('#rsdBody').innerHTML =
      (p.description ? '<div class="rsd-desc">' + escapeHtml(p.description) + '</div>' : '') +
      '<div class="rsd-block"><div class="rsd-block-t">支持的加载器（底层）</div><div class="rsd-chips">' + chips(p.loaders || [], loaderSet) + '</div></div>' +
      '<div class="rsd-block"><div class="rsd-block-t">支持的游戏版本</div><div class="rsd-chips">' + chips(p.game_versions || [], gameSet) + '</div></div>' +
      '<div class="rsd-block"><div class="rsd-block-t">全部版本 · 点击单独下载（' + p.versions.length + '）</div>' +
        '<div class="rsd-vers">' + p.versions.slice(0, 40).map(v =>
          '<div class="rsd-ver" data-ver-id="' + v.id + '">' +
            '<div class="rsd-ver-info">' +
              '<div class="rsd-ver-name">' + escapeHtml(v.version_number || v.name || v.id) + '</div>' +
              '<div class="rsd-ver-meta">' +
                v.game_versions.slice(0, 3).map(g => '<i>' + escapeHtml(g) + '</i>').join('') +
                v.loaders.slice(0, 3).map(l => '<i>' + escapeHtml(l) + '</i>').join('') +
              '</div>' +
            '</div>' +
            '<span class="rsd-ver-size">' + fmtSize(v.files[0] && v.files[0].size) + '</span>' +
            '<button class="btn btn-mini" data-dl="' + v.id + '" data-fn="' + escapeHtml(v.files[0] ? v.files[0].filename : '') + '">下载</button>' +
          '</div>'
        ).join('') + '</div></div>';
    $$('#rsdBody [data-dl]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const vid = b.dataset.dl, fn = b.dataset.fn;
      const key = 'res:' + fn;
      const it = dlEnsure(key, fn);
      it.status.textContent = '准备中…';
      toast('开始下载', p.title + ' · ' + fn, 'ok');
      A.downloadModrinthVersion(p.id, vid, rsType).then(r => {
        if (r && r.file) dlFinish(key);
        toast('资源下载完成', r.file + ' 已保存至 ' + r.dir, 'ok');
        if (rsType === 'mod') refreshMods();
      }).catch(err => {
        it.status.textContent = '失败';
        it.done = true;
        setTimeout(() => { it.el.remove(); dlItems.delete(key); updateDlCount(); }, 8000);
        toast('资源下载失败', err.message, 'warn');
      });
    }));
  } catch(e){
    if (currentRs === hit) $('#rsdBody').innerHTML = '<div class="rs-empty">获取详情失败：' + escapeHtml(e.message) + '</div>';
  }
}
$('#rsdClose').addEventListener('click', closeRsDetail);
$('#rsMask').addEventListener('click', closeRsDetail);
function closeRsDetail(){
  currentRs = null;
  $('#rsDetail').classList.remove('open');
  $('#rsMask').classList.remove('open');
}

/* ================= 模组：加载器安装 ================= */
let ldType = 'fabric';
let ldLoaderVersions = [];
function renderLdMc(){
  const sel = $('#ldMcSel');
  const prev = sel.value;
  sel.innerHTML = '<option value="">选择游戏版本</option>' +
    versions.map(v => '<option value="' + v.id + '"' + (v.id === prev || v.id === cfg.currentVersion ? ' selected' : '') + '>' + v.id + '</option>').join('');
  if (sel.value) loadLoaderVersions();
}
$$('#ldTypes .chip').forEach(ch => ch.addEventListener('click', () => {
  $$('#ldTypes .chip').forEach(c => c.classList.remove('on'));
  ch.classList.add('on');
  ldType = ch.dataset.ld;
  loadLoaderVersions();
}));
$('#ldMcSel').addEventListener('change', loadLoaderVersions);
async function loadLoaderVersions(){
  const mc = $('#ldMcSel').value;
  const sel = $('#ldVerSel');
  if (!mc){ sel.innerHTML = '<option value="">先选择游戏版本</option>'; return; }
  sel.innerHTML = '<option value="">正在获取加载器版本…</option>';
  try {
    if (ldType === 'fabric'){
      ldLoaderVersions = await A.fabricVersions(mc);
      sel.innerHTML = ldLoaderVersions.map((v, i) => '<option value="' + v + '"' + (i === 0 ? ' selected' : '') + '>' + v + (i === 0 ? '（推荐）' : '') + '</option>').join('') || '<option value="">暂无可用版本</option>';
    } else if (ldType === 'forge'){
      const promos = await A.forgePromos();
      const hit = promos.find(p => p.mc === mc) || promos.find(p => mc.startsWith(p.mc + '-') || p.mc.startsWith(mc + '-'));
      const forgeVer = hit ? (mc + '-' + hit.forge) : '';
      ldLoaderVersions = forgeVer ? [forgeVer] : [];
      sel.innerHTML = forgeVer
        ? '<option value="' + forgeVer + '" selected>' + forgeVer + '（' + (hit.tier === 'recommended' ? '推荐' : '最新') + '）</option>'
        : '<option value="">该版本暂无 Forge 推荐版本</option>';
    } else {
      ldLoaderVersions = await A.neoforgeVersions(mc);
      sel.innerHTML = ldLoaderVersions.map((v, i) => '<option value="' + v + '"' + (i === 0 ? ' selected' : '') + '>' + v + (i === 0 ? '（推荐）' : '') + '</option>').join('') || '<option value="">暂无可用版本</option>';
    }
  } catch(e){
    sel.innerHTML = '<option value="">获取失败：' + escapeHtml(e.message) + '</option>';
  }
}
$('#btnInstallLoader').addEventListener('click', async () => {
  if (loaderBusy) return;
  const mc = $('#ldMcSel').value;
  const lv = $('#ldVerSel').value;
  if (!mc){ toast('请先选择游戏版本', '加载器需要对应具体的游戏版本', 'warn'); return; }
  if (!lv){ toast('请先选择加载器版本', '加载器版本列表为空', 'warn'); return; }
  const typeName = LD_NAME[ldType];
  confirmDlg('为 ' + mc + ' 安装 ' + typeName + ' ' + lv + ' ？将自动下载安装器并写入游戏目录。', async () => {
    loaderBusy = true;
    $('#btnInstallLoader').disabled = true;
    const prog = $('#ldProgress');
    prog.style.display = '';
    $('#ldpBar').style.width = '0%';
    $('#ldpLabel').textContent = '准备安装 ' + typeName + ' ' + lv + '…';
    $('#logDrawer').classList.add('open');
    syncLogUI();
    logLine('info', '开始安装加载器：' + typeName + ' ' + lv + ' @ ' + mc);
    const res = await A.installLoader({ type: ldType, mc, loader: lv });
    if (res.ok){
      $('#ldpBar').style.width = '100%';
      $('#ldpLabel').textContent = '安装完成';
      toast('加载器安装完成', typeName + ' ' + lv + ' 已就绪，可在主页选择该版本启动', 'ok');
      await refreshEnv();
      setTimeout(() => { prog.style.display = 'none'; }, 2600);
    } else {
      $('#ldpLabel').textContent = '安装失败：' + res.error;
      logLine('error', '加载器安装失败：' + res.error + '（可查看上方日志定位原因，或检查网络后重试）');
      toast('加载器安装失败', res.error + ' 已写入日志', 'warn');
    }
    loaderBusy = false;
    $('#btnInstallLoader').disabled = false;
  });
});
A.onInstallerProgress(p => {
  const prog = $('#ldProgress');
  const name = LD_NAME[p.type] || p.type;
  if (prog){
    prog.style.display = '';
    if (p.stage === 'download' && p.libTotal){
      $('#ldpLabel').textContent = '正在下载并预置 ' + name + ' 所需库文件 ' + (p.libDone || 0) + '/' + p.libTotal + '（走国内镜像加速，无需运行安装器）';
      $('#ldpBar').style.width = Math.round((p.libDone || 0) / p.libTotal * 100) + '%';
    } else if (p.stage === 'download'){
      $('#ldpLabel').textContent = '下载 ' + name + ' 安装器 ' + (p.total ? Math.round(p.received / p.total * 100) + '%' : '…');
      if (p.total) $('#ldpBar').style.width = Math.round(p.received / p.total * 100) + '%';
    } else if (p.stage === 'run'){
      $('#ldpLabel').textContent = name + ' 安装器运行中 · 正在下载并写入库文件与依赖，这可能需要几分钟';
      $('#ldpBar').style.width = '75%';
    } else if (p.stage === 'done'){
      $('#ldpLabel').textContent = name + ' 安装完成 · 可前往「版本管理」查看与安装模组';
      $('#ldpBar').style.width = '100%';
    }
  }
  // 同步到全局下载浮动面板
  if (dlWithLoader){
    const it = dlItems.get('ver:' + dlWithLoader.id);
    if (it){
      if (p.stage === 'download' && p.libTotal) it.status.textContent = '预置 ' + name + ' 库文件 ' + (p.libDone || 0) + '/' + p.libTotal;
      else if (p.stage === 'download') it.status.textContent = '下载 ' + name + ' 安装器' + (p.total ? ' ' + Math.round(p.received / p.total * 100) + '%' : '…');
      else if (p.stage === 'run') it.status.textContent = name + ' 安装器运行中 · 下载库文件中…';
      else if (p.stage === 'done') it.status.textContent = name + ' 安装完成 · 可在版本管理查看模组';
      if (p.libTotal && p.stage === 'download') it.bar.style.width = (30 + Math.round((p.libDone || 0) / p.libTotal * 60)) + '%';
      else if (p.total && p.stage === 'download') it.bar.style.width = (60 + Math.round(p.received / p.total * 15)) + '%';
      if (p.stage === 'run') it.bar.style.width = '80%';
      if (p.stage === 'done'){ it.bar.style.width = '100%'; it.pct.textContent = '100%'; }
    }
  }
});

/* ================= 模组：列表管理 ================= */
async function refreshMods(){
  const box = $('#modsList');
  const ver = $('#modsVerSel') ? $('#modsVerSel').value : '';
  if (!ver && versions.length){
    // 首次进入：默认选中当前启动版本
    const def = cfg.currentVersion && versions.find(v => v.id === cfg.currentVersion) ? cfg.currentVersion : versions[0].id;
    const sel = $('#modsVerSel');
    if (sel && (sel.options.length <= 1 || sel.options.length !== versions.length)){
      fillModsVerSel(def);
    }
  }
  const cur = $('#modsVerSel') ? $('#modsVerSel').value : '';
  if (!cur){
    box.innerHTML = '<div class="mods-empty">请先在上方选择游戏版本<br>将显示该版本（或共享目录）下已安装的模组</div>';
    return;
  }
  let mods = [];
  try { mods = await A.listMods(cur); } catch(e){}
  if (!mods.length){
    box.innerHTML = '<div class="mods-empty">「' + escapeHtml(cur) + '」暂无已安装模组<br>可前往「资源中心」下载，或点击右上角安装模组加载器后放入 .jar 模组文件</div>';
    return;
  }
  box.innerHTML = mods.map(m =>
    '<div class="mod-row' + (m.enabled ? '' : ' off') + '" data-name="' + escapeHtml(m.name) + '">' +
      '<div class="mod-ico"><svg viewBox="0 0 24 24"><path d="M12 3 5 5.8v5.4c0 4.4 3 8 7 9.8 4-1.8 7-5.4 7-9.8V5.8z"/><path d="m9 11.8 2.2 2.2L15.5 9.5"/></svg></div>' +
      '<div class="mod-info">' +
        '<div class="mod-name" title="' + escapeHtml(m.display) + '">' + escapeHtml(m.display) + '</div>' +
        '<div class="mod-meta"><span>' + fmtSize(m.size) + '</span><span>' + (m.enabled ? '已启用' : '已禁用') + '</span></div>' +
      '</div>' +
      '<div class="mod-actions">' +
        '<button class="btn btn-mini" data-act="toggle" title="' + (m.enabled ? '禁用' : '启用') + '">' + (m.enabled ? '禁用' : '启用') + '</button>' +
        '<button class="btn btn-mini" data-act="del" style="color:#ff8a94">删除</button>' +
      '</div>' +
    '</div>'
  ).join('');
  $$('#modsList [data-act]').forEach(b => {
    b.addEventListener('click', async e => {
      e.stopPropagation();
      const row = b.closest('.mod-row');
      const name = row.dataset.name;
      const act = b.dataset.act;
      if (act === 'toggle'){
        const on = row.classList.contains('off');
        try {
          await A.setModEnabled(name, on, $('#modsVerSel') ? $('#modsVerSel').value : '');
          toast(on ? '已启用模组' : '已禁用模组', name, 'ok');
          refreshMods();
        } catch(err){ toast('操作失败', err.message, 'warn'); }
      } else {
        confirmDlg('确定删除模组「' + name + '」吗？', async () => {
          try {
            await A.deleteMod(name, $('#modsVerSel') ? $('#modsVerSel').value : '');
            toast('模组已删除', name);
            refreshMods();
          } catch(err){ toast('删除失败', err.message, 'warn'); }
        });
      }
    });
  });
}
function fillModsVerSel(def){
  const sel = $('#modsVerSel');
  if (!sel) return;
  sel.innerHTML = versions.map(v => '<option value="' + escapeHtml(v.id) + '"' + (v.id === def ? ' selected' : '') + '>' + escapeHtml(v.id) + '</option>').join('');
}
$('#btnRefreshMods').addEventListener('click', refreshMods);
if ($('#modsVerSel')) $('#modsVerSel').addEventListener('change', refreshMods);
$('#btnOpenModsDir').addEventListener('click', () => {
  const ver = $('#modsVerSel') ? $('#modsVerSel').value : '';
  const base = cfg.isolation && ver ? (gameDir ? gameDir.replace(/\/minecraft$/, '') + '/versions/' + ver : '') : (gameDir ? gameDir + '/mods' : '');
  A.openPath(base || (gameDir || ''));
});

/* ================= 设置 ================= */
function syncMem(){
  const mb = parseInt($('#memRange').value, 10);
  $('#memVal').textContent = (mb >= 1024 ? (mb / 1024) : mb) + (mb >= 1024 ? ' GB' : ' MB');
  $('#statMem').textContent = (mb >= 1024 ? (mb / 1024) : mb) + 'G';
}
const langSel = $('#langSel');
if (langSel) langSel.addEventListener('change', () => { cfg.lang = langSel.value; saveCfg(); toast('游戏语言已设为 ' + (langSel.value === 'zh_cn' ? '简体中文' : 'English')); });
$('#memRange').addEventListener('input', e => {
  syncMem();
  cfg.memory = parseInt(e.target.value, 10);
  A.setConfig({ memory: cfg.memory });
});
function renderJavaSel(){
  const sel = $('#javaSel');
  const opts = [];
  const has = javaList.length > 0;
  if (!has) opts.push('<option value="">未检测到 Java</option>');
  if (has) opts.push('<option value="">自动选择（推荐）</option>');
  javaList.forEach((j, i) => {
    const label = 'Java ' + (j.major || '?') + ' · ' + j.dir;
    opts.push('<option value="' + j.dir + '"' + (cfg.javaPath === j.dir ? ' selected' : '') + '>' + label + '</option>');
  });
  sel.innerHTML = opts.join('');
  if (cfg.javaPath && !javaList.find(j => j.dir === cfg.javaPath) && cfg.javaPath !== ''){
    sel.insertAdjacentHTML('beforeend', '<option value="' + cfg.javaPath + '" selected>自定义：' + cfg.javaPath + '</option>');
  }
  $('#javaSelDesc').textContent = has ? '已检测到 ' + javaList.length + ' 个 Java 运行时' : '未检测到 Java，可自动下载或指定路径';
}
$('#javaSel').addEventListener('change', e => {
  cfg.javaPath = e.target.value;
  A.setConfig({ javaPath: cfg.javaPath });
  updateJavaStat();
  toast('Java 运行时已更新', e.target.value || '自动选择', 'ok');
});
$('#btnJavaRefresh').addEventListener('click', async () => {
  toast('正在检测 Java…');
  javaList = await A.detectJava();
  renderJavaSel();
  updateJavaStat();
});
function updateJavaStat(){
  const j = javaList.find(x => x.dir === cfg.javaPath) || javaList[0];
  $('#statJava').textContent = j ? (j.major || '?') : '—';
}
/* Java 自动下载 */
let javaAvail = [];
async function renderJavaAvail(){
  try { javaAvail = await A.javaAvailable(); } catch(e){ javaAvail = []; }
  const wrap = $('#javaAvailWrap');
  if (!javaAvail.length){
    wrap.innerHTML = '<span class="qt-count">无法获取下载列表</span>';
    return;
  }
  wrap.innerHTML = javaAvail.map(m =>
    '<button class="btn btn-mini" data-major="' + m + '">下载 Java ' + m + '</button>'
  ).join('');
  $$('#javaAvailWrap [data-major]').forEach(b => b.addEventListener('click', () => doJavaInstall(parseInt(b.dataset.major, 10))));
}
let javaInstalling = false;
async function doJavaInstall(major){
  if (javaInstalling) return;
  javaInstalling = true;
  $('#javaAvailDesc').textContent = '正在下载 Java ' + major + '…（约 200MB，请耐心等待）';
  const res = await A.installJava(major);
  javaInstalling = false;
  if (res.ok){
    cfg.javaPath = res.dir;
    await A.setConfig({ javaPath: res.dir });
    $('#javaAvailDesc').textContent = 'Java ' + major + ' 安装完成，已自动选用';
    toast('Java 安装完成', res.dir, 'ok');
    javaList = await A.detectJava();
    renderJavaSel(); updateJavaStat();
    updateJavaGuide(); // 修复：Java 装好后引导条立即消失
    await refreshEnv();
  } else {
    $('#javaAvailDesc').textContent = 'Java ' + major + ' 安装失败：' + res.error;
    toast('Java 安装失败', res.error, 'warn');
  }
}
A.onJavaProgress(p => {
  if (!p) return;
  if (p.stage === 'download'){
    $('#javaAvailDesc').textContent = '下载 Java ' + p.major + (p.total ? ' ' + Math.round(p.received / p.total * 100) + '%' : '…');
  } else if (p.stage === 'extract'){
    $('#javaAvailDesc').textContent = '解压安装 Java ' + p.major + '…';
  } else if (p.stage === 'done'){
    $('#javaAvailDesc').textContent = 'Java ' + p.major + ' 就绪';
  }
});
$('#btnPickDir').addEventListener('click', async () => {
  const dir = await A.pickDir();
  if (dir){
    cfg.gameDir = dir;
    await A.setConfig({ gameDir: dir });
    toast('游戏目录已更新', dir, 'ok');
    await refreshEnv();
  }
});
$('#btnResetDir').addEventListener('click', async () => {
  cfg.gameDir = '';
  await A.setConfig({ gameDir: '' });
  const info = await A.appInfo();
  toast('已恢复默认游戏目录', info.dataDir + '\\.minecraft', 'ok');
  await refreshEnv();
});
$('#btnOpenDataDir').addEventListener('click', async () => {
  const info = await A.appInfo();
  A.openPath(info.dataDir);
});
/* 离线账户名：强制英文（仅允许字母/数字/下划线） */
const NAME_RE = /^[A-Za-z0-9_]{1,16}$/;
$('#offlineName').addEventListener('input', e => {
  const cleaned = e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
  if (cleaned !== e.target.value) e.target.value = cleaned;
});
$('#offlineName').addEventListener('change', e => {
  const v = e.target.value.trim();
  if (!NAME_RE.test(v)){
    e.target.value = (cfg.offlineName || '').match(/^[A-Za-z0-9_]{1,16}$/) ? cfg.offlineName : 'Player';
    toast('离线账户名必须为英文', '仅允许字母、数字、下划线（1-16 个字符），已为你还原为上一个有效名称', 'warn');
    return;
  }
  cfg.offlineName = v;
  A.setConfig({ offlineName: v });
  updateHome(); tick();
  toast('离线账户名已更新', v, 'ok');
});
$('#btnUploadAvatar').addEventListener('click', async () => {
  const p = await A.uploadAvatar();
  if (p){ await refreshAvatar(); await A.setConfig({ needsAvatarSetup: false }); toast('头像已更新', '新的头像将显示在主页与底部栏', 'ok'); }
});
$('#btnRemoveAvatar').addEventListener('click', async () => {
  await A.removeAvatar();
  await refreshAvatar();
  toast('已移除自定义头像');
});
/* ================= 微软正版账户 ================= */
async function renderMsStatus(){
  const st = await A.msStatus();
  const msa = st.authType === 'msa';
  $('#authModeDesc').textContent = msa
    ? ('当前使用微软正版账户：' + st.name + (st.owns === false ? '（未检测到游戏所有权）' : ''))
    : '当前使用离线账户（免费直接游玩，可在下方切换正版）';
  const badge = $('#authModeBadge');
  badge.className = 'badge ' + (msa ? 'msa' : 'offline');
  badge.innerHTML = msa ? ('正版 · ' + st.name) : '离线';
  if (msa){
    $('#msCtrl').innerHTML =
      '<button class="btn btn-mini" id="btnMsLogout">' +
      '<svg viewBox="0 0 24 24"><path d="M4 12h12"/><path d="m13 7 5 5-5 5"/><path d="M9 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3"/></svg>' +
      '退出登录</button>';
    $('#btnMsLogout').addEventListener('click', async () => {
      await A.msLogout();
      toast('已退出正版账户', '已切换为离线账户模式', 'ok');
      await renderMsStatus(); updateHome();
    });
  } else {
    $('#msCtrl').innerHTML =
      '<button class="btn" id="btnMsLogin">' +
      '<svg viewBox="0 0 24 24"><path d="M10 13.5a4 4 0 0 0 5.6.4l2.6-2.6a4 4 0 0 0-5.6-5.6l-1.4 1.4"/><path d="M14 10.5a4 4 0 0 0-5.6-.4l-2.6 2.6a4 4 0 0 0 5.6 5.6l1.3-1.4"/></svg>' +
      '使用微软账户登录</button>';
    $('#btnMsLogin').addEventListener('click', msLoginFlow);
  }
}
let msPollTimer = null;
async function msLoginFlow(){
  try {
    const st = await A.msStatus();
    if (st.needClientId){
      toast('需要应用 Client ID', '请先在下方填写 Azure 应用 Client ID 并保存', 'warn');
      return;
    }
    $('#btnMsLogin') && ($('#btnMsLogin').disabled = true);
    const dc = await A.msDeviceCode();
    // 展示设备码弹窗
    const mask = $('#dlOptMask');
    mask.innerHTML =
      '<div class="dlopt" style="max-width:440px">' +
      '<div class="dlopt-title">微软账户登录</div>' +
      '<div class="dlopt-sub">请在浏览器中打开下面的网址，并输入验证码完成登录</div>' +
      '<div class="ms-code" id="msUserCode">' + escapeHtml(dc.userCode) + '</div>' +
      '<div class="ms-veri">' +
      '<input type="text" id="msUriBox" readonly value="' + escapeHtml(dc.verificationUri) + '">' +
      '<button class="btn btn-mini" id="btnMsOpenUri">打开</button>' +
      '</div>' +
      '<div class="ms-hint" id="msHint">等待你在浏览器中完成验证…</div>' +
      '<div class="dlopt-foot"><button class="btn btn-mini" id="btnMsCancel">取消</button></div>' +
      '</div>';
    mask.classList.add('open');
    $('#btnMsOpenUri').addEventListener('click', () => A.openPath(dc.verificationUri));
    $('#btnMsCancel').addEventListener('click', () => { mask.classList.remove('open'); if (msPollTimer){ clearTimeout(msPollTimer); msPollTimer = null; } });
    // 轮询
    let interval = dc.interval || 5;
    const poll = async () => {
      if (!mask.classList.contains('open')) return;
      try {
        const r = await A.msPoll({ deviceCode: dc.deviceCode, interval });
        if (r.pending){
          $('#msHint').textContent = '等待你在浏览器中完成验证…（每 ' + interval + ' 秒检查一次）';
          msPollTimer = setTimeout(poll, (r.interval || interval) * 1000);
          interval = r.interval || interval;
          return;
        }
        $('#msHint').textContent = '验证成功，正在获取游戏档案…';
        const done = await A.msComplete({ accessToken: r.accessToken, refreshToken: r.refreshToken });
        mask.classList.remove('open');
        await renderMsStatus();
        cfg = await A.getConfig();
        updateHome();
        toast('正版登录成功', '欢迎回来，' + done.name, 'ok');
      } catch(err){
        mask.classList.remove('open');
        toast('正版登录失败', err.message || '未知错误', 'error');
        await renderMsStatus();
      }
    };
    msPollTimer = setTimeout(poll, 3000);
  } catch(err){
    $('#btnMsLogin') && ($('#btnMsLogin').disabled = false);
    toast('正版登录失败', err.message || '未知错误', 'error');
    await renderMsStatus();
  }
}
$('#btnMsClientSave').addEventListener('click', async () => {
  const v = $('#msClientId').value.trim();
  await A.msSetClientId(v);
  cfg = await A.getConfig();
  toast(v ? 'Client ID 已保存' : '已清除 Client ID');
});
$('#btnMsGuide').addEventListener('click', () => {
  A.openPath('https://learn.microsoft.com/zh-cn/azure/active-directory/develop/quickstart-register-app');
});
/* 作者主页 / 爱发电（关于页） */
const AFDIAN_URL = 'https://ifdian.net/a/minaiyu';
$('#btnAuthorHome').addEventListener('click', () => A.openPath(AFDIAN_URL));
$('#btnAfdian').addEventListener('click', () => A.openPath(AFDIAN_URL));
/* 技术说明页：使用教程 / 问题反馈 */
$('#btnTechTutorial').addEventListener('click', () => switchTechTab('tutorial'));
$('#btnTechFeedback').addEventListener('click', () => A.openPath('https://docs.qq.com/form/page/DUFRYU0dTanVIaURa'));
$('#btnTechFeedback3').addEventListener('click', () => A.openPath('https://docs.qq.com/form/page/DUFRYU0dTanVIaURa'));
$('#btnXboxBuy2').addEventListener('click', () => A.openPath('https://www.xbox.com/zh-CN/games/store/minecraft-java-bedrock-edition-pc/9NXP44L49SHJ'));
/* 技术说明 / 使用教程 tab 切换 */
function switchTechTab(tab){
  $$('.tech-tabs .chip').forEach(c => c.classList.toggle('on', c.dataset.tab === tab));
  $('#techOverview').style.display = tab === 'overview' ? '' : 'none';
  $('#techTutorial').style.display = tab === 'tutorial' ? '' : 'none';
}
$$('.tech-tabs .chip').forEach(ch => ch.addEventListener('click', () => switchTechTab(ch.dataset.tab)));
/* 资源中心：MC 百科 */
$('#btnMcWiki').addEventListener('click', () => A.openPath('https://mcmod.cn/'));
/* 关于页：获取更新 */
$('#btnUpdate').addEventListener('click', () => A.openPath('https://docs.qq.com/aio/DUENmdFVWVmZrWGF3'));

/* 关于页：前往官网（应用内打开打包的官网页面） */
$('#btnWebsite').addEventListener('click', async () => {
  try { await A.openWebsite(); }
  catch(e){ toast('无法打开官网', String(e && e.message || e), 'err'); }
});

/* ================= 首次启动弹窗 ================= */
$('#acOffline').addEventListener('click', async () => {
  await A.setConfig({ firstRun: true, authType: 'offline', needsAvatarSetup: true });
  cfg = await A.getConfig();
  $('#firstRunMask').classList.remove('open');
  await refreshAvatar();
  toast('已选择离线账户', '请完成玩家名与头像设置', 'ok');
  maybeShowAvSetup();
});
$('#acMicrosoft').addEventListener('click', async () => {
  $('#firstRunMask').classList.remove('open');
  await A.setConfig({ firstRun: true });
  cfg = await A.getConfig();
  const st = await A.msStatus();
  if (st.needClientId){
    // 引导填写 Client ID
    const mask = $('#dlOptMask');
    mask.innerHTML =
      '<div class="dlopt" style="max-width:440px">' +
      '<div class="dlopt-title">正版登录 · 需要应用 Client ID</div>' +
      '<div class="dlopt-sub">微软要求第三方启动器使用自己注册的应用 ID（微软官方许可的行业做法）。打开注册指南完成注册后，把“应用程序（客户端）ID”粘贴到这里。</div>' +
      '<input type="text" id="msFirstClientId" placeholder="粘贴 Azure 应用 Client ID" style="width:100%;margin-bottom:12px">' +
      '<div class="dlopt-opts" style="flex-direction:column">' +
      '<button class="btn" id="btnMsFirstSave">保存并开始登录</button>' +
      '<button class="btn btn-mini" id="btnMsFirstGuide">打开注册指南</button>' +
      '</div>' +
      '</div>';
    mask.classList.add('open');
    $('#btnMsFirstGuide').addEventListener('click', () => A.openPath('https://learn.microsoft.com/zh-cn/azure/active-directory/develop/quickstart-register-app'));
    $('#btnMsFirstSave').addEventListener('click', async () => {
      const v = $('#msFirstClientId').value.trim();
      if (!v){ toast('请先粘贴 Client ID', '', 'warn'); return; }
      await A.msSetClientId(v);
      $('#msClientId').value = v;
      cfg = await A.getConfig();
      mask.classList.remove('open');
      await msLoginFlow();
    });
  } else {
    await msLoginFlow();
  }
});

/* ================= 离线游玩每满 10 次：请支持正版 ================= */
$('#btnBuyMc').addEventListener('click', () => {
  A.openPath('https://www.xbox.com/zh-CN/games/store/minecraft-java-bedrock-edition-pc/9NXP44L49SHJ');
  $('#supportMask').classList.remove('open');
});
$('#btnSupportLater').addEventListener('click', () => {
  $('#supportMask').classList.remove('open');
});
function maybeShowSupportTip(authTypeAtLaunch){
  // 离线账户每累计启动 10 次弹一次；使用正版（微软）账户登录后不再弹窗
  const n = cfg.launchCount || 0;
  if (authTypeAtLaunch === 'legacy' && n > 0 && n % 10 === 0){
    setTimeout(() => $('#supportMask').classList.add('open'), 1200);
  }
}
$('#mirrorSel').addEventListener('change', e => {
  cfg.mirror = e.target.value;
  A.setConfig({ mirror: cfg.mirror });
  $('#mirrorChip').textContent = '下载源：' + (cfg.mirror === 'mojang' ? 'Mojang 官方' : 'BMCLAPI 加速镜像');
  manifestLoaded = false;
  toast('下载源已切换', cfg.mirror === 'mojang' ? 'Mojang 官方源' : 'BMCLAPI 镜像', 'ok');
});
$('#jvmArgs').addEventListener('change', e => {
  cfg.jvmArgs = e.target.value.trim();
  A.setConfig({ jvmArgs: cfg.jvmArgs });
  toast('JVM 参数已保存');
});
$('#gameArgs').addEventListener('change', e => {
  cfg.gameArgs = e.target.value.trim();
  A.setConfig({ gameArgs: cfg.gameArgs });
  toast('游戏参数已保存');
});

/* ================= 开关 ================= */
function applyVisualPrefs(){
  $('.aurora').style.display = cfg.dynamicWallpaper !== false ? '' : 'none';
  $('.cursor-glow').style.display = cfg.cursorGlow !== false ? '' : 'none';
  $('.beam').style.display = cfg.lightEffect !== false ? '' : 'none';
  document.body.classList.toggle('no-blur', cfg.panelBlur === false);
  $$('.glass-card, .dock, .titlebar, .log-drawer, .dlopt').forEach(el => {
    el.style.backdropFilter = cfg.panelBlur === false ? 'none' : '';
    el.style.webkitBackdropFilter = cfg.panelBlur === false ? 'none' : '';
  });
}
const SWITCHES = [
  ['swLight', 'lightEffect', '沉浸光效'],
  ['swAurora', 'dynamicWallpaper', '极光光场'],
  ['swCursor', 'cursorGlow', '光标光效'],
  ['swBlur', 'panelBlur', '面板磨砂'],
  ['swIsolation', 'isolation', '版本隔离'],
  ['swCloseAfter', 'closeAfterLaunch', '启动后关闭启动器']
];
SWITCHES.forEach(([id, key, label]) => {
  const sw = $('#' + id);
  const toggle = () => {
    const on = sw.classList.toggle('on');
    sw.setAttribute('aria-checked', String(on));
    cfg[key] = on;
    A.setConfig({ [key]: on });
    applyVisualPrefs();
    toast(on ? '已开启' : '已关闭', label, on ? 'ok' : 'info');
  };
  sw.addEventListener('click', toggle);
  sw.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle(); } });
});

/* ================= 主题切换 v10 ================= */
const themeGrid = $('#themeGrid');
if (themeGrid){
  themeGrid.addEventListener('click', e => {
    const card = e.target.closest('.th-card');
    if (!card) return;
    const id = card.dataset.theme;
    if (!id) return;
    applyTheme(id);
    cfg.theme = id;
    A.setConfig({ theme: id });
    toast('已切换主题', card.title, 'ok');
  });
}

/* ================= 窗口 ================= */
$('#winMin').addEventListener('click', () => A.winMin());
$('#winMax').addEventListener('click', () => A.winMax());
$('#winClose').addEventListener('click', () => A.winClose());

/* ================= 光标光效 ================= */
const cg = $('#cursorGlow');
let cgX = innerWidth / 2, cgY = innerHeight / 2, tX = cgX, tY = cgY;
window.addEventListener('mousemove', e => { tX = e.clientX; tY = e.clientY; });
(function glowLoop(){
  cgX += (tX - cgX) * 0.08;
  cgY += (tY - cgY) * 0.08;
  cg.style.transform = 'translate(' + cgX + 'px,' + cgY + 'px)';
  requestAnimationFrame(glowLoop);
})();

