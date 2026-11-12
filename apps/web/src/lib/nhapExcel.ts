// [2026-11-11 Nguyễn Văn Thủy] NHẬP EXCEL DÙNG CHUNG — khai mỗi loại dữ liệu một bộ mô tả trường (đóng góp)
/**
 * Mỗi loại nhập (mặt hàng, khách hàng, nhà cung cấp, kho…) khai MỘT bộ mô tả trường. Từ bộ này trình nhập 4 bước
 * (components/NhapExcelWizard.tsx) tự sinh: tệp mẫu (kèm sheet Hướng dẫn), bảng ghép cột, ô ngầm định, bước kiểm tra, tệp lỗi.
 * `run(rows, { dryRun, mode })`: dryRun = chỉ kiểm từng dòng, không ghi; trả kết quả theo từng dòng Excel.
 * Thêm loại mới: viết một NhapLoai rồi thêm vào NHAP_LOAI (trang TI14 và nút "Nhập Excel" ở danh sách dùng chung danh sách này).
 */
import { api } from './api';

export interface NhapTruong {
  key: string;
  /** Tiêu đề cột trong tệp mẫu (cũng là tên dùng để tự ghép cột). */
  header: string;
  /** true = mọi dòng phải có; 'moi' = chỉ dòng thêm mới phải có. */
  required?: boolean | 'moi';
  /** Tên cột khác hay gặp để tự ghép (không dấu, không phân biệt hoa thường). */
  aliases?: string[];
  /** Diễn giải cách điền (sheet Hướng dẫn, chú thích ở bước ghép cột). */
  note?: string;
  /** Giá trị ví dụ ở dòng mẫu. */
  example?: string;
  /** Giá trị ngầm định khi tệp không có cột / ô trống (người dùng sửa được ở bước ghép cột). */
  defaultValue?: string;
}

export type NhapCheDo = 'create' | 'update' | 'both';
export interface NhapDong { row: number; key: string; action: 'create' | 'update' | 'error'; errors: string[]; values: Record<string, string | undefined>; before?: Record<string, string | undefined> }
export interface NhapKetQua { created: number; updated: number; failed: number; rows: NhapDong[] }

export interface NhapLoai {
  id: string;
  /** Nhóm trên trang Nhập Excel: Danh mục, Chứng từ, Số dư… */
  nhom: string;
  title: string;
  desc: string;
  keyField: string;
  fields: NhapTruong[];
  /** Cho chọn Thêm mới / Cập nhật / Cả hai (mặc định có). */
  modes?: boolean;
  /** Danh sách để xem sau khi nhập. */
  listPath: string;
  /** Khoá dữ liệu cần tải lại sau khi ghi. */
  invalidate: string[];
  run: (rows: Record<string, string>[], opt: { dryRun: boolean; mode: NhapCheDo }) => Promise<NhapKetQua>;
}

const rowsOut = (rows: Record<string, string>[]) => rows.map(({ _row, ...r }) => ({ ...r, row: Number(_row) }) as Record<string, string | number> & { row: number });

/* ------------------------------------------------------------------ Mặt hàng */
const MAT_HANG: NhapLoai = {
  id: 'mat-hang', nhom: 'Danh mục', title: 'Mặt hàng', desc: 'Mã, tên, ĐVT, nhóm hàng, thuế suất GTGT, trạng thái', keyField: 'sku',
  listPath: '/danh-muc/mat-hang', invalidate: ['products', 'inventory-items'], modes: false,
  fields: [
    { key: 'sku', header: 'Mã hàng', required: true, aliases: ['ma', 'ma vthh', 'ma hang hoa', 'ma san pham', 'sku', 'ma hang hoa, dich vu'], example: '100021099', note: 'Mã đã có → cập nhật; chưa có → thêm mới. Mã mới không có chữ ở đầu hoặc cuối. Mã biến thể: giữ nguyên mã cha (đã có hoặc có ở dòng khác trong tệp), thêm tối đa 2 chữ ở đầu hoặc cuối.' },
    { key: 'name', header: 'Tên hàng', required: 'moi', aliases: ['ten', 'ten vthh', 'ten hang hoa', 'ten san pham', 'ten hang hoa, dich vu'], example: 'Sữa bột mẫu 400g' },
    { key: 'unit', header: 'ĐVT', required: 'moi', aliases: ['don vi tinh', 'dvt chinh', 'don vi', 'don vi tinh chinh'], example: 'Hộp', note: 'Mặt hàng đã có: ĐVT không đổi qua Excel (đổi ở form mặt hàng).' },
    { key: 'groupCode', header: 'Nhóm hàng', aliases: ['nhom', 'nhom vthh', 'ma nhom', 'ma nhom vthh', 'nhom vat tu, hang hoa'], example: '', note: 'Mã hoặc đúng tên nhóm cấp 3 trong danh mục. Mã biến thể: bỏ trống, theo mã cha.' },
    { key: 'vatRate', header: 'Thuế suất GTGT (%)', aliases: ['thue suat', 'thue gtgt', 'vat', 'thue suat gtgt'], example: '8', note: 'KCT, 0, 5, 8, 10 hoặc mã thuế đầu ra khác — phải có ở danh mục Biểu thuế.' },
    { key: 'isActive', header: 'Trạng thái', aliases: ['theo doi', 'dang theo doi'], note: 'Đang hoạt động / Ngừng hoạt động. Trống = giữ nguyên (mới: Đang hoạt động).' },
  ],
  run: async (rows, { dryRun }) => {
    const o = await api.post<{ created: number; updated: number; failed: number; rows: { row: number; sku: string; action: NhapDong['action']; errors: string[]; values: Record<string, string>; before?: Record<string, string> }[] }>(
      '/api/v1/catalog/products/import', { dryRun, rows: rowsOut(rows).map((r) => ({ ...r, sku: r.sku ?? '' })) });
    return { ...o, rows: o.rows.map((r) => ({ ...r, key: r.sku })) };
  },
};

