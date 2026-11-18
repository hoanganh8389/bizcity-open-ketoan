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

export const NHAP_DANH_MUC: NhapLoai[] = [BIEU_THUE];
