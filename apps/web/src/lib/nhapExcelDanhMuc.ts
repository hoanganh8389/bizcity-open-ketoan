// [2026-11-18 10:40 AM kiennt] NT-DM-005 — nhập Excel cho các màn danh mục còn thiếu: ACC43, DM18, DM08, DM04, DM09, DM05, DM14, ACC41, ACC41A (đóng góp)
/**
 * NHẬP EXCEL CÁC DANH MỤC NHỎ — mỗi màn một NhapLoai, nhận đúng tệp "Xuất" của màn đó (khứ hồi), ghi qua API sẵn có như bấm Ghi trên form.
 * Luật chung (phiếu NT-DM-005 §2):
 *   - khoá dòng = mã (không phân biệt hoa thường); đã có → cập nhật, chưa có → thêm mới; chế độ Thêm mới / Cập nhật / Cả hai;
 *   - ô chữ trống: mục đã có giữ nguyên; mục mới lấy mặc định như form;
 *   - cột tích (tệp Xuất ghi "x" / trống): cột có ô nào được điền thì ô trống = Không; cả cột trống = giữ nguyên / mặc định;
 *   - tệp Xuất chỉ có cột đang hiện: thiếu cột thì mục đã có giữ nguyên giá trị cũ.
 * ACC41 (tài khoản ngầm định) và ACC41A (tài khoản kết chuyển) là bộ cấu hình, không thêm / xoá dòng — có hàm run riêng.
 */
import { api } from './api';
import type { NhapCheDo, NhapDong, NhapKetQua, NhapLoai, NhapTruong } from './nhapExcel';

type Dong = Record<string, string>;
const chu = (v: string | undefined) => (v ?? '').trim();
const kd = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
/** Cột có ô nào được điền (tệp có cột đó và dùng nó). */
const coCot = (rows: Dong[], k: string) => rows.some((r) => chu(r[k]));
/** Ô tích: true / false; undefined = trống mà cả cột trống (giữ nguyên / mặc định); null = giá trị lạ. */
function tich(v: string | undefined, cot: boolean): boolean | undefined | null {
  const t = kd(v ?? '');
  if (!t) return cot ? false : undefined;
  if (/^(co|x|1|true|yes|dang dung|dang su dung|hoat dong|dang hoat dong|theo doi)$/.test(t)) return true;
  if (/^(khong|0|false|no|ngung dung|ngung su dung|ngung hoat dong|ngung theo doi)$/.test(t)) return false;
  return null;
}
const ketQua = (out: NhapDong[]): NhapKetQua => {
  out.sort((a, b) => a.row - b.row);
  const n = (a: NhapDong['action']) => out.filter((x) => x.action === a).length;
  return { created: n('create'), updated: n('update'), failed: n('error'), rows: out };
};
const loiCua = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Tài khoản chi tiết (ghi sổ được) — để kiểm ô tài khoản. */
async function taiKhoanChiTiet(): Promise<Set<string>> {
  const ds = await api.get<{ code: string }[]>('/api/v1/accounts', { postingOnly: true });
  return new Set(ds.map((a) => a.code));
}
/** Mã đang nằm trong Thùng rác của danh mục (không có quyền / lỗi thì coi như trống). */
async function thungRac(catalog: string): Promise<Set<string>> {
  try { const r = await api.getQuiet<{ key: string }[]>('/api/v1/catalog-trash', { catalog }); return new Set((r.data ?? []).map((x) => x.key.toLowerCase())); } catch { return new Set(); }
}
async function chiNhanh(): Promise<Set<string>> {
  const ds = await api.get<{ code: string }[]>('/api/v1/branches');
  return new Set(ds.map((b) => b.code.toUpperCase()));
}

/* ------------------------------------------------------------------ khung chung cho danh mục khoá theo mã */
interface KiemDong { errors: string[]; ghi?: () => Promise<unknown> }
interface DanhMuc<T> {
  id: string; title: string; desc: string; listPath: string; invalidate: string[]; fields: NhapTruong[];
  /** Tên mã trong câu báo, vd "Mã thuế". */
  tenMa: string;
  /** Chuẩn hoá mã (in hoa…); trả '' nếu ô trống. */
  chuanMa?: (s: string) => string;
  maSai?: (ma: string) => string;
  tai: () => Promise<T[]>;
  maCua: (t: T) => string;
  rac?: () => Promise<Set<string>>;
  /** Chuẩn bị dữ liệu dùng chung cho mọi dòng (tài khoản, chi nhánh…). */
  chuan?: (rows: Dong[], have: Map<string, T>) => Promise<unknown>;
  xemTruoc?: (t: T) => Record<string, string | undefined>;
  kiem: (r: Dong, ma: string, before: T | undefined, ctx: { rows: Dong[]; have: Map<string, T>; them: unknown }) => KiemDong;
  /** Thứ tự ghi (vd nhóm cha trước nhóm con). */
  thuTu?: (ds: { ma: string; r: Dong }[], have: Map<string, T>) => { ma: string; r: Dong }[];
}
function danhMuc<T>(d: DanhMuc<T>): NhapLoai {
  return {
    id: d.id, nhom: 'Danh mục', title: d.title, desc: d.desc, keyField: d.fields[0]!.key, listPath: d.listPath, invalidate: d.invalidate, fields: d.fields,
    run: async (rows, { dryRun, mode }: { dryRun: boolean; mode: NhapCheDo }) => {
      const [ds, rac] = await Promise.all([d.tai(), d.rac ? d.rac() : Promise.resolve(new Set<string>())]);
      const have = new Map(ds.map((t) => [d.maCua(t).toLowerCase(), t]));
      const them = d.chuan ? await d.chuan(rows, have) : undefined;
      const k0 = d.fields[0]!.key;
      const seen = new Map<string, number>();
      const pre = rows.map((r) => {
        const row = Number(r._row);
        const ma = (d.chuanMa ?? chu)(r[k0] ?? '');
        const before = have.get(ma.toLowerCase());
        const errors: string[] = [];
        if (!ma) errors.push(`Thiếu ${d.tenMa.toLowerCase()}`);
        else { const s = d.maSai?.(ma); if (s) errors.push(s); }
        if (ma && seen.has(ma.toLowerCase())) errors.push(`Trùng ${d.tenMa.toLowerCase()} với dòng ${seen.get(ma.toLowerCase())} trong tệp`); else if (ma) seen.set(ma.toLowerCase(), row);
        if (mode === 'create' && before) errors.push(`${d.tenMa} ${ma} đã có — chọn "Cập nhật" nếu muốn sửa`);
        if (mode === 'update' && !before) errors.push(`${d.tenMa} ${ma} chưa có`);
        if (ma && !before && rac.has(ma.toLowerCase())) errors.push(`${d.tenMa} ${ma} đang nằm trong Thùng rác — khôi phục hoặc xoá vĩnh viễn ở Thùng rác rồi nhập lại`);
        const k = ma ? d.kiem(r, ma, before, { rows, have, them }) : { errors: [] };
        errors.push(...k.errors);
        return { row, ma, r, before, errors, ghi: k.ghi, values: { ...r, [k0]: before ? d.maCua(before) : ma } as Record<string, string | undefined> };
      });
      const order = d.thuTu ? d.thuTu(pre.map((p) => ({ ma: p.ma, r: p.r })), have).map((x) => pre.find((p) => p.ma === x.ma && p.r === x.r)!) : pre;
      const out: NhapDong[] = [];
      for (const p of order) {
        const before = p.before && d.xemTruoc ? d.xemTruoc(p.before) : undefined;
        if (p.errors.length || dryRun || !p.ghi) { out.push({ row: p.row, key: p.ma, action: p.errors.length ? 'error' : p.before ? 'update' : 'create', errors: p.errors, values: p.values, before }); continue; }
        try { await p.ghi(); out.push({ row: p.row, key: p.ma, action: p.before ? 'update' : 'create', errors: [], values: p.values, before }); }
        catch (e) { out.push({ row: p.row, key: p.ma, action: 'error', errors: [loiCua(e)], values: p.values, before }); }
      }
      return ketQua(out);
    },
  };
}
const TT_TRUONG = (header: string, note = ''): NhapTruong => ({ key: 'isActive', header, aliases: ['hoat dong', 'trang thai', 'dang dung', 'dang su dung', 'theo doi'], example: 'x', note: `x / Có = đang dùng; Không. Như tệp Xuất: cột có ô nào được điền thì ô trống = Không. Cả cột trống: mới = đang dùng, đã có = giữ nguyên.${note}` });
const loiTich = (ten: string, v: string | undefined) => `${ten} "${v}" ghi x / Có hoặc Không`;