/* ------------------------------------------------------------------ Khách hàng / Nhà cung cấp */
const doiTuong = (kind: 'customer' | 'supplier'): NhapLoai => {
  const kh = kind === 'customer';
  const ab = kh ? 'khách hàng' : 'nhà cung cấp';
  return {
    id: kh ? 'khach-hang' : 'nha-cung-cap', nhom: 'Danh mục', title: kh ? 'Khách hàng' : 'Nhà cung cấp',
    desc: `Mã, tên, mã số thuế, địa chỉ, nhóm, điện thoại, ngân hàng, hạn nợ của ${ab}`, keyField: 'code',
    listPath: kh ? '/danh-muc/khach-hang' : '/danh-muc/nha-cung-cap', invalidate: ['partners'],
    fields: [
      { key: 'code', header: `Mã ${ab}`, aliases: ['ma', 'ma kh', 'ma ncc', 'ma doi tuong', 'ma khach hang', 'ma nha cung cap'], example: '', note: 'Để trống khi thêm mới: phần mềm tự cấp mã nối dãy của nhóm. Mã đã có → cập nhật.' },
      { key: 'name', header: `Tên ${ab}`, required: 'moi', aliases: ['ten', 'ten kh', 'ten ncc', 'ten doi tuong', 'ten khach hang', 'ten nha cung cap', 'ten cong ty'], example: kh ? 'Công ty TNHH Mẫu' : 'Công ty CP Sữa Mẫu' },
      { key: 'kind', header: 'Kiểu', aliases: ['loai doi tuong', 'thuoc kieu'], defaultValue: kh ? 'Khách hàng' : 'Nhà cung cấp', note: 'Khách hàng / Nhà cung cấp / Nhân viên / Nội bộ / Khác.' },
      { key: 'groupCode', header: `Nhóm ${ab}`, aliases: ['nhom', 'nhom kh', 'nhom ncc', 'nhom kh/ncc', 'ma nhom', 'ma nhom khach hang', 'ma nhom nha cung cap', 'ma nhom kh, ncc'], note: 'Mã hoặc đúng tên nhóm trong danh mục nhóm đối tượng.' },
      { key: 'taxCode', header: 'Mã số thuế', aliases: ['mst', 'ma so thue/cccd', 'ma so thue cccd'], example: '0100000000', note: '10 số, 10 số-3 số hoặc 12 số CCCD; không trùng đối tượng khác.' },
      { key: 'address', header: 'Địa chỉ', aliases: ['dia chi nr', 'dia chi cty', 'dia chi cong ty'], example: 'Hà Nội' },
      { key: 'phone', header: 'Điện thoại', aliases: ['dien thoai co dinh', 'so dien thoai', 'sdt', 'telephone'] },
      { key: 'mobile', header: 'Di động', aliases: ['dtdd', 'mobile', 'dien thoai di dong'] },
      { key: 'email', header: 'Email', aliases: ['thu dien tu'] },
      { key: 'contactName', header: 'Người liên hệ', aliases: ['nguoi dai dien', 'nguoi lien he / dai dien', 'ho va ten nguoi lien he', 'ten nguoi lien he'] },
      { key: 'bankAccountNo', header: 'Số tài khoản ngân hàng', aliases: ['so tai khoan', 'tai khoan ngan hang', 'stk', 'so tai khoan ngan hang'] },
      { key: 'bankName', header: 'Tên ngân hàng', aliases: ['ngan hang', 'mo tai ngan hang'] },
      { key: 'paymentTermDays', header: 'Số ngày được nợ', aliases: ['han thanh toan', 'so ngay no', 'so ngay duoc no'], note: 'Số nguyên 0 – 3650.' },
      { key: 'creditLimit', header: 'Hạn mức nợ', aliases: ['so no toi da', 'han muc', 'han muc no'] },
      { key: 'isActive', header: 'Theo dõi', aliases: ['trang thai', 'dang giao dich'], note: 'Có / Không.' },
      { key: 'note', header: 'Ghi chú', aliases: ['dien giai'] },
    ],
    run: async (rows, { dryRun, mode }) => {
      const o = await api.post<{ created: number; updated: number; failed: number; rows: (Omit<NhapDong, 'key'> & { code: string })[] }>('/api/v1/partners/import', { dryRun, mode, rows: rowsOut(rows) });
      return { ...o, rows: o.rows.map((r) => ({ ...r, key: r.code })) };
    },
  };
};

/* ------------------------------------------------------------------ Kho (ít dòng: kiểm ở trình duyệt, ghi từng kho) */
interface KhoRow { code: string; branchCode: string; name: string; address: string; isActive: boolean; isDefault: boolean; isPromo: boolean; account: string; note: string }
const YES = ['có', 'co', 'x', '1', 'true', 'yes'];
const NO = ['không', 'khong', '0', 'false', 'no'];
const yn = (v: string | undefined) => { const s = (v ?? '').trim().toLowerCase(); return !s ? undefined : YES.includes(s) ? true : NO.includes(s) ? false : null; };
const KHO: NhapLoai = {
  id: 'kho', nhom: 'Danh mục', title: 'Kho', desc: 'Mã kho, chi nhánh, tên, địa chỉ, tài khoản kho, kho mặc định', keyField: 'code',
  listPath: '/danh-muc/kho', invalidate: ['warehouses'],
  fields: [
    { key: 'code', header: 'Mã kho', required: true, aliases: ['ma'], example: '01-HH' },
    { key: 'branchCode', header: 'Chi nhánh', required: 'moi', aliases: ['ma chi nhanh', 'don vi'], example: '00001', note: 'Mã chi nhánh trong sơ đồ tổ chức.' },
    { key: 'name', header: 'Tên kho', required: 'moi', aliases: ['ten'], example: 'Kho hàng' },
    { key: 'address', header: 'Địa chỉ', aliases: ['dia chi kho'] },
    { key: 'account', header: 'Tài khoản kho', aliases: ['tk kho'] },
    { key: 'isDefault', header: 'Kho mặc định', aliases: ['mac dinh'], note: 'Có / Không: nhận dòng hàng không ghi mã kho.' },
    { key: 'isPromo', header: 'Kho khuyến mại', aliases: ['khuyen mai'] },
    { key: 'isActive', header: 'Theo dõi', aliases: ['trang thai'] },
    { key: 'note', header: 'Ghi chú', aliases: ['dien giai'] },
  ],
  run: async (rows, { dryRun, mode }) => {
    const [ws, bs] = await Promise.all([api.get<KhoRow[]>('/api/v1/warehouses'), api.get<{ code: string }[]>('/api/v1/branches')]);
    const have = new Map(ws.map((w) => [w.code, w]));
    const branches = new Set(bs.map((b) => b.code));
    const seen = new Map<string, number>();
    const out: NhapDong[] = [];
    for (const r of rows) {
      const row = Number(r._row);
      const code = (r.code ?? '').trim();
      const before = have.get(code);
      const errors: string[] = [];
      if (!code) errors.push('Thiếu mã kho');
      if (code.length > 12) errors.push('Mã kho tối đa 12 ký tự');
      if (code && seen.has(code)) errors.push(`Trùng mã với dòng ${seen.get(code)} trong tệp`); else if (code) seen.set(code, row);
      if (mode === 'create' && before) errors.push(`Kho ${code} đã có — chọn "Cập nhật" nếu muốn sửa`);
      if (mode === 'update' && !before) errors.push(`Kho ${code} chưa có`);
      const branchCode = (r.branchCode ?? '').trim();
      if (!before && !branchCode) errors.push('Kho mới phải có chi nhánh');
      if (branchCode && !branches.has(branchCode)) errors.push(`Chi nhánh "${branchCode}" chưa có`);
      if (!before && !(r.name ?? '').trim()) errors.push('Kho mới phải có tên');
      const flags = { isDefault: yn(r.isDefault), isPromo: yn(r.isPromo), isActive: yn(r.isActive) };
      for (const [k, v] of Object.entries(flags)) if (v === null) errors.push(`Cột ${k === 'isDefault' ? 'Kho mặc định' : k === 'isPromo' ? 'Kho khuyến mại' : 'Theo dõi'} ghi Có / Không`);
      const values = { ...r, code };
      if (errors.length || dryRun) { out.push({ row, key: code, action: errors.length ? 'error' : before ? 'update' : 'create', errors, values, before: before ? { ...before, isActive: before.isActive ? 'Có' : 'Không', isDefault: before.isDefault ? 'Có' : 'Không', isPromo: before.isPromo ? 'Có' : 'Không' } as never : undefined }); continue; }
      const body = {
        branchCode: branchCode || before!.branchCode, name: (r.name ?? '').trim() || before!.name, address: (r.address ?? '').trim() || before?.address || '',
        account: (r.account ?? '').trim() || before?.account || '', note: (r.note ?? '').trim() || before?.note || '',
        isActive: flags.isActive ?? before?.isActive ?? true, isDefault: flags.isDefault ?? before?.isDefault ?? false, isPromo: flags.isPromo ?? before?.isPromo ?? false,
      };
      try {
        if (before) await api.patch(`/api/v1/warehouses/${encodeURIComponent(code)}`, body); else await api.post('/api/v1/warehouses', { ...body, code });
        out.push({ row, key: code, action: before ? 'update' : 'create', errors: [], values });
      } catch (e) { out.push({ row, key: code, action: 'error', errors: [e instanceof Error ? e.message : String(e)], values }); }
    }
    const n = (a: NhapDong['action']) => out.filter((x) => x.action === a).length;
    return { created: n('create'), updated: n('update'), failed: n('error'), rows: out };
  },
};


