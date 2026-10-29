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
import { ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { HelpDrawer } from '@/components/HelpDrawer';
import { ProductFullForm } from './ProductFullForm';
import { pathOf, useClasses } from './ProductsPage';

interface Row {
  sku: string; name: string; groupCode: string | null; isMain: boolean; isActive: boolean; noSale: boolean;
  unit: string; ratio: number; isDefault: boolean; price: number | null; isDefaultUnit: boolean; companyPrice: number | null;
}
interface RowsResponse { code: string; isCompany: boolean; companyCode: string | null; rows: Row[] }
type Show = 'all' | 'priced' | 'empty' | 'dirty';

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
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const exportRef = useRef<(() => void) | null>(null);
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
    { key: 'ratio', header: 'Tỉ lệ', type: 'number', width: 70, showZero: true },
    { key: 'isDefault', header: 'Bán chính', type: 'check', width: 75 },
    ...(!isCompany ? [{ key: 'companyPrice', header: 'Giá công ty', type: 'money', width: 120 } as Column<Row>] : []),
    {
      key: 'price', header: `Giá ${name}`, type: 'money', width: 140, value: (r) => priceOf(r),
      render: (r) => canWrite ? (
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
  const showBtn = (k: Show, label: string) => <button key={k} className={`btn btn-sm ${show === k ? 'btn-primary' : ''}`} onClick={() => setShow(k)}>{label}</button>;

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <b>Giá theo mặt hàng — {name}</b>
        <span className="muted" style={{ fontSize: 12 }}>{counts.skus.toLocaleString('vi-VN')} mã · {counts.priced.toLocaleString('vi-VN')}/{counts.all.toLocaleString('vi-VN')} ô đã có giá</span>
        <span className="spacer" style={{ flex: 1 }} />
        {showBtn('all', 'Tất cả')}{showBtn('priced', 'Đã có giá')}{showBtn('empty', 'Còn trống')}{dirty.size > 0 && showBtn('dirty', `Đang sửa (${dirty.size})`)}
        {canWrite && <button className="btn btn-sm" onClick={fillByRatio} title="Ô trống của mặt hàng đang hiện = giá ĐVT đã có ÷ tỉ lệ × tỉ lệ cần">Điền theo tỉ lệ</button>}
        <button className="btn btn-sm" onClick={() => exportRef.current?.()}>Xuất Excel</button>
        {canWrite && dirty.size > 0 && <button className="btn btn-sm" onClick={() => setDirty(new Map())}>Bỏ sửa</button>}
        {canWrite && <button className="btn btn-sm btn-primary" disabled={!dirty.size || save.isPending} onClick={() => save.mutate()}>Ghi giá{dirty.size ? ` (${dirty.size} ô)` : ''}</button>}
        <button className="btn btn-sm btn-help" onClick={() => setHelp(true)}>? Hướng dẫn</button>
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : null} />
      {save.isSuccess && !dirty.size && <div className="alert alert-info" style={{ marginBottom: 6 }}>Đã ghi {save.data.saved} ô{save.data.removed ? `, bỏ giá ${save.data.removed} ô` : ''}. Cửa hàng nhận giá mới sau vài phút.</div>}
      {q.isLoading ? <Loading /> : (
        <DataGrid storageKey="dm14-gia-v1" exportName={`gia-${code}`} exportRef={exportRef} rows={rows} rowKey={keyOf} maxHeight="55vh"
          onRowDoubleClick={(r) => setOpen(r.sku)} rowClassName={(r) => (r.isActive ? '' : 'muted')} footerLabel={false}
          note="sửa ô giá rồi bấm Ghi giá; bấm đúp dòng để mở mặt hàng"
          emptyText={show === 'all' ? 'Chưa có mặt hàng nào khai đơn vị tính.' : 'Không có dòng nào.'} columns={columns} />
      )}
      {open && (
        <ProductFullForm sku={open} classes={{ brand: classes.brand.data ?? [], industry: classes.industry.data ?? [], group: classes.group.data ?? [], type: classes.type.data ?? [] }}
          groupPath={groupPath} onClose={() => { setOpen(null); void qc.invalidateQueries({ queryKey: ['price-rows', code] }); }} />
      )}
      {help && <HelpDrawer guideKey="bang-gia" onClose={() => setHelp(false)} />}
    </div>
  );
}
