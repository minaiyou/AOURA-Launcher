/* 原生 PE 版本资源注入（无需 wine）：为 Windows exe 写入 VS_VERSION_INFO
   用法: node build/set-version.js <exe> <版本> <产品名> <公司名> <描述> */
'use strict';
const fs = require('fs');
const { NtExecutable, NtExecutableResource } = require('pe-library');

const exePath = process.argv[2];
const ver = (process.argv[3] || '3.0.0').split('.'); // major.minor.build.rev
const product = process.argv[4] || 'AOURA启动器';
const company = process.argv[5] || '珉爱';
const desc = process.argv[6] || 'AOURA 启动器 - 沉浸光效 Minecraft 启动器';
if (!exePath){ console.error('用法: node set-version.js <exe> <版本> [产品名] [公司名] [描述]'); process.exit(1); }

const V = [ver[0]||'0', ver[1]||'0', ver[2]||'0', ver[3]||'0'].map(Number);

function align(buf, bound){ const rem = buf.length % bound; return rem ? Buffer.concat([buf, Buffer.alloc(bound - rem)]) : buf; }
function wstr(s){ const b = Buffer.from(s, 'utf16le'); return Buffer.concat([b, Buffer.alloc(2)]); } // 含末尾 NUL

/* VS_FIXEDFILEINFO 52 字节 */
const ffi = Buffer.alloc(52);
ffi.writeUInt32LE(0xFEEF04BD, 0);
ffi.writeUInt32LE(0x00010000, 4);
ffi.writeUInt32LE((V[0] << 16) | V[1], 8);          // FileVersionMS
ffi.writeUInt32LE((V[2] << 16) | V[3], 12);         // FileVersionLS
ffi.writeUInt32LE((V[0] << 16) | V[1], 16);         // ProductVersionMS
ffi.writeUInt32LE((V[2] << 16) | V[3], 20);         // ProductVersionLS
ffi.writeUInt32LE(0x3F, 24);                        // FileFlagsMask
ffi.writeUInt32LE(0, 28);                           // FileFlags
ffi.writeUInt32LE(0x00040004, 32);                  // VOS_NT_WINDOWS32
ffi.writeUInt32LE(0x1, 36);                         // VFT_APP
ffi.writeUInt32LE(0, 40);                           // FileSubtype
ffi.writeUInt32LE(0, 44); ffi.writeUInt32LE(0, 48); // FileDate

/* 单个 String 项 */
function strEntry(key, value){
  const v = wstr(value);
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 4); // wType = 1 文本
  const body = Buffer.concat([head, wstr(key), v]);
  const padded = align(body, 4);
  padded.writeUInt16LE(padded.length, 0);           // wLength
  padded.writeUInt16LE(v.length - 2, 2);            // wValueLength（不含 NUL）
  return padded;
}

/* StringTable（语言 0804 / 代码页 04B0） */
const strings = [
  ['CompanyName', company],
  ['FileDescription', desc],
  ['FileVersion', V.join('.') + '.0'],
  ['InternalName', 'AOURA启动器'],
  ['LegalCopyright', 'Copyright © ' + company],
  ['OriginalFilename', 'AOURA启动器.exe'],
  ['ProductName', product],
  ['ProductVersion', ver + '.0']
].map(s => strEntry(s[0], s[1]));
const stKey = wstr('StringFileInfo');
let table = Buffer.concat([Buffer.alloc(6), stKey]);
table.writeUInt16LE(1, 4); // wType = 1
table = align(table, 4);
const langKey = wstr('080404b0');
let tableInner = Buffer.concat([Buffer.alloc(6), langKey, ...strings]);
tableInner.writeUInt16LE(1, 4);
tableInner = align(tableInner, 4);
table = Buffer.concat([table, tableInner]);
table.writeUInt16LE(table.length, 0);

/* VarFileInfo - Translation */
const transVal = Buffer.alloc(4);
transVal.writeUInt16LE(0x0804, 0); transVal.writeUInt16LE(0x04B0, 2);
const varHead = Buffer.alloc(10); // 6 + 4 value
varHead.writeUInt16LE(0, 4);      // wType = 0 二进制
varHead.writeUInt16LE(4, 2);      // wValueLength
let varEntry = Buffer.concat([varHead, wstr('Translation'), transVal]);
varEntry = align(varEntry, 4);
varEntry.writeUInt16LE(varEntry.length, 0);
let varInfo = Buffer.concat([Buffer.alloc(6), wstr('VarFileInfo'), varEntry]);
varInfo.writeUInt16LE(0, 4);
varInfo = align(varInfo, 4);
varInfo.writeUInt16LE(varInfo.length, 0);

/* VS_VERSION_INFO 根 */
const children = Buffer.concat([table, varInfo]);
const root = Buffer.concat([Buffer.alloc(6), wstr('VS_VERSION_INFO'), align(ffi, 4), children]);
root.writeUInt16LE(52, 2);  // wValueLength = VS_FIXEDFILEINFO
root.writeUInt16LE(0, 4);   // wType = 0
root.writeUInt16LE(root.length, 0);

const exe = NtExecutable.from(fs.readFileSync(exePath));
const res = NtExecutableResource.from(exe);
// 清除所有旧 RT_VERSION（含不同 lang 的条目）
res.entries.filter(e => e.type === 16).forEach(e => res.removeResourceEntry(16, e.id, e.lang));
res.replaceResourceEntry({ type: 16, id: 1, lang: 0x0804, codepage: 1200, bin: root });
res.outputResource(exe, false, true);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('[version] 已注入 ' + ver + ' -> ' + exePath);
