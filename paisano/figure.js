// The exercise figures: a flat-shaded person who moves between the two poses of a rep (config.js). Between them, a
// limb whose hand or foot stays put, on the floor, the bar or a wall, bends to keep it there; every other bone turns
// about its joint and takes its length from the poses, so an arm seen end-on (a floor press) grows as it rises. The far
// limbs are a shade darker, for depth.

const NS = 'http://www.w3.org/2000/svg';
// Limbs from the root out: near leg and far leg, near arm and far arm. A front view sets them apart at the shoulders
// and hips.
const LIMBS = [['hip', 'kn', 'an', 'to', -5], ['hip', 'KN', 'AN', 'TO', 5], ['sh', 'el', 'wr', null, -9], ['sh', 'EL', 'WR', null, 9]];
const LOOKS = [[['shorts', 8.6], ['skin', 6.4], ['shoe', 5.2]], [['skin', 5.8], ['skin', 5], ['shirt', 7]]]; // a leg's bones, an arm's (the last a sleeve): [class, width]
const HEAD = 6.6;

// The head around its center, facing right or, in a front view, facing out: a neck, skin and short hair, no face.
const FACE = {
  side: `<line class="skin" stroke-width="4.6" x1="0" y1="${HEAD + 6}" x2="0" y2="3"/><circle class="skin" r="${HEAD}"/>
    <path class="hair" d="M-6.8 1.2 C-7.6 -4.6 -3.8 -7.6 0.8 -7.4 C4.6 -7.2 7 -4.8 6.9 -1.8 C5 -3.6 2.4 -4.2 0.2 -3.4 C-1.4 -2.6 -2.4 -1 -2.8 1 C-3.6 3 -5 4.4 -6.4 4.6 Z"/>`,
  front: `<line class="skin" stroke-width="5" x1="0" y1="${HEAD + 6}" x2="0" y2="3"/><circle class="skin" r="${HEAD}"/>
    <path class="hair" d="M-6.9 0.6 C-7.3 -4.8 -3.6 -7.5 0 -7.5 C3.6 -7.5 7.3 -4.8 6.9 0.6 C5.8 -2.2 4 -3.6 1.8 -3.9 C0.4 -2.8 -1.6 -2.8 -2.6 -3.6 C-4.6 -3.2 -6 -1.6 -6.9 0.6 Z"/>`,
};