/* ------------------------------------------------------------------ ACC43 Biểu thuế */
interface Thue { code: string; name: string; rate: number; direction: string; accountCode: string | null; reportGroup: string; isActive: boolean }
const NHOM_BK: [string, string][] = [['KCT', 'Không chịu thuế'], ['0', '0%'], ['5', '5%'], ['8', '8%'], ['10', '10%'], ['KKK', 'Không kê khai']];
const BIEU_THUE = danhMuc<Thue>({
  id: 'bieu-thue', title: 'Biểu thuế', desc: 'Mã thuế, tên, thuế suất, tài khoản, chiều (đầu ra / đầu vào), nhóm bảng kê, hoạt động', listPath: '/danh-muc/loai-thue', invalidate: ['tax-codes'],
  tenMa: 'Mã thuế', maSai: (m) => (m.length > 16 ? 'Mã thuế tối đa 16 ký tự' : ''),
  fields: [
    { key: 'code', header: 'Mã thuế', required: true, aliases: ['ma', 'ma loai thue'], example: 'R08', note: 'Đã có → cập nhật; chưa có → thêm mới.' },
    { key: 'name', header: 'Tên thuế', required: 'moi', aliases: ['ten', 'ten loai thue'], example: 'Thuế GTGT đầu ra 8%' },
    { key: 'rate', header: 'Thuế suất', aliases: ['thue suat (%)', 'ty le'], example: '8', note: 'Số phần trăm: 8 hoặc 8%. Trống: mới = 0.' },
    { key: 'accountCode', header: 'Tài khoản', aliases: ['tk', 'tai khoan hach toan'], example: '33311', note: 'Tài khoản chi tiết đã có ở Hệ thống tài khoản.' },
    { key: 'direction', header: 'Chiều', aliases: ['chieu thue'], example: 'Đầu ra', note: 'Đầu ra (bán) / Đầu vào (mua). Cột ẩn trên lưới. Thiếu với thuế mới: suy theo tài khoản (133… = Đầu vào, 333… = Đầu ra).' },
    { key: 'reportGroup', header: 'Nhóm bảng kê', aliases: ['nhom tren bang ke'], example: '8%', note: 'Không chịu thuế (KCT) / 0% / 5% / 8% / 10% / Không kê khai (KKK). Cột ẩn. Thiếu với thuế mới: theo thuế suất.' },
    TT_TRUONG('Hoạt động'),
  ],
  tai: () => api.get<Thue[]>('/api/v1/tax-codes'), maCua: (t) => t.code, rac: () => thungRac('tax-codes'),
  chuan: async (rows) => ({ tk: await taiKhoanChiTiet(), cotTT: coCot(rows, 'isActive') }),
  xemTruoc: (t) => ({ name: t.name, rate: String(t.rate), accountCode: t.accountCode ?? '', direction: t.direction === 'output' ? 'Đầu ra' : 'Đầu vào', reportGroup: NHOM_BK.find(([k]) => k === t.reportGroup)?.[1] ?? t.reportGroup, isActive: t.isActive ? 'x' : '' }),
  kiem: (r, ma, before, { them }) => {
    const { tk, cotTT } = them as { tk: Set<string>; cotTT: boolean };
    const errors: string[] = [];
    const name = chu(r.name);
    if (!before && !name) errors.push('Thuế mới phải có tên');
    const rs = chu(r.rate).replace('%', '').replace(',', '.').trim();
    const rate = rs ? Number(rs) : before ? before.rate : 0;
    if (rs && (Number.isNaN(rate) || rate < 0 || rate > 100)) errors.push(`Thuế suất "${r.rate}" phải là số 0–100`);
    const acc = chu(r.accountCode) || before?.accountCode || '';
    if (chu(r.accountCode) && !tk.has(acc)) errors.push(`Tài khoản ${acc} không có hoặc là tài khoản tổng hợp`);
    const c = kd(chu(r.direction));
    let direction = !c ? before?.direction : /^(dau ra|ra|ban|output)/.test(c) ? 'output' : /^(dau vao|vao|mua|input)/.test(c) ? 'input' : 'x';
    if (direction === 'x') { errors.push(`Chiều "${r.direction}" ghi Đầu ra / Đầu vào`); direction = undefined; }
    else if (!direction) { direction = acc.startsWith('133') ? 'input' : acc.startsWith('333') ? 'output' : undefined; if (!direction) errors.push('Không suy được chiều thuế từ tài khoản — ghi cột Chiều (Đầu ra / Đầu vào)'); }
    const g = kd(chu(r.reportGroup)).replace(/\s*%$/, '');
    let reportGroup = !g ? before?.reportGroup : NHOM_BK.find(([k, l]) => kd(k) === g || kd(l).replace(/\s*%$/, '') === g)?.[0];
    if (g && !reportGroup) errors.push(`Nhóm bảng kê "${r.reportGroup}" ghi KCT / 0% / 5% / 8% / 10% / KKK`);
    if (!reportGroup && !g) reportGroup = /kct|khong chiu/.test(kd(`${ma} ${name}`)) ? 'KCT' : NHOM_BK.find(([k]) => k === String(rate))?.[0];
    if (!reportGroup && !g) errors.push('Không suy được nhóm bảng kê từ thuế suất — ghi cột Nhóm bảng kê');
    const tt = tich(r.isActive, cotTT);
    if (tt === null) errors.push(loiTich('Hoạt động', r.isActive));
    if (errors.length) return { errors };
    const body = { name: name || before!.name, rate, direction: direction!, accountCode: acc || undefined, reportGroup: reportGroup! };
    return {
      errors, ghi: async () => {
        if (before) return api.patch(`/api/v1/tax-codes/${encodeURIComponent(before.code)}`, { ...body, isActive: tt ?? before.isActive });
        await api.post('/api/v1/tax-codes', { ...body, code: ma });
        if (tt === false) await api.patch(`/api/v1/tax-codes/${encodeURIComponent(ma)}`, { ...body, isActive: false });
      },
    };
  },
});

