// [2026-11-03 11:52 PM Johnny Chu - Chu Hoàng Anh] FLOW — FLOW-2 (R-FLOW-8): màn kanban chỉ đọc — đọc bang-viec.json + config.json do workflow Pages đặt cạnh trang; không gọi API ghi nào
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const COLOR = { doing: '--doing', merging: '--merging', blocked: '--blocked', todo: '--todo', partial: '--partial', paused: '--paused', done: '--done' };
  const COLLAPSED = new Set(['done']);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const link = (href, text) => { const a = el('a', null, text); a.href = href; a.rel = 'noopener'; return a; };

  let board = null;
  let repo = '';
  let sha = '';

  // Bộ lọc nằm trên URL: tải lại / gửi link giữ đúng chỗ đang xem.
  const params = new URLSearchParams(location.search);
  const state = { q: params.get('q') || '', phase: params.get('phase') || '', who: params.get('who') || '', prio: params.get('prio') || '' };
  const writeUrl = () => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) if (v) p.set(k, v);
    history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
  };

  const ghBlob = (file, line) => (repo ? `https://github.com/${repo}/blob/main/${file}#L${line}` : null);
  const ghEditClaims = () => (repo ? `https://github.com/${repo}/edit/main/docs/phases/CLAIMS.md` : null);

  function matches(it) {
    if (state.phase && it.phase !== state.phase) return false;
    if (state.who && (it.claim ? it.claim.who : '') !== state.who) return false;
    if (state.prio && (it.priority || '—') !== state.prio) return false;
    if (state.q) {
      const hay = `${it.id} ${it.title} ${it.phase} ${it.claim ? `${it.claim.who} ${it.claim.branch}` : ''}`.toLowerCase();
      if (!hay.includes(state.q.toLowerCase())) return false;
    }
    return true;
  }

  function card(it) {
    const c = el('article', 'card');
    const meta = el('div', 'meta');
    meta.append(el('span', 'id', it.id), el('span', null, it.phase));
    if (it.priority) meta.append(el('span', 'chip', it.priority));
    c.append(meta, el('p', 't', it.title || '(không có tên)'));
    if (it.claim) c.append(el('div', 'claim', `${it.claim.who} · ${it.claim.branch} · ${it.claim.state}, từ ${it.claim.since}`));
    const acts = el('div', 'actions');
    const blob = ghBlob(it.file, it.line);
    if (blob) acts.append(link(blob, 'Mở checklist'));
    const edit = ghEditClaims();
    if (edit && !it.claim && it.column !== 'done') acts.append(link(edit, 'Nhận việc (PR giữ chỗ)'));
    if (acts.childNodes.length) c.append(acts);
    return c;
  }

  function render() {
    const root = $('board');
    root.textContent = '';
    root.setAttribute('aria-busy', 'false');
    const shown = board.items.filter(matches);
    $('summary').textContent = `${shown.length} / ${board.items.length} việc${shown.length !== board.items.length ? ' (đang lọc)' : ''}`;
    for (const col of board.columns) {
      const its = shown.filter((i) => i.column === col.key);
      const sec = el('section', `col${COLLAPSED.has(col.key) ? ' collapsed' : ''}`);
      sec.setAttribute('aria-label', col.label);
      const h = el('header');
      const h2 = el('h2');
      const dot = el('span', 'dot');
      dot.style.background = `var(${COLOR[col.key] || '--muted'})`;
      h2.append(dot, document.createTextNode(col.label), el('span', 'count', String(its.length)));
      h.append(h2);
      if (COLLAPSED.has(col.key) || its.length > 30) {
        const b = el('button', 'toggle', sec.classList.contains('collapsed') ? 'Mở' : 'Thu');
        b.type = 'button';
        b.setAttribute('aria-expanded', String(!sec.classList.contains('collapsed')));
        b.addEventListener('click', () => {
          sec.classList.toggle('collapsed');
          const open = !sec.classList.contains('collapsed');
          b.textContent = open ? 'Thu' : 'Mở';
          b.setAttribute('aria-expanded', String(open));
          if (open) COLLAPSED.delete(col.key); else COLLAPSED.add(col.key);
        });
        h.append(b);
      }
      const list = el('div', 'cards');
      if (!its.length) list.append(el('p', 'empty', '—'));
      for (const it of its) list.append(card(it));
      sec.append(h, list);
      root.append(sec);
    }
  }

  function fillSelect(id, values, current) {
    const s = $(id);
    for (const v of values) { const o = el('option', null, v); o.value = v; s.append(o); }
    s.value = values.includes(current) ? current : '';
  }

  function wire() {
    const items = board.items;
    const uniq = (xs) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'vi'));
    fillSelect('phase', uniq(items.map((i) => i.phase)), state.phase);
    fillSelect('who', uniq(items.filter((i) => i.claim).map((i) => i.claim.who)), state.who);
    fillSelect('prio', uniq(items.map((i) => i.priority || '—')), state.prio);
    $('q').value = state.q;
    const on = (id, key, ev) => $(id).addEventListener(ev, () => { state[key] = $(id).value.trim(); writeUrl(); render(); });
    on('q', 'q', 'input'); on('phase', 'phase', 'change'); on('who', 'who', 'change'); on('prio', 'prio', 'change');
    $('reset').addEventListener('click', () => { for (const k of Object.keys(state)) state[k] = ''; for (const id of ['q', 'phase', 'who', 'prio']) $(id).value = ''; writeUrl(); render(); });
    if (repo) {
      $('rule').href = `https://github.com/${repo}/blob/main/docs/rules/RULE-FLOW.md`;
      $('source').textContent = '';
      const src = sha ? link(`https://github.com/${repo}/commit/${sha}`, `commit ${sha.slice(0, 7)}`) : null;
      $('source').append(document.createTextNode(`Nguồn: ${repo} · `), src || document.createTextNode('main'));
    }
  }

  function fail(msg) {
    const root = $('board');
    root.setAttribute('aria-busy', 'false');
    root.textContent = '';
    root.append(el('p', 'state', msg));
  }

  Promise.all([
    fetch('bang-viec.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    fetch('config.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]).then(([b, cfg]) => {
    if (!b || b.contract !== 'bizcity_task_board@1' || !Array.isArray(b.items)) throw new Error('khuôn bang-viec.json lạ');
    board = b; repo = cfg.repo || ''; sha = cfg.sha || '';
    wire();
    render();
  }).catch((e) => fail(`Không tải được bảng việc (${e.message}). Bảng gốc: docs/phases/BANG-VIEC.md trên main.`));
})();
