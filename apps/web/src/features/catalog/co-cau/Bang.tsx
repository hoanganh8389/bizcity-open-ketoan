// [2026-11-20 Nguyễn Văn Thủy] Cơ cấu tổ chức (DM16) — Bảng dùng chung (DataGrid: lọc từng cột, ẩn / hiện cột, Xuất Excel, không phân trang) + bộ cột đơn vị / phân kho / bộ phận. (đóng góp)
import { useMemo, useState, type ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { DataGrid, type Column } from '@/components/DataGrid';
import { type BoPhan, type CC, type DonVi, type PhanKho, TrangThai, duongCua, duongTen, iconDonVi, ngung, tenCap, tenDonVi } from './du-lieu';

/* ------------------------------------------------------------------ bảng dùng chung (DataGrid: lọc từng cột, ẩn / hiện cột, Xuất Excel, không phân trang) */

export const luc = (d?: string | null) => (d ? new Date(d).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
export type Dau = { createdBy?: string; createdAt?: string | null; updatedBy?: string; updatedAt?: string | null };
export type Hang = { code: string; name: string; isActive: boolean } & Dau;
/** Một cột: k = khoá, v = giá trị để lọc / sắp xếp / xuất Excel, gt = cách hiện (bỏ trống thì hiện v). */
export interface Cot<T> { k: string; ten: string; w?: number; v: (x: T) => string | number; gt?: (x: T) => ReactNode; an?: boolean }
export function Bang<T extends Hang>({ rows, cot, onMo, onSua, onXoa, rong, them, khoa, tenXuat }: { rows: T[]; cot: Cot<T>[]; onMo?: (x: T) => void; onSua?: (x: T) => void; onXoa?: (x: T) => void; rong: ReactNode; them?: ReactNode; khoa: string; tenXuat: string }) {
  const [tt, setTt] = useState<'' | 'dung' | 'ngung'>('dung');
  const list = useMemo(() => rows.filter((x) => !tt || (tt === 'dung' ? !ngung(x) : ngung(x))), [rows, tt]);
  const columns: Column<T>[] = [
    ...cot.map((c): Column<T> => ({ key: c.k, header: c.ten, title: c.ten, width: c.w, value: c.v, render: c.gt, hidden: c.an })),
    { key: 'trangThai', header: 'Trạng thái', width: 130, value: (x) => (ngung(x) ? 'Ngừng hoạt động' : 'Đang hoạt động'), render: (x) => <TrangThai x={x} /> },
    { key: 'createdBy', header: 'Người tạo', width: 140, hidden: true, value: (x) => x.createdBy ?? '' },
    { key: 'createdAt', header: 'Ngày tạo', width: 130, hidden: true, value: (x) => x.createdAt ?? '', render: (x) => luc(x.createdAt) },
    { key: 'updatedBy', header: 'Người sửa', width: 140, hidden: true, value: (x) => x.updatedBy ?? '' },
    { key: 'updatedAt', header: 'Ngày sửa', width: 130, hidden: true, value: (x) => x.updatedAt ?? '', render: (x) => luc(x.updatedAt) },
    ...(onSua || onXoa ? [{ key: '_thaoTac', header: 'Thao tác', width: 80, noFilter: true, noSort: true, noExport: true, value: () => '',
      render: (x: T) => <>{onSua && <button type="button" className="ccm-nut-ic" title="Sửa" onClick={(e) => { e.stopPropagation(); onSua(x); }}><Pencil size={15} /></button>}{onXoa && <button type="button" className="ccm-nut-ic do" title="Xoá vĩnh viễn" onClick={(e) => { e.stopPropagation(); onXoa(x); }}><Trash2 size={15} /></button>}</> } as Column<T>] : []),
  ];
  return (
    <>
      <div className="ccm-ds-loc">
        <select className="input" value={tt} onChange={(e) => setTt(e.target.value as typeof tt)} title="Lọc trạng thái"><option value="dung">Đang hoạt động</option><option value="ngung">Ngừng hoạt động</option><option value="">Tất cả trạng thái</option></select>
        {them && <span className="ccm-ds-them">{them}</span>}
      </div>
      {!rows.length ? <div className="ccm-rong">{rong}</div>
        : <DataGrid rows={list} columns={columns} rowKey={(x) => x.code} storageKey={khoa} exportName={tenXuat} onRowDoubleClick={onMo} footerLabel={false} emptyText="Không có dòng nào khớp" maxHeight="calc(100vh - 330px)" />}
    </>
  );
}

/** Đường dẫn theo tên: Công ty TGS / Miền Bắc / Chi nhánh Phú Thọ. */


export function cotDonVi(cc: CC, o: { duong?: boolean; cap?: boolean }): Cot<DonVi>[] {
  return [
    { k: 'code', ten: 'Mã', w: 120, v: (x) => x.code, gt: (x) => <span className="mono">{x.code}</span> },
    { k: 'name', ten: 'Tên', w: 240, v: (x) => x.name, gt: (x) => <><span className="ccm-cay-ic nho">{iconDonVi(x, !!cc.kids.get(x.code)?.length)}</span> {x.name}</> },
    { k: 'levelLabel', ten: 'Tên gọi cấp', w: 120, v: (x) => x.levelLabel || '', gt: tenCap },
    { k: 'level', ten: 'Cấp', w: 60, v: (x) => x.level, an: !o.cap },
    { k: 'path', ten: 'Đường dẫn', w: 340, v: (x) => duongTen(cc, x), gt: (x) => <span className="muted">{duongTen(cc, x)}</span>, an: !o.duong },
    { k: 'taxUsed', ten: 'MST dùng', w: 150, v: (x) => x.taxUsed, gt: (x) => <span className="mono">{x.taxUsed}{x.taxFrom && <span className="muted" title={`Kế thừa từ ${x.taxFrom}`}> ↑</span>}</span> },
    { k: 'companyName', ten: 'Tên in chứng từ', w: 220, v: (x) => x.companyName, an: true },
    { k: 'address', ten: 'Địa chỉ', w: 220, v: (x) => x.address, an: true },
    { k: 'phone', ten: 'Điện thoại', w: 110, v: (x) => x.phone, an: true },
    { k: 'kho', ten: 'Số phân kho', w: 90, v: (x) => (cc.khoCua.get(x.code) ?? []).filter((w) => !ngung(w)).length },
    { k: 'note', ten: 'Ghi chú', w: 200, v: (x) => x.note, an: true },
  ];
}
export function cotKho(cc: CC, thuoc: boolean): Cot<PhanKho>[] {
  return [
    { k: 'code', ten: 'Mã phân kho', w: 130, v: (x) => x.code, gt: (x) => <span className="mono">{x.code}</span> },
    { k: 'name', ten: 'Tên phân kho', w: 240, v: (x) => x.name, gt: (x) => <>{x.name}{x.isDefault && <span className="ccm-mac-dinh">Mặc định</span>}</> },
    { k: 'branch', ten: 'Thuộc đơn vị', w: 240, v: (x) => tenDonVi(cc, x.branchCode), an: !thuoc },
    { k: 'path', ten: 'Đường dẫn', w: 340, v: (x) => duongCua(cc, x.branchCode), gt: (x) => <span className="muted">{duongCua(cc, x.branchCode)}</span>, an: !thuoc },
    { k: 'type', ten: 'Loại kho', w: 170, v: (x) => x.typeName || x.typeCode },
    { k: 'address', ten: 'Địa chỉ', w: 220, v: (x) => x.address ?? '', an: true },
    { k: 'note', ten: 'Ghi chú', w: 200, v: (x) => x.note ?? '', an: true },
  ];
}
export function cotBoPhan(cc: CC, thuoc: boolean): Cot<BoPhan>[] {
  return [
    { k: 'code', ten: 'Mã bộ phận', w: 140, v: (x) => x.code, gt: (x) => <span className="mono">{x.code}</span> },
    { k: 'name', ten: 'Tên bộ phận', w: 260, v: (x) => x.name, gt: (x) => <span style={{ paddingLeft: cc.bpSau(x) * 18 }}>{cc.bpSau(x) > 0 && <span className="muted">└ </span>}{x.name}{cc.byCode.get(x.branchCode ?? '')?.departmentCode === x.code && <span className="ccm-mac-dinh">Mặc định</span>}</span> },
    { k: 'parent', ten: 'Bộ phận cha', w: 200, v: (x) => { const p = cc.chaBp(x); return p ? `${p.name} (${p.code})` : ''; } },
    { k: 'branch', ten: 'Thuộc đơn vị', w: 240, v: (x) => tenDonVi(cc, x.branchCode), gt: (x) => tenDonVi(cc, x.branchCode) || <span className="muted">Chưa gắn đơn vị</span>, an: !thuoc },
    { k: 'path', ten: 'Đường dẫn', w: 340, v: (x) => duongCua(cc, x.branchCode), gt: (x) => <span className="muted">{duongCua(cc, x.branchCode)}</span>, an: !thuoc },
    { k: 'note', ten: 'Ghi chú', w: 200, v: (x) => x.note ?? '', an: true },
  ];
}
