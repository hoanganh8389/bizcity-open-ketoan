// [2026-10-30 04:56 PM Nguyễn Văn Thủy] R-SIG — ký bù (commit 392d97e, đóng góp): trình nạp 25 trường hợp mua hàng theo thứ tự TH01 → TH25, ghi kết quả đối chiếu ra JSON.
// =============================================================================
// NẠP 25 TRƯỜNG HỢP MUA HÀNG (db/seeds/mua-hang-25th/kich-ban.json) vào sổ thật của MỘT đơn vị — làm qua đúng API của
// giao diện (khai chính sách, lập phiếu, duyệt, tính thưởng…), theo thứ tự TH01 → TH25 như kế toán bấm tay; xong thì
// kiểm từng số "Kết quả mong đợi" của file và ghi kết quả ra tệp JSON (để lập bảng Excel các chỗ lệch).
//
// [2026-10-31 05:07 PM Johnny Chu - Chu Hoàng Anh] R-REV — chuyển về scripts/mua-hang/; đơn vị nạp phải là đơn vị mới, không làm sạch sổ.
// Chạy qua scripts/mua-hang/nap-25-truong-hop.sh (trong container API). Biến môi trường:
//   NAP_TENANT   mã đơn vị (vd tgs)            NAP_CHAY=1  ghi thật (thiếu = chỉ xem trước, không ghi gì)
//   NAP_API      địa chỉ API (mặc định http://127.0.0.1:4100)
//   NAP_KICH_BAN tệp kịch bản (mặc định /app/db/seeds/mua-hang-25th/kich-ban.json)
//   NAP_KET_QUA  tệp kết quả (mặc định /app/apps/api/data/nap-25-truong-hop.json)
//   DATABASE_URL, JWT_SECRET  (có sẵn trong container API) — để cấp vé đăng nhập cho chủ đơn vị, không cần mật khẩu.
// =============================================================================
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { SignJWT } from 'jose';

const TENANT = process.env.NAP_TENANT;
const RUN = process.env.NAP_CHAY === '1';
const API = (process.env.NAP_API || 'http://127.0.0.1:4100').replace(/\/$/, '');
const FILE = process.env.NAP_KICH_BAN || '/app/db/seeds/mua-hang-25th/kich-ban.json';
const OUT = process.env.NAP_KET_QUA || '/app/apps/api/data/nap-25-truong-hop.json';
const OVERRIDE_REASON = 'Test 25 trường hợp: vượt hạn mức do các trường hợp cùng NCC làm chung một sổ';
if (!TENANT) { console.error('Thiếu NAP_TENANT (mã đơn vị)'); process.exit(1); }

const plan = JSON.parse(await readFile(FILE, 'utf8'));

// ---------- đăng nhập: vé của chủ đơn vị (owner), ký bằng JWT_SECRET như lúc đăng nhập thường
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const t = (await pool.query('SELECT id, code FROM tenants WHERE code = $1', [TENANT])).rows[0];
if (!t) { console.error(`Không có đơn vị ${TENANT}`); process.exit(1); }
const u = (await pool.query(`SELECT id, full_name, session_version FROM users WHERE tenant_id = $1 AND role = 'owner' AND is_active ORDER BY id LIMIT 1`, [t.id])).rows[0];
if (!u) { console.error('Đơn vị chưa có tài khoản chủ đơn vị (owner) đang hoạt động'); process.exit(1); }
const token = await new SignJWT({ tid: String(t.id), role: 'owner', name: 'Team công nghệ (test 25 TH)', sv: Number(u.session_version ?? 0) })
  .setProtectedHeader({ alg: 'HS256' }).setSubject(String(u.id)).setIssuedAt().setExpirationTime('2h')
  .sign(new TextEncoder().encode(process.env.JWT_SECRET));

