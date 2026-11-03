// [2026-11-03 04:10 PM Johnny Chu - Chu Hoàng Anh] G3-01 — `bizcity flow check`: một mặt hàng có liền mạch mua → kho → bán → giá vốn → lãi lỗ → đóng kỳ không, đọc bằng báo cáo thật
/**
 * KIỂM LUỒNG MỘT MẶT HÀNG TRONG MỘT KỲ (skill check-accounting-flow; chuẩn C1, C2, C5 ở skills/open-ketoan-standard).
 * Chỉ ĐỌC qua API công khai của đơn vị — không tính lại số nào, chỉ đọc số Kernel đã ghi và nói chỗ nào đứt:
 *
 *   C1.1  có hàng vào trước khi ra      GET /api/v1/inventory/item-ledger    (dòng nhập, số dư đầu kỳ)
 *   C1.2  tồn không âm theo ngày        GET /api/v1/inventory/item-ledger    (balanceQty < 0 → F22-STK-01)
 *   C1.3  dòng xuất có giá vốn          item-ledger.uncosted + GET /api/v1/inventory/costs (đơn giá vốn tháng)
 *   C1.4  lãi gộp tính được             GET /api/v1/reports/gross-profit     (doanh thu − giá vốn, dòng chưa có giá vốn)
 *   C1.5  sổ kho khớp sổ cái           GET /api/v1/inventory/reconcile      (giá trị tồn theo sổ chi tiết = số dư TK hàng tồn kho)
 *   C5    sẵn sàng đóng kỳ, kết chuyển  GET /api/v1/periods/check            (bảng kiểm trước khoá kỳ, kèm remedy)
 *   C2    định danh hàng bất biến       SKIP có lý do: chưa có thao tác đổi mã, API chưa trả itemId (PHASE-024 S024-11)
 *
 * Phương pháp giá vốn đọc được: bình quân gia quyền theo tháng (costing.service). FIFO chưa có trong Kernel — lệnh không
 * giả lập FIFO, chỉ báo.
 */
const pass = (id, title, detail = '') => ({ id, title, status: 'PASS', detail });
const fail = (id, title, detail = '', extra = {}) => ({ id, title, status: 'FAIL', detail, ...extra });
const skip = (id, title, detail) => ({ id, title, status: 'SKIP', detail });

// [2026-11-03 05:45 PM Johnny Chu - Chu Hoàng Anh] G3-01 — quyết định chủ dự án 2026-11-03: mặc định bình quân gia quyền tháng, FIFO vào lộ trình
export const COSTING_NOTE = 'Giá vốn: bình quân gia quyền theo tháng — phương pháp mặc định (quyết định chủ dự án 2026-11-03). FIFO có trong lộ trình, làm sau item_id (PHASE-024 B7), Kernel chưa thi hành; đích danh chưa có — xem skills/open-ketoan-standard chuẩn C1.';
// [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-1: lý do SKIP của C2 theo main (0066 đã đưa item_id vào sổ)
export const ITEM_ID_NOTE = 'Sổ, sổ kho và giá vốn đã theo item_id (migration 0066, PHASE-024 G2), nhưng chưa có thao tác đổi mã / gộp mã và API chưa trả itemId (PHASE-024 S024-11).' Không đổi, không dùng lại mã của mặt hàng đã có dòng sổ.';