/* ------------------------------------------------------------------ DM18 Loại kho */
interface LoaiKho { code: string; name: string; purpose: string; canSell: boolean; owned: boolean; trackExpiry: boolean; accountPrefix: string; isActive: boolean }
const LOAI_KHO = danhMuc<LoaiKho>({
  id: 'loai-kho', title: 'Loại kho', desc: 'Mã, tên loại kho, công dụng, tài khoản hạch toán', listPath: '/danh-muc/loai-kho', invalidate: ['warehouse-types', 'warehouses'],
  tenMa: 'Mã loại kho', chuanMa: (s) => chu(s).toUpperCase(), maSai: (m) => (/^[A-Z][A-Z0-9_]{1,11}$/.test(m) ? '' : 'Mã loại kho: chữ in hoa / số, 2–12 ký tự, bắt đầu bằng chữ'),
  fields: [
    { key: 'code', header: 'Mã', required: true, aliases: ['ma loai kho'], example: 'KM', note: 'Chữ in hoa / số, 2–12 ký tự. Đã có → cập nhật; chưa có → thêm mới.' },
    { key: 'name', header: 'Tên loại kho', required: 'moi', aliases: ['ten', 'ten loai'], example: 'Kho khuyến mại' },
    { key: 'purpose', header: 'Công dụng', aliases: ['cong dung', 'mo ta'], example: 'Hàng tặng kèm' },
    { key: 'accountPrefix', header: 'Tài khoản hạch toán', aliases: ['tai khoan', 'tk kho'], example: '1567', note: 'Tài khoản chi tiết đã có. Trống: mới = dùng TK kho ngầm định; đã có = giữ nguyên.' },
  ],
  tai: async () => (await api.get<{ types: LoaiKho[] }>('/api/v1/warehouse-types')).types, maCua: (t) => t.code,
  rac: async () => { try { return new Set((await api.get<{ code: string }[]>('/api/v1/warehouse-types/trash')).map((x) => x.code.toLowerCase())); } catch { return new Set(); } },
  chuan: async () => ({ tk: await taiKhoanChiTiet() }),
  xemTruoc: (t) => ({ name: t.name, purpose: t.purpose, accountPrefix: t.accountPrefix }),
  kiem: (r, ma, before, { them }) => {
    const { tk } = them as { tk: Set<string> };
    const errors: string[] = [];
    const name = chu(r.name) || before?.name || '';
    if (!name) errors.push('Loại kho mới phải có tên');
    if (name.length > 80) errors.push('Tên loại kho tối đa 80 ký tự');
    const acc = chu(r.accountPrefix) || before?.accountPrefix || '';
    if (chu(r.accountPrefix) && !tk.has(acc)) errors.push(`Tài khoản ${acc} không có hoặc là tài khoản tổng hợp`);
    if (errors.length) return { errors };
    return {
      errors, ghi: () => api.put(`/api/v1/warehouse-types/${encodeURIComponent(ma)}`, {
        name, purpose: chu(r.purpose) || before?.purpose || '', canSell: before ? before.canSell : true, owned: before ? before.owned : true,
        trackExpiry: before ? before.trackExpiry : true, accountPrefix: acc, isActive: true,
      }),
    };
  },
});

/* ------------------------------------------------------------------ DM08 Nhóm khách hàng, nhà cung cấp */
interface NhomDT { code: string; name: string; parentCode: string | null; kind: string; note: string; isActive: boolean }
const DUNG_CHO: Record<string, string> = { 'moi loai': 'any', any: 'any', 'khach hang': 'customer', customer: 'customer', 'nha cung cap': 'supplier', supplier: 'supplier', 'nhan vien': 'employee', employee: 'employee', 'noi bo': 'internal', internal: 'internal', khac: 'other', other: 'other' };
const DUNG_CHO_TEN: Record<string, string> = { any: 'Mọi loại', customer: 'Khách hàng', supplier: 'Nhà cung cấp', employee: 'Nhân viên', internal: 'Nội bộ', other: 'Khác' };
const chaTrongTep = (rows: Dong[], have: Map<string, NhomDT>) => {
  const cha = new Map<string, string>([...have.values()].map((g) => [g.code.toLowerCase(), (g.parentCode ?? '').toLowerCase()]));
  for (const r of rows) { const m = chu(r.code).toLowerCase(); const p = chu(r.parentCode).toLowerCase(); if (m && p) cha.set(m, p); }
  return cha;
};
const NHOM_DOI_TUONG = danhMuc<NhomDT>({
  id: 'nhom-doi-tuong', title: 'Nhóm khách hàng, nhà cung cấp', desc: 'Mã nhóm, tên, ghi chú, nhóm cha, dùng cho, hoạt động', listPath: '/danh-muc/nhom-doi-tuong', invalidate: ['partner-groups'],
  tenMa: 'Mã nhóm',
  fields: [
    { key: 'code', header: 'Mã nhóm KH', required: true, aliases: ['ma nhom', 'ma nhom ncc', 'ma nhom doi tuong'], example: 'KH-LE', note: 'Đã có → cập nhật; chưa có → thêm mới.' },
    { key: 'name', header: 'Tên nhóm KH', required: 'moi', aliases: ['ten nhom', 'ten nhom ncc', 'ten'], example: 'Khách lẻ' },
    { key: 'note', header: 'Ghi chú', aliases: ['mo ta', 'dien giai'] },
    { key: 'parentCode', header: 'Nhóm cha', aliases: ['ma nhom cha', 'thuoc nhom'], example: '', note: 'Mã nhóm cha đã có hoặc có trong tệp (nhóm cha được ghi trước). Trống: mới = nhóm gốc; đã có = giữ nguyên.' },
    { key: 'kind', header: 'Dùng cho', aliases: ['loai', 'loai doi tuong'], example: 'Khách hàng', note: 'Mọi loại / Khách hàng / Nhà cung cấp / Nhân viên / Nội bộ / Khác. Trống: mới = Mọi loại.' },
    TT_TRUONG('Hoạt động'),
  ],
  tai: () => api.get<NhomDT[]>('/api/v1/partner-groups'), maCua: (g) => g.code, rac: () => thungRac('partner-groups'),
  chuan: async (rows, have) => ({ cha: chaTrongTep(rows, have), trongTep: new Set(rows.map((r) => chu(r.code).toLowerCase()).filter(Boolean)), cotTT: coCot(rows, 'isActive') }),
  xemTruoc: (g) => ({ name: g.name, note: g.note, parentCode: g.parentCode ?? '', kind: DUNG_CHO_TEN[g.kind] ?? g.kind, isActive: g.isActive ? 'x' : '' }),
  kiem: (r, ma, before, { have, them }) => {
    const { cha, trongTep, cotTT } = them as { cha: Map<string, string>; trongTep: Set<string>; cotTT: boolean };
    const errors: string[] = [];
    const name = chu(r.name) || before?.name || '';
    if (!name) errors.push('Nhóm mới phải có tên');
    const p = chu(r.parentCode) || before?.parentCode || '';
    if (p) {
      if (p.toLowerCase() === ma.toLowerCase()) errors.push('Nhóm cha không được là chính nó');
      else if (!have.has(p.toLowerCase()) && !trongTep.has(p.toLowerCase())) errors.push(`Nhóm cha ${p} chưa có`);
      else { // vòng cha: đi lên từ nhóm cha, gặp lại chính nó là vòng
        let x = p.toLowerCase(); const qua = new Set<string>();
        while (x && !qua.has(x)) { if (x === ma.toLowerCase()) { errors.push(`Nhóm cha ${p} đang là nhóm con (hoặc cháu) của ${ma} — vòng nhóm cha`); break; } qua.add(x); x = cha.get(x) ?? ''; }
      }
    }
    const k = kd(chu(r.kind));
    const kind = !k ? before?.kind ?? 'any' : DUNG_CHO[k];
    if (!kind) errors.push(`Dùng cho "${r.kind}" ghi Mọi loại / Khách hàng / Nhà cung cấp / Nhân viên / Nội bộ / Khác`);
    const tt = tich(r.isActive, cotTT);
    if (tt === null) errors.push(loiTich('Hoạt động', r.isActive));
    if (errors.length) return { errors };
    return { errors, ghi: () => api.put(`/api/v1/partner-groups/${encodeURIComponent(ma)}`, { name, parentCode: p || undefined, kind, note: chu(r.note) || before?.note || '', isActive: tt ?? before?.isActive ?? true }) };
  },
  thuTu: (ds, have) => {
    const cha = new Map<string, string>([...have.values()].map((g) => [g.code.toLowerCase(), (g.parentCode ?? '').toLowerCase()]));
    for (const x of ds) if (chu(x.r.parentCode)) cha.set(x.ma.toLowerCase(), chu(x.r.parentCode).toLowerCase());
    const sau = (m: string) => { let n = 0; let x = cha.get(m.toLowerCase()) ?? ''; const qua = new Set<string>(); while (x && !qua.has(x) && n < 50) { qua.add(x); n++; x = cha.get(x) ?? ''; } return n; };
    return [...ds].sort((a, b) => sau(a.ma) - sau(b.ma));
  },
});

