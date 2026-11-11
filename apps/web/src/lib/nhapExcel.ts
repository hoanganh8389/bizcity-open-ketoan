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
  id: 'mat-hang', nhom: 'Danh mục', title: 'Mặt hàng', desc: 'Mã, tên, ĐVT, nhóm / ngành / nhãn / loại hàng, nhóm hạch toán, thuế VAT', keyField: 'sku',
  listPath: '/danh-muc/mat-hang', invalidate: ['products', 'inventory-items'], modes: false,
  fields: [
    { key: 'sku', header: 'Mã hàng', required: true, aliases: ['ma', 'ma vthh', 'ma hang hoa', 'ma san pham', 'sku', 'ma hang hoa, dich vu'], example: 'SP0001', note: 'Mã đã có → cập nhật; chưa có → thêm mới. Không có khoảng trắng.' },
    { key: 'name', header: 'Tên hàng', required: 'moi', aliases: ['ten', 'ten vthh', 'ten hang hoa', 'ten san pham', 'ten hang hoa, dich vu'], example: 'Sữa bột mẫu 400g' },
    { key: 'unit', header: 'ĐVT', required: 'moi', aliases: ['don vi tinh', 'dvt chinh', 'don vi', 'don vi tinh chinh'], example: 'Hộp', note: 'Mặt hàng đã có: ĐVT không đổi qua Excel (đổi ở form mặt hàng).' },
    { key: 'groupCode', header: 'Nhóm hàng', aliases: ['nhom', 'nhom vthh', 'ma nhom', 'ma nhom vthh', 'nhom vat tu, hang hoa'], note: 'Mã hoặc đúng tên nhóm trong danh mục.' },
    { key: 'industryCode', header: 'Ngành hàng', aliases: ['nganh'] },
    { key: 'brandCode', header: 'Nhãn hàng', aliases: ['nhan', 'thuong hieu'] },
    { key: 'typeCode', header: 'Loại hàng', aliases: ['tinh chat', 'loai'] },
    { key: 'postingGroupCode', header: 'Nhóm hạch toán', aliases: ['nhom hach toan'] },
    { key: 'taxOutCode', header: 'Mã VAT ra', aliases: ['thue suat', 'thue gtgt', 'vat ra'], note: 'Mã thuế bán ra có sẵn (vd R08).' },
    { key: 'taxInCode', header: 'Mã VAT vào', aliases: ['vat vao'], note: 'Mã thuế mua vào có sẵn (vd V08).' },
    { key: 'note', header: 'Ghi chú', aliases: ['dien giai', 'mo ta'] },
    { key: 'isActive', header: 'Theo dõi', aliases: ['trang thai', 'dang theo doi'], note: 'Có / Không. Trống = giữ nguyên (mới: Có).' },
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
    listPath: kh ? '/danh-muc/doi-tuong' : '/mua-hang/nha-cung-cap', invalidate: ['partners'],
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

export const NHAP_LOAI: NhapLoai[] = [doiTuong('customer'), doiTuong('supplier'), MAT_HANG, KHO];
export const nhapLoai = (id: string) => NHAP_LOAI.find((l) => l.id === id);
