/**
 * Lưới giá của MỘT bảng giá (DM14, phần dưới): mọi mặt hàng × đơn vị tính, sửa giá ngay trên ô rồi bấm "Ghi giá".
 *   - Cột "Giá công ty" để so (bảng giá chi nhánh); hàng chính chỉ bán theo giá công ty nên ô giá chi nhánh của hàng chính
 *     tô mờ (khai cũng không dùng).
 *   - Lọc nhanh: chỉ ô đã có giá / chỉ ô còn trống / chỉ ô đang sửa; lọc, sắp xếp, xuất Excel theo cột như mọi lưới.
 *   - Bấm đúp một dòng: mở form mặt hàng (khai thêm đơn vị tính, cờ…).
 * API: GET /api/v1/catalog/price-lists/:code/rows · PUT /api/v1/catalog/price-lists/:code/prices
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ProductFullForm } from './ProductFullForm';
import { pathOf, useClasses } from './ProductsPage';

interface Row {
  sku: string; name: string; groupCode: string | null; isMain: boolean; isActive: boolean; noSale: boolean;
  unit: string; ratio: number; isDefault: boolean; price: number | null; isDefaultUnit: boolean; companyPrice: number | null;
}
interface RowsResponse { code: string; isCompany: boolean; companyCode: string | null; rows: Row[] }
type Show = 'all' | 'priced' | 'empty' | 'dirty';
interface NhapGia { ten: string; loi: string[]; doi: { sku: string; unit: string; name: string; cu: number | null; moi: number }[]; giu: number }

const keyOf = (r: { sku: string; unit: string }) => `${r.sku}|${r.unit}`;
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString('vi-VN'));
const parseNum = (s: string): number | null => {
  const t = s.replace(/\./g, '').replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function PriceRowsPanel({ code, name, canWrite }: { code: string; name: string; canWrite: boolean }) {
  const qc = useQueryClient();
  const [dirty, setDirty] = useState<Map<string, number | null>>(new Map());
  // [2026-11-17 11:48 AM kiennt] DM14 — ô giá chỉ xem; bấm Sửa giá mới sửa, Ghi giá lưu rồi quay về xem (đóng góp)
  const [dangSua, setDangSua] = useState(false);
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<string | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [nhap, setNhap] = useState<NhapGia | null>(null);
  /** Đọc tệp giá: dòng tiêu đề có "Mã hàng"; cột ĐVT, Đơn giá (hoặc Giá / Giá bán). Ô giá trống bỏ qua. */
  const docTep = async (file: File) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: true, defval: '' });
    const fold = (x: unknown) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[()*:.]/g, ' ').replace(/\s+/g, ' ').trim();
    const hi = aoa.findIndex((r) => r.some((c) => fold(c) === 'ma hang'));
    if (hi < 0) { setNhap({ ten: file.name, loi: ['Không thấy dòng tiêu đề có cột "Mã hàng" — dùng tệp từ nút Xuất Excel làm mẫu.'], doi: [], giu: 0 }); return; }
    const h = aoa[hi]!.map(fold);
    const cMa = h.indexOf('ma hang'), cDvt = h.indexOf('dvt'), cGia = h.findIndex((x) => ['don gia', 'gia', 'gia ban'].includes(x));
    if (cDvt < 0 || cGia < 0) { setNhap({ ten: file.name, loi: [`Tệp thiếu cột ${cDvt < 0 ? '"ĐVT"' : ''} ${cGia < 0 ? '"Đơn giá"' : ''}`.trim()], doi: [], giu: 0 }); return; }
    const coSan = new Map((data?.rows ?? []).map((r) => [keyOf(r).toLowerCase(), r]));
    const loi: string[] = []; const doi: NhapGia['doi'] = []; let giu = 0;
    aoa.slice(hi + 1).forEach((r, i) => {
      const sku = String(r[cMa] ?? '').trim(); const unit = String(r[cDvt] ?? '').trim(); const g = r[cGia];
      if (!sku && !unit) return;
      const dong = hi + i + 2;
      const row = coSan.get(`${sku}|${unit}`.toLowerCase());
      if (!row) { loi.push(`Dòng ${dong}: ${sku} / ${unit} không có trong bảng giá (mã hàng hoặc ĐVT chưa khai ở form mặt hàng)`); return; }
      if (g === '' || g === null || g === undefined) { giu++; return; }
      // [2026-11-17 09:19 PM kiennt] NT-DM-003 — ô giá dạng chữ: "580,000" / "580.000" / "1.250.000" (nhóm 3 số) là phân cách hàng nghìn, không phải phần thập phân (đóng góp)
      const chu = String(g).replace(/\s/g, '');
      const gia = typeof g === 'number' ? g : /^\d{1,3}([.,]\d{3})+$/.test(chu) ? Number(chu.replace(/[.,]/g, '')) : parseNum(chu);
      if (gia === null || !Number.isFinite(gia) || gia < 0) { loi.push(`Dòng ${dong}: ${sku} / ${unit} đơn giá "${String(g)}" không hợp lệ`); return; }
      if (gia === row.price) { giu++; return; }
      doi.push({ sku: row.sku, unit: row.unit, name: row.name, cu: row.price, moi: gia });
    });
    setNhap({ ten: file.name, loi, doi, giu });
  };
  const ghiNhap = useMutation({
    mutationFn: (ds: NhapGia['doi']) => api.put<{ saved: number; removed: number }>(`/api/v1/catalog/price-lists/${encodeURIComponent(code)}/prices`, { rows: ds.map((x) => ({ sku: x.sku, unit: x.unit, price: x.moi })) }),
    onSuccess: () => { setNhap(null); void qc.invalidateQueries({ queryKey: ['price-rows', code] }); void qc.invalidateQueries({ queryKey: ['price-lists'] }); void qc.invalidateQueries({ queryKey: ['catalog-product'] }); },
  });
  const q = useQuery({ queryKey: ['price-rows', code], queryFn: () => api.get<RowsResponse>(`/api/v1/catalog/price-lists/${encodeURIComponent(code)}/rows`) });
  const classes = { brand: useClasses('brand'), industry: useClasses('industry'), group: useClasses('group'), type: useClasses('type') };
  const groupPath = useMemo(() => pathOf(classes.group.data ?? []), [classes.group.data]);

  const data = q.data;
  const priceOf = (r: Row) => (dirty.has(keyOf(r)) ? dirty.get(keyOf(r))! : r.price);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => {
    if (show === 'dirty') return dirty.has(keyOf(r));
    const p = dirty.has(keyOf(r)) ? dirty.get(keyOf(r)) : r.price;
    return show === 'priced' ? p !== null && p !== undefined : show === 'empty' ? p === null || p === undefined : true;
  }), [data, show, dirty]);
  const counts = useMemo(() => {
    const all = data?.rows ?? [];
    return { all: all.length, priced: all.filter((r) => r.price !== null).length, skus: new Set(all.map((r) => r.sku)).size };
  }, [data]);

  const edit = (r: Row, v: number | null) => setDirty((m) => {
    const next = new Map(m);
    if (v === r.price) next.delete(keyOf(r)); else next.set(keyOf(r), v);
    return next;
  });
  const save = useMutation({
    mutationFn: () => api.put<{ saved: number; removed: number }>(`/api/v1/catalog/price-lists/${encodeURIComponent(code)}/prices`, {
      rows: [...dirty.entries()].map(([k, price]) => { const [sku, ...u] = k.split('|'); return { sku, unit: u.join('|'), price }; }),
    }),
    onSuccess: () => {
      setDirty(new Map());
      setDangSua(false);
      void qc.invalidateQueries({ queryKey: ['price-rows', code] });
      void qc.invalidateQueries({ queryKey: ['price-lists'] });
      void qc.invalidateQueries({ queryKey: ['catalog-product'] });
    },
  });
  /** Điền ô trống của các mặt hàng đang hiện theo tỉ lệ, từ ĐVT đã có giá của cùng mặt hàng. */
  const fillByRatio = () => {
    const bySku = new Map<string, Row[]>();
    rows.forEach((r) => bySku.set(r.sku, [...(bySku.get(r.sku) ?? []), r]));
    const next = new Map(dirty);
    let n = 0;
    for (const list of bySku.values()) {
      const known = list.find((r) => (priceOf(r) ?? 0) > 0);
      if (!known) continue;
      const perBase = priceOf(known)! / known.ratio;
      list.forEach((r) => { if (priceOf(r) === null) { next.set(keyOf(r), Math.round(perBase * r.ratio)); n++; } });
    }
    setDirty(next);
    window.alert(n ? `Đã điền ${n} ô theo tỉ lệ — kiểm tra rồi bấm Ghi giá.` : 'Không có ô trống nào điền được (mặt hàng chưa có giá ĐVT nào).');
  };

  const isCompany = data?.isCompany ?? false;
  const columns: Column<Row>[] = [
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 120 },
    { key: 'name', header: 'Tên hàng', width: 300 },
    { key: 'unit', header: 'ĐVT', width: 80 },
    // [2026-11-17 11:44 AM kiennt] DM14 — cột Tỉ lệ đổi tên thành Quy đổi (đóng góp)
    { key: 'ratio', header: 'Quy đổi', type: 'number', width: 80, showZero: true, title: 'Số đơn vị tính nhỏ nhất trong một đơn vị tính này' },
    { key: 'isDefault', header: 'Bán chính', type: 'check', width: 75 },
    ...(!isCompany ? [{ key: 'companyPrice', header: 'Giá công ty', type: 'money', width: 120 } as Column<Row>] : []),
    {
      key: 'price', header: 'Đơn giá', type: 'money', width: 140, value: (r) => priceOf(r),
      render: (r) => canWrite && dangSua ? (
        <input className={`input num ${dirty.has(keyOf(r)) ? 'dirty' : ''}`} style={{ height: 22, width: '100%', background: dirty.has(keyOf(r)) ? 'var(--warn-50, #fff7e0)' : undefined, opacity: !isCompany && r.isMain ? 0.5 : 1 }}
          value={fmt(priceOf(r))} onChange={(e) => edit(r, parseNum(e.target.value))} onDoubleClick={(e) => e.stopPropagation()}
          title={!isCompany && r.isMain ? 'Hàng chính: cửa hàng chỉ bán theo giá công ty, giá chi nhánh không dùng' : undefined} />
      ) : fmt(priceOf(r)),
    },
    { key: 'isMain', header: 'Hàng chính', type: 'check', width: 80 },
    { key: 'group', header: 'Nhóm hàng', width: 260, hidden: true, value: (r) => groupPath(r.groupCode) },
    { key: 'noSale', header: 'Không bán', type: 'check', width: 75, hidden: true },
    { key: 'isActive', header: 'Theo dõi', type: 'check', width: 70, hidden: true },
  ];

  return (
    <div className="card" style={{ marginTop: 10 }}>
      {/* [2026-11-17 11:39 AM kiennt] DM14 — hàng tiêu đề + nút dùng thanh nút danh mục (nút cao 28px, đệm như thanh phía trên) (đóng góp) */}
      <div className="catalog-toolbar canh-phai" style={{ marginBottom: 6 }}>
        {/* [2026-11-17 11:32 AM kiennt] DM14 — tiêu đề gọn, nút lọc thành một nhóm liền; bỏ nút Hướng dẫn thứ hai và dòng nhắc trên lưới (đã ở hướng dẫn) (đóng góp) */}
        <b>{name}</b>
        <span className="muted" style={{ fontSize: 12 }} title={`${counts.skus.toLocaleString('vi-VN')} mã hàng`}>{counts.priced.toLocaleString('vi-VN')}/{counts.all.toLocaleString('vi-VN')} ô có giá</span>
        {/* [2026-11-17 11:54 AM kiennt] DM14 — lọc Tất cả / Đã có giá / Còn trống thành một ô chọn bên trái, tách khỏi nút chức năng (đóng góp) */}
        <select className="select input" style={{ height: 28, width: 'auto', marginLeft: 8 }} value={show} onChange={(e) => setShow(e.target.value as Show)} title="Lọc dòng theo giá">
          <option value="all">Tất cả</option><option value="priced">Đã có giá</option><option value="empty">Còn trống</option>
          {dirty.size > 0 && <option value="dirty">Đang sửa ({dirty.size})</option>}
        </select>
        <span className="spacer" style={{ flex: 1 }} />
        {canWrite && dangSua && <button className="btn btn-sm" onClick={fillByRatio} title="Ô trống của mặt hàng đang hiện = giá ĐVT đã có ÷ tỉ lệ × tỉ lệ cần">Điền theo tỉ lệ</button>}
        <button className="btn btn-sm" onClick={() => exportRef.current?.()}>Xuất Excel</button>
        {/* [2026-11-17 09:13 PM kiennt] NT-DM-003 — nhập giá từ Excel: dùng đúng tệp Xuất Excel của lưới này (Mã hàng, ĐVT, Đơn giá) (đóng góp) */}
        {canWrite && !dangSua && <button className="btn btn-sm" onClick={() => fileRef.current?.click()} title="Nạp giá từ tệp Excel (lấy mẫu bằng nút Xuất Excel): cột Mã hàng, ĐVT, Đơn giá — xem trước rồi mới ghi">Nhập Excel</button>}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void docTep(f); e.target.value = ''; }} />
        {canWrite && dangSua && <button className="btn btn-sm" onClick={() => { setDirty(new Map()); setDangSua(false); }} title="Bỏ các ô đang sửa, quay về xem">Bỏ sửa</button>}
        {canWrite && (dangSua
          ? <button className="btn btn-sm btn-primary" disabled={save.isPending} onClick={() => (dirty.size ? save.mutate() : setDangSua(false))}>Ghi giá{dirty.size ? ` (${dirty.size} ô)` : ''}</button>
          : <button className="btn btn-sm btn-primary" onClick={() => { save.reset(); setDangSua(true); }}>Sửa giá</button>)}
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : null} />
      {save.isSuccess && !dirty.size && <div className="alert alert-info" style={{ marginBottom: 6 }}>Đã ghi {save.data.saved} ô{save.data.removed ? `, bỏ giá ${save.data.removed} ô` : ''}. Cửa hàng nhận giá mới sau vài phút.</div>}
      {q.isLoading ? <Loading /> : (
        <DataGrid storageKey="dm14-gia-v1" exportName={`gia-${code}`} exportRef={exportRef} rows={rows} rowKey={keyOf} maxHeight="55vh"
          onRowDoubleClick={(r) => setOpen(r.sku)} rowClassName={(r) => (r.isActive ? '' : 'muted')} footerLabel={false}
          emptyText={show === 'all' ? 'Chưa có mặt hàng nào khai đơn vị tính.' : 'Không có dòng nào.'} columns={columns} />
      )}
      {nhap && (
        <Modal title={`Nhập giá từ Excel — ${name}`} onClose={() => { setNhap(null); ghiNhap.reset(); }} wide
          footer={<><button className="btn btn-primary" disabled={!nhap.doi.length || ghiNhap.isPending} title={!nhap.doi.length ? 'Không có ô giá nào thay đổi' : undefined} onClick={() => ghiNhap.mutate(nhap.doi)}>{ghiNhap.isPending ? 'Đang ghi…' : `Ghi ${nhap.doi.length.toLocaleString('vi-VN')} ô giá`}</button><button className="btn" onClick={() => { setNhap(null); ghiNhap.reset(); }}>Thoát</button></>}>
          <div className="full">
            <div className={`alert ${nhap.loi.length ? 'alert-warn' : 'alert-info'}`} style={{ marginBottom: 6 }}>
              Tệp {nhap.ten}: {nhap.doi.filter((x) => x.cu === null).length.toLocaleString('vi-VN')} ô thêm giá · {nhap.doi.filter((x) => x.cu !== null).length.toLocaleString('vi-VN')} ô đổi giá · {nhap.giu.toLocaleString('vi-VN')} ô không đổi / để trống{nhap.loi.length ? ` · ${nhap.loi.length} dòng lỗi (bỏ qua)` : ''}. Bấm Ghi để lưu.
            </div>
            <ErrorBox error={ghiNhap.error ? errorText(ghiNhap.error) : null} />
            {nhap.loi.length > 0 && <ul className="neg" style={{ margin: '0 0 6px 18px', fontSize: 12, maxHeight: 120, overflowY: 'auto' }}>{nhap.loi.slice(0, 200).map((l) => <li key={l}>{l}</li>)}</ul>}
            {nhap.doi.length > 0 && (
              <div style={{ maxHeight: '45vh', overflowY: 'auto' }}>
                <table className="grid full"><thead><tr><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th className="num">Giá đang có</th><th className="num">Giá mới</th></tr></thead>
                  <tbody>{nhap.doi.slice(0, 500).map((x) => <tr key={`${x.sku}|${x.unit}`}><td className="mono">{x.sku}</td><td>{x.name}</td><td>{x.unit}</td><td className="num">{fmt(x.cu)}</td><td className="num"><b>{fmt(x.moi)}</b></td></tr>)}</tbody></table>
              </div>
            )}
          </div>
        </Modal>
      )}
      {open && (
        <ProductFullForm sku={open} classes={{ brand: classes.brand.data ?? [], industry: classes.industry.data ?? [], group: classes.group.data ?? [], type: classes.type.data ?? [] }}
          groupPath={groupPath} onClose={() => { setOpen(null); void qc.invalidateQueries({ queryKey: ['price-rows', code] }); }} />
      )}
    </div>
  );
}