/* ------------------------------------------------------------------ DM04 Nhân viên */
interface NhanVien { code: string; name: string; parentCode: string | null; note: string; isActive: boolean; extra: Record<string, unknown> }
const NV_EXTRA = ['position', 'email', 'branchCode', 'mobile', 'address', 'group', 'departmentCode'] as const;
const NHAN_VIEN = danhMuc<NhanVien>({
  id: 'nhan-vien', title: 'Nhân viên', desc: 'Mã, tên, chức vụ, email, chi nhánh làm việc, di động, địa chỉ, nhóm, phòng ban, theo dõi', listPath: '/danh-muc/nhan-vien', invalidate: ['dimensions'],
  tenMa: 'Mã NV', maSai: (m) => (m.length > 64 ? 'Mã NV tối đa 64 ký tự' : ''),
  fields: [
    { key: 'code', header: 'Mã NV', required: true, aliases: ['ma nhan vien', 'ma'], example: 'NV001', note: 'Đã có → cập nhật; chưa có → thêm mới.' },
    { key: 'name', header: 'Tên NV', required: 'moi', aliases: ['ten nhan vien', 'ho ten', 'ten'], example: 'Nguyễn Văn A' },
    { key: 'position', header: 'Chức vụ', aliases: ['chuc danh'] },
    { key: 'email', header: 'Email', aliases: ['thu dien tu'] },
    { key: 'branchCode', header: 'Chi nhánh làm việc', aliases: ['chi nhanh', 'ma chi nhanh'], example: 'OC01', note: 'Mã chi nhánh đã có (Cơ cấu tổ chức).' },
    { key: 'mobile', header: 'Di động', aliases: ['dien thoai', 'so dien thoai'] },
    { key: 'address', header: 'Địa chỉ', aliases: ['dia chi'] },
    TT_TRUONG('Theo dõi'),
    { key: 'group', header: 'Nhóm NV', aliases: ['nhom nhan vien', 'nhom'] },
    { key: 'note', header: 'Ghi chú', aliases: ['mo ta'] },
    { key: 'departmentCode', header: 'Mã phòng ban', aliases: ['phong ban', 'ma bo phan'], note: 'Mã phòng ban đã có.' },
  ],
  tai: () => api.get<NhanVien[]>('/api/v1/dimensions/employee'), maCua: (n) => n.code, rac: () => thungRac('dimensions.employee'),
  chuan: async (rows) => {
    const [cn, pb] = await Promise.all([chiNhanh(), api.get<{ code: string }[]>('/api/v1/dimensions/department')]);
    return { cn, pb: new Set(pb.map((x) => x.code.toLowerCase())), cotTT: coCot(rows, 'isActive') };
  },
  xemTruoc: (n) => ({ name: n.name, note: n.note, isActive: n.isActive ? 'x' : '', ...Object.fromEntries(NV_EXTRA.map((k) => [k, String(n.extra?.[k] ?? '')])) }),
  kiem: (r, ma, before, { them }) => {
    const { cn, pb, cotTT } = them as { cn: Set<string>; pb: Set<string>; cotTT: boolean };
    const errors: string[] = [];
    const name = chu(r.name) || before?.name || '';
    if (!name) errors.push('Nhân viên mới phải có tên');
    const br = chu(r.branchCode).toUpperCase();
    if (br && !cn.has(br)) errors.push(`Chi nhánh ${br} chưa có`);
    const dep = chu(r.departmentCode);
    if (dep && !pb.has(dep.toLowerCase())) errors.push(`Phòng ban ${dep} chưa có`);
    const em = chu(r.email);
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) errors.push(`Email "${em}" không đúng dạng`);
    const tt = tich(r.isActive, cotTT);
    if (tt === null) errors.push(loiTich('Theo dõi', r.isActive));
    if (errors.length) return { errors };
    const extra: Record<string, unknown> = { ...(before?.extra ?? {}) };
    for (const k of NV_EXTRA) { const v = k === 'branchCode' ? br : chu(r[k]); if (v) extra[k] = v; }
    return { errors, ghi: () => api.put(`/api/v1/dimensions/employee/${encodeURIComponent(ma)}`, { name, parentCode: before?.parentCode || undefined, note: chu(r.note) || before?.note || '', isActive: tt ?? before?.isActive ?? true, extra }) };
  },
});

