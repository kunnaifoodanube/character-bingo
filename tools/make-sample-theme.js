// สร้างชุดตัวละครตัวอย่าง 24 ตัว (ออกแบบใหม่ทั้งหมด ไม่ใช้ตัวละครที่มีลิขสิทธิ์)
// ใช้: node tools/make-sample-theme.js
const fs = require('fs');
const path = require('path');

const names = ['ปุยฝ้าย', 'ส้มซ่า', 'มะนาวน้อย', 'บลูเบอร์รี่', 'ชมพูแป้ง', 'เมฆหมอก', 'ถั่วแดง', 'มินต์ชิป',
  'ขนมครก', 'ลูกชุบ', 'ไข่ตุ๋น', 'ฟักทอง', 'มะพร้าว', 'องุ่นม่วง', 'แตงโม', 'ข้าวเหนียว',
  'ทับทิม', 'โกโก้', 'ลาเต้', 'วาซาบิ', 'ชาไทย', 'ข้าวโพด', 'ลำไย', 'สายไหม'];

function hsl(h, s, l) { return `hsl(${h},${s}%,${l}%)`; }

function body(shape, fill, stroke) {
  const st = `fill="${fill}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"`;
  switch (shape) {
    case 0: return `<circle cx="100" cy="112" r="68" ${st}/>`;
    case 1: return `<rect x="34" y="48" width="132" height="128" rx="42" ${st}/>`;
    case 2: return `<path d="M40 175 V100 a60 60 0 0 1 120 0 V175 l-20 -14 l-20 14 l-20 -14 l-20 14 l-20 -14 z" ${st}/>`;
    case 3: return `<ellipse cx="100" cy="114" rx="62" ry="74" ${st}/>`;
    case 4: return `<path d="M100 44 C150 40 178 90 168 130 C160 168 128 182 100 180 C66 182 30 164 32 124 C34 84 56 48 100 44 z" ${st}/>`;
    default: return `<path d="M44 70 L60 30 L82 58 Q100 52 118 58 L140 30 L156 70 Q172 100 166 132 Q156 180 100 180 Q44 180 34 132 Q28 100 44 70 z" ${st}/>`;
  }
}
function eyes(kind, dark) {
  const w = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${dark}" stroke-width="4"/><circle cx="${cx + r * 0.2}" cy="${cy + r * 0.15}" r="${r * 0.5}" fill="${dark}"/><circle cx="${cx + r * 0.35}" cy="${cy - r * 0.1}" r="${r * 0.18}" fill="#fff"/>`;
  switch (kind) {
    case 0: return w(78, 100, 15) + w(122, 100, 15);
    case 1: return w(100, 96, 26);
    case 2: return w(70, 102, 12) + w(100, 90, 13) + w(130, 102, 12);
    default: return `<path d="M64 102 q14 -14 28 0 M108 102 q14 -14 28 0" fill="none" stroke="${dark}" stroke-width="6" stroke-linecap="round"/>`;
  }
}
function mouth(kind, dark) {
  switch (kind) {
    case 0: return `<path d="M80 134 q20 20 40 0" fill="none" stroke="${dark}" stroke-width="6" stroke-linecap="round"/>`;
    case 1: return `<path d="M78 130 q22 34 44 0 z" fill="${dark}"/><rect x="94" y="130" width="10" height="9" fill="#fff"/>`;
    case 2: return `<ellipse cx="100" cy="140" rx="9" ry="11" fill="${dark}"/>`;
    case 3: return `<path d="M82 134 q18 14 36 0" fill="none" stroke="${dark}" stroke-width="6" stroke-linecap="round"/><path d="M96 140 q6 14 12 0" fill="#ff6f91"/>`;
    default: return `<path d="M76 138 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8" fill="none" stroke="${dark}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
}
function accessory(kind, accent, dark) {
  switch (kind) {
    case 0: return `<path d="M62 62 L52 26 L80 50 z M138 62 L148 26 L120 50 z" fill="${accent}" stroke="${dark}" stroke-width="4" stroke-linejoin="round"/>`;
    case 1: return `<path d="M100 46 Q96 26 108 14" fill="none" stroke="${dark}" stroke-width="5" stroke-linecap="round"/><circle cx="110" cy="14" r="9" fill="${accent}" stroke="${dark}" stroke-width="4"/>`;
    case 2: return `<path d="M100 48 C88 30 96 18 118 14 C120 34 112 44 100 48 z" fill="#5cc96b" stroke="${dark}" stroke-width="4"/>`;
    case 3: return `<path d="M100 42 L78 28 L78 56 z M100 42 L122 28 L122 56 z" fill="${accent}" stroke="${dark}" stroke-width="4" stroke-linejoin="round"/><circle cx="100" cy="42" r="7" fill="${accent}" stroke="${dark}" stroke-width="4"/>`;
    case 4: return `<path d="M70 40 L130 40 L120 10 L80 10 z" fill="${accent}" stroke="${dark}" stroke-width="4" stroke-linejoin="round"/><rect x="60" y="36" width="80" height="10" rx="5" fill="${dark}"/>`;
    default: return '';
  }
}
function cheeks(on) {
  return on ? `<ellipse cx="62" cy="126" rx="10" ry="6" fill="#ff8fab" opacity=".7"/><ellipse cx="138" cy="126" rx="10" ry="6" fill="#ff8fab" opacity=".7"/>` : '';
}
function spots(on, color) {
  return on ? `<circle cx="66" cy="152" r="7" fill="${color}" opacity=".55"/><circle cx="136" cy="156" r="9" fill="${color}" opacity=".55"/><circle cx="148" cy="80" r="6" fill="${color}" opacity=".55"/>` : '';
}

function monster(i) {
  const hue = (i * 47) % 360;
  const fill = hsl(hue, 78, 70), stroke = hsl(hue, 55, 32), accent = hsl((hue + 150) % 360, 85, 62), dark = '#2b2140';
  const shape = i % 6, eye = Math.floor(i / 6) % 4, mo = (i + Math.floor(i / 6)) % 5, acc = (i * 7) % 6;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">` +
    (acc < 3 ? accessory(acc, accent, dark) : '') + body(shape, fill, stroke) + spots(i % 3 === 0, stroke) + cheeks(i % 2 === 0) +
    eyes(eye, dark) + mouth(mo, dark) + (acc >= 3 ? accessory(acc, accent, dark) : '') + `</svg>`;
}

const theme = {
  format: 'character-bingo-theme@1',
  id: 'sample-monsters',
  name: 'มอนสเตอร์ขนม (ชุดตัวอย่าง)',
  category: 'Cartoon',
  updatedAt: new Date().toISOString(),
  characters: names.map((n, i) => ({
    id: 'm' + String(i + 1).padStart(2, '0'),
    name: n,
    img: 'data:image/svg+xml;base64,' + Buffer.from(monster(i)).toString('base64')
  }))
};

const out = path.join(__dirname, '..', 'themes');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'sample-monsters.json'), JSON.stringify(theme));
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({
  format: 'character-bingo-index@1',
  default: 'sample-monsters',
  themes: [{ id: theme.id, name: theme.name, category: theme.category, file: 'sample-monsters.json' }]
}, null, 2));
console.log('wrote', theme.characters.length, 'characters');