async function call(method, path, body) {
  const res = await fetch(API + path, { method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data: json.data, error: json.error };
}
const must = async (method, path, body) => {
  const r = await call(method, path, body);
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${r.error?.message ?? ''}`);
  return r.data;
};

// ---------- trạng thái ban đầu: đơn vị MỚI (chưa có chứng từ / chính sách mua hàng): lập bằng seed (SEED_TENANT_CODE=<mã> npm run db:seed -w @ketoan/api) hoặc trên bản test (scripts/tao-ban-test.sh). Không làm sạch sổ để nạp lại — sổ chỉ thêm (R-LEDGER-1, docs/audits/REVIEW-2026-10-31-THUY.md §8)
const existing = (await pool.query('SELECT count(*)::int AS n FROM purchase_documents WHERE tenant_id = $1', [t.id])).rows[0].n;
const existingPol = (await pool.query('SELECT count(*)::int AS n FROM purchase_policies WHERE tenant_id = $1', [t.id])).rows[0].n;
console.log(`Đơn vị ${TENANT} (id ${t.id}) — nạp nhân danh: ${u.full_name}`);
console.log(`Hiện có: ${existing} chứng từ mua hàng, ${existingPol} chính sách mua hàng.`);
const nSteps = plan.cases.reduce((s, c) => s + c.buoc.length, 0);
const nPol = plan.cases.reduce((s, c) => s + c.buoc.filter((b) => b.op === 'chinh-sach').length, 0);
const nDoc = plan.cases.reduce((s, c) => s + c.buoc.filter((b) => b.op === 'phieu' || b.op === 'thuong' || b.op === 'so-du').length, 0);
console.log(`Kịch bản: ${plan.cases.length} trường hợp, ${nSteps} bước — ${nPol} chính sách, ${nDoc} chứng từ, ${plan.cases.reduce((s, c) => s + c.kiem.length, 0)} số cần kiểm.`);
if (!RUN) {
  for (const c of plan.cases) console.log(`  ${c.th}  ${c.ten}  (${c.buoc.length} bước)`);
  console.log(existing || existingPol ? '\n⚠ Đơn vị đã có dữ liệu mua hàng: nạp vào một đơn vị MỚI (seed hoặc bản test) — không làm sạch sổ.' : '\nChỉ là xem trước. Nạp thật: thêm --chay.');
  await pool.end(); process.exit(0);
}
if (existing || existingPol) { console.error('Đơn vị đã có dữ liệu mua hàng — nạp vào một đơn vị MỚI (seed hoặc bản test); không làm sạch sổ (R-LEDGER-1).'); await pool.end(); process.exit(1); }

// ---------- chạy
const ids = new Map();      // id trong kịch bản → id phiếu
const notes = new Map();    // ghiNhan → giá trị
const report = [];          // { th, buoc, ok, text }
const docCache = new Map();
let curTh = '';
const log = (ok, text) => { report.push({ th: curTh, ok, text }); console.log(`  ${ok ? '✓' : '✗'} ${text}`); };
const ref = (x) => { const v = ids.get(x); if (!v) throw new Error(`Chưa có phiếu ${x}`); return v; };
const today = () => new Date().toISOString().slice(0, 10);

const getDoc = async (id) => (await must('GET', `/api/v1/purchase/documents/${ref(id)}`));
const blockingOf = (a) => (a?.checks ?? []).filter((c) => c.level === 'error');
const creditOver = (a) => Math.max(0, ...(a?.credit ?? []).map((c) => Number(c.exceeded ?? 0)));

function buildDoc(step) {
  const d = structuredClone(step.doc);
  if (step.tuDon) {
    const o = docCache.get(step.tuDon);
    d.branchCode ??= o.branchCode; d.partnerCode ??= o.partnerCode; d.priceIncludesVat ??= o.priceIncludesVat;
    d.lines = o.lines.map((l) => ({ lineKey: l.lineKey, refLineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, price: l.price, taxCode: l.taxCode, lineType: l.lineType,
      ...(l.discountPct !== undefined ? { discountPct: l.discountPct } : {}), ...(step.lo?.[l.lineKey] ?? {}) }));
    d.refIds = [ref(step.tuDon)];
  }
  if (d.refIds && !step.tuDon) d.refIds = d.refIds.map(ref);
  d.lines = (d.lines ?? []).map((l) => ({ name: l.name ?? l.sku, lineType: l.lineType ?? 'buy', ...l }));
  return d;
}

async function partnerDebt(code) {
  const rows = await must('GET', `/api/v1/debt-items?partnerCode=${encodeURIComponent(code)}&status=all`);
  return rows.filter((r) => String(r.accountCode ?? '331').startsWith('331')).reduce((s, r) => s + (r.side === 'debit' ? -1 : 1) * Number(r.remaining ?? 0), 0);
}

async function approve(id, step, opts = {}) {
  const r = opts.reason
    ? await call('POST', `/api/v1/purchase/documents/${id}/override`, { reason: opts.reason })
    : await call('POST', `/api/v1/purchase/documents/${id}/approve`, {});
  if (r.ok) return { ok: true };
  return { ok: false, error: r.error, status: r.status };
}

async function runStep(step) {
  switch (step.op) {
    case 'chi-nhanh': {
      const has = (await pool.query('SELECT is_active FROM branches WHERE tenant_id = $1 AND code = $2', [t.id, step.code])).rows[0];
      if (has && !has.is_active) {
        await must('PATCH', `/api/v1/branches/${encodeURIComponent(step.code)}`, { isActive: true });
        report.push({ th: curTh, ok: true, lech: true, text: `Chi nhánh ${step.code} đang ngừng sử dụng trong sổ — file dùng chi nhánh này nên đã bật lại (sau khi xem xong có thể tắt lại ở Danh mục chi nhánh DM02).` });
        log(true, `Bật lại chi nhánh ${step.code} (đang ngừng sử dụng)`);
      } else if (has) log(true, `Chi nhánh ${step.code} đã có`);
      else { await must('POST', '/api/v1/branches', { code: step.code, name: step.name }); log(true, `Thêm chi nhánh ${step.code} ${step.name}`); }
      // Kho mặc định <mã>-HH: phiếu ghi đúng phân kho, lọc / báo cáo theo kho được (chi nhánh đã có kho mặc định thì giữ).
      const whs = await must('GET', `/api/v1/warehouses?branchCodes=${encodeURIComponent(step.code)}`);
      if ((whs ?? []).some((w) => w.isDefault)) return;
      const code = `${step.code}-HH`;
      if ((await pool.query('SELECT 1 FROM warehouses WHERE tenant_id = $1 AND code = $2', [t.id, code])).rowCount) return;
      await must('POST', '/api/v1/warehouses', { code, branchCode: step.code, name: 'Kho hàng', address: '', isActive: true, isDefault: true, isPromo: false, account: '', note: 'Kho mặc định của chi nhánh trong bộ 25 trường hợp mua hàng' });
      return log(true, `Thêm kho mặc định ${code} cho chi nhánh ${step.code}`);
    }
    case 'ncc': {
      const cur = (await pool.query('SELECT name, tax_code, address, phone FROM partners WHERE tenant_id = $1 AND code = $2', [t.id, step.code])).rows[0];
      const body = { name: step.name, kind: 'supplier', ...(step.taxCode ? { taxCode: step.taxCode } : {}), ...(step.address ? { address: step.address } : {}), ...(step.phone ? { phone: step.phone } : {}), ...(step.groupCode ? { groupCode: step.groupCode } : {}) };
      if (cur && !step.taxCode && !step.address && !step.groupCode) return log(true, `NCC ${step.code} đã có`);
      const r = await call('PUT', `/api/v1/partners/${encodeURIComponent(step.code)}`, body);
      if (!r.ok && step.groupCode) { await must('PUT', `/api/v1/partners/${encodeURIComponent(step.code)}`, { ...body, groupCode: undefined }); return log(true, `NCC ${step.code} (nhóm ${step.groupCode} chưa có trong danh mục — bỏ nhóm)`); }
      if (!r.ok) throw new Error(r.error?.message);
      return log(true, `${cur ? 'Cập nhật' : 'Thêm'} NCC ${step.code} ${step.name}`);
    }
    case 'mat-hang': {
      const has = (await pool.query('SELECT 1 FROM products WHERE tenant_id = $1 AND sku = $2', [t.id, step.sku])).rowCount;
      if (has) return log(true, `Mặt hàng ${step.sku} đã có`);
      await must('PUT', `/api/v1/catalog/products/${encodeURIComponent(step.sku)}?new=1`, { name: step.name, unit: step.unit, groupCode: step.groupCode, brandCode: step.brandCode, taxInCode: step.taxInCode,
        units: [{ unit: step.unit, ratio: 1, isDefault: true, isPurchaseDefault: true }] });
      return log(true, `Thêm mặt hàng ${step.sku} ${step.name}`);
    }
    case 'them-dvt': {
      const p = await must('GET', `/api/v1/catalog/products/${encodeURIComponent(step.sku)}`);
      const units = (p.units ?? []).map((x) => ({ unit: x.unit, ratio: Number(x.ratio), isDefault: Boolean(x.isDefault), isPurchaseDefault: Boolean(x.isPurchaseDefault), weightKg: x.weightKg ?? null, note: x.note ?? '' }));
      const hit = units.find((x) => x.unit.toLowerCase() === step.unit.toLowerCase());
      if (hit && Number(hit.ratio) !== step.ratio) throw new Error(`${step.sku}: ĐVT ${step.unit} đang có tỉ lệ ${hit.ratio}, file cần ${step.ratio}`);
      if (hit && (!step.muaMacDinh || hit.isPurchaseDefault)) return log(true, `${step.sku} đã có ĐVT ${step.unit} = ${step.ratio}`);
      const next = hit ? units : [...units, { unit: step.unit, ratio: step.ratio, isDefault: false, isPurchaseDefault: false }];
      if (step.muaMacDinh) for (const x of next) x.isPurchaseDefault = x.unit.toLowerCase() === step.unit.toLowerCase();
      await must('PUT', `/api/v1/catalog/products/${encodeURIComponent(step.sku)}`, { units: next });
      return log(true, `${step.sku}: ${hit ? '' : `thêm ĐVT ${step.unit} = ${step.ratio}; `}mua mặc định ${step.unit}`);
    }
    case 'bo-ngay-le':
    case 'ngay-le': {
      const s = await must('GET', '/api/v1/purchase/settings');
      const has = s.holidays.includes(step.ngay);
      if (step.op === 'ngay-le' ? has : !has) return log(true, `Ngày nghỉ ${step.ngay}: ${has ? 'đã có' : 'chưa có'}`);
      const holidays = step.op === 'ngay-le' ? [...s.holidays, step.ngay].sort() : s.holidays.filter((x) => x !== step.ngay);
      await must('PUT', '/api/v1/purchase/settings', { ...s, holidays });
      return log(true, `${step.op === 'ngay-le' ? 'Thêm' : 'Bỏ (sẽ thêm lại ở TH18)'} ngày nghỉ ${step.ngay}`);
    }
    case 'chinh-sach': {
      const p = { scope: {}, isActive: true, priority: 0, validFrom: null, validTo: null, ...step.p };
      await must('POST', '/api/v1/purchase/policies', p);
      return log(true, `Chính sách ${p.code} — ${p.name}`);
    }
    case 'tat-chinh-sach': {
      const list = await must('GET', '/api/v1/purchase/policies');
      const p = list.find((x) => x.code === step.code);
      await must('PUT', `/api/v1/purchase/policies/${p.id}`, { ...p, isActive: false, validFrom: p.validFrom ?? null, validTo: p.validTo ?? null });
      return log(true, `Tắt chính sách ${step.code}`);
    }
    case 'so-du': {
      let amount = step.amount;
      if (step.denTong) { const cur = await partnerDebt(step.partnerCode); amount = step.denTong - cur; console.log(`    nợ ${step.partnerCode} đang có ${cur.toLocaleString('vi-VN')} → số dư đầu kỳ ${amount.toLocaleString('vi-VN')}`); }
      const r = await must('POST', '/api/v1/opening-balances', { branchCode: step.branchCode, docDate: '2026-09-30', description: step.ghiChu, balancingAccount: '4211', lines: [{ accountCode: '3312', partnerCode: step.partnerCode, debit: 0, credit: amount }] });
      if (step.denTong) notes.set(`${step.id.split('-')[0]}-truoc`, await partnerDebt(step.partnerCode));
      return log(true, `Số dư đầu kỳ ${step.partnerCode} ${amount.toLocaleString('vi-VN')} (${r.docNo ?? ''})`);
    }
    case 'ghi-no': {
      const v = await partnerDebt(step.partnerCode);
      notes.set(step.ghiNhan, v);
      return log(true, `Nợ ${step.partnerCode} lúc này: ${v.toLocaleString('vi-VN')}`);
    }
    case 'thu-phieu': {
      const a = await must('POST', '/api/v1/purchase/analyze', buildDoc(step));
      const b = blockingOf(a);
      notes.set(step.ghiNhan, b.length ? 'chặn' : 'không chặn');
      return log(true, `Thử (không lưu) ${step.doc.note ?? step.id}: ${b.length ? `chặn — ${b.map((x) => x.text).join('; ')}` : 'KHÔNG bị chặn'}`);
    }
    case 'phieu': {
      const body = buildDoc(step);
      if (step.thuThieuLo) {
        const a = await must('POST', '/api/v1/purchase/analyze', { ...body, lines: body.lines.map(({ lotNo, expDate, mfgDate, ...l }) => l) });
        const b = blockingOf(a);
        notes.set(step.thuThieuLo, b.some((x) => /lô/i.test(x.text)) ? 'chặn' : 'không chặn');
      }
      const saved = await must('POST', '/api/v1/purchase/documents', body);
      ids.set(step.id, saved.id); docCache.set(step.id, saved);
      if (step.lechFile) report.push({ th: curTh, ok: true, lech: true, text: step.lechFile });
      let msg = `${saved.docNo} (${body.kind}) ${Number(saved.totals?.total ?? 0).toLocaleString('vi-VN')}`;
      if (step.xuLy === 'nhap') return log(true, `Lưu nháp ${msg}`);
      const a = (await getDoc(step.id)).analysis;
      const over = creditOver(a);
      if (step.xuLy === 'chan-roi-huy') {
        const r = await approve(saved.id, step);
        notes.set(`${step.id}-chan`, r.ok ? 'không chặn' : 'chặn'); notes.set(`${step.id}-vuot`, over);
        if (r.ok) { await must('POST', `/api/v1/purchase/documents/${saved.id}/unapprove`, {}); }
        await must('POST', `/api/v1/purchase/documents/${saved.id}/cancel`, {});
        return log(!r.ok, `${msg}: ${r.ok ? 'KHÔNG bị chặn (file mong chặn)' : `bị chặn (vượt ${over.toLocaleString('vi-VN')})`} → huỷ`);
      }
      if (step.xuLy === 'chan-giu-nhap') {
        const r = await approve(saved.id, step);
        notes.set(step.ghiNhan, r.ok ? 'không chặn' : 'chặn');
        return log(!r.ok, `${msg}: ${r.ok ? 'KHÔNG bị chặn (file mong chặn)' : `bị chặn — ${r.error?.message?.slice(0, 160)}`}; giữ nháp`);
      }
      if (step.xuLy === 'ngoai-le') {
        const r0 = await approve(saved.id, step);
        notes.set(`${step.id}-vuot`, over);
        if (r0.ok) return log(false, `${msg}: duyệt được ngay (file mong chặn, phải duyệt ngoại lệ)`);
        const r = await approve(saved.id, step, { reason: step.lyDo });
        if (!r.ok) throw new Error(`Duyệt ngoại lệ ${saved.docNo}: ${r.error?.message}`);
        return log(true, `${msg}: bị chặn (vượt ${over.toLocaleString('vi-VN')}) → duyệt ngoại lệ, lý do "${step.lyDo}"`);
      }
      const r = await approve(saved.id, step);
      if (r.ok) return log(true, `Duyệt ${msg}`);
      if (r.error?.details?.canOverride || /hạn mức/i.test(r.error?.message ?? '')) {
        const r2 = await approve(saved.id, step, { reason: OVERRIDE_REASON });
        if (r2.ok) { report.push({ th: curTh, ok: true, lech: true, text: `${saved.docNo}: bị chặn vì ${r.error.message.slice(0, 200)} — duyệt ngoại lệ (lý do: ${OVERRIDE_REASON}). Trên máy mẫu (sổ riêng) không vướng.` }); return log(true, `Duyệt ngoại lệ ${msg}`); }
      }
      throw new Error(`Không duyệt được ${saved.docNo}: ${r.error?.message}`);
    }
    case 'bo-duyet': {
      await must('POST', `/api/v1/purchase/documents/${ref(step.id)}/unapprove`, {});
      return log(true, `Bỏ duyệt ${docCache.get(step.id).docNo}`);
    }
    case 'duyet': {
      const r = await approve(ref(step.id), step);
      if (step.ghiNhan) notes.set(step.ghiNhan, r.ok ? 'duyệt' : 'chặn');
      if (!r.ok) {
        if (/hạn mức/i.test(r.error?.message ?? '')) {
          const r2 = await approve(ref(step.id), step, { reason: OVERRIDE_REASON });
          if (r2.ok) { report.push({ th: curTh, ok: true, lech: true, text: `${docCache.get(step.id).docNo}: vẫn bị chặn vì ${r.error.message.slice(0, 200)} — duyệt ngoại lệ.` }); return log(true, `Duyệt ngoại lệ ${docCache.get(step.id).docNo}`); }
        }
        return log(false, `Không duyệt được ${docCache.get(step.id).docNo}: ${r.error?.message}`);
      }
      return log(true, `Duyệt ${docCache.get(step.id).docNo}`);
    }
    case 'chuyen-han-muc': {
      const list = await must('GET', '/api/v1/purchase/policies');
      const p = list.find((x) => x.code === step.code);
      const r = await call('POST', `/api/v1/purchase/policies/${p.id}/transfer-limit`, { from: '', to: step.to, amount: step.amount });
      if (step.kyVong === 'loi') { notes.set(step.ghiNhan, r.ok ? 'chuyển được' : 'lỗi'); if (r.ok) throw new Error('Chuyển hạn mức vượt phần chưa phân bổ mà không bị chặn'); return log(true, `Thử chuyển ${step.amount.toLocaleString('vi-VN')}: bị chặn — ${r.error?.message}`); }
      if (!r.ok) throw new Error(r.error?.message);
      return log(true, `Chuyển hạn mức ${step.amount.toLocaleString('vi-VN')} → ${step.to}`);
    }
    case 'thuong': {
      const pv = await must('POST', '/api/v1/purchase/rebates/preview', { policyCode: step.policyCode, period: step.period });
      const list = await must('GET', '/api/v1/purchase/policies');
      const p = list.find((x) => x.code === step.policyCode);
      const saved = await must('POST', '/api/v1/purchase/documents', {
        kind: 'rebate', docDate: step.ngay, branchCode: step.branchCode, partnerCode: p.scope.partnerCode, brandCode: p.scope.brandCode, priceIncludesVat: false, lines: [],
        amount: pv.amount, taxCode: step.taxCode, rebate: { policyCode: p.code, period: step.period, base: pv.base, rate: pv.rate, detail: pv.detail },
        allocation: (pv.allocation ?? []).map((a) => ({ sku: a.sku, name: a.name, amount: a.amount })), note: `${p.name} — kỳ ${step.period}`,
      });
      ids.set(step.id, saved.id); docCache.set(step.id, saved);
      const r = await approve(saved.id, step);
      if (!r.ok) throw new Error(`Duyệt phiếu thưởng ${saved.docNo}: ${r.error?.message}`);
      return log(true, `Phiếu thưởng ${saved.docNo}: doanh số ${Number(pv.base).toLocaleString('vi-VN')} × ${pv.rate}% = ${Number(pv.amount).toLocaleString('vi-VN')}`);
    }
    default: throw new Error(`Bước không biết: ${step.op}`);
  }
}

// ---------- đọc số để kiểm
const dig = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
async function measure(k) {
  const L = k.lay;
  if (L.ghiNhan) return notes.get(L.ghiNhan);
  if (L.phieu) return dig((await getDoc(L.phieu)).doc, L.truong);
  if (L.tinh) { const c = (await getDoc(L.tinh)).analysis.calc; return L.dong !== undefined ? dig(c.lines[L.dong], L.truong) : dig(c, L.truong); }
  if (L.butToan) {
    const d = (await getDoc(L.butToan)).doc;
    let s = 0;
    for (const l of d.links) for (const e of (await must('GET', `/api/v1/documents/${l.eventId}`)).entries ?? []) for (const x of e.lines ?? [])
      if (String(x.accountCode).startsWith(L.tk)) s += Number(L.ve === 'no' ? x.debit : x.credit);
    return s;
  }
  if (L.conNo) { const all = await must('GET', '/api/v1/purchase/documents'); const d = all.find((x) => x.id === ref(L.conNo)); return d?.debt ? d.debt.owed - d.debt.owedPaid : undefined; }
  if (L.thuong) return dig(await must('POST', '/api/v1/purchase/rebates/preview', { policyCode: L.thuong, period: L.period }), L.truong);
  if (L.phanBo) { const a = await must('GET', `/api/v1/purchase/allocations/${ref(L.phanBo)}`); return (a.rows ?? a).filter((r) => r.sku === L.sku).reduce((s, r) => s + Number(r.amount), 0); }
  return undefined;
}
const same = (k, v) => (typeof k.mong === 'number' ? typeof v === 'number' && Math.abs(v - k.mong) <= (k.saiSo ?? 0.5) : String(v) === String(k.mong));

const cases = [];
try {
  console.log('\n== Chuẩn bị');
  curTh = '00';
  for (const s of plan.chuanBi) await runStep(s);
  for (const c of plan.cases) {
    curTh = c.th;
    console.log(`\n== ${c.th}  ${c.ten}`);
    let error;
    try { for (const s of c.buoc) await runStep(s); } catch (e) { error = e.message; log(false, `DỪNG case: ${e.message}`); }
    // Kiểm ngay sau case (như máy mẫu chụp ảnh lúc làm xong case), sau đó kiểm lại khi nạp xong cả 25 case.
    const checks = [];
    for (const k of c.kiem) { let v; try { v = await measure(k); } catch (e) { v = `lỗi đọc: ${e.message}`; } checks.push({ ten: k.ten, mong: k.mong, ngaySauCase: v, datSauCase: same(k, v) }); }
    for (const x of checks) console.log(`  ${x.datSauCase ? 'ĐẠT ' : 'LỆCH'} ${x.ten}: file ${typeof x.mong === 'number' ? x.mong.toLocaleString('vi-VN') : x.mong} — sổ ${typeof x.ngaySauCase === 'number' ? x.ngaySauCase.toLocaleString('vi-VN') : x.ngaySauCase}`);
    cases.push({ th: c.th, ten: c.ten, error, checks, so: [...ids.entries()].filter(([k]) => k.startsWith(c.th.toLowerCase())).map(([k]) => ({ id: k, docNo: docCache.get(k)?.docNo, dbId: ids.get(k) })) });
  }
  console.log('\n== Kiểm lại khi nạp xong cả 25 case');
  for (const c of plan.cases) {
    const out = cases.find((x) => x.th === c.th);
    for (let i = 0; i < c.kiem.length; i++) { let v; try { v = await measure(c.kiem[i]); } catch (e) { v = `lỗi đọc: ${e.message}`; } out.checks[i].cuoiCung = v; out.checks[i].datCuoiCung = same(c.kiem[i], v); }
  }
} finally {
  const total = cases.flatMap((c) => c.checks);
  const summary = { tenant: TENANT, at: new Date().toISOString(), cases: cases.length, checks: total.length, datSauCase: total.filter((x) => x.datSauCase).length, datCuoiCung: total.filter((x) => x.datCuoiCung).length };
  await writeFile(OUT, JSON.stringify({ summary, cases, report, ids: Object.fromEntries([...ids].map(([k, v]) => [k, { id: v, docNo: docCache.get(k)?.docNo }])) }, null, 1), 'utf8');
  console.log(`\nKết quả: ${summary.datSauCase}/${summary.checks} số đạt ngay sau từng case, ${summary.datCuoiCung}/${summary.checks} khi nạp xong. Ghi chi tiết: ${OUT}`);
  await pool.end();
}