/* ------------------------------------------------------------------ DM09 Tài khoản ngân hàng */
interface NganHang { code: string; bankName: string; bankBranch: string; accountNo: string; holder: string; accountCode: string; branchCode: string | null; currency: string; note: string; isActive: boolean; bankAddress: string; bankPhone: string; contact: string }
const NH_CHU = ['bankName', 'bankBranch', 'accountNo', 'holder', 'note', 'bankAddress', 'bankPhone', 'contact'] as const;
const TK_NGAN_HANG = danhMuc<NganHang>({
  id: 'tk-ngan-hang', title: 'Tài khoản ngân hàng', desc: 'Mã, tên ngân hàng, số TK, tài khoản hạch toán, chủ TK, chi nhánh, tiền tệ, hoạt động', listPath: '/danh-muc/ngan-hang', invalidate: ['bank-accounts'],
  tenMa: 'Mã ngân hàng',
  fields: [
    { key: 'code', header: 'Mã ngân hàng', required: true, aliases: ['ma', 'ma tk ngan hang'], example: 'TCB01', note: 'Đã có → cập nhật; chưa có → thêm mới.' },
    { key: 'bankName', header: 'Tên ngân hàng', required: 'moi', aliases: ['ngan hang', 'ten'], example: 'Techcombank' },
    { key: 'accountNo', header: 'Số TK', required: 'moi', aliases: ['so tai khoan'], example: '19031234567890' },
    { key: 'accountCode', header: 'Tài khoản hạch toán', required: 'moi', aliases: ['tai khoan', 'tk hach toan'], example: '1121', note: 'Tài khoản chi tiết đã có (112…).' },
    { key: 'note', header: 'Ghi chú', aliases: ['mo ta'] },
    TT_TRUONG('Hoạt động'),
    { key: 'bankAddress', header: 'Địa chỉ', aliases: ['dia chi ngan hang'] },
    { key: 'bankPhone', header: 'Điện thoại', aliases: ['dien thoai ngan hang'] },
    { key: 'holder', header: 'Chủ TK', aliases: ['chu tai khoan'] },
    { key: 'contact', header: 'Người liên lạc', aliases: ['lien he'] },
    { key: 'bankBranch', header: 'Chi nhánh ngân hàng', aliases: ['chi nhanh nh'] },
    { key: 'branchCode', header: 'Chi nhánh dùng', aliases: ['ma chi nhanh'], note: 'Mã chi nhánh đã có (Cơ cấu tổ chức).' },
    { key: 'currency', header: 'Tiền tệ', aliases: ['loai tien'], example: 'VND', note: '3 chữ. Trống: mới = VND.' },
  ],
  tai: () => api.get<NganHang[]>('/api/v1/bank-accounts'), maCua: (b) => b.code, rac: () => thungRac('bank-accounts'),
  chuan: async (rows, have) => {
    const [tk, cn] = await Promise.all([taiKhoanChiTiet(), chiNhanh()]);
    // Mỗi tài khoản kế toán chỉ gắn một tài khoản ngân hàng (như máy chủ): gom theo tài khoản sau khi áp tệp.
    const tkCua = new Map<string, string>([...have.values()].map((b) => [b.code.toLowerCase(), b.accountCode]));
    for (const r of rows) { const m = chu(r.code).toLowerCase(); if (m && chu(r.accountCode)) tkCua.set(m, chu(r.accountCode)); }
    return { tk, cn, tkCua, cotTT: coCot(rows, 'isActive') };
  },
  xemTruoc: (b) => ({ ...Object.fromEntries(NH_CHU.map((k) => [k, b[k]])), accountCode: b.accountCode, branchCode: b.branchCode ?? '', currency: b.currency, isActive: b.isActive ? 'x' : '' }),
  kiem: (r, ma, before, { them }) => {
    const { tk, cn, tkCua, cotTT } = them as { tk: Set<string>; cn: Set<string>; tkCua: Map<string, string>; cotTT: boolean };
    const errors: string[] = [];
    const v = Object.fromEntries(NH_CHU.map((k) => [k, chu(r[k]) || (before?.[k] ?? '')])) as Record<(typeof NH_CHU)[number], string>;
    if (!v.bankName) errors.push('Thiếu tên ngân hàng');
    if (!v.accountNo) errors.push('Thiếu số tài khoản');
    const acc = chu(r.accountCode) || before?.accountCode || '';
    if (!acc) errors.push('Thiếu tài khoản hạch toán'); else if (chu(r.accountCode) && !tk.has(acc)) errors.push(`Tài khoản ${acc} không có hoặc là tài khoản tổng hợp`);
    const trung = acc ? [...tkCua].find(([m, a]) => a === acc && m !== ma.toLowerCase())?.[0] : undefined;
    if (trung) errors.push(`Tài khoản ${acc} đã gắn với tài khoản ngân hàng ${trung.toUpperCase()} — mỗi tài khoản kế toán chỉ gắn một tài khoản ngân hàng`);
    const br = chu(r.branchCode).toUpperCase() || before?.branchCode || '';
    if (chu(r.branchCode) && !cn.has(br)) errors.push(`Chi nhánh ${br} chưa có`);
    const cur = (chu(r.currency) || before?.currency || 'VND').toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) errors.push(`Tiền tệ "${r.currency}" phải 3 chữ (VND, USD…)`);
    const tt = tich(r.isActive, cotTT);
    if (tt === null) errors.push(loiTich('Hoạt động', r.isActive));
    if (errors.length) return { errors };
    return { errors, ghi: () => api.put(`/api/v1/bank-accounts/${encodeURIComponent(ma)}`, { ...v, accountCode: acc, branchCode: br || undefined, currency: cur, isActive: tt ?? before?.isActive ?? true }) };
  },
});

/* ------------------------------------------------------------------ DM05 Hình thức thanh toán */
interface Httt { code: string; name: string; accountCode: string; bankAccountCode: string | null; isReceivable: boolean; isActive: boolean; note: string; sortOrder: number | null; discountRate: number | null; partnerCode: string | null }
const HINH_THUC_TT = danhMuc<Httt>({
  id: 'hinh-thuc-thanh-toan', title: 'Hình thức thanh toán', desc: 'Mã, tên, tài khoản hạch toán, tài khoản ngân hàng, đối tượng nhận hộ, ghi công nợ, hoạt động', listPath: '/cau-hinh/hinh-thuc-thanh-toan', invalidate: ['payment-methods'],
  tenMa: 'Mã hình thức',
  fields: [
    { key: 'code', header: 'Mã', required: true, aliases: ['ma httt', 'ma hinh thuc'], example: 'CK', note: 'Đã có → cập nhật; chưa có → thêm mới.' },
    { key: 'name', header: 'Tên', required: 'moi', aliases: ['ten httt', 'ten hinh thuc'], example: 'Chuyển khoản' },
    { key: 'accountCode', header: 'Tài khoản hạch toán', required: 'moi', aliases: ['tai khoan', 'tk'], example: '1121', note: 'Tài khoản chi tiết đã có.' },
    { key: 'bankAccountCode', header: 'Tài khoản ngân hàng', aliases: ['ma ngan hang', 'tk ngan hang'], example: 'TCB01', note: 'Mã ở danh mục Tài khoản ngân hàng.' },
    { key: 'partnerCode', header: 'Đối tượng nhận hộ', aliases: ['doi tuong', 'ma doi tuong'], note: 'Mã đối tượng đã có.' },
    { key: 'isReceivable', header: 'Ghi công nợ', aliases: ['cong no'], example: '', note: 'x / Có = ghi công nợ. Như tệp Xuất: cột có ô nào được điền thì ô trống = Không.' },
    TT_TRUONG('Hoạt động'),
    { key: 'sortOrder', header: 'Thứ tự', aliases: ['stt hien thi'], note: 'Số nguyên. Cột ẩn trên lưới.' },
  ],
  tai: () => api.get<Httt[]>('/api/v1/posting/payment-methods'), maCua: (m) => m.code, rac: () => thungRac('payment-methods'),
  chuan: async (rows) => {
    const [tk, nh] = await Promise.all([taiKhoanChiTiet(), api.get<{ code: string }[]>('/api/v1/bank-accounts')]);
    const maDT = [...new Set(rows.map((r) => chu(r.partnerCode)).filter(Boolean))];
    const co = new Set<string>();
    for (const m of maDT) { const ds = await api.get<{ code: string }[]>('/api/v1/partners', { search: m, status: 'all', pageSize: 20 }); if (ds.some((p) => p.code.toLowerCase() === m.toLowerCase())) co.add(m.toLowerCase()); }
    return { tk, nh: new Set(nh.map((b) => b.code.toLowerCase())), dt: co, cotTT: coCot(rows, 'isActive'), cotCN: coCot(rows, 'isReceivable') };
  },
  xemTruoc: (m) => ({ name: m.name, accountCode: m.accountCode, bankAccountCode: m.bankAccountCode ?? '', partnerCode: m.partnerCode ?? '', isReceivable: m.isReceivable ? 'x' : '', isActive: m.isActive ? 'x' : '', sortOrder: m.sortOrder == null ? '' : String(m.sortOrder) }),
  kiem: (r, ma, before, { them }) => {
    const { tk, nh, dt, cotTT, cotCN } = them as { tk: Set<string>; nh: Set<string>; dt: Set<string>; cotTT: boolean; cotCN: boolean };
    const errors: string[] = [];
    const name = chu(r.name) || before?.name || '';
    if (!name) errors.push('Thiếu tên hình thức');
    const acc = chu(r.accountCode) || before?.accountCode || '';
    if (!acc) errors.push('Thiếu tài khoản hạch toán'); else if (chu(r.accountCode) && !tk.has(acc)) errors.push(`Tài khoản ${acc} không có hoặc là tài khoản tổng hợp`);
    const bank = chu(r.bankAccountCode) || before?.bankAccountCode || '';
    if (chu(r.bankAccountCode) && !nh.has(bank.toLowerCase())) errors.push(`Tài khoản ngân hàng ${bank} chưa có`);
    const p = chu(r.partnerCode) || before?.partnerCode || '';
    if (chu(r.partnerCode) && !dt.has(p.toLowerCase())) errors.push(`Đối tượng ${p} chưa có`);
    const so = chu(r.sortOrder);
    const sortOrder = so ? Number(so) : before?.sortOrder ?? null;
    if (so && !Number.isInteger(sortOrder)) errors.push(`Thứ tự "${so}" phải là số nguyên`);
    const cn = tich(r.isReceivable, cotCN); if (cn === null) errors.push(loiTich('Ghi công nợ', r.isReceivable));
    const tt = tich(r.isActive, cotTT); if (tt === null) errors.push(loiTich('Hoạt động', r.isActive));
    if (errors.length) return { errors };
    return {
      errors, ghi: () => api.put(`/api/v1/posting/payment-methods/${encodeURIComponent(ma)}`, {
        name, accountCode: acc, bankAccountCode: bank || null, isReceivable: cn ?? before?.isReceivable ?? false, isActive: tt ?? before?.isActive ?? true,
        note: before?.note ?? '', sortOrder, discountRate: before?.discountRate ?? null, partnerCode: p || null,
      }),
    };
  },
});