/* ------------------------------------------------------------------ Nhóm hàng (cây cha – con) */
// [2026-11-12 Nguyễn Văn Thủy] cột tệp giống màn DM11: Nhóm cha (đường dẫn hoặc tên), Mã nhóm hàng, Mã ngắn, Tên nhóm hàng, Đang dùng;
//   không cần mã nội bộ — dòng trùng (nhóm cha + mã nhóm hàng) là cập nhật; nhóm đã có mặt hàng không đổi mã ngắn / không chuyển nhóm (đóng góp)
interface NhomRow { code: string; name: string; parentCode: string | null; isActive: boolean; skuCode?: string; fullName?: string; products: number }
/** Độ dài mã ngắn theo cấp (giống DM11): cấp 1 = 2 chữ số, cấp 2 = 3, cấp 3 = 1 ký tự; cấp sâu hơn không ghép vào mã hàng. */
const MA_NGAN: Record<number, number> = { 1: 2, 2: 3, 3: 1 };
const NHOM_HANG: NhapLoai = {
  id: 'nhom-hang', nhom: 'Danh mục', title: 'Nhóm hàng', desc: 'Cây nhóm hàng: nhóm cha, mã nhóm hàng, mã ngắn, tên nhóm hàng', keyField: 'name',
  listPath: '/danh-muc/phan-loai-hang', invalidate: ['item-classes'], modes: false,
  fields: [
    { key: 'parentCode', header: 'Nhóm cha', aliases: ['ma nhom cha', 'thuoc nhom', 'nhom tren', 'thuoc', 'duong dan nhom cha'], example: 'BỈM/ TÃ / Aiwibi', note: 'Đường dẫn nhóm cha (cấp 1 / cấp 2 …) hoặc đúng mã nhóm hàng của nhóm cha. Trống = nhóm cấp 1. Nhóm cha có ở dòng trên trong tệp cũng được.' },
    { key: 'name', header: 'Mã nhóm hàng', required: true, aliases: ['ma nhom', 'ten', 'ten nhom', 'nhom hang'], example: 'Bỉm/ Tã quần trẻ em', note: 'Tên ngắn hiện trên cây. Cùng nhóm cha + cùng mã nhóm hàng với nhóm đang có → cập nhật nhóm đó.' },
    { key: 'skuCode', header: 'Mã ngắn', aliases: ['ma ngan', 'ma ghep', 'ma ngan (ma ghep)', 'ma sku'], example: '3', note: 'Ghép vào mã hàng: cấp 1 = 2 chữ số không bắt đầu bằng 0; cấp 2 = 3 ký tự; cấp 3 = 1 ký tự (chữ hoặc số). Nhóm đã có mặt hàng: không đổi được.' },
    { key: 'fullName', header: 'Tên nhóm hàng', aliases: ['ten nhom hang', 'ten day du', 'mhlten'], note: 'Tên đầy đủ. Trống = tự ghép tên nhóm cha + mã nhóm hàng.' },
    { key: 'isActive', header: 'Đang dùng', aliases: ['theo doi', 'trang thai'], note: 'Có / Không. Trống = giữ nguyên (mới: Có).' },
  ],
  run: async (rows, { dryRun }) => {
    const ds = await api.get<NhomRow[]>('/api/v1/item-classes/group');
    const have = new Map(ds.map((c) => [c.code, c]));
    const low = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase();
    // Cây sau khi nhập: nhóm đang có + dòng tệp. Khoá nhóm = mã nội bộ (nhóm mới: mã tạm "moi:<dòng>").
    const tree = new Map<string, { name: string; parent: string | null; sku: string; full: string }>(ds.map((c) => [c.code, { name: c.name, parent: c.parentCode, sku: c.skuCode ?? '', full: c.fullName ?? '' }]));
    const pathOf = (code: string | null): string => { const out: string[] = []; for (let c = code, n = 0; c && n < 50; c = tree.get(c)?.parent ?? null, n++) out.unshift(tree.get(c)?.name ?? ''); return out.join(' / '); };
    const kidsOf = (parent: string | null) => [...tree.entries()].filter(([, v]) => (v.parent ?? null) === parent);
    const findParent = (v: string): string | { err: string } => {
      const k = low(v);
      const byPath = [...tree.keys()].filter((c) => low(pathOf(c)) === k);
      if (byPath.length === 1) return byPath[0]!;
      const byName = [...tree.entries()].filter(([, x]) => low(x.name) === k).map(([c]) => c);
      if (byName.length === 1) return byName[0]!;
      if (have.has(v)) return v;
      return { err: byName.length > 1 ? `Có ${byName.length} nhóm tên "${v}" — ghi đường dẫn đầy đủ, vd "BỈM/ TÃ / Aiwibi"` : `Nhóm cha "${v}" chưa có` };
    };
    const subProducts = (code: string) => { let n = 0; const st = [code]; const seen = new Set<string>(); while (st.length) { const c = st.pop()!; if (seen.has(c)) continue; seen.add(c); n += have.get(c)?.products ?? 0; for (const [k] of kidsOf(c)) st.push(k); } return n; };
    const nums = ds.map((c) => Number(c.code)).filter((n) => Number.isInteger(n));
    let nextCode = (nums.length ? Math.max(...nums) : 0) + 1;

    const pre = rows.map((r) => {
      const row = Number(r._row);
      const errors: string[] = [];
      const name = (r.name ?? '').trim();
      if (!name) errors.push('Thiếu mã nhóm hàng');
      let parent: string | null = null;
      const pv = (r.parentCode ?? '').trim();
      if (pv) { const p = findParent(pv); if (typeof p === 'string') parent = p; else errors.push(p.err); }
      // Nhóm đang có cùng cha + cùng mã nhóm hàng → cập nhật.
      const same = errors.length ? undefined : kidsOf(parent).find(([, v]) => low(v.name) === low(name));
      const code = same ? same[0] : `moi:${row}`;
      const before = have.get(code);
      const sku = (r.skuCode ?? '').trim().toUpperCase();
      if (sku && !/^[0-9A-Z]+$/.test(sku)) errors.push('Mã ngắn chỉ gồm chữ và số');
      if (before && sku && sku !== (before.skuCode ?? '') && subProducts(code) > 0) errors.push(`Nhóm đã có mặt hàng — không đổi mã ngắn (${before.skuCode || 'trống'} → ${sku})`);
      const isActive = yn(r.isActive);
      if (isActive === null) errors.push('Cột Đang dùng ghi Có / Không');
      const full = (r.fullName ?? '').trim() || before?.fullName || [parent ? tree.get(parent)?.full || pathOf(parent).split(' / ').join(' ') : '', name].filter(Boolean).join(' ');
      if (!errors.length) tree.set(code, { name, parent, sku: sku || before?.skuCode || '', full });
      return { row, code, before, errors, name, parent, sku, full, isActive, values: { ...r, name, parentCode: parent ? pathOf(parent) : '', fullName: full } as Record<string, string> };
    });
    // Kiểm trên cây sau nhập: độ dài mã ngắn theo cấp, cấp 1 là 2 chữ số, trùng mã ngắn cùng cha.
    const levelOf = (code: string) => { let n = 0; for (let c: string | null = code; c && n < 50; c = tree.get(c)?.parent ?? null) n++; return n; };
    for (const p of pre) {
      if (p.errors.length) continue;
      const lv = levelOf(p.code);
      const sku = tree.get(p.code)!.sku;
      const len = MA_NGAN[lv];
      if (len && !sku) p.errors.push(`Nhóm cấp ${lv} phải có mã ngắn (${len} ký tự)`);
      else if (len && lv === 1 && !/^[1-9][0-9]$/.test(sku)) p.errors.push(`Nhóm cấp 1: mã ngắn là 2 chữ số, không bắt đầu bằng 0 (đang "${sku}")`);
      else if (len && sku.length !== len) p.errors.push(`Nhóm cấp ${lv}: mã ngắn phải đúng ${len} ký tự (đang "${sku}")`);
      const sib = sku ? kidsOf(p.parent).find(([c, v]) => c !== p.code && v.sku === sku) : undefined;
      if (sib) p.errors.push(`Mã ngắn ${sku} đã dùng cho nhóm "${sib[1].name}" cùng cấp`);
    }
    // Nhóm cha ở dòng lỗi (nhóm mới) → nhóm con cũng không ghi được.
    for (let doi = true; doi;) {
      doi = false;
      const hong = new Set(pre.filter((p) => p.errors.length && !p.before).map((p) => p.code));
      for (const p of pre) if (!p.errors.length && p.parent && hong.has(p.parent)) { p.errors.push('Nhóm cha ở dòng lỗi — sửa dòng đó trước'); doi = true; }
    }
    const out: NhapDong[] = [];
    const realCode = new Map<string, string>(ds.map((c) => [c.code, c.code]));
    const order = [...pre].sort((a, b) => levelOf(a.code) - levelOf(b.code)); // cha trước con
    for (const p of order) {
      const beforeView = p.before ? { name: p.before.name, parentCode: p.before.parentCode ? pathOf(p.before.parentCode) : '', skuCode: p.before.skuCode ?? '', fullName: p.before.fullName ?? '', isActive: p.before.isActive ? 'Có' : 'Không' } : undefined;
      const key = p.values.parentCode ? `${p.values.parentCode} / ${p.name}` : p.name;
      if (p.errors.length || dryRun) { out.push({ row: p.row, key, action: p.errors.length ? 'error' : p.before ? 'update' : 'create', errors: p.errors, values: p.values, before: beforeView }); continue; }
      const parentReal = p.parent ? realCode.get(p.parent) : undefined;
      if (p.parent && !parentReal) { out.push({ row: p.row, key, action: 'error', errors: ['Nhóm cha chưa ghi được (dòng của nó lỗi)'], values: p.values }); continue; }
      const code = p.before ? p.code : String(nextCode++);
      try {
        await api.put(`/api/v1/item-classes/group/${encodeURIComponent(code)}${p.before ? '' : '?new=1'}`, {
          name: p.name, fullName: p.full, parentCode: parentReal || undefined, isActive: p.isActive ?? p.before?.isActive ?? true, ...(p.sku ? { skuCode: p.sku } : {}),
        });
        realCode.set(p.code, code);
        out.push({ row: p.row, key, action: p.before ? 'update' : 'create', errors: [], values: p.values, before: beforeView });
      } catch (e) { out.push({ row: p.row, key, action: 'error', errors: [e instanceof Error ? e.message : String(e)], values: p.values }); }
    }
    out.sort((a, b) => a.row - b.row);
    const n = (a: NhapDong['action']) => out.filter((x) => x.action === a).length;
    return { created: n('create'), updated: n('update'), failed: n('error'), rows: out };
  },
};


