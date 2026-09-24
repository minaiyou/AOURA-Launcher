/* 原生 PE 图标注入（无需 wine）：替换 Windows exe 的 RT_ICON / RT_GROUP_ICON 资源 */
'use strict';
const fs = require('fs');
const { NtExecutable, NtExecutableResource } = require('pe-library');

const exePath = process.argv[2];
const icoPath = process.argv[3];
if (!exePath || !icoPath){ console.error('用法: node set-icon.js <exe> <ico>'); process.exit(1); }

const ico = fs.readFileSync(icoPath);
const count = ico.readUInt16LE(4);
const images = [];
let off = 6;
for (let i = 0; i < count; i++){
  const w = ico.readUInt8(off);
  const h = ico.readUInt8(off + 1);
  const size = ico.readUInt32LE(off + 8);
  const dataOff = ico.readUInt32LE(off + 12);
  const bin = ico.slice(dataOff, dataOff + size);
  images.push({ w, h, bin });
  off += 16;
}

const exe = NtExecutable.from(fs.readFileSync(exePath));
const res = NtExecutableResource.from(exe);

// 清除旧图标
res.removeResourceEntry(3);   // RT_ICON
res.removeResourceEntry(14);  // RT_GROUP_ICON

// 写入 RT_ICON（ID 从 1 开始）
const ids = [];
images.forEach((img, i) => {
  const id = i + 1;
  ids.push(id);
  res.replaceResourceEntry({ type: 3, id, lang: 0, codepage: 1200, bin: img.bin.buffer.slice(img.bin.byteOffset, img.bin.byteOffset + img.bin.byteLength) });
});

// 组装 RT_GROUP_ICON
const g = Buffer.alloc(6 + count * 14);
g.writeUInt16LE(0, 0);   // reserved
g.writeUInt16LE(1, 2);   // type = icon
g.writeUInt16LE(count, 4);
images.forEach((img, i) => {
  const o = 6 + i * 14;
  g.writeUInt8(img.w >= 256 ? 0 : img.w, o);
  g.writeUInt8(img.h >= 256 ? 0 : img.h, o + 1);
  g.writeUInt8(0, o + 2);
  g.writeUInt8(0, o + 3);
  g.writeUInt16LE(1, o + 4);    // planes
  g.writeUInt16LE(32, o + 6);   // bpp
  g.writeUInt32LE(img.bin.length, o + 8);
  g.writeUInt16LE(ids[i], o + 12);
});
res.replaceResourceEntry({ type: 14, id: 1, lang: 0, codepage: 1200, bin: g.buffer.slice(g.byteOffset, g.byteOffset + g.length) });

res.outputResource(exe, false, true);
const out = Buffer.from(exe.generate());
fs.writeFileSync(exePath, out);
console.log('[icon] 已注入 ' + count + ' 个图标尺寸 -> ' + exePath);