/* ------------------------------------------------------------------ DM14 Bảng giá (danh sách bảng giá) */
interface BangGia { code: string; name: string; isCompany: boolean; isActive: boolean; note: string; branchCodes: string[] }
/** "OC02 Ớt Chuông Cầu Giấy, CN01 (chưa gán)" → ["OC02"]; mục "(chưa gán)" là chi nhánh tự theo bảng giá công ty, bỏ qua. */
const maChiNhanhCua = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter((x) => x && !/\(chưa gán\)\s*$/i.test(x)).map((x) => (x.split(/\s+/)[0] ?? '').toUpperCase());
const BANG_GIA = danhMuc<BangGia>({
  id: 'bang-gia', title: 'Bảng giá (danh sách)', desc: 'Mã, tên bảng giá, bảng giá công ty, chi nhánh áp dụng, ghi chú, đang dùng — giá từng mặt hàng nhập ở lưới giá', listPath: '/danh-muc/bang-gia', invalidate: ['price-lists'],
  tenMa: 'Mã bảng giá',
  fields: [
    { key: 'code', header: 'Mã bảng giá', required: true, aliases: ['ma'], example: 'BGCG', note: 'Đã có → cập nhật; chưa có → thêm mới.' },
    { key: 'name', header: 'Tên bảng giá', required: 'moi', aliases: ['ten'], example: 'Bảng giá Cầu Giấy' },
    { key: 'isCompany', header: 'Bảng giá công ty', aliases: ['cong ty'], note: 'x = bảng giá công ty. Như tệp Xuất: cột có ô nào được điền thì ô trống = Không.' },
    { key: 'branches', header: 'Chi nhánh áp dụng', aliases: ['chi nhanh', 'ma chi nhanh'], example: 'OC02', note: 'Mã chi nhánh cách nhau dấu phẩy (chữ sau mã bỏ qua; mục "(chưa gán)" bỏ qua). Cột có ô nào được điền thì ô trống = không gán chi nhánh. Chi nhánh đang ở bảng giá khác thì chuyển sang.' },
    { key: 'note', header: 'Ghi chú', aliases: ['mo ta'] },
    TT_TRUONG('Đang dùng'),
  ],
  tai: () => api.get<BangGia[]>('/api/v1/catalog/price-lists'), maCua: (l) => l.code, rac: () => thungRac('price-lists'),
  chuan: async (rows) => {
    const dem = new Map<string, number[]>();
    for (const r of rows) for (const c of maChiNhanhCua(chu(r.branches))) dem.set(c, [...(dem.get(c) ?? []), Number(r._row)]);
    return { cn: await chiNhanh(), dem, cotCN: coCot(rows, 'branches'), cotCT: coCot(rows, 'isCompany'), cotTT: coCot(rows, 'isActive') };
  },
  xemTruoc: (l) => ({ name: l.name, isCompany: l.isCompany ? 'x' : '', branches: l.branchCodes.join(', '), note: l.note, isActive: l.isActive ? 'x' : '' }),
  kiem: (r, ma, before, { them }) => {
    const { cn, dem, cotCN, cotCT, cotTT } = them as { cn: Set<string>; dem: Map<string, number[]>; cotCN: boolean; cotCT: boolean; cotTT: boolean };
    const errors: string[] = [];
    const name = chu(r.name) || before?.name || '';
    if (!name) errors.push('Bảng giá mới phải có tên');
    const ds = maChiNhanhCua(chu(r.branches));
    for (const c of ds) {
      if (!cn.has(c)) errors.push(`Chi nhánh ${c} chưa có`);
      const o = dem.get(c) ?? []; if (o.length > 1) errors.push(`Chi nhánh ${c} ghi ở nhiều bảng giá trong tệp (dòng ${o.join(', ')})`);
    }
    const ct = tich(r.isCompany, cotCT); if (ct === null) errors.push(loiTich('Bảng giá công ty', r.isCompany));
    const tt = tich(r.isActive, cotTT); if (tt === null) errors.push(loiTich('Đang dùng', r.isActive));
    if (errors.length) return { errors };
    return {
      errors, ghi: async () => {
        await api.put(`/api/v1/catalog/price-lists/${encodeURIComponent(ma)}`, { name, isCompany: ct ?? before?.isCompany ?? false, isActive: tt ?? before?.isActive ?? true, note: chu(r.note) || before?.note || '' });
        if (cotCN) await api.put(`/api/v1/catalog/price-lists/${encodeURIComponent(ma)}/branches`, { branchCodes: [...new Set(ds)] });
      },
    };
  },
});