// Builds x's figure in svg; returns a function that draws it a fraction t of the way from the first pose to the second.
export function figure(svg, x) {
  const [A, B] = x.poses.map(pose => {
    const j = Object.fromEntries(pose.split(',').map(p => { const [k, px, py] = p.trim().split(/\s+/); return [k, [+px, +py]]; }));
    for (const k of ['kn', 'an', 'to', 'el', 'wr']) j[k.toUpperCase()] ??= j[k];
    return j;
  });
  // A fixed frame around both poses, heads included, so every figure is drawn at one size.
  const all = [...Object.values(A), ...Object.values(B), [A.hd[0], A.hd[1] - 12], [B.hd[0], B.hd[1] - 12]].concat(x.bar ? [[50, x.bar]] : []);
  const cx = (Math.min(...all.map(p => p[0])) + Math.max(...all.map(p => p[0]))) / 2;
  const cy = (Math.min(...all.map(p => p[1])) + Math.max(...all.map(p => p[1]))) / 2;
  svg.setAttribute('viewBox', `${cx - 66} ${cy - 66} 132 132`);
  const el = (name, attrs, parent = svg) => {
    const node = parent.appendChild(document.createElementNS(NS, name));
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };
  svg.replaceChildren();
  el('rect', { class: 'mat', x: cx - 56, y: 96.6, width: 112, height: 3.4, rx: 1.7 });
  if (x.wall) el('rect', { class: 'wall', x: x.wall, y: cy - 66, width: 9, height: 100 - cy + 66, rx: 1.5 });
  if (x.bar !== undefined) el('line', { class: 'bar', 'stroke-width': 3.6, x1: 26, x2: 84, y1: x.bar, y2: x.bar });
  const far = el('g', { class: x.front ? '' : 'far' }), body = el('g', {}), near = el('g', {}); // and the head over all
  const limbs = LIMBS.map((_, i) => {
    const layer = i % 2 ? far : near;
    return {
      bones: LOOKS[i >> 1].map(([cls, w]) => el('line', { class: cls, 'stroke-width': w }, layer)),
      hand: i > 1 && el('circle', { class: 'skin', r: 2.9 }, layer),
    };
  });
  const torso = el('line', { class: 'shirt', 'stroke-width': 12.6 }, body);
  const head = el('g', {});
  head.innerHTML = FACE[x.front ? 'front' : 'side'];
  const bells = [['wr', near], ['WR', far]].slice(0, { none: 0, one: 1, pair: 2 }[x.hold]).map(([j, layer]) => {
    const bell = el('g', {}, layer);
    bell.innerHTML = '<rect class="block" x="-4.2" y="-3.9" width="8.4" height="7.8" rx="1.6"/><rect class="band" x="-4.2" y="-0.8" width="8.4" height="1.6"/>';
    return [j, bell];
  });

  return t => {
    const P = {}, mix = (a, b) => a + (b - a) * t;
    const off = (J, root, dx) => x.front ? [J[root][0] + dx, J[root][1]] : J[root];
    // A bone from a to b: turned and sized between the poses.
    const turn = (from, a, b) => {
      const [la, aa] = [Math.hypot(A[b][0] - a.A[0], A[b][1] - a.A[1]), Math.atan2(A[b][1] - a.A[1], A[b][0] - a.A[0])];
      const [lb, ab] = [Math.hypot(B[b][0] - a.B[0], B[b][1] - a.B[1]), Math.atan2(B[b][1] - a.B[1], B[b][0] - a.B[0])];
      const angle = aa + ((ab - aa + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * t, length = mix(la, lb);
      return [from[0] + length * Math.cos(angle), from[1] + length * Math.sin(angle)];
    };
    const at = j => ({ A: A[j], B: B[j] });
    P.hip = [mix(A.hip[0], B.hip[0]), mix(A.hip[1], B.hip[1])];
    P.sh = turn(P.hip, at('hip'), 'sh');
    P.hd = turn(P.sh, at('sh'), 'hd');
    for (const [root, mid, end, tip, dx] of LIMBS) {
      const r = { A: off(A, root, dx), B: off(B, root, dx) }, from = x.front ? [P[root][0] + dx, P[root][1]] : P[root];
      P[root + dx] = from;
      if (Math.hypot(A[end][0] - B[end][0], A[end][1] - B[end][1]) < 0.01) {
        // Planted: the middle joint is where the two bones meet, on the side it bends to in the poses.
        const l1 = mix(Math.hypot(A[mid][0] - r.A[0], A[mid][1] - r.A[1]), Math.hypot(B[mid][0] - r.B[0], B[mid][1] - r.B[1]));
        const l2 = mix(Math.hypot(A[end][0] - A[mid][0], A[end][1] - A[mid][1]), Math.hypot(B[end][0] - B[mid][0], B[end][1] - B[mid][1]));
        const dxe = A[end][0] - from[0], dye = A[end][1] - from[1], reach = Math.hypot(dxe, dye), d = Math.min(reach, l1 + l2);
        const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(l1 * l1 - along * along, 0));
        const ux = dxe / reach, uy = dye / reach, px = from[0] + along * ux, py = from[1] + along * uy;
        const hint = [mix(A[mid][0], B[mid][0]), mix(A[mid][1], B[mid][1])];
        const [k1, k2] = [[px - h * uy, py + h * ux], [px + h * uy, py - h * ux]];
        P[mid] = Math.hypot(k1[0] - hint[0], k1[1] - hint[1]) < Math.hypot(k2[0] - hint[0], k2[1] - hint[1]) ? k1 : k2;
        P[end] = A[end];
      } else {
        P[mid] = turn(from, r, mid);
        P[end] = turn(P[mid], at(mid), end);
      }
      if (tip) P[tip] = turn(P[end], at(end), tip);
    }
    const line = (node, a, b) => {
      node.setAttribute('x1', a[0]); node.setAttribute('y1', a[1]);
      node.setAttribute('x2', b[0]); node.setAttribute('y2', b[1]);
    };
    LIMBS.forEach(([root, mid, end, tip, dx], i) => {
      const { bones: [upper, lower, third], hand } = limbs[i], top = P[root + dx];
      line(upper, top, P[mid]);
      line(lower, P[mid], P[end]);
      if (tip) line(third, P[end], [P[tip][0] + (P[tip][0] - P[end][0]) * 0.25, P[tip][1] + (P[tip][1] - P[end][1]) * 0.25]); // a shoe runs past the toes
      else line(third, top, [top[0] + (P[mid][0] - top[0]) * 0.4, top[1] + (P[mid][1] - top[1]) * 0.4]); // a sleeve covers the top of the arm
      if (hand) hand.setAttribute('cx', P[end][0]), hand.setAttribute('cy', P[end][1]);
    });
    line(torso, P.hip, P.sh);
    // The head sits a neck's length off the shoulders, along the line the poses give it, and turns with it.
    const nx = P.hd[0] - P.sh[0], ny = P.hd[1] - P.sh[1], neck = Math.hypot(nx, ny), out = neck * 1.45;
    const turned = x.front ? 0 : Math.atan2(ny, nx) * 180 / Math.PI + 90;
    head.setAttribute('transform', `translate(${P.sh[0] + nx / neck * out} ${P.sh[1] + ny / neck * out}) rotate(${turned})`);
    for (const [j, bell] of bells) bell.setAttribute('transform', `translate(${P[j][0]} ${P[j][1]})`);
  };
}

// The figure's rep, over and over: up, a pause, back down a little slower, a pause. Returns a function that stops it.
export function play(svg, x) {
  const draw = figure(svg, x), start = performance.now();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { draw(0.5); return () => {}; }
  let frame = requestAnimationFrame(function tick(now) {
    const s = ((now - start) / 1000 / x.tempo % 1) * 3.2;
    const ease = u => u < 0.5 ? 2 * u * u : 1 - (2 - 2 * u) ** 2 / 2;
    draw(s < 0.5 ? 0 : s < 1.5 ? ease(s - 0.5) : s < 1.9 ? 1 : s < 3 ? 1 - ease((s - 1.9) / 1.1) : 0);
    frame = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(frame);
}