/* ------------------------------------------------------------------ Hệ thống tài khoản (cùng bộ cột với tệp Xuất ở ACC1: sửa xong nhập lại được) */
interface TkRow { code: string; name: string; nameEn: string | null; description?: string; parentCode: string | null; normalSide: string; isActive: boolean }
const TINH_CHAT_DOC: Record<string, string> = { 'du no': 'debit', 'no': 'debit', 'du co': 'credit', 'co': 'credit', 'luong tinh': 'both', 'debit': 'debit', 'credit': 'credit', 'both': 'both' };
const khongDauNho = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
const TAI_KHOAN: NhapLoai = {
  id: 'tai-khoan', nhom: 'Danh mục', title: 'Hệ thống tài khoản', desc: 'Số tài khoản, tên, tài khoản tổng hợp, tính chất (Dư Nợ / Dư Có / Lưỡng tính), tên tiếng Anh, diễn giải, trạng thái', keyField: 'code',
  listPath: '/danh-muc/tai-khoan', invalidate: ['accounts'],
  fields: [
    { key: 'code', header: 'Số tài khoản', required: true, aliases: ['so tk', 'tai khoan', 'ma tai khoan', 'so hieu tai khoan'], example: '13111', note: 'Đã có → cập nhật; chưa có → thêm mới. 3–20 chữ / số.' },
    { key: 'name', header: 'Tên tài khoản', required: 'moi', aliases: ['ten', 'ten tk'], example: 'Phải thu khách hàng bán lẻ' },
    { key: 'parentCode', header: 'Tài khoản tổng hợp', aliases: ['tk tong hop', 'tai khoan me', 'tk me', 'tk cap tren'], example: '131', note: 'Chỉ dùng khi thêm mới. Trống: lấy theo số tài khoản (13111 → 1311 hoặc 131 nếu có). Số tài khoản con bắt đầu bằng số tài khoản tổng hợp.' },
    { key: 'normalSide', header: 'Tính chất', aliases: ['tinh chat tai khoan', 'so du'], example: 'Lưỡng tính', note: 'Dư Nợ / Dư Có / Lưỡng tính. Trống: mới = theo tài khoản tổng hợp; đã có = giữ nguyên.' },
    { key: 'nameEn', header: 'Tên tiếng Anh', aliases: ['ten tieng anh', 'ten en', 'english name'] },
    { key: 'description', header: 'Diễn giải', aliases: ['ghi chu', 'mo ta'] },
    { key: 'isActive', header: 'Trạng thái', aliases: ['theo doi', 'dang su dung'], note: 'Đang sử dụng / Ngừng sử dụng (hoặc Có / Không). Trống = giữ nguyên (mới: đang sử dụng).' },
  ],
  run: async (rows, { dryRun, mode }) => {
    const ds = await api.get<TkRow[]>('/api/v1/accounts', { includeInactive: true });
    const have = new Map(ds.map((a) => [a.code, a]));
    const fileCodes = new Set(rows.map((r) => (r.code ?? '').trim()).filter(Boolean));
    const seen = new Map<string, number>();
    // Tài khoản tổng hợp: ghi trong tệp, hoặc tài khoản dài nhất (có sẵn / trong tệp) là phần đầu của số tài khoản.
    const tongHop = (code: string, ghi: string) => {
      if (ghi) return ghi;
      for (let n = code.length - 1; n >= 3; n--) { const p = code.slice(0, n); if (have.has(p) || fileCodes.has(p)) return p; }
      return '';
    };
    const pre = rows.map((r) => {
      const row = Number(r._row);
      const code = (r.code ?? '').trim();
      const before = have.get(code);
      const errors: string[] = [];
      if (!code) errors.push('Thiếu số tài khoản'); else if (!/^[0-9A-Za-z]{3,20}$/.test(code)) errors.push('Số tài khoản 3–20 chữ / số, không có khoảng trắng');
      if (code && seen.has(code)) errors.push(`Trùng số tài khoản với dòng ${seen.get(code)} trong tệp`); else if (code) seen.set(code, row);
      if (mode === 'create' && before) errors.push(`Tài khoản ${code} đã có — chọn "Cập nhật" nếu muốn sửa`);
      if (mode === 'update' && !before) errors.push(`Tài khoản ${code} chưa có`);
      const name = (r.name ?? '').trim();
      if (!before && !name) errors.push('Tài khoản mới phải có tên');
      const parent = before ? before.parentCode ?? '' : tongHop(code, (r.parentCode ?? '').trim());
      if (!before && parent && !code.startsWith(parent)) errors.push(`Số tài khoản phải bắt đầu bằng số tài khoản tổng hợp ${parent}`);
      if (!before && parent && !have.has(parent) && !fileCodes.has(parent)) errors.push(`Tài khoản tổng hợp ${parent} chưa có`);
      const tc = (r.normalSide ?? '').trim();
      const side = tc ? TINH_CHAT_DOC[khongDauNho(tc)] : undefined;
      if (tc && !side) errors.push(`Tính chất "${tc}" ghi Dư Nợ / Dư Có / Lưỡng tính`);
      const tt = khongDauNho(r.isActive ?? '');
      const isActive = !tt ? undefined : /^(dang su dung|co|x|1|true)$/.test(tt) ? true : /^(ngung su dung|khong|0|false)$/.test(tt) ? false : null;
      if (isActive === null) errors.push('Trạng thái ghi Đang sử dụng / Ngừng sử dụng');
      return { row, code, before, errors, name, parent, side, isActive, values: { ...r, code, parentCode: parent } as Record<string, string | undefined> };
    });
    const out: NhapDong[] = [];
    // Thêm mới: tài khoản tổng hợp trước tài khoản con (số ngắn trước).
    const order = [...pre].sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
    const ghiDuoc = new Set(ds.map((a) => a.code));
    for (const p of order) {
      const beforeView = p.before ? { name: p.before.name, nameEn: p.before.nameEn ?? '', description: p.before.description ?? '', normalSide: ({ debit: 'Dư Nợ', credit: 'Dư Có', both: 'Lưỡng tính' } as Record<string, string>)[p.before.normalSide] ?? '', isActive: p.before.isActive ? 'Đang sử dụng' : 'Ngừng sử dụng' } : undefined;
      if (p.errors.length || dryRun) { out.push({ row: p.row, key: p.code, action: p.errors.length ? 'error' : p.before ? 'update' : 'create', errors: p.errors, values: p.values, before: beforeView }); continue; }
      if (!p.before && p.parent && !ghiDuoc.has(p.parent)) { out.push({ row: p.row, key: p.code, action: 'error', errors: [`Tài khoản tổng hợp ${p.parent} chưa ghi được (dòng của nó lỗi)`], values: p.values }); continue; }
      const opt = { ...(p.side ? { normalSide: p.side } : {}), ...((p.values.nameEn ?? '').trim() ? { nameEn: p.values.nameEn!.trim() } : {}), ...((p.values.description ?? '').trim() ? { description: p.values.description!.trim() } : {}) };
      try {
        if (p.before) await api.patch(`/api/v1/accounts/${encodeURIComponent(p.code)}`, { ...(p.name ? { name: p.name } : {}), ...opt, ...(p.isActive !== undefined ? { isActive: p.isActive } : {}) });
        else {
          const cha = p.parent ? have.get(p.parent) : undefined;
          // Tài khoản con theo dõi chi tiết như tài khoản tổng hợp (đối tượng, khoản mục…).
          const theoCha = Object.fromEntries(Object.entries((cha ?? {}) as Record<string, unknown>).filter(([k, x]) => (k.startsWith('track') || k === 'isDebt') && x === true));
          await api.post('/api/v1/accounts', { code: p.code, name: p.name, parentCode: p.parent || undefined, normalSide: p.side ?? cha?.normalSide ?? 'debit', ...theoCha, ...opt });
          if (p.isActive === false) await api.patch(`/api/v1/accounts/${encodeURIComponent(p.code)}`, { isActive: false });
        }
        ghiDuoc.add(p.code);
        out.push({ row: p.row, key: p.code, action: p.before ? 'update' : 'create', errors: [], values: p.values, before: beforeView });
      } catch (e) { out.push({ row: p.row, key: p.code, action: 'error', errors: [e instanceof Error ? e.message : String(e)], values: p.values }); }
    }
    out.sort((a, b) => a.row - b.row);
    const n = (a: NhapDong['action']) => out.filter((x) => x.action === a).length;
    return { created: n('create'), updated: n('update'), failed: n('error'), rows: out };
  },
};