/* ------------------------------------------------------------------ ACC41 Tài khoản ngầm định (tệp Xuất chế độ Gọn: Loại · TK Nợ · TK Có) */
type Nguon = 'rule' | 'payment' | 'warehouse' | 'tax' | 'purpose';
interface SLine { side: 'debit' | 'credit'; source: Nguon; key?: string }
interface Khoa { key: string; label: string; range: string[]; accountCode: string | null }
interface SoDo { businesses: { name: string; groups: { name: string; lines: SLine[] }[] }[]; keys: Khoa[] }
/** Như màn ACC41 (chế độ Gọn): ô TK của dòng sổ lấy từ nguồn khác hiện chữ "theo …". */
const NGUON_NGAN: Record<Nguon, string> = { rule: '', payment: 'theo HTTT', warehouse: 'theo loại kho', tax: 'theo loại thuế', purpose: 'theo mục đích' };
const tachTk = (s: string) => [...new Set(s.split(/[;,]/).map((x) => x.trim()).filter(Boolean))];
const TK_NGAM_DINH: NhapLoai = {
  id: 'tai-khoan-ngam-dinh', nhom: 'Danh mục', title: 'Tài khoản ngầm định', desc: 'Loại (nghiệp vụ – bút toán), TK Nợ, TK Có — đặt tài khoản ngầm định sửa được; không thêm / xoá loại', keyField: 'loai',
  listPath: '/cau-hinh/quy-tac-hach-toan', invalidate: ['posting-scheme'], modes: false,
  fields: [
    { key: 'loai', header: 'Loại', required: true, aliases: ['nghiep vu', 'loai chung tu'], example: 'Bán hàng – Doanh thu', note: 'Đúng tên ở cột Loại trên màn (tệp Xuất chế độ Gọn).' },
    { key: 'no', header: 'TK Nợ', aliases: ['tai khoan no', 'no'], example: '131', note: 'Nhiều tài khoản cách nhau dấu chấm phẩy, theo thứ tự như tệp Xuất (dòng có nhiều ô ngầm định); một tài khoản thì đặt cho mọi ô của bên đó. Chữ "theo HTTT / loại kho / loại thuế / mục đích" là tài khoản lấy từ màn khác — giữ nguyên, sửa ở màn đó. Trống = giữ nguyên.' },
    { key: 'co', header: 'TK Có', aliases: ['tai khoan co', 'co'], example: '5111', note: 'Như TK Nợ.' },
  ],
  run: async (rows, { dryRun }) => {
    const [sd, tk] = await Promise.all([api.get<SoDo>('/api/v1/posting/scheme'), taiKhoanChiTiet()]);
    const keys = new Map(sd.keys.map((k) => [k.key, k]));
    const dongMan = new Map<string, SLine[][]>();
    for (const b of sd.businesses) for (const g of b.groups) {
      const t = kd(`${b.name} – ${g.name.replace(/\s*\(.*\)$/, '')}`);
      dongMan.set(t, [...(dongMan.get(t) ?? []), g.lines]);
    }
    const datKhoa = new Map<string, { tk: string; row: number }>();
    const pre = rows.map((r) => {
      const row = Number(r._row);
      const loai = chu(r.loai);
      const errors: string[] = [];
      const doi: [string, string][] = [];
      const nhom = dongMan.get(kd(loai));
      if (!loai) errors.push('Thiếu cột Loại');
      else if (!nhom) errors.push(`Loại "${loai}" không có trên màn Tài khoản ngầm định`);
      else for (const lines of nhom) for (const [side, cot, ten] of [['debit', 'no', 'TK Nợ'], ['credit', 'co', 'TK Có']] as const) {
        if (!chu(r[cot])) continue;
        const ben = lines.filter((l) => l.side === side);
        const sua = [...new Set(ben.filter((l) => l.source === 'rule' && l.key).map((l) => l.key!))];
        const coDinh = new Set(ben.filter((l) => !(l.source === 'rule' && l.key)).map((l) => (l.key ? keys.get(l.key)?.accountCode ?? '' : NGUON_NGAN[l.source])).filter(Boolean));
        const hienTai = [...new Set(sua.map((k) => keys.get(k)?.accountCode ?? '').filter(Boolean))];
        const moi = tachTk(chu(r[cot])).filter((x) => !coDinh.has(x));
        if (!moi.length || (moi.length === hienTai.length && moi.every((x) => hienTai.includes(x)))) continue; // không đổi
        if (!sua.length) { errors.push(`${ten}: tài khoản dòng này lấy từ màn khác (hình thức thanh toán, loại kho, thuế…), không sửa ở đây`); continue; }
        // Ghép như tệp Xuất: các ô ngầm định theo thứ tự xuất hiện; một tài khoản thì đặt cho mọi ô của bên đó.
        if (moi.length !== sua.length && moi.length !== 1) { errors.push(`${ten}: dòng có ${sua.length} ô ngầm định mà tệp ghi ${moi.length} tài khoản (${moi.join('; ')}) — ghi ${sua.length} tài khoản theo thứ tự như tệp Xuất, hoặc sửa trên màn`); continue; }
        sua.forEach((kk, i) => {
          const k = keys.get(kk)!; const a = moi.length === 1 ? moi[0]! : moi[i]!;
          if (!tk.has(a)) errors.push(`${ten}: tài khoản ${a} không có hoặc là tài khoản tổng hợp`);
          else if (k.range.length && !k.range.some((p) => a.startsWith(p))) errors.push(`${ten}: tài khoản ${a} ngoài khoảng cho phép của ô "${k.label}" (${k.range.join('; ')})`);
          else doi.push([k.key, a]);
        });
      }
      return { row, loai, errors, doi, values: { ...r } as Record<string, string | undefined> };
    });
    // Một ô ngầm định dùng ở nhiều loại: các dòng phải ghi cùng tài khoản.
    for (const p of pre) for (const [k, a] of p.doi) { const o = datKhoa.get(k); if (!o) datKhoa.set(k, { tk: a, row: p.row }); else if (o.tk !== a) p.errors.push(`Ô ngầm định "${keys.get(k)?.label ?? k}" đã đặt ${o.tk} ở dòng ${o.row} — dòng này ghi ${a}`); }
    const out: NhapDong[] = [];
    const daGhi = new Set<string>();
    for (const p of pre) {
      if (p.errors.length || dryRun) { out.push({ row: p.row, key: p.loai, action: p.errors.length ? 'error' : 'update', errors: p.errors, values: p.values }); continue; }
      try {
        for (const [k, a] of p.doi) if (!daGhi.has(k)) { await api.put(`/api/v1/posting/scheme/accounts/${encodeURIComponent(k)}`, { accountCode: a }); daGhi.add(k); }
        out.push({ row: p.row, key: p.loai, action: 'update', errors: [], values: p.values });
      } catch (e) { out.push({ row: p.row, key: p.loai, action: 'error', errors: [loiCua(e)], values: p.values }); }
    }
    return ketQua(out);
  },
};