/** Ngày đầu, ngày cuối của kỳ YYYY-MM. */
export function periodRange(period) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period ?? ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}` };
}

/** Mục bảng kiểm khoá kỳ không chặn luồng hàng (chỉ nhắc). */
const PERIOD_NOTE_ONLY = new Set(['paymentRequests']);

/**
 * @param {{sku: string, period: string, branch?: string, server?: string, key?: string, fetchImpl?: typeof fetch}} q
 */
export async function checkFlow({ sku, period, branch, server, key, fetchImpl = globalThis.fetch }) {
  const rows = [];
  const range = periodRange(period);
  if (!sku || !range) throw new Error('cần --sku <mã hàng> và --period YYYY-MM');
  if (!server || !key) {
    const why = 'chưa có BIZCITY_SERVER + BIZCITY_API_KEY (khoá HT02, phạm vi "Đọc báo cáo, sổ sách")';
    for (const [id, t] of [['C1.1', 'Có hàng vào trước khi ra'], ['C1.2', 'Tồn không âm theo ngày'], ['C1.3', 'Dòng xuất có giá vốn'], ['C1.4', 'Lãi gộp tính được'], ['C1.5', 'Sổ kho khớp sổ cái'], ['C5', 'Sẵn sàng đóng kỳ, kết chuyển']]) rows.push(skip(id, t, why));
    rows.push(skip('C2', 'Định danh hàng bất biến', ITEM_ID_NOTE));
    return { verdict: 'SKIP', sku, period, rows, ledger: null, profit: null };
  }
  const base = server.replace(/\/$/, '');
  const get = async (p, params) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    const res = await fetchImpl(`${base}${p}?${qs}`, { headers: { 'X-Api-Key': key } });
    const body = await res.json().catch(() => null);
    if (body?.ok) return { data: body.data };
    return { error: body?.error ? `${body.error.code}: ${body.error.message}` : `HTTP ${res.status}` };
  };

  let ledger = null;
  const il = await get('/api/v1/inventory/item-ledger', { sku, from: range.from, to: range.to, branchCodes: branch });
  if (il.error) {
    rows.push(fail('C1.1', 'Có hàng vào trước khi ra', `sổ chi tiết hàng: ${il.error}`));
    rows.push(skip('C1.2', 'Tồn không âm theo ngày', 'không đọc được sổ chi tiết hàng'));
  } else {
    ledger = il.data;
    const r = ledger.rows ?? [];
    const inQty = r.reduce((s, x) => s + (x.inQty ?? 0), 0);
    const outQty = r.reduce((s, x) => s + (x.outQty ?? 0), 0);
    const opening = ledger.opening?.qty ?? 0;
    if (!r.length && !opening) rows.push(skip('C1.1', 'Có hàng vào trước khi ra', `mã ${sku} không có phát sinh và tồn đầu kỳ ${period} — kiểm lại mã hàng`));
    else if (outQty > 0 && inQty <= 0 && opening <= 0) rows.push(fail('C1.1', 'Có hàng vào trước khi ra', `xuất ${outQty} mà kỳ không có nhập, tồn đầu ${opening}: thiếu phiếu nhập mua / tồn đầu kỳ`, { codes: ['F22-STK-01'] }));
    else rows.push(pass('C1.1', 'Có hàng vào trước khi ra', `đầu kỳ ${opening} · nhập ${inQty} · xuất ${outQty} · cuối kỳ ${ledger.closing?.qty ?? '?'}`));
    const neg = r.find((x) => (x.balanceQty ?? 0) < 0);
    rows.push(neg
      ? fail('C1.2', 'Tồn không âm theo ngày', `âm ${neg.balanceQty} ngày ${neg.docDate} tại ${neg.branchCode} sau ${neg.docNo} (${neg.docType}) — nhập trễ hoặc sai kho`, { codes: ['INVENTORY_NEGATIVE', 'F22-STK-01'] })
      : pass('C1.2', 'Tồn không âm theo ngày', r.length ? `${r.length} dòng sổ, tồn thấp nhất ${Math.min(opening, ...r.map((x) => x.balanceQty ?? 0))}` : 'không có phát sinh'));
  }

  const uncostedOut = (ledger?.rows ?? []).filter((x) => x.uncosted && (x.outQty ?? 0) > 0);
  const costs = await get('/api/v1/inventory/costs', { period, search: sku });
  const costRows = (Array.isArray(costs.data) ? costs.data : costs.data?.rows ?? costs.data?.items ?? []).filter((c) => c.sku === sku);
  const outAny = (ledger?.rows ?? []).some((x) => (x.outQty ?? 0) > 0);
  if (costs.error && !ledger) rows.push(skip('C1.3', 'Dòng xuất có giá vốn', `bảng đơn giá vốn: ${costs.error}`));
  else if (uncostedOut.length) rows.push(fail('C1.3', 'Dòng xuất có giá vốn', `${uncostedOut.length} dòng xuất chưa có giá vốn (đầu tiên ${uncostedOut[0].docNo}) — tính giá vốn tháng ${period} ở ACC49`, { codes: ['F22-STK-02'] }));
  else if (outAny && !costRows.length) rows.push(fail('C1.3', 'Dòng xuất có giá vốn', `có xuất mà bảng đơn giá vốn ${period} chưa có mã ${sku}${costs.error ? ` (${costs.error})` : ''} — chạy Tính giá vốn (ACC49)`, { codes: ['F22-STK-02'] }));
  else {
    const unit = costRows.map((c) => c.unitCost ?? c.unit_cost).filter((v) => v !== undefined);
    rows.push(pass('C1.3', 'Dòng xuất có giá vốn', costRows.length ? `đơn giá vốn ${period}: ${unit.join(' / ')} (${costRows.length} nhóm giá vốn)` : 'kỳ không có xuất'));
  }

  let profit = null;
  const gp = await get('/api/v1/reports/gross-profit', { from: range.from, to: range.to, groupBy: 'product', search: sku, branchCodes: branch });
  if (gp.error) rows.push(skip('C1.4', 'Lãi gộp tính được', `báo cáo lãi gộp: ${gp.error}`));
  else {
    profit = (gp.data.rows ?? []).find((x) => x.key === sku) ?? null;
    if (!profit) rows.push(pass('C1.4', 'Lãi gộp tính được', 'kỳ không có dòng bán của mã này'));
    else if (profit.uncosted > 0) rows.push(fail('C1.4', 'Lãi gộp tính được', `${profit.uncosted} dòng bán chưa có giá vốn: lãi gộp đang thiếu chi phí`, { codes: ['F22-STK-02'] }));
    else rows.push(pass('C1.4', 'Lãi gộp tính được', `doanh thu ${profit.revenue} − giá vốn ${profit.cost} = lãi gộp ${profit.gross}${profit.margin !== null && profit.margin !== undefined ? ` (${profit.margin}%)` : ''}`));
  }

  // [2026-11-03 06:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — C1.5: sổ chi tiết kho khớp số dư tài khoản hàng tồn kho (GET /api/v1/inventory/reconcile)
  const rc = await get('/api/v1/inventory/reconcile', { period, search: sku, branchCodes: branch });
  if (rc.error) rows.push(skip('C1.5', 'Sổ kho khớp sổ cái', `đối chiếu kho ↔ sổ cái: ${rc.error} (máy chủ cần bản có GET /api/v1/inventory/reconcile)`));
  else {
    const mine = (rc.data.rows ?? []).filter((x) => x.sku === sku);
    const bad = mine.filter((x) => x.status === 'diff' || x.status === 'wrong_account');
    const wait = mine.filter((x) => x.status === 'uncosted');
    const show = (x) => `${x.branchCode}: sổ kho ${x.subledgerValue} · sổ cái ${x.ledgerValue}${x.accounts?.length ? ` (${x.accounts.map((a) => `${a.code} ${a.value}`).join(', ')})` : ''}`;
    if (bad.length) rows.push(fail('C1.5', 'Sổ kho khớp sổ cái', bad.map((x) => `${show(x)} — ${x.status === 'wrong_account' ? `có số dư ngoài tài khoản kho của nhóm hạch toán (${x.expectedAccount})` : `lệch ${x.diff}`}`).join(' · ')));
    else if (wait.length) rows.push(skip('C1.5', 'Sổ kho khớp sổ cái', `còn ${wait.reduce((t, x) => t + x.uncosted, 0)} dòng kho chưa định giá: tính giá vốn tháng rồi chạy lại`));
    else rows.push(pass('C1.5', 'Sổ kho khớp sổ cái', mine.length ? mine.map(show).join(' · ') : `mã ${sku} không có số dư tới hết ${period}`));
  }

  const pc = await get('/api/v1/periods/check', { year: range.year, month: range.month });
  if (pc.error) rows.push(skip('C5', 'Sẵn sàng đóng kỳ, kết chuyển', `bảng kiểm khoá kỳ: ${pc.error} (khoá cần quyền đọc sổ)`));
  else {
    const items = Array.isArray(pc.data) ? pc.data : pc.data?.items ?? [];
    const open = items.filter((x) => (x.count ?? 0) > 0 && !PERIOD_NOTE_ONLY.has(x.key));
    const notes = items.filter((x) => (x.count ?? 0) > 0 && PERIOD_NOTE_ONLY.has(x.key));
    rows.push(open.length
      ? fail('C5', 'Sẵn sàng đóng kỳ, kết chuyển', open.map((x) => `${x.label} (${x.count})`).join(' · '), {
        todo: open.map((x) => ({ key: x.key, label: x.label, count: x.count, link: x.link ?? null, steps: (x.remedy?.steps ?? []).map((s) => s.text) })),
      })
      : pass('C5', 'Sẵn sàng đóng kỳ, kết chuyển', `bảng kiểm kỳ ${period} sạch${notes.length ? ` · nhắc: ${notes.map((x) => `${x.label} (${x.count})`).join(' · ')}` : ''}`));
  }

  rows.push(skip('C2', 'Định danh hàng bất biến', ITEM_ID_NOTE));
  const verdict = rows.some((r) => r.status === 'FAIL') ? 'FAIL' : rows.filter((r) => r.id !== 'C2').every((r) => r.status === 'PASS') ? 'PASS' : 'SKIP';
  return { verdict, sku, period, rows, ledger, profit };
}

export function formatFlow(r) {
  const L = [`Kiểm luồng mặt hàng ${r.sku} · kỳ ${r.period} (mua → kho → bán → giá vốn → lãi lỗ → đóng kỳ)`];
  for (const x of r.rows) {
    L.push(`  ${x.status.padEnd(4)}  ${x.id.padEnd(4)}  ${x.title}${x.detail ? ` — ${x.detail}` : ''}`);
    if (x.codes?.length) L.push(`              mã: ${x.codes.join(', ')} → npx bizcity explain <MÃ>`);
    for (const t of x.todo ?? []) {
      L.push(`              • ${t.label}${t.link ? ` [${t.link}]` : ''}`);
      for (const s of t.steps) L.push(`                  – ${s}`);
    }
  }
  L.push('', COSTING_NOTE);
  L.push(`KẾT LUẬN: ${r.verdict}${r.verdict === 'PASS' ? ' (C2 còn SKIP cho tới khi có thao tác đổi mã qua API)' : ''}`);
  return L.join('\n');
}

// [2026-11-03 05:45 PM Johnny Chu - Chu Hoàng Anh] G3-01 — kiểm VÒNG ĐỜI: nhiều kỳ liền nhau + tồn chuyển kỳ không đứt (cuối kỳ trước = đầu kỳ sau)
const MAX_PERIODS = 24;

/** Các kỳ YYYY-MM từ from tới to (gồm cả hai đầu); null nếu sai hoặc quá MAX_PERIODS. */
export function periodsBetween(from, to) {
  const a = periodRange(from);
  const b = periodRange(to);
  if (!a || !b) return null;
  const out = [];
  for (let y = a.year, m = a.month; y < b.year || (y === b.year && m <= b.month); m === 12 ? (y++, m = 1) : m++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (out.length > MAX_PERIODS) return null;
  }
  return out.length ? out : null;
}

/**
 * Một chứng từ đúng, một kỳ đúng chưa đủ: số liệu phải nối được qua các kỳ. Chạy checkFlow từng kỳ, rồi thêm dòng
 * L1 "tồn chuyển kỳ" — tồn cuối kỳ trước (Kernel ghi) phải bằng tồn đầu kỳ sau (Kernel ghi). Lệch là có chứng từ
 * sửa / nhập về sau khi kỳ trước đã chốt số, hoặc mã hàng bị đổi giữa chừng (F22-STK-04, chuẩn C2).
 */
export async function checkLifecycle({ sku, from, to, branch, server, key, fetchImpl }) {
  const periods = periodsBetween(from, to);
  if (!sku || !periods) throw new Error(`cần --sku, --period YYYY-MM và --to YYYY-MM không trước --period, tối đa ${MAX_PERIODS} kỳ`);
  const runs = [];
  for (const period of periods) runs.push(await checkFlow({ sku, period, branch, server, key, fetchImpl }));
  const links = [];
  for (let i = 1; i < runs.length; i++) {
    const prev = runs[i - 1].ledger?.closing?.qty;
    const next = runs[i].ledger?.opening?.qty;
    const id = `L1 ${runs[i - 1].period}→${runs[i].period}`;
    if (prev === undefined || next === undefined) links.push(skip(id, 'Tồn chuyển kỳ liền mạch', 'không đọc được sổ chi tiết hàng của một trong hai kỳ'));
    else if (prev !== next) links.push(fail(id, 'Tồn chuyển kỳ liền mạch', `cuối ${runs[i - 1].period} = ${prev} nhưng đầu ${runs[i].period} = ${next}: có chứng từ kỳ trước sửa / nhập về sau khi đã chốt số, hoặc mã hàng đổi giữa chừng`, { codes: ['F22-STK-04'] }));
    else links.push(pass(id, 'Tồn chuyển kỳ liền mạch', `${prev}`));
  }
  const all = [...runs.flatMap((r) => r.rows.filter((x) => x.id !== 'C2')), ...links];
  const verdict = all.some((x) => x.status === 'FAIL') ? 'FAIL' : all.every((x) => x.status === 'PASS') ? 'PASS' : 'SKIP';
  return { verdict, sku, from: periods[0], to: periods[periods.length - 1], periods: runs.map(({ ledger, profit, ...r }) => r), links };
}

export function formatLifecycle(r) {
  const L = [`Vòng đời mặt hàng ${r.sku} · ${r.from} → ${r.to} (${r.periods.length} kỳ)`];
  for (const p of r.periods) {
    const bad = p.rows.filter((x) => x.status !== 'PASS' && x.id !== 'C2');
    L.push(`  ${p.verdict.padEnd(4)}  kỳ ${p.period}${bad.length ? ` — ${bad.map((x) => `${x.id} ${x.status}`).join(', ')}` : ''}`);
    for (const x of bad) {
      L.push(`          ${x.id}: ${x.detail}`);
      if (x.codes?.length) L.push(`              mã: ${x.codes.join(', ')} → npx bizcity explain <MÃ>`);
    }
  }
  for (const x of r.links) {
    L.push(`  ${x.status.padEnd(4)}  ${x.id}  ${x.title} — ${x.detail}`);
    if (x.codes?.length) L.push(`              mã: ${x.codes.join(', ')} → npx bizcity explain <MÃ>`);
  }
  L.push(`  SKIP  C2    Định danh hàng bất biến — ${ITEM_ID_NOTE}`);
  L.push('', COSTING_NOTE);
  L.push(`KẾT LUẬN: ${r.verdict}`);
  return L.join('\n');
}