/* ------------------------------------------------------------------ Số dư tài khoản đầu kỳ (cả công nợ theo đối tượng) */
/** Số tiền trong ô Excel: "1.000.000", "1,000,000", "1000000,5", "1 000 000" đều đọc được; trống = 0; sai = NaN. */
export function soTien(v: string | undefined): number {
  let s = (v ?? '').replace(/\s/g, '');
  if (!s) return 0;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
/** Ngày trong ô: yyyy-mm-dd hoặc dd/mm/yyyy (d/m/yy) → yyyy-mm-dd; sai = ''. */
export function ngay(v: string | undefined): string {
  const s = (v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return '';
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  const d = `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return Number.isNaN(Date.parse(d)) ? '' : d;
}
const cuoiThangTruoc = () => { const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth(), 0); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const laiLo = (a: string) => /^[5-8]/.test(a) || a.startsWith('911');
const tien = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

const SO_DU: NhapLoai = {
  id: 'so-du-tai-khoan', nhom: 'Số dư ban đầu', title: 'Số dư tài khoản đầu kỳ',
  desc: 'Dư Nợ / Dư Có từng tài khoản, công nợ theo đối tượng (131, 331…), theo chi nhánh — mỗi chi nhánh một phiếu số dư', keyField: 'accountCode',
  listPath: '/nghiep-vu/so-du-tai-khoan', invalidate: ['documents', 'document'], modes: false,
  fields: [
    { key: 'branchCode', header: 'Chi nhánh', required: true, aliases: ['ma chi nhanh', 'don vi'], example: '00000', note: 'Mã chi nhánh trong sơ đồ tổ chức. Mỗi chi nhánh thành một phiếu số dư.' },
    { key: 'docDate', header: 'Ngày chốt số dư', required: true, aliases: ['ngay', 'ngay so du', 'ngay chung tu', 'ngay hach toan'], defaultValue: cuoiThangTruoc(), note: 'dd/mm/yyyy — thường là ngày cuối kỳ trước khi bắt đầu dùng phần mềm.' },
    { key: 'accountCode', header: 'Tài khoản', required: true, aliases: ['so hieu tai khoan', 'tk', 'ma tai khoan', 'tai khoan chi tiet'], example: '1111', note: 'Tài khoản chi tiết (ghi sổ được). Doanh thu, chi phí (loại 5–8) và 911 không có số dư: lãi lỗ luỹ kế ghi vào 4212 / 4211.' },
    { key: 'partnerCode', header: 'Mã đối tượng', aliases: ['doi tuong', 'ma khach hang', 'ma nha cung cap', 'ma kh', 'ma ncc', 'ma doi tuong'], note: 'Bắt buộc với tài khoản theo dõi đối tượng (131, 331, 141…).' },
    { key: 'debit', header: 'Dư Nợ', aliases: ['du no', 'so du no', 'no'], example: '10.000.000', note: 'Mỗi dòng ghi Dư Nợ hoặc Dư Có.' },
    { key: 'credit', header: 'Dư Có', aliases: ['du co', 'so du co', 'co'] },
    { key: 'balancingAccount', header: 'TK cân đối', aliases: ['tai khoan can doi', 'tk chenh lech'], note: 'Để trống: tổng Dư Nợ phải bằng tổng Dư Có của chi nhánh. Ghi tài khoản (vd 4211) để nhận phần chênh lệch.' },
  ],
  run: async (rows, { dryRun }) => {
    const [accounts, branches, docs] = await Promise.all([
      api.get<{ code: string; name: string; isPosting?: boolean; trackPartner?: boolean; isDebt?: boolean }[]>('/api/v1/accounts', { postingOnly: true }),
      api.get<{ code: string; isActive: boolean }[]>('/api/v1/branches'),
      api.get<{ docNo: string; branchCode: string; status: string }[]>('/api/v1/documents', { docType: 'opening', pageSize: 1000 }),
    ]);
    const acc = new Map(accounts.map((a) => [a.code, a]));
    const brs = new Set(branches.map((b) => b.code));
    const daCo = new Map(docs.filter((d) => d.status !== 'cancelled').map((d) => [d.branchCode, d.docNo]));
    const codes = [...new Set(rows.map((r) => (r.partnerCode ?? '').trim()).filter(Boolean))];
    const ex = codes.length ? await api.post<{ missing: string[] }>('/api/v1/partners/exists', { codes }) : { missing: [] };
    const thieuDT = new Set(ex.missing);

    const out: (NhapDong & { g: string; debit: number; credit: number; bal: string })[] = rows.map((r) => {
      const row = Number(r._row);
      const errors: string[] = [];
      const branchCode = (r.branchCode ?? '').trim();
      const date = ngay(r.docDate);
      const a = (r.accountCode ?? '').trim();
      const p = (r.partnerCode ?? '').trim();
      const debit = soTien(r.debit);
      const credit = soTien(r.credit);
      const bal = (r.balancingAccount ?? '').trim();
      if (!branchCode) errors.push('Thiếu chi nhánh'); else if (!brs.has(branchCode)) errors.push(`Chi nhánh "${branchCode}" chưa có`);
      if (!date) errors.push(`Ngày chốt số dư "${r.docDate ?? ''}" không đọc được (dd/mm/yyyy)`);
      const info = acc.get(a);
      if (!a) errors.push('Thiếu tài khoản');
      else if (!info) errors.push(`Tài khoản ${a} chưa có hoặc là tài khoản tổng hợp (cần tài khoản chi tiết)`);
      else if (laiLo(a)) errors.push(`Tài khoản ${a} là doanh thu / chi phí / xác định kết quả, không có số dư đầu kỳ (ghi lãi lỗ luỹ kế vào 4212 hoặc 4211)`);
      if (info && (info.trackPartner || info.isDebt) && !p) errors.push(`Tài khoản ${a} theo dõi đối tượng: cần Mã đối tượng`);
      if (p && thieuDT.has(p)) errors.push(`Đối tượng ${p} chưa có — nhập danh mục khách hàng / NCC trước`);
      if (Number.isNaN(debit) || Number.isNaN(credit)) errors.push('Số tiền không đọc được');
      else if (debit < 0 || credit < 0) errors.push('Số tiền âm: ghi sang cột bên kia');
      else if ((debit > 0) === (credit > 0)) errors.push('Mỗi dòng ghi Dư Nợ hoặc Dư Có (không cả hai, không để trống cả hai)');
      if (bal && (!acc.has(bal) || laiLo(bal))) errors.push(`TK cân đối ${bal} không dùng được (cần tài khoản chi tiết, không phải doanh thu / chi phí)`);
      return { row, key: `${branchCode} · ${a}${p ? ` · ${p}` : ''}`, action: errors.length ? 'error' : 'create', errors, g: `${branchCode}|${date}`, debit: debit || 0, credit: credit || 0, bal,
        values: { branchCode, docDate: r.docDate, accountCode: a, partnerCode: p, debit: debit ? tien(debit) : '', credit: credit ? tien(credit) : '', balancingAccount: bal } };
    });

    // Kiểm theo phiếu (chi nhánh + ngày): đã có phiếu số dư, cân Nợ – Có.
    const nhom = new Map<string, typeof out>();
    for (const r of out) nhom.set(r.g, [...(nhom.get(r.g) ?? []), r]);
    for (const [g, list] of nhom) {
      const [branchCode] = g.split('|');
      const loiNhom: string[] = [];
      if (branchCode && daCo.has(branchCode)) loiNhom.push(`Chi nhánh ${branchCode} đã có phiếu số dư ${daCo.get(branchCode)} — sửa phiếu đó, hoặc huỷ trước khi nhập lại`);
      const ngays = new Set(out.filter((r) => r.g.startsWith(`${branchCode}|`)).map((r) => r.g));
      if (ngays.size > 1) loiNhom.push(`Chi nhánh ${branchCode} có nhiều ngày chốt số dư trong tệp — mỗi chi nhánh một ngày`);
      const no = list.reduce((s, r) => s + r.debit, 0);
      const co = list.reduce((s, r) => s + r.credit, 0);
      const bal = list.find((r) => r.bal)?.bal;
      if (Math.abs(no - co) >= 0.005 && !bal) loiNhom.push(`Chi nhánh ${branchCode}: tổng Dư Nợ ${tien(no)} ≠ tổng Dư Có ${tien(co)} (lệch ${tien(Math.abs(no - co))}) — sửa số hoặc ghi cột TK cân đối`);
      if (loiNhom.length) for (const r of list) { r.errors.push(...loiNhom.filter((e) => !r.errors.includes(e))); r.action = 'error'; }
    }

    if (!dryRun) {
      for (const [g, list] of nhom) {
        if (list.some((r) => r.action === 'error')) continue; // phiếu của chi nhánh có dòng lỗi: không ghi nửa vời
        const [branchCode, docDate] = g.split('|') as [string, string];
        try {
          await api.post('/api/v1/opening-balances', {
            branchCode, docDate, description: 'Số dư đầu kỳ (nhập Excel)', balancingAccount: list.find((r) => r.bal)?.bal || undefined,
            lines: list.map((r) => ({ accountCode: r.values.accountCode, partnerCode: r.values.partnerCode || undefined, debit: r.debit, credit: r.credit })),
          });
        } catch (e) { for (const r of list) { r.action = 'error'; r.errors.push(e instanceof Error ? e.message : String(e)); } }
      }
    }
    // Phiếu có dòng lỗi thì cả phiếu không ghi: báo rõ ở các dòng còn lại.
    for (const list of nhom.values()) {
      if (!list.some((r) => r.action === 'error')) continue;
      for (const r of list) if (r.action !== 'error') { r.action = 'error'; r.errors.push('Phiếu số dư của chi nhánh này còn dòng lỗi — sửa hết rồi nhập cả phiếu'); }
    }
    const n = (x: NhapDong['action']) => out.filter((r) => r.action === x).length;
    return { created: n('create'), updated: 0, failed: n('error'), rows: out.map(({ g: _g, debit: _d, credit: _c, bal: _b, ...r }) => r) };
  },
};


/* ------------------------------------------------------------------ Tồn kho đầu kỳ / Tồn max (theo kho × mã hàng) */
const homNay = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const soLuong = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 4 });
const khoKey = (kho: string | undefined, sku: string | undefined) => `${(kho ?? '').trim().toUpperCase()}|${(sku ?? '').trim()}`;
const KHO_TRUONG: NhapTruong = { key: 'kho', header: 'Kho', required: true, aliases: ['ma kho', 'kho hang', 'ma chi nhanh', 'chi nhanh', 'cua hang'], example: '00000', note: 'Mã kho trong danh mục kho (DM12); ghi mã chi nhánh thì vào kho mặc định của chi nhánh.' };
const SKU_TRUONG: NhapTruong = { key: 'sku', header: 'Mã hàng', required: true, aliases: ['ma', 'ma vthh', 'ma hang hoa', 'ma san pham', 'sku'], example: 'SP0001', note: 'Mã phải có trong danh mục mặt hàng.' };
const TEN_TRUONG: NhapTruong = { key: 'name', header: 'Tên hàng', aliases: ['ten', 'ten vthh', 'ten hang hoa'], note: 'Chỉ để đối chiếu, không ghi.' };

const TON_KHO: NhapLoai = {
  id: 'ton-kho', nhom: 'Số dư ban đầu', title: 'Tồn kho đầu kỳ (số lượng)',
  desc: 'Số lượng tồn từng mã hàng theo kho — so với tồn trên sổ, mỗi kho một phiếu điều chỉnh (+/−) ghi sổ ngay. Mã không có trong tệp giữ nguyên; nhập lại cả tệp không sinh thêm chênh lệch.', keyField: 'sku',
  listPath: '/bao-cao/nhap-xuat-ton', invalidate: ['documents', 'inventory'], modes: false,
  fields: [
    { key: 'docDate', header: 'Ngày cân tồn', required: true, aliases: ['ngay', 'ngay chung tu', 'ngay ton', 'ngay kiem ke'], defaultValue: homNay(), note: 'dd/mm/yyyy — ngày ghi phiếu điều chỉnh. Cả tệp một ngày.' },
    KHO_TRUONG, SKU_TRUONG, TEN_TRUONG,
    { key: 'qty', header: 'Số lượng tồn', required: true, aliases: ['so luong', 'sl', 'ton', 'ton cuoi', 'sl ton', 'so luong ton', 'ton cuoi ky', 'so luong ton cuoi'], example: '120', note: 'Theo ĐVT nhỏ nhất của mặt hàng. Dòng trùng kho × mã được cộng dồn. Kết quả hiện: tồn trên sổ → tồn theo tệp.' },
  ],
  run: async (rows, { dryRun }) => {
    const dates = new Set(rows.map((r) => ngay(r.docDate)));
    const docDate = [...dates][0] ?? '';
    const loiChung = !docDate ? `Ngày cân tồn "${rows[0]?.docDate ?? ''}" không đọc được (dd/mm/yyyy)` : dates.size > 1 ? 'Tệp có nhiều ngày cân tồn — cả tệp một ngày' : '';
    const loiDong = new Map<number, string[]>();
    const gui: { row: number; kho: string; sku: string; name: string; qty: number }[] = [];
    for (const r of rows) {
      const row = Number(r._row); const e: string[] = [];
      const q = soTien(r.qty);
      if (!(r.kho ?? '').trim()) e.push('Thiếu kho');
      if (!(r.sku ?? '').trim()) e.push('Thiếu mã hàng');
      if (Number.isNaN(q)) e.push(`Số lượng "${r.qty ?? ''}" không đọc được`); else if (q < 0) e.push('Số lượng tồn âm');
      if (loiChung) e.push(loiChung);
      if (e.length) loiDong.set(row, e); else gui.push({ row, kho: (r.kho ?? '').trim(), sku: (r.sku ?? '').trim(), name: (r.name ?? '').trim(), qty: q });
    }
    type Recon = { kho: string; sku: string; name: string; fileQty: number | null; bookQty: number; status: 'up' | 'down' | 'same' | 'error'; error?: string; warehouseCode: string };
    const body = { rows: gui, zeroMissing: false, docDate: docDate || '2000-01-01' };
    const pv = gui.length ? await api.post<{ rows: Recon[] }>('/api/v1/stock/init/reconcile/preview', body) : { rows: [] as Recon[] };
    const theo = new Map(pv.rows.map((x) => [khoKey(x.kho, x.sku), x]));
    let ghiLoi = '';
    let phieu: { docNo: string; warehouseCode: string }[] = [];
    // Dòng lỗi bỏ qua (máy chủ chỉ ghi dòng có chênh lệch); nhập lại cả tệp không sinh thêm chênh lệch.
    if (!dryRun && pv.rows.some((x) => x.status === 'up' || x.status === 'down')) {
      try { phieu = (await api.post<{ created: { docNo: string; warehouseCode: string }[] }>('/api/v1/stock/init/reconcile/import', body)).created; } catch (e) { ghiLoi = e instanceof Error ? e.message : String(e); }
    }
    const out: NhapDong[] = rows.map((r) => {
      const row = Number(r._row);
      const x = theo.get(khoKey(r.kho, r.sku));
      const errors = loiDong.get(row) ?? (x?.status === 'error' ? [x.error ?? 'Lỗi'] : !x ? ['Không kiểm được dòng này'] : []);
      if (!errors.length && ghiLoi) errors.push(ghiLoi);
      const doc = x && !errors.length && x.status !== 'same' ? phieu.find((p) => p.warehouseCode === x.warehouseCode)?.docNo : undefined;
      return { row, key: (r.sku ?? '').trim(), action: errors.length ? 'error' : 'update', errors,
        values: { ...r, name: x?.name || r.name, qty: x?.fileQty != null ? soLuong(x.fileQty) : r.qty, ...(doc ? { kho: `${r.kho} (${doc})` } : {}) },
        before: x && x.status !== 'error' ? { qty: soLuong(x.bookQty) } : undefined };
    });
    const n = (a: NhapDong['action']) => out.filter((r) => r.action === a).length;
    return { created: 0, updated: n('update'), failed: n('error'), rows: out };
  },
};

const TON_MAX: NhapLoai = {
  id: 'ton-max', nhom: 'Số dư ban đầu', title: 'Tồn max theo kho',
  desc: 'Mức tồn tối đa từng mã hàng ở từng kho — dùng tính chuyển hàng về shop và đề xuất đặt mua', keyField: 'sku',
  listPath: '/mua-hang/ton-max', invalidate: ['ton-max'], modes: false,
  fields: [KHO_TRUONG, SKU_TRUONG, TEN_TRUONG,
    { key: 'max', header: 'Tồn max', required: true, aliases: ['ton toi da', 'max', 'muc ton toi da', 'sl max'], example: '50', note: 'Theo ĐVT nhỏ nhất. Ghi 0 = không giữ hàng ở kho này.' }],
  run: async (rows, { dryRun }) => {
    const loiDong = new Map<number, string[]>();
    const gui: { row: number; kho: string; sku: string; name: string; max: number }[] = [];
    for (const r of rows) {
      const row = Number(r._row); const e: string[] = [];
      const m = soTien(r.max);
      if (!(r.kho ?? '').trim()) e.push('Thiếu kho');
      if (!(r.sku ?? '').trim()) e.push('Thiếu mã hàng');
      if (Number.isNaN(m)) e.push(`Tồn max "${r.max ?? ''}" không đọc được`); else if (m < 0) e.push('Tồn max âm');
      if (e.length) loiDong.set(row, e); else gui.push({ row, kho: (r.kho ?? '').trim(), sku: (r.sku ?? '').trim(), name: (r.name ?? '').trim(), max: m });
    }
    type Pv = { kho: string; sku: string; name: string; max: number; oldMax: number | null; status: 'new' | 'update' | 'same' | 'error'; error?: string };
    const pv = gui.length ? await api.post<{ rows: Pv[] }>('/api/v1/stock/init/max/preview', { rows: gui }) : { rows: [] as Pv[] };
    let ghiLoi = '';
    if (!dryRun && gui.length) { try { await api.post('/api/v1/stock/init/max/import', { rows: gui }); } catch (e) { ghiLoi = e instanceof Error ? e.message : String(e); } }
    const theo = new Map(pv.rows.map((x) => [khoKey(x.kho, x.sku), x]));
    const out: NhapDong[] = rows.map((r) => {
      const row = Number(r._row);
      const x = theo.get(khoKey(r.kho, r.sku));
      const errors = loiDong.get(row) ?? (x?.status === 'error' ? [x.error ?? 'Lỗi'] : !x ? ['Không kiểm được dòng này'] : ghiLoi ? [ghiLoi] : []);
      return { row, key: (r.sku ?? '').trim(), action: errors.length ? 'error' : x?.status === 'new' ? 'create' : 'update', errors,
        values: { ...r, name: x?.name || r.name, max: x ? soLuong(x.max) : r.max }, before: x?.oldMax != null ? { max: soLuong(x.oldMax) } : undefined };
    });
    const n = (a: NhapDong['action']) => out.filter((r) => r.action === a).length;
    return { created: n('create'), updated: n('update'), failed: n('error'), rows: out };
  },
};

/* ------------------------------------------------------------------ Phiếu thu / chi / báo có / báo nợ / phiếu kế toán */
type LoaiPhieu = 'receipt' | 'payment' | 'bank_receipt' | 'bank_payment' | 'manual';
const PHIEU: Record<LoaiPhieu, { id: string; title: string; path: string; nguoi: string; no?: string; co?: string; dg: string }> = {
  receipt: { id: 'phieu-thu', title: 'Phiếu thu', path: '/nghiep-vu/phieu-thu', nguoi: 'Người nộp', no: '1111', dg: 'Thu tiền' },
  payment: { id: 'phieu-chi', title: 'Phiếu chi', path: '/nghiep-vu/phieu-chi', nguoi: 'Người nhận', co: '1111', dg: 'Chi tiền' },
  bank_receipt: { id: 'bao-co', title: 'Thu tiền gửi', path: '/nghiep-vu/phieu-bao-co', nguoi: 'Người nộp', dg: 'Thu tiền gửi' },
  bank_payment: { id: 'bao-no', title: 'Chi tiền gửi', path: '/nghiep-vu/phieu-bao-no', nguoi: 'Người nhận', dg: 'Chi tiền gửi' },
  manual: { id: 'phieu-ke-toan', title: 'Chứng từ nghiệp vụ khác', path: '/nghiep-vu/phieu-ke-toan', nguoi: 'Người liên quan', dg: 'Hạch toán' },
};
const phieuTien = (docType: LoaiPhieu): NhapLoai => {
  const m = PHIEU[docType];
  return {
    id: m.id, nhom: 'Chứng từ', title: m.title, keyField: 'docNo', listPath: m.path, invalidate: ['documents', 'document'], modes: false,
    desc: 'Mỗi số chứng từ một phiếu (nhiều dòng TK Nợ / TK Có / số tiền); vào ở trạng thái chờ duyệt, duyệt ở danh sách để ghi sổ',
    fields: [
      { key: 'docNo', header: 'Số chứng từ', aliases: ['so phieu', 'so ct', 'so chung tu (*)'], note: 'Các dòng cùng số = một phiếu nhiều dòng. Để trống: mỗi dòng một phiếu, phần mềm tự cấp số.' },
      { key: 'docDate', header: 'Ngày chứng từ', required: true, aliases: ['ngay', 'ngay hach toan', 'ngay ct'], example: '20/10/2026', note: 'dd/mm/yyyy.' },
      { key: 'branchCode', header: 'Chi nhánh', required: true, aliases: ['ma chi nhanh', 'don vi'], example: '00000' },
      { key: 'description', header: 'Diễn giải', aliases: ['ly do thu', 'ly do chi', 'noi dung', 'dien giai chung'], defaultValue: m.dg, note: 'Diễn giải chung của phiếu.' },
      { key: 'partnerCode', header: 'Mã đối tượng', aliases: ['doi tuong', 'ma khach hang', 'ma nha cung cap', 'ma kh', 'ma ncc'], note: 'Bắt buộc khi dòng dùng tài khoản theo dõi đối tượng (131, 331, 141…).' },
      { key: 'counterparty', header: m.nguoi, aliases: ['nguoi nop', 'nguoi nhan', 'nguoi nop tien', 'nguoi nhan tien', 'ho ten'] },
      { key: 'reasonCode', header: 'Lý do', aliases: ['ma ly do'] },
      { key: 'employeeCode', header: 'Nhân viên', aliases: ['ma nhan vien', 'nv'] },
      { key: 'lineDescription', header: 'Diễn giải dòng', aliases: ['dien giai chi tiet', 'noi dung dong'] },
      { key: 'debitAccount', header: 'TK Nợ', required: true, aliases: ['tai khoan no', 'tk no'], defaultValue: m.no, example: m.no ?? '1121' },
      { key: 'creditAccount', header: 'TK Có', required: true, aliases: ['tai khoan co', 'tk co'], defaultValue: m.co, example: m.co ?? '1311' },
      { key: 'amount', header: 'Số tiền', required: true, aliases: ['so tien', 'thanh tien', 'so tien quy doi'], example: '1.000.000' },
      { key: 'costItem', header: 'Khoản mục', aliases: ['khoan muc chi phi', 'ma khoan muc'] },
      { key: 'department', header: 'Bộ phận', aliases: ['ma bo phan', 'phong ban'] },
    ],
    run: async (rows, { dryRun }) => {
      // Gom dòng theo số chứng từ; số trống = mỗi dòng một phiếu.
      const nhom = new Map<string, Record<string, string>[]>();
      for (const r of rows) { const k = (r.docNo ?? '').trim() || `#${r._row}`; nhom.set(k, [...(nhom.get(k) ?? []), r]); }
      const loiTruoc = new Map<number, string[]>();
      const vouchers: { rows: number[]; voucher: unknown }[] = [];
      for (const [k, list] of nhom) {
        const h = list[0]!;
        const loi: string[] = [];
        const date = ngay(h.docDate);
        if (!date) loi.push(`Ngày chứng từ "${h.docDate ?? ''}" không đọc được (dd/mm/yyyy)`);
        if (list.some((r) => ngay(r.docDate) !== date || (r.branchCode ?? '').trim() !== (h.branchCode ?? '').trim())) loi.push(`Các dòng của phiếu ${k} khác ngày hoặc khác chi nhánh`);
        const lines = list.map((r) => {
          const so = soTien(r.amount);
          if (Number.isNaN(so) || so <= 0) loi.push(`Dòng ${r._row}: số tiền "${r.amount ?? ''}" phải là số lớn hơn 0`);
          return { debitAccount: (r.debitAccount ?? '').trim(), creditAccount: (r.creditAccount ?? '').trim(), amount: so, description: (r.lineDescription ?? '').trim() || (r.description ?? '').trim(),
            ...(r.costItem?.trim() ? { costItem: r.costItem.trim() } : {}), ...(r.department?.trim() ? { department: r.department.trim() } : {}) };
        });
        const nums = list.map((r) => Number(r._row));
        if (loi.length) { for (const n of nums) loiTruoc.set(n, loi); continue; }
        vouchers.push({ rows: nums, voucher: {
          docType, branchCode: (h.branchCode ?? '').trim(), docDate: date, ...(k.startsWith('#') ? {} : { docNo: k }),
          description: (h.description ?? '').trim() || m.dg, counterparty: (h.counterparty ?? '').trim(),
          ...(h.partnerCode?.trim() ? { partnerCode: h.partnerCode.trim() } : {}), ...(h.reasonCode?.trim() ? { reasonCode: h.reasonCode.trim() } : {}),
          ...(h.employeeCode?.trim() ? { employeeCode: h.employeeCode.trim() } : {}), lines,
        } });
      }
      const kq = vouchers.length ? await api.post<{ vouchers: { rows: number[]; ok: boolean; docNo?: string; error?: string }[] }>('/api/v1/vouchers/import', { dryRun, vouchers }) : { vouchers: [] };
      const theoDong = new Map<number, { ok: boolean; docNo?: string; error?: string }>();
      for (const v of kq.vouchers) for (const n of v.rows) theoDong.set(n, v);
      const out: NhapDong[] = rows.map((r) => {
        const row = Number(r._row);
        const v = theoDong.get(row);
        const errors = loiTruoc.get(row) ?? (v && !v.ok ? [v.error ?? 'Lỗi'] : []);
        const so = soTien(r.amount);
        return { row, key: v?.docNo || (r.docNo ?? ''), action: errors.length ? 'error' : 'create', errors,
          values: { ...r, docNo: v?.docNo || r.docNo || (errors.length ? '' : '(tự cấp)'), amount: Number.isNaN(so) ? r.amount : tien(so) } };
      });
      const n = (x: NhapDong['action']) => out.filter((r) => r.action === x).length;
      return { created: n('create'), updated: 0, failed: n('error'), rows: out };
    },
  };
};

export const NHAP_LOAI: NhapLoai[] = [doiTuong('customer'), doiTuong('supplier'), MAT_HANG, NHOM_HANG, KHO, TAI_KHOAN, SO_DU, TON_KHO, TON_MAX, ...(['receipt', 'payment', 'bank_receipt', 'bank_payment', 'manual'] as const).map(phieuTien)];
/** Loại nhập của một loại phiếu tiền / phiếu kế toán (nút Nhập Excel ở danh sách phiếu). */
export const nhapPhieu = (docType: string) => NHAP_LOAI.find((l) => l.id === PHIEU[docType as LoaiPhieu]?.id);
export const nhapLoai = (id: string) => NHAP_LOAI.find((l) => l.id === id);