/* ------------------------------------------------------------------ ACC41A Tài khoản kết chuyển (cả bộ ghi một lần) */
interface BuocKC { seq: number; fromAccount: string; toAccount: string; mode: 'debit' | 'credit' | 'balance'; description: string; isActive: boolean; includeOpening: boolean }
const BEN_KC: Record<string, BuocKC['mode']> = { no: 'debit', debit: 'debit', co: 'credit', credit: 'credit', 'hai ben': 'balance', balance: 'balance' };
const BEN_TEN: Record<BuocKC['mode'], string> = { debit: 'Nợ', credit: 'Có', balance: 'Hai bên' };
const TK_KET_CHUYEN: NhapLoai = {
  id: 'tai-khoan-ket-chuyen', nhom: 'Danh mục', title: 'Tài khoản kết chuyển', desc: 'Thứ tự, kết chuyển từ, kết chuyển đến, bên kết chuyển, diễn giải, trạng thái — khoá dòng là cặp từ → đến; cả bộ ghi một lần (phiên bản mới)', keyField: 'fromAccount',
  listPath: '/cau-hinh/tai-khoan-ket-chuyen', invalidate: ['closing-rules', 'closing-rule-versions'],
  fields: [
    { key: 'fromAccount', header: 'Kết chuyển từ', required: true, aliases: ['tk di', 'tu tai khoan'], example: '511', note: 'Đầu số tài khoản nguồn (gồm mọi tài khoản con).' },
    { key: 'toAccount', header: 'Kết chuyển đến', required: true, aliases: ['tk den', 'den tai khoan'], example: '911', note: 'Tài khoản chi tiết.' },
    { key: 'seq', header: 'Thứ tự kết chuyển', required: 'moi', aliases: ['thu tu', 'stt'], example: '10', note: 'Số 0–9999, chạy từ nhỏ đến lớn.' },
    { key: 'mode', header: 'Bên kết chuyển', required: 'moi', aliases: ['ben'], example: 'Có', note: 'Nợ / Có / Hai bên.' },
    { key: 'description', header: 'Diễn giải', aliases: ['dien giai', 'mo ta'] },
    { key: 'includeOpening', header: 'Kết chuyển số dư cuối', aliases: ['so du cuoi'], note: 'x = cộng cả số dư đầu kỳ (bước 911 → 421). Cột ẩn. Cột có ô nào được điền thì ô trống = Không.' },
    { key: 'isActive', header: 'Trạng thái', aliases: ['hoat dong', 'ap dung'], example: 'Đang sử dụng', note: 'Đang sử dụng / Ngừng sử dụng (hoặc x / Không). Trống: mới = đang sử dụng, đã có = giữ nguyên.' },
  ],
  run: async (rows, { dryRun, mode }) => {
    const [kc, tkCt, tatCa] = await Promise.all([
      api.get<{ rules: BuocKC[] }>('/api/v1/closing/rules'), taiKhoanChiTiet(),
      api.get<{ code: string }[]>('/api/v1/accounts', { includeInactive: true }),
    ]);
    const maKC = (b: { fromAccount: string; toAccount: string }) => `${b.fromAccount}-${b.toAccount}`;
    const bo = new Map(kc.rules.map((b) => [maKC(b), { ...b }]));
    const cotSD = coCot(rows, 'includeOpening');
    const seen = new Map<string, number>();
    const pre = rows.map((r) => {
      const row = Number(r._row);
      const from = chu(r.fromAccount); const to = chu(r.toAccount);
      const ma = `${from}-${to}`;
      const before = bo.get(ma);
      const errors: string[] = [];
      if (!/^[0-9A-Za-z]{3,20}$/.test(from)) errors.push('Kết chuyển từ: đầu số 3–20 chữ / số');
      if (!/^[0-9A-Za-z]{3,20}$/.test(to)) errors.push('Kết chuyển đến: số tài khoản 3–20 chữ / số');
      if (seen.has(ma)) errors.push(`Trùng bước ${from} → ${to} với dòng ${seen.get(ma)}`); else seen.set(ma, row);
      if (mode === 'create' && before) errors.push(`Bước ${from} → ${to} đã có — chọn "Cập nhật" nếu muốn sửa`);
      if (mode === 'update' && !before) errors.push(`Bước ${from} → ${to} chưa có`);
      const s = chu(r.seq); const seq = s ? Number(s) : before?.seq;
      if (seq === undefined) errors.push('Bước mới phải có thứ tự'); else if (!Number.isInteger(seq) || seq < 0 || seq > 9999) errors.push(`Thứ tự "${s}" phải là số nguyên 0–9999`);
      const b = kd(chu(r.mode)); const md = b ? BEN_KC[b] : before?.mode;
      if (b && !md) errors.push(`Bên kết chuyển "${r.mode}" ghi Nợ / Có / Hai bên`); else if (!md) errors.push('Bước mới phải có bên kết chuyển');
      const t = kd(chu(r.isActive));
      const act = !t ? before?.isActive ?? true : /^(dang su dung|co|x|1|true|ap dung)$/.test(t) ? true : /^(ngung su dung|khong|0|false)$/.test(t) ? false : null;
      if (act === null) errors.push(`Trạng thái "${r.isActive}" ghi Đang sử dụng / Ngừng sử dụng`);
      const so = tich(r.includeOpening, cotSD); if (so === null) errors.push(loiTich('Kết chuyển số dư cuối', r.includeOpening));
      const desc = chu(r.description) || before?.description || '';
      if (desc.length > 255) errors.push('Diễn giải tối đa 255 ký tự');
      const moi: BuocKC | null = errors.length ? null : { seq: seq!, fromAccount: from, toAccount: to, mode: md!, description: desc, isActive: act as boolean, includeOpening: so ?? before?.includeOpening ?? false };
      return { row, ma, before, errors, moi, values: { ...r } as Record<string, string | undefined> };
    });
    for (const p of pre) if (p.moi) bo.set(p.ma, p.moi);
    // Kiểm cả bộ như máy chủ (mọi bước, kể cả bước ngừng — lỗi L04 chưa sửa): đầu số đi phải có tài khoản, tài khoản đến phải là TK chi tiết.
    const loiBo: string[] = [];
    for (const b of bo.values()) {
      if (!tatCa.some((a) => a.code.startsWith(b.fromAccount))) loiBo.push(`${b.fromAccount} → ${b.toAccount}: không có tài khoản nào bắt đầu bằng ${b.fromAccount}`);
      if (!tkCt.has(b.toAccount)) loiBo.push(`${b.fromAccount} → ${b.toAccount}: tài khoản đến ${b.toAccount} không có hoặc là tài khoản tổng hợp`);
    }
    const ok = pre.filter((p) => !p.errors.length);
    if (loiBo.length) for (const p of ok) p.errors.push(`Bộ kết chuyển còn bước lỗi nên không lưu được (L04 — khai đủ tài khoản ở Hệ thống tài khoản trước): ${loiBo.slice(0, 4).join('; ')}${loiBo.length > 4 ? `; … (${loiBo.length} lỗi)` : ''}`);
    const view = (b?: BuocKC) => (b ? { seq: String(b.seq), mode: BEN_TEN[b.mode], description: b.description, isActive: b.isActive ? 'Đang sử dụng' : 'Ngừng sử dụng', includeOpening: b.includeOpening ? 'x' : '' } : undefined);
    if (!dryRun && ok.length && !loiBo.length) {
      try { await api.put('/api/v1/closing/rules', { rules: [...bo.values()].sort((a, b) => a.seq - b.seq), note: 'Nhập Excel' }); }
      catch (e) { for (const p of ok) p.errors.push(loiCua(e)); }
    }
    return ketQua(pre.map((p) => ({ row: p.row, key: p.ma, action: p.errors.length ? 'error' : p.before ? 'update' : 'create', errors: p.errors, values: p.values, before: view(p.before) })));
  },
};

export const NHAP_DANH_MUC: NhapLoai[] = [BIEU_THUE, LOAI_KHO, NHOM_DOI_TUONG, NHAN_VIEN, TK_NGAN_HANG, HINH_THUC_TT, BANG_GIA, TK_NGAM_DINH, TK_KET_CHUYEN];
