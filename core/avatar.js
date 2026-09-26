'use strict';

/* A face for an agent, and only an agent — see AGENT_NAMES just above this in
   core/todo.js. Abstract geometric shapes on a flat background, in Tenon's own
   chart colours (--tenon-chart-1..10, see BUCKET_COLOR in kanban/js/02-state.js
   for the board's other user of that same set), seeded from the name itself so
   the same agent always draws the same picture and no two agents draw the
   same one by coincidence worth minding. No network call, no CDN, nothing to
   vendor — a few lines of arithmetic and a template string.

   Classic script, loaded right after core/todo.js and before every file in
   kanban/js/, so agentAvatarSVG() is a plain global by the time cardModel()
   (09-columns.js) and the drawer (19-drawer.js) reach for it. Free of window,
   document and state, the same rule core/todo.js keeps beside it, so it runs
   the same in the browser and in a bare Node vm. */

const AVATAR_PALETTE = [
  'var(--tenon-chart-1)', 'var(--tenon-chart-2)', 'var(--tenon-chart-3)', 'var(--tenon-chart-4)',
  'var(--tenon-chart-5)', 'var(--tenon-chart-6)', 'var(--tenon-chart-7)', 'var(--tenon-chart-8)',
  'var(--tenon-chart-9)', 'var(--tenon-chart-10)'
];

/* djb2 — not cryptographic, just a cheap, deterministic way to spread names
   across the palette and the shapes below. */
function avatarHash(name){
  let h = 5381;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}
/* A linear congruential step, so three shapes on one avatar don't all read
   off the same few bits of the name's hash. */
function avatarNext(seed){ return (seed * 1103515245 + 12345) >>> 0; }

const AVATAR_SHAPES = [
  (cx, cy, r, fill) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/>',
  (cx, cy, r, fill) => '<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + (r * 2) + '" height="' + (r * 2) +
    '" fill="' + fill + '" transform="rotate(45 ' + cx + ' ' + cy + ')"/>',
  (cx, cy, r, fill) => '<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + (r * 2) + '" height="' + (r * 2) + '" fill="' + fill + '"/>',
  (cx, cy, r, fill) => '<polygon points="' + [0, 1, 2].map(k => {
    const a = Math.PI * 2 * k / 3 - Math.PI / 2;
    return (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1);
  }).join(' ') + '" fill="' + fill + '"/>'
];

/* An agent's avatar as a self-contained <svg> string: a rounded square in one
   Tenon colour, three overlapping shapes in others on top of it, on a 40x40
   grid. `size` is the drawn width and height in CSS pixels. */
function avatarSvg(name, size){
  const h = avatarHash(name);
  const px = size || 20;
  let svg = '<svg viewBox="0 0 40 40" width="' + px + '" height="' + px + '" aria-hidden="true" focusable="false">' +
    '<rect width="40" height="40" rx="9" fill="' + AVATAR_PALETTE[h % AVATAR_PALETTE.length] + '"/>';
  let seed = h || 1;
  for (let i = 0; i < 3; i++) {
    seed = avatarNext(seed);
    // seed can sit past 2^31, where JS's >> sign-extends — >>> throughout
    // keeps every slice of it an ordinary unsigned number. Shape reads the
    // high bits rather than seed's own low ones: this LCG's low bits are the
    // textbook-weak part of it, cycling through far too few values.
    const shape = AVATAR_SHAPES[(seed >>> 20) % AVATAR_SHAPES.length];
    const fill = AVATAR_PALETTE[(seed >>> 8) % AVATAR_PALETTE.length];
    const cx = 9 + (seed >>> 4) % 22;
    const cy = 9 + (seed >>> 12) % 22;
    const r = 5 + (seed >>> 16) % 7;
    svg += shape(cx, cy, r, fill);
  }
  return svg + '</svg>';
}
/* The avatar wrapped for drawing beside a name, or '' for anyone agentOf()
   does not recognise — the one call site the drawer and the board both use,
   so "agents only, people get none" is decided in one place. */
function agentAvatarHTML(to, size){
  const agent = agentOf(to);
  if (!agent) return '';
  return '<span class="avatar" aria-hidden="true">' + avatarSvg(agent, size) + '</span>';
}
