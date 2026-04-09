import { computeBalances, simplifyDebts, formatCents } from '../../logic/settlement.js';
import { store } from '../../store/app.store.js';
import type { Expense, Group, Settlement } from '../../types/index.js';

const PALETTE = ['#e53e3e','#dd6b20','#ecc94b','#38a169','#319795','#4f6ef7','#805ad5','#d53f8c'];

function avatarColor(uid: string, colorMap: Record<string, string>): string {
  if (colorMap[uid]) return colorMap[uid];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function createGraphSvg(
  settlements: Settlement[],
  group: Group,
  memberColorMap: Record<string, string>
): SVGSVGElement {
  const members = group.members;
  const N = members.length;
  const W = 440, H = 280;
  const cx = W / 2, cy = H / 2;
  const nodeR = 26;
  const arrowLen = 10;
  const ns = 'http://www.w3.org/2000/svg';

  // ── Physics state ───────────────────────────────────────────────────────────
  interface PhysNode { uid: string; x: number; y: number; vx: number; vy: number; pinned: boolean; }
  const phys: Record<string, PhysNode> = {};
  const R0 = N <= 1 ? 0 : N === 2 ? 90 : 100;
  members.forEach((m, i) => {
    const angle = (2 * Math.PI * i) / Math.max(N, 1) - Math.PI / 2;
    phys[m.uid] = {
      uid: m.uid,
      x: cx + R0 * Math.cos(angle) + (Math.random() - 0.5) * 8,
      y: cy + R0 * Math.sin(angle) + (Math.random() - 0.5) * 8,
      vx: 0, vy: 0, pinned: false,
    };
  });

  // ── SVG scaffold ────────────────────────────────────────────────────────────
  const svg = document.createElementNS(ns, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.style.overflow = 'visible';
  svg.style.maxHeight = '300px';

  const defs = document.createElementNS(ns, 'defs');
  defs.innerHTML = `<marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#4f6ef7"/></marker>`;
  svg.appendChild(defs);

  const edgeGroup = document.createElementNS(ns, 'g');
  svg.appendChild(edgeGroup);
  const nodeGroup = document.createElementNS(ns, 'g');
  svg.appendChild(nodeGroup);

  // ── Edge elements ───────────────────────────────────────────────────────────
  const edgeEls = settlements.map(s => {
    const amtText = formatCents(s.amount);
    const rectW = amtText.length * 7 + 10;

    const path = document.createElementNS(ns, 'path') as SVGPathElement;
    path.setAttribute('stroke', '#4f6ef7');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrowhead)');

    const rect = document.createElementNS(ns, 'rect') as SVGRectElement;
    rect.setAttribute('width', String(rectW));
    rect.setAttribute('height', '18');
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', 'white');
    rect.setAttribute('stroke', '#bee3f8');
    rect.setAttribute('stroke-width', '1.5');

    const text = document.createElementNS(ns, 'text') as SVGTextElement;
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '10');
    text.setAttribute('font-weight', '700');
    text.setAttribute('fill', '#4f6ef7');
    text.textContent = amtText;

    edgeGroup.appendChild(path);
    edgeGroup.appendChild(rect);
    edgeGroup.appendChild(text);
    return { path, rect, text, s, rectW };
  });

  function updateEdges() {
    edgeEls.forEach(({ path, rect, text, s, rectW }) => {
      const from = phys[s.from], to = phys[s.to];
      if (!from || !to) return;
      const dx = to.x - from.x, dy = to.y - from.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;
      const ux = dx / len, uy = dy / len;
      const bend = 22;
      const sx = from.x + ux * nodeR, sy = from.y + uy * nodeR;
      const ex = to.x - ux * (nodeR + arrowLen), ey = to.y - uy * (nodeR + arrowLen);
      const mx = (sx + ex) / 2 + (-uy) * bend, my = (sy + ey) / 2 + ux * bend;
      path.setAttribute('d', `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
      const lx = 0.25 * sx + 0.5 * mx + 0.25 * ex;
      const ly = 0.25 * sy + 0.5 * my + 0.25 * ey;
      rect.setAttribute('x', (lx - rectW / 2).toFixed(1));
      rect.setAttribute('y', (ly - 9).toFixed(1));
      text.setAttribute('x', lx.toFixed(1));
      text.setAttribute('y', (ly + 5).toFixed(1));
    });
  }

  // ── Node elements + drag ────────────────────────────────────────────────────
  const windowCleanups: Array<() => void> = [];
  const nodeEls: Record<string, { circle: SVGCircleElement; initial: SVGTextElement; label: SVGTextElement }> = {};

  members.forEach(m => {
    const color = avatarColor(m.uid, memberColorMap);
    const name = m.displayName;

    const circle = document.createElementNS(ns, 'circle') as SVGCircleElement;
    circle.setAttribute('r', String(nodeR));
    circle.setAttribute('fill', color);
    circle.setAttribute('stroke', 'white');
    circle.setAttribute('stroke-width', '2.5');
    circle.style.cursor = 'grab';

    const initial = document.createElementNS(ns, 'text') as SVGTextElement;
    initial.setAttribute('text-anchor', 'middle');
    initial.setAttribute('font-size', '13');
    initial.setAttribute('font-weight', '700');
    initial.setAttribute('fill', 'white');
    initial.style.pointerEvents = 'none';
    initial.textContent = name[0].toUpperCase();

    const label = document.createElementNS(ns, 'text') as SVGTextElement;
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '11');
    label.setAttribute('fill', 'var(--color-text)');
    label.style.pointerEvents = 'none';
    label.textContent = name.length > 11 ? name.slice(0, 10) + '…' : name;

    nodeGroup.appendChild(circle);
    nodeGroup.appendChild(initial);
    nodeGroup.appendChild(label);
    nodeEls[m.uid] = { circle, initial, label };

    // Drag — pins the node so physics skips it, releases on mouseup/touchend
    let dragStart = { cx: 0, cy: 0, px: 0, py: 0 };

    function svgScale() {
      const r = svg.getBoundingClientRect();
      return { sx: W / r.width, sy: H / r.height };
    }

    function startDrag(clientX: number, clientY: number) {
      phys[m.uid].pinned = true;
      phys[m.uid].vx = 0;
      phys[m.uid].vy = 0;
      dragStart = { cx: clientX, cy: clientY, px: phys[m.uid].x, py: phys[m.uid].y };
    }

    function moveDrag(clientX: number, clientY: number) {
      if (!phys[m.uid].pinned) return;
      const { sx, sy } = svgScale();
      phys[m.uid].x = dragStart.px + (clientX - dragStart.cx) * sx;
      phys[m.uid].y = dragStart.py + (clientY - dragStart.cy) * sy;
    }

    function endDrag() {
      if (!phys[m.uid].pinned) return;
      phys[m.uid].pinned = false;
      circle.style.cursor = 'grab';
    }

    circle.addEventListener('mousedown', e => { startDrag(e.clientX, e.clientY); circle.style.cursor = 'grabbing'; e.preventDefault(); });
    const onMM = (e: MouseEvent) => moveDrag(e.clientX, e.clientY);
    const onMU = () => endDrag();
    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup', onMU);

    circle.addEventListener('touchstart', e => { startDrag(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false });
    const onTM = (e: TouchEvent) => { moveDrag(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); };
    const onTE = () => endDrag();
    window.addEventListener('touchmove', onTM, { passive: false });
    window.addEventListener('touchend', onTE);

    windowCleanups.push(() => {
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup', onMU);
      window.removeEventListener('touchmove', onTM);
      window.removeEventListener('touchend', onTE);
    });
  });

  function applyNodeEl(m: typeof members[0]) {
    const p = phys[m.uid];
    const el = nodeEls[m.uid];
    el.circle.setAttribute('cx', p.x.toFixed(1));
    el.circle.setAttribute('cy', p.y.toFixed(1));
    el.initial.setAttribute('x', p.x.toFixed(1));
    el.initial.setAttribute('y', (p.y + 5).toFixed(1));
    el.label.setAttribute('x', p.x.toFixed(1));
    el.label.setAttribute('y', (p.y + nodeR + 15).toFixed(1));
  }

  // ── Physics tick ────────────────────────────────────────────────────────────
  const restLen = Math.max(110, Math.min(180, 340 / Math.max(N, 2)));
  function tick() {
    if (!svg.isConnected) { windowCleanups.forEach(fn => fn()); return; }

    const nodes = Object.values(phys);
    const fx: Record<string, number> = {};
    const fy: Record<string, number> = {};
    nodes.forEach(n => { fx[n.uid] = 0; fy[n.uid] = 0; });

    // Node–node repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const f = 4500 / (dist * dist);
        const ux = dx / dist, uy = dy / dist;
        fx[a.uid] -= f * ux; fy[a.uid] -= f * uy;
        fx[b.uid] += f * ux; fy[b.uid] += f * uy;
      }
    }

    // Edge spring attraction
    settlements.forEach(s => {
      const a = phys[s.from], b = phys[s.to];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const f = 0.045 * (dist - restLen);
      const ux = dx / dist, uy = dy / dist;
      fx[a.uid] += f * ux; fy[a.uid] += f * uy;
      fx[b.uid] -= f * ux; fy[b.uid] -= f * uy;
    });

    // Weak gravity toward center
    nodes.forEach(n => {
      fx[n.uid] += (cx - n.x) * 0.012;
      fy[n.uid] += (cy - n.y) * 0.012;
    });

    // Integrate
    nodes.forEach(n => {
      if (n.pinned) { n.vx = 0; n.vy = 0; return; }
      n.vx = (n.vx + fx[n.uid]) * 0.80;
      n.vy = (n.vy + fy[n.uid]) * 0.80;
      const spd = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (spd > 12) { n.vx = n.vx / spd * 12; n.vy = n.vy / spd * 12; }
      n.x = Math.max(nodeR + 4, Math.min(W - nodeR - 4, n.x + n.vx));
      n.y = Math.max(nodeR + 4, Math.min(H - nodeR - 18, n.y + n.vy));
    });

    members.forEach(m => applyNodeEl(m));
    updateEdges();
    requestAnimationFrame(tick);
  }

  // Seed initial DOM positions before first frame
  members.forEach(m => applyNodeEl(m));
  updateEdges();
  requestAnimationFrame(tick);

  // ── Settled-up overlay ──────────────────────────────────────────────────────
  if (settlements.length === 0 && N > 0) {
    const t = document.createElementNS(ns, 'text') as SVGTextElement;
    t.setAttribute('x', String(cx));
    t.setAttribute('y', String(H - 10));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '12');
    t.setAttribute('fill', 'var(--color-text-muted)');
    t.textContent = 'Everyone is settled up!';
    svg.appendChild(t);
  }

  return svg;
}

export function renderSettlementView(
  container: HTMLElement,
  group: Group,
  expenses: Expense[],
  onConfirm: (from: string, to: string, amount: number) => Promise<void>,
  onRenameGroup: () => void,
  memberColorMap: Record<string, string> = {},
  view: 'list' | 'graph' = 'list',
  onViewChange: (v: 'list' | 'graph') => void = () => {},
): void {
  const currentUid = store.getState().user?.uid;
  const balances = computeBalances(expenses, group.members);
  const settlements = simplifyDebts(balances);

  const balanceRows = balances.map(b => {
    const cls = b.net > 0 ? 'positive' : b.net < 0 ? 'negative' : 'zero';
    const label = b.net > 0
      ? `gets back ${formatCents(b.net)}`
      : b.net < 0 ? `owes ${formatCents(b.net)}`
      : 'settled up';
    return `
      <li class="balance-item">
        <span class="balance-name">${escapeHtml(b.displayName)}</span>
        <span class="balance-amount ${cls}">${label}</span>
      </li>
    `;
  }).join('');

  const settlementRows = settlements.length === 0
    ? '<p class="empty-state-text">Everyone is settled up!</p>'
    : settlements.map((s, i) => `
        <li class="settlement-item">
          <div class="settlement-info">
            <span class="settlement-from">${escapeHtml(s.fromName)}</span>
            <span class="settlement-arrow">→</span>
            <span class="settlement-to">${escapeHtml(s.toName)}</span>
            <span class="settlement-amount">${formatCents(s.amount)}</span>
          </div>
          ${s.from === currentUid
            ? `<button class="btn btn-sm btn-confirm" data-index="${i}">Confirm</button>`
            : ''
          }
        </li>
      `).join('');

  container.innerHTML = `
    <section class="settlement-section">
      <div class="settlement-group-header">
        <span class="settlement-group-name">${escapeHtml(group.name)}</span>
        <button class="btn-icon" id="settlement-rename-btn" title="Rename group">✎</button>
      </div>
      <h3 class="section-title">Balances</h3>
      <ul class="balance-list">${balanceRows}</ul>

      <div class="settlement-payments-header">
        <h3 class="section-title">Suggested Payments</h3>
        <div class="view-toggle">
          <button class="view-toggle-btn${view === 'list' ? ' active' : ''}" id="view-list-btn">☰ List</button>
          <button class="view-toggle-btn${view === 'graph' ? ' active' : ''}" id="view-graph-btn">◎ Graph</button>
        </div>
      </div>

      <div id="settlement-list-panel"${view === 'graph' ? ' hidden' : ''}>
        <ul class="settlement-list">${settlementRows}</ul>
      </div>
      <div id="settlement-graph-panel"${view === 'list' ? ' hidden' : ''}>
      </div>
    </section>
  `;

  container.querySelector('#settlement-graph-panel')!.appendChild(
    createGraphSvg(settlements, group, memberColorMap)
  );

  container.querySelector('#settlement-rename-btn')!.addEventListener('click', onRenameGroup);

  container.querySelector('#view-list-btn')!.addEventListener('click', () => {
    onViewChange('list');
    container.querySelector('#view-list-btn')!.classList.add('active');
    container.querySelector('#view-graph-btn')!.classList.remove('active');
    container.querySelector<HTMLElement>('#settlement-list-panel')!.removeAttribute('hidden');
    container.querySelector<HTMLElement>('#settlement-graph-panel')!.setAttribute('hidden', '');
  });

  container.querySelector('#view-graph-btn')!.addEventListener('click', () => {
    onViewChange('graph');
    container.querySelector('#view-graph-btn')!.classList.add('active');
    container.querySelector('#view-list-btn')!.classList.remove('active');
    container.querySelector<HTMLElement>('#settlement-graph-panel')!.removeAttribute('hidden');
    container.querySelector<HTMLElement>('#settlement-list-panel')!.setAttribute('hidden', '');
  });

  container.querySelectorAll<HTMLButtonElement>('.btn-confirm').forEach(btn => {
    btn.addEventListener('click', async () => {
      const index = parseInt(btn.dataset.index!);
      const s: Settlement = settlements[index];
      if (!confirm(`Confirm that ${s.fromName} paid ${s.toName} ${formatCents(s.amount)}?`)) return;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await onConfirm(s.from, s.to, s.amount);
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = 'Confirm';
      }
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
