'use strict';
/* Generates every image in public/assets as SVG. Run: node tools/make-assets.js
 * Tweak colours or shapes here and re-run to restyle the whole game. */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'public', 'assets');
fs.mkdirSync(OUT, { recursive: true });

// Cold palette built around a deep bike-shop blue, with one warm accent (amber)
const INK = '#0a1020', CREAM = '#eef2fa', PINK = '#e0524f', YELLOW = '#ffc857', TEAL = '#39c2c9', ORANGE = '#f08a3c',
  GREEN = '#4fbf7a', PURPLE = '#2f6fe0', BLUE = '#7fb6ff', RED = '#e0524f', NAVY = '#16337a';
const DECK = path.join(OUT, 'deck');
const embed = (file, x, y, w, h) => `<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/${file.endsWith('png') ? 'png' : 'jpeg'};base64,${fs.readFileSync(path.join(DECK, file)).toString('base64')}"/>`;
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const W = (w) => S.replace('stroke-width="3"', 'stroke-width="' + w + '"');
const save = (name, body, w, h) => fs.writeFileSync(path.join(OUT, name + '.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h || w}">${body}</svg>\n`);

// ---------- reusable drawings on a 64x64 canvas ----------
const ART = {
  sip: `<rect x="26" y="4" width="12" height="8" rx="3" fill="${CREAM}" ${S}/><rect x="21" y="10" width="22" height="9" rx="3" fill="${INK}" ${S}/>
    <path d="M18 24a5 5 0 0 1 5-5h18a5 5 0 0 1 5 5v30a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6z" fill="${PURPLE}" ${S}/><path d="M18 31h28v12H18z" fill="${CREAM}" ${S}/><path d="M25 37h14" stroke="${PURPLE}" stroke-width="3.500" stroke-linecap="round"/>`,
  give: `<rect x="12" y="28" width="40" height="26" rx="4" fill="${PINK}" ${S}/><rect x="9" y="20" width="46" height="11" rx="3" fill="${RED}" ${S}/>
    <rect x="28" y="20" width="8" height="34" fill="${YELLOW}" ${S}/><path d="M32 20c-4-10-16-10-14-3 1 4 8 4 14 3zM32 20c4-10 16-10 14-3-1 4-8 4-14 3z" fill="${YELLOW}" ${S}/>`,
  card: `<rect x="10" y="16" width="26" height="36" rx="4" fill="${PURPLE}" ${S} transform="rotate(-14 23 34)"/><rect x="26" y="14" width="26" height="36" rx="4" fill="${CREAM}" ${S} transform="rotate(10 39 32)"/>
    <path d="M39 22l3 6.500 7 .8-5.200 4.700 1.500 6.900L39 37.400l-6.300 3.500 1.500-6.900-5.200-4.700 7-.8z" fill="${YELLOW}" ${S} transform="rotate(10 39 32)"/>`,
  vote: `<path d="M22 8h20v22H22z" fill="${CREAM}" ${S}/><path d="M27 18l4 4 7-8" fill="none" stroke="${GREEN}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="8" y="28" width="48" height="26" rx="4" fill="${BLUE}" ${S}/><path d="M20 36h24" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
  trust: `<path d="M32 54C10 40 6 28 10 19c4-9 16-9 22 1 6-10 18-10 22-1 4 9 0 21-22 35z" fill="${PINK}" ${S}/><path d="M33 20l-6 9 9 5-6 9 4 9" fill="none" stroke="${INK}" stroke-width="3.500" stroke-linecap="round" stroke-linejoin="round"/>`,
  duel: `<g ${S}><path d="M12 10l8 2 26 28-6 6L14 18z" fill="${CREAM}"/><path d="M36 48l12-12M44 44l8 8" stroke-width="6"/><path d="M36 48l12-12M44 44l8 8" stroke="${YELLOW}" stroke-width="2.500"/>
    <path d="M52 10l-8 2-26 28 6 6 26-28z" fill="${CREAM}"/><path d="M28 48L16 36M20 44l-8 8" stroke-width="6"/><path d="M28 48L16 36M20 44l-8 8" stroke="${YELLOW}" stroke-width="2.500"/></g>`,
  number: `<path d="M8 14a6 6 0 0 1 6-6h36a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H30L18 57V46h-4a6 6 0 0 1-6-6z" fill="${TEAL}" ${S}/>
    <path d="M24 22a8 8 0 1 1 12 7c-3 2-4 3-4 6" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="40.500" r="3" fill="${INK}"/>`,
  rule: `<path d="M7 22l11 10 14-19 14 19 11-10-5 26H12z" fill="${YELLOW}" ${S}/><rect x="12" y="46" width="40" height="9" rx="3" fill="${ORANGE}" ${S}/><circle cx="32" cy="36" r="4" fill="${PINK}" ${W(2)}/><circle cx="7" cy="21" r="3.500" fill="${PINK}" ${W(2)}/><circle cx="57" cy="21" r="3.500" fill="${PINK}" ${W(2)}/><circle cx="32" cy="12" r="3.500" fill="${PINK}" ${W(2)}/>`,
  dicedrink: `<g transform="rotate(-10 24 28)"><rect x="6" y="10" width="36" height="36" rx="9" fill="${CREAM}" ${S}/><circle cx="15" cy="19" r="3.500" fill="${INK}"/><circle cx="24" cy="28" r="3.500" fill="${INK}"/><circle cx="33" cy="37" r="3.500" fill="${INK}"/></g><path d="M48 28c4 7 10 12 10 19a10 10 0 0 1-20 0c0-7 6-12 10-19z" fill="${YELLOW}" ${S}/>`,
  mystery: `<rect x="6" y="14" width="24" height="36" rx="5" fill="${TEAL}" ${S} transform="rotate(-12 18 32)"/><rect x="34" y="14" width="24" height="36" rx="5" fill="${PINK}" ${S} transform="rotate(12 46 32)"/><rect x="19" y="9" width="26" height="42" rx="5" fill="${PURPLE}" ${S}/>
    <path d="M26.500 24a6 6 0 1 1 9 5c-2.500 1.600-3.200 2.800-3.200 5" fill="none" stroke="${YELLOW}" stroke-width="4.500" stroke-linecap="round"/><circle cx="32.300" cy="41.500" r="2.800" fill="${YELLOW}"/>`,
  reflex: `<rect x="8" y="36" width="48" height="18" rx="9" fill="#b3123f" ${S}/><ellipse cx="32" cy="34" rx="22" ry="13" fill="${RED}" ${S}/><path d="M36 4L24 20h8l-5 12 14-17h-8z" fill="${YELLOW}" ${W(2.500)}/>`,
  rps: `<g fill="none" stroke-linecap="round"><path d="M24 38L46 8M40 38L18 8" stroke="${INK}" stroke-width="9"/><path d="M24 38L46 8M40 38L18 8" stroke="${CREAM}" stroke-width="4"/>
    <circle cx="19" cy="47" r="8" stroke="${INK}" stroke-width="9"/><circle cx="19" cy="47" r="8" stroke="${PINK}" stroke-width="4"/><circle cx="45" cy="47" r="8" stroke="${INK}" stroke-width="9"/><circle cx="45" cy="47" r="8" stroke="${PINK}" stroke-width="4"/></g>`,
  rock: `<path d="M12 42c-5-10 1-24 14-28 13-4 25 2 27 14 2 13-7 23-20 25-9 1-18-3-21-11z" fill="#9aa3b5" ${S}/><path d="M24 22l6 6-3 8M40 26l-4 8 6 6" fill="none" stroke="${INK}" stroke-width="2.500" stroke-linecap="round" stroke-linejoin="round"/>`,
  paper: `<path d="M16 5h24l10 10v40H16z" fill="#fff" ${S}/><path d="M40 5v10h10" fill="#d9e2f2" ${S}/><path d="M23 26h20M23 34h20M23 42h14" stroke="${BLUE}" stroke-width="3" stroke-linecap="round"/>`,
  least: `<path d="M24 12a8 8 0 0 1 16 0" fill="none" ${W(4)}/><rect x="20" y="12" width="24" height="7" rx="2" fill="${INK}" ${S}/><path d="M18 19h28l-3 30H21z" fill="${RED}" ${S}/><path d="M26 25l1 18M38 25l-1 18" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/><rect x="16" y="49" width="32" height="8" rx="3" fill="${INK}" ${S}/>`,
  all: `<g ${S}><path d="M8 14l18 4-4 20a8 8 0 0 1-16-3z" fill="${YELLOW}" transform="rotate(-8 16 26)"/><path d="M56 14l-18 4 4 20a8 8 0 0 0 16-3z" fill="${YELLOW}" transform="rotate(8 48 26)"/>
    <path d="M13 40l-3 14M4 54h14M51 40l3 14M46 54h14" fill="none"/><path d="M32 4v7M24 6l3 6M40 6l-3 6" fill="none" stroke="${CREAM}"/></g>`,
  fwd: `<path d="M10 14l18 18-18 18zM32 14l22 18-22 18z" fill="${GREEN}" ${S}/>`,
  back: `<path d="M54 14L36 32l18 18zM32 14L10 32l22 18z" fill="${RED}" ${S}/>`,
  water: `<path d="M32 6c8 12 18 22 18 33a18 18 0 0 1-36 0c0-11 10-21 18-33z" fill="${BLUE}" ${S}/><path d="M23 38a9 9 0 0 0 7 10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
  start: `<path d="M16 8v50" ${W(5)}/><path d="M16 10h34l-8 11 8 11H16z" fill="${GREEN}" ${S}/>`,
  finish: `<path d="M18 10h28v14a14 14 0 0 1-28 0z" fill="${YELLOW}" ${S}/><path d="M18 14H9c0 9 4 13 10 14M46 14h9c0 9-4 13-10 14" fill="none" ${S}/>
    <path d="M32 38v8" ${W(6)}/><rect x="20" y="46" width="24" height="9" rx="3" fill="${ORANGE}" ${S}/><path d="M32 15l2 4.200 4.600.5-3.400 3.100 1 4.500-4.200-2.300-4.200 2.300 1-4.500-3.400-3.100 4.600-.5z" fill="#fff"/>`,
  // card art
  shield: `<path d="M32 6l22 7v15c0 14-9 24-22 30C19 52 10 42 10 28V13z" fill="${BLUE}" ${S}/><path d="M32 6v52C19 52 10 42 10 28V13z" fill="${TEAL}" ${S}/><path d="M23 31l7 7 12-14" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  mirror: `<ellipse cx="32" cy="24" rx="17" ry="20" fill="${YELLOW}" ${S}/><ellipse cx="32" cy="24" rx="12" ry="15" fill="#c9f3ff" ${S}/><path d="M26 18l8-7M27 27l12-11" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M32 44v14" ${W(7)}/><path d="M32 45v12" stroke="${YELLOW}" stroke-width="3" stroke-linecap="round"/>`,
  half: `<path d="M12 54C14 30 28 12 52 8c-2 22-14 38-34 42" fill="${CREAM}" ${S}/><path d="M12 56C20 38 32 24 48 12" fill="none" ${S}/><path d="M24 40l-2-9M32 31l-1-9M40 23l0-8M26 39l9 1M34 30l9 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  loaded: `<rect x="12" y="14" width="40" height="40" rx="9" fill="${CREAM}" ${S}/><path d="M32 22l3.500 7.400 8.100.9-6 5.500 1.700 8L32 39.700l-7.300 4.100 1.700-8-6-5.500 8.100-.9z" fill="${PINK}" ${S}/><path d="M50 4v8M46 8h8M10 6v6M7 9h6" stroke="${YELLOW}" stroke-width="3" stroke-linecap="round"/>`,
  swap: `<g fill="none" ${S}><path d="M10 24h36" stroke-width="9"/><path d="M10 24h36" stroke="${TEAL}" stroke-width="4"/><path d="M40 12l14 12-14 12z" fill="${TEAL}"/>
    <path d="M54 44H18" stroke-width="9"/><path d="M54 44H18" stroke="${PINK}" stroke-width="4"/><path d="M24 32L10 44l14 12z" fill="${PINK}"/></g>`,
  thief: `<circle cx="32" cy="34" r="20" fill="${CREAM}" ${S}/><path d="M12 30q20-10 40 0v10q-20-8-40 0z" fill="${INK}"/><ellipse cx="24" cy="34" rx="4.500" ry="3.500" fill="#fff"/><ellipse cx="40" cy="34" rx="4.500" ry="3.500" fill="#fff"/><circle cx="25" cy="34" r="1.800" fill="${INK}"/><circle cx="41" cy="34" r="1.800" fill="${INK}"/>
    <path d="M13 24c2-12 12-16 19-16s17 4 19 16c-12-5-26-5-38 0z" fill="${PURPLE}" ${S}/><path d="M26 46q6 4 12 0" fill="none" ${S}/>`,
  double: `<g ${S}><path d="M10 18l12 12M22 18L10 30" stroke-width="8"/><path d="M10 18l12 12M22 18L10 30" stroke="${YELLOW}" stroke-width="3.500"/>
    <path d="M30 22a9 9 0 1 1 15 7L30 46h22" fill="none" stroke-width="10"/><path d="M30 22a9 9 0 1 1 15 7L30 46h22" fill="none" stroke="${ORANGE}" stroke-width="5"/></g>`,
};

ART.potato = ART.sip; // Pass the Bidon

// ---------- tile icons ----------
['sip', 'give', 'card', 'vote', 'trust', 'duel', 'number', 'all', 'fwd', 'back', 'water', 'start', 'finish',
  'rule', 'dicedrink', 'mystery', 'reflex', 'rps', 'least']
  .forEach(k => save('icon-' + k, ART[k], 64));
// the two card-deck houses use the artwork from the printed card backs
save('icon-meeting', embed('icon-em.png', 1, 1, 62, 62), 64);
save('icon-ohno', embed('icon-on.png', 1, 1, 62, 62), 64);
save('icon-pair', ART.all, 64); save('icon-joke', embed('icon-em.png', 1, 1, 62, 62), 64); save('icon-deck', ART.card, 64); save('icon-push', ART.fwd, 64);
save('icon-cantine', `<rect x="2" y="2" width="60" height="60" rx="12" fill="#fff"/>` + embed('em-9.jpg', 7, 7, 50, 50), 64);
save('rps-rock', ART.rock, 64); save('rps-paper', ART.paper, 64); save('rps-scissors', ART.rps, 64);

// ---------- dice ----------
const PIPS = { 1: [[32, 32]], 2: [[19, 19], [45, 45]], 3: [[19, 19], [32, 32], [45, 45]], 4: [[19, 19], [45, 19], [19, 45], [45, 45]],
  5: [[19, 19], [45, 19], [32, 32], [19, 45], [45, 45]], 6: [[19, 17], [45, 17], [19, 32], [45, 32], [19, 47], [45, 47]] };
for (let n = 1; n <= 6; n++) save('dice-' + n,
  `<rect x="6" y="9" width="52" height="52" rx="12" fill="${INK}" opacity=".35"/><rect x="5" y="4" width="54" height="54" rx="12" fill="${CREAM}" ${S}/>` +
  PIPS[n].map(p => `<circle cx="${p[0]}" cy="${p[1] - 1}" r="5.500" fill="${n === 1 ? PINK : INK}"/>`).join(''), 64);

// ---------- cards (art only; names are drawn by the page) ----------
const CARD_BG = { shield: ['#16337a', '#2f6fe0'], mirror: ['#1c4a8f', '#39c2c9'], potato: ['#a8502a', '#f08a3c'], half: ['#1d6b55', '#4fbf7a'],
  loaded: ['#8a5a12', '#ffc857'], swap: ['#22335a', '#7fb6ff'], thief: ['#141c33', '#4f6591'], double: ['#8f2f2d', '#e0524f'] };
Object.keys(CARD_BG).forEach(k => {
  const [a, b] = CARD_BG[k];
  save('card-' + k, `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect x="3" y="3" width="194" height="194" rx="22" fill="url(#g)" stroke="${INK}" stroke-width="6"/><rect x="14" y="14" width="172" height="172" rx="14" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>
    <circle cx="100" cy="100" r="62" fill="#fff" fill-opacity=".16"/><g transform="translate(36 36) scale(2)">${ART[k]}</g>`, 200);
});
save('card-skip', `<rect x="3" y="3" width="194" height="194" rx="22" fill="#fff" stroke="${INK}" stroke-width="6"/>` + embed('em-9.jpg', 30, 30, 140, 140), 200);
save('card-back', `<rect x="3" y="3" width="194" height="274" rx="22" fill="${NAVY}" stroke="${INK}" stroke-width="6"/><rect x="16" y="16" width="168" height="248" rx="14" fill="none" stroke="${YELLOW}" stroke-width="4"/>
  <g fill="${YELLOW}" opacity=".9"><path d="M100 86l14 30 33 4-24 22 6 32-29-16-29 16 6-32-24-22 33-4z"/></g><circle cx="100" cy="140" r="78" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="3" stroke-dasharray="3 10" stroke-linecap="round"/>`, 200, 280);

// ---------- avatars: eight riders, one per Giant bike family ----------
const rider = (bg, helmet, jersey, skin, extra) => `<circle cx="50" cy="50" r="47" fill="${bg}" stroke="${INK}" stroke-width="5"/>
  <path d="M16 96c2-18 14-26 34-26s32 8 34 26z" fill="${jersey}" ${S}/><path d="M38 71l12 12 12-12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="50" cy="50" r="22" fill="${skin}" ${S}/>
  <path d="M25 46c0-17 11-27 25-27s25 10 25 27c-8-5-16-7-25-7s-17 2-25 7z" fill="${helmet}" ${S}/><path d="M38 23c-3 5-4 10-4 16M50 20v19M62 23c3 5 4 10 4 16" fill="none" stroke="${INK}" stroke-width="2.500" stroke-linecap="round"/>
  <path d="M27 46l-3 12M73 46l3 12" ${W(2.500)}/>${extra || ''}`;
const eyes = `<circle cx="42" cy="52" r="3" fill="${INK}"/><circle cx="58" cy="52" r="3" fill="${INK}"/>`;
const smile = `<path d="M42 61q8 7 16 0" fill="none" ${W(2.500)}/>`;
const shades = (c) => `<path d="M31 48h38v6a8 8 0 0 1-16 0h-6a8 8 0 0 1-16 0z" fill="${c}" ${W(2.500)}/>`;
const AV = [
  rider(PURPLE, '#fff', NAVY, '#f3c9a5', eyes + smile),                                  // TCR
  rider(RED, INK, '#fff', '#d9a066', shades(BLUE) + smile),                              // Propel
  rider(YELLOW, PURPLE, '#fff', '#f6d7bd', eyes + `<path d="M43 62h14" ${W(2.500)}/>`),   // Defy
  rider(TEAL, ORANGE, INK, '#8d5a3b', eyes + smile + `<path d="M40 59q10-5 20 0" fill="none" ${W(3)}/>`), // Revolt (moustache)
  rider(GREEN, INK, ORANGE, '#f3c9a5', shades(YELLOW) + smile),                          // Trance
  rider('#a06bff', YELLOW, INK, '#c98a5c', eyes + `<path d="M41 60q9 9 18 0z" fill="#fff" ${W(2.500)}/>`), // Reign
  rider(ORANGE, RED, '#fff', '#f6d7bd', shades(INK) + `<path d="M44 63q6 3 12 0" fill="none" ${W(2.500)}/>`), // Glory
  rider('#c5cfe2', GREEN, PURPLE, '#a56b46', eyes + smile + `<circle cx="34" cy="58" r="3" fill="${RED}" opacity=".5"/><circle cx="66" cy="58" r="3" fill="${RED}" opacity=".5"/>`), // Talon
];
AV.forEach((a, i) => save('avatar-' + i, a, 100));

// ---------- logo emblem + favicon: a little road bike (our own drawing, not a brand logo) ----------
const spokes = (cx, cy, r) => Array.from({ length: 8 }, (_, k) => { const a = k * Math.PI / 8; return `<path d="M${(cx - Math.cos(a) * r).toFixed(1)} ${(cy - Math.sin(a) * r).toFixed(1)}L${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}" stroke="${BLUE}" stroke-opacity=".55" stroke-width="1.500"/>`; }).join('');
const wheel = (cx, cy) => spokes(cx, cy, 27) + `<circle cx="${cx}" cy="${cy}" r="29" fill="none" stroke="${CREAM}" stroke-width="7"/><circle cx="${cx}" cy="${cy}" r="4" fill="${CREAM}"/>`;
const bike = wheel(58, 124) + wheel(142, 124) +
  `<g fill="none" stroke="${PURPLE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="M58 124L84 78h46l12 46M84 78l20 46h-46M104 124l26-46"/></g>
  <g fill="none" stroke="${CREAM}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M74 72h20M126 70l-4-12h14"/></g><circle cx="104" cy="124" r="7" fill="${YELLOW}" stroke="${INK}" stroke-width="3"/>`;
const logo = `<circle cx="100" cy="100" r="94" fill="${INK}" stroke="${PURPLE}" stroke-width="9"/><circle cx="100" cy="100" r="80" fill="none" stroke="${BLUE}" stroke-opacity=".5" stroke-width="2.500" stroke-dasharray="1 11" stroke-linecap="round"/>${bike}`;
save('logo', logo, 200);
save('favicon', logo, 200);
save('bike', bike, 200);

console.log('Wrote', fs.readdirSync(OUT).length, 'images to', OUT);
