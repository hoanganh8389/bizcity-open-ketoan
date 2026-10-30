/**
 * CHỨNG TỪ MUA HÀNG — XEM THEO DÒNG HÀNG / THEO MÃ HÀNG (cùng bộ lọc với xem theo phiếu, giống BH01 / BH02 bên bán hàng):
 *   dong  mỗi dòng hàng của phiếu một dòng: phiếu, NCC, chi nhánh, phân kho, mã, tên, loại dòng, ĐVT, SL (+ quy ĐVT nhỏ nhất),
 *         đơn giá, CK, tiền hàng, thuế, tổng, lô / hạn — số tiền tính như trên phiếu (phiếu đã duyệt: số đã chốt).
 *   ma    cộng dồn theo mã hàng, số lượng quy ĐVT nhỏ nhất: SL đặt · SL nhập · SL trả / xuất · SL thuần, tiền nhập · tiền trả · thuần,
 *         đơn giá bình quân nhập (chưa thuế, sau CK), số phiếu.
 * Chiều: nhập mua / nhận quà / đổi (nhận về) = vào; trả NCC / xuất quà / đổi (trả đi) = ra; đơn đặt chỉ cộng cột "SL đặt".
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TAX_RATE, computeDoc, ratioOf, type LineCalc, type ProductUnit } from '@ketoan/contracts/mua-hang';
import { api } from '@/lib/api';
import { DataGrid, type Column } from '@/components/DataGrid';
import { Loading } from '@/components/ui';
import { KIND_LABEL, P, STATUS_LABEL, TAX_LABEL, today, useNames, type MhData, type StoredDoc } from '../du-lieu';
import { dmy } from '../chung';

import { congNo } from './tienPhieu';

type Dir = 'order' | 'in' | 'out';
const dirOf = (d: StoredDoc, l: LineCalc): Dir | null => {
  if (d.kind === 'order') return 'order';
  if (d.kind === 'receipt' || d.kind === 'gift_in') return 'in';
  if (d.kind === 'return' || d.kind === 'gift_out') return 'out';
  if (d.kind === 'exchange') return l.dir === 'out' ? 'out' : 'in';
  return null;
};
const LINE_TYPE: Record<string, string> = { buy: 'Hàng mua', gift_seller: 'KM người bán', gift_consumer: 'KM NTD / quà' };

/** grossEx: tiền hàng TRƯỚC chiết khấu, CHƯA thuế (phiếu nhập giá gồm thuế thì quy về chưa thuế); disc = grossEx − beforeTax (chiết khấu chưa thuế). */
interface Row { key: string; doc: StoredDoc; l: LineCalc; dir: Dir; base: number; baseUnit: string; total: number; grossEx: number; disc: number }
interface SkuRow { key: string; sku: string; name: string; baseUnit: string; ordered: number; inQty: number; outQty: number; giftQty: number; inGross: number; inDisc: number; inValue: number; outValue: number; tax: number; docs: Set<string> }

export function XemTheoMaHang({ docs, data, mode, partnerName, khoText, onOpen }: { docs: StoredDoc[]; data: MhData; mode: 'dong' | 'ma'; partnerName: (c: string) => string; khoText: (d: StoredDoc) => string; onOpen: (d: StoredDoc) => void }) {
  const branchName = useNames().branchName;
  const skus = useMemo(() => [...new Set(docs.flatMap((d) => d.lines.map((l) => l.sku)).filter(Boolean))].sort(), [docs]);
  const uq = useQuery({ queryKey: ['mua-hang', 'units', 'xem-ma', skus.join(',')], enabled: skus.length > 0, staleTime: 60_000, queryFn: () => api.post<Record<string, ProductUnit[]>>(`${P}/units`, { skus }) });
  const units = uq.data;
  // Tên theo danh mục + nhóm hàng (đường dẫn đầy đủ) + ngành · nhãn · nhóm — tên ghi trên dòng phiếu có thể là chữ cũ / mã.
  const iq = useQuery({ queryKey: ['mua-hang', 'sku-info', skus.join(',')], enabled: skus.length > 0, staleTime: 60_000, queryFn: () => api.post<Record<string, { name: string; groupPath: string; industry: string; brand: string; group: string }>>(`${P}/sku-info`, { skus }) });
  const info = (sku: string) => iq.data?.[sku];
  const nameOf = (sku: string, fallback: string) => info(sku)?.name || fallback;
  const rows = useMemo<Row[]>(() => {
    if (!units) return [];
    const out: Row[] = [];
    for (const d of docs) {
      if (!d.lines.length) continue;
      // Phiếu đã duyệt: dòng đã chốt chiết khấu lúc duyệt; phiếu chưa duyệt: tính theo chính sách hiện hành (như mở phiếu).
      const c = computeDoc(d, d.status === 'approved' ? [] : data.policies, { units });
      c.lines.forEach((l, i) => {
        if (!l.sku && !l.name) return;
        const dir = dirOf(d, l);
        if (!dir) return;
        const us = units[l.sku] ?? [];
        const r = ratioOf(us, l.unit) || 1;
        const rate = TAX_RATE[l.taxCode] ?? 0;
        const grossEx = Math.round(d.priceIncludesVat && l.lineType === 'buy' ? l.gross / (1 + rate / 100) : l.lineType === 'buy' ? l.gross : 0);
        out.push({ key: `${d.id}-${i}`, doc: d, l, dir, base: Math.round(l.qty * r * 10000) / 10000, baseUnit: us.find((u) => u.ratio === 1)?.unit ?? l.unit, total: l.beforeTax + l.tax, grossEx: Math.max(grossEx, l.beforeTax), disc: Math.max(0, grossEx - l.beforeTax) });
      });
    }
    return out;
  }, [docs, data.policies, units]);
  if (skus.length && !units) return <Loading />;

  if (mode === 'dong') {
    const sign = (r: Row) => (r.dir === 'out' ? -1 : 1);
    const asOf = today();
    const columns: Column<Row>[] = [
      { key: 'sku', header: 'Mã hàng', type: 'code', width: 110, value: (r) => r.l.sku },
      { key: 'name', header: 'Tên hàng', width: 230, value: (r) => nameOf(r.l.sku, r.l.name), title: 'Tên theo danh mục mặt hàng' },
      { key: 'groupPath', header: 'Nhóm hàng (đầy đủ)', width: 260, title: 'Đường dẫn nhóm hàng đầy đủ theo danh mục, vd Nhóm hàng\Sữa\Sữa bột', value: (r) => info(r.l.sku)?.groupPath ?? '' },
      { key: 'date', header: 'Ngày', width: 90, value: (r) => dmy(r.doc.docDate) },
      { key: 'docNo', header: 'Số phiếu', type: 'code', width: 110, value: (r) => r.doc.docNo, render: (r) => <button type="button" className="btn btn-xs btn-ghost mono" onClick={() => onOpen(r.doc)} title="Mở phiếu">{r.doc.docNo || '(nháp)'}</button> },
      { key: 'kind', header: 'Loại', width: 120, value: (r) => KIND_LABEL[r.doc.kind] + (r.doc.kind === 'exchange' ? (r.dir === 'out' ? ' (trả đi)' : ' (nhận về)') : '') },
      { key: 'branch', header: 'Chi nhánh', width: 170, title: 'Mã · tên chi nhánh', value: (r) => `${r.doc.branchCode}${branchName(r.doc.branchCode) ? ` · ${branchName(r.doc.branchCode)}` : ''}` },
      { key: 'kho', header: 'Phân kho', type: 'code', width: 90, title: 'Mã phân kho (chưa ghi kho = kho mặc định của chi nhánh); đơn đặt: kho giao', value: (r) => khoText(r.doc) },
      { key: 'status', header: 'Trạng thái', width: 100, value: (r) => STATUS_LABEL[r.doc.status] },
      { key: 'invoiceSerial', header: 'Ký hiệu HĐ', type: 'code', width: 90, value: (r) => r.doc.invoice?.serial ?? '' },
      { key: 'invoice', header: 'Số HĐ', type: 'code', width: 100, value: (r) => r.doc.invoice?.no ?? '' },
      { key: 'invoiceDate', header: 'Ngày HĐ', width: 90, value: (r) => (r.doc.invoice ? dmy(r.doc.invoice.date) : '') },
      { key: 'partner', header: 'Mã NCC', type: 'code', width: 120, value: (r) => r.doc.partnerCode },
      { key: 'partnerName', header: 'Tên NCC', width: 200, value: (r) => partnerName(r.doc.partnerCode) },
      { key: 'lineType', header: 'Loại dòng', width: 110, value: (r) => LINE_TYPE[r.l.lineType] ?? r.l.lineType },
      { key: 'unit', header: 'ĐVT', width: 60, value: (r) => r.l.unit },
      { key: 'qty', header: 'Số lượng', type: 'qty', width: 80, sum: true, value: (r) => sign(r) * r.l.qty, title: 'Theo ĐVT của dòng; hàng ra (trả NCC, xuất quà, đổi trả đi) ghi âm' },
      { key: 'base', header: 'SL (ĐVT nhỏ nhất)', type: 'qty', width: 110, sum: true, value: (r) => sign(r) * r.base, title: 'Quy về ĐVT tỉ lệ 1 — cộng được giữa Thùng / Lốc / Hộp' },
      { key: 'baseUnit', header: 'ĐVT nhỏ nhất', width: 80, value: (r) => r.baseUnit },
      { key: 'industry', header: 'Ngành hàng', width: 130, title: 'Cấp 1 của phân loại: ngành hàng của mặt hàng', value: (r) => info(r.l.sku)?.industry ?? '' },
      { key: 'brand', header: 'Nhãn hàng', width: 130, title: 'Cấp 2: nhãn hàng của mặt hàng', value: (r) => info(r.l.sku)?.brand ?? '' },
      { key: 'group', header: 'Nhóm hàng', width: 150, title: 'Cấp 3: nhóm hàng (nhóm cuối) của mặt hàng', value: (r) => info(r.l.sku)?.group ?? '' },
      { key: 'price', header: 'Đơn giá trên phiếu', type: 'price', width: 110, value: (r) => r.l.price, title: 'Đơn giá đúng như nhập trên phiếu (theo loại giá của phiếu)' },
      { key: 'priceKind', header: 'Loại giá', width: 90, value: (r) => (r.doc.priceIncludesVat ? 'gồm thuế' : 'chưa thuế') },
      { key: 'priceEx', header: 'Đơn giá chưa thuế', type: 'price', width: 110, value: (r) => (r.l.qty ? Math.round((r.grossEx / r.l.qty) * 100) / 100 : 0), title: 'Trước chiết khấu, chưa thuế, theo ĐVT của dòng' },
      { key: 'grossEx', header: 'Tiền hàng trước CK (chưa thuế)', type: 'money', width: 150, sum: true, value: (r) => sign(r) * r.grossEx, title: 'SL × đơn giá, chưa trừ chiết khấu, chưa thuế' },
      { key: 'disc', header: 'Chiết khấu (chưa thuế)', type: 'money', width: 120, sum: true, value: (r) => sign(r) * r.disc, title: 'CK dòng + phần CK trên đơn chia vào dòng' },
      { key: 'beforeTax', header: 'Tiền hàng sau CK (chưa thuế)', type: 'money', width: 150, sum: true, value: (r) => sign(r) * r.l.beforeTax, title: '= Tiền hàng trước CK − chiết khấu. Đây là tiền hàng ghi sổ (giá trị hàng nhập)' },
      { key: 'taxCode', header: 'Thuế suất', width: 80, value: (r) => TAX_LABEL[r.l.taxCode] ?? r.l.taxCode },
      { key: 'tax', header: 'Tiền thuế GTGT', type: 'money', width: 110, sum: true, value: (r) => sign(r) * r.l.tax },
      { key: 'total', header: 'Tổng thanh toán (sau CK, gồm thuế)', type: 'money', width: 160, sum: true, value: (r) => sign(r) * r.total, title: '= Tiền hàng sau CK + tiền thuế — số phải trả NCC của dòng' },
      { key: 'debtState', header: 'Công nợ của phiếu', width: 170, title: 'Tình trạng công nợ cả phiếu chứa dòng này (đã trả / còn lại tính theo phiếu, không chia theo dòng)', value: (r) => { const c = congNo(r.doc, asOf); return c ? (c.left > 0 ? `${c.text} · còn ${c.left.toLocaleString('vi-VN')}` : c.text) : ''; } },
      { key: 'lot', header: 'Số lô', width: 90, value: (r) => r.l.lotNo ?? '' },
      { key: 'exp', header: 'Hạn dùng', width: 90, value: (r) => dmy(r.l.expDate) },
    ];
    return <DataGrid storageKey="mh-chung-tu-dong" exportName="chung-tu-mua-hang-theo-dong" rows={rows} rowKey={(r) => r.key} columns={columns} footerLabel="Cộng" onRowDoubleClick={(r) => onOpen(r.doc)}
      rowClassName={(r) => (r.doc.status === 'approved' ? '' : 'muted')} emptyText="Không có dòng hàng nào trong các phiếu đang lọc" />;
  }

  const by = new Map<string, SkuRow>();
  for (const r of rows) {
    const k = r.l.sku || `(mới) ${r.l.name}`;
    const x = by.get(k) ?? by.set(k, { key: k, sku: r.l.sku, name: r.l.name, baseUnit: r.baseUnit, ordered: 0, inQty: 0, outQty: 0, giftQty: 0, inGross: 0, inDisc: 0, inValue: 0, outValue: 0, tax: 0, docs: new Set() }).get(k)!;
    x.docs.add(r.doc.id);
    if (r.dir === 'order') { x.ordered += r.base; continue; }
    if (r.dir === 'in') { x.inQty += r.base; x.inGross += r.grossEx; x.inDisc += r.disc; x.inValue += r.l.beforeTax; x.tax += r.l.tax; if (r.l.lineType !== 'buy') x.giftQty += r.base; }
    else { x.outQty += r.base; x.outValue += r.l.beforeTax; x.tax -= r.l.tax; }
  }
  const sums = [...by.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  const q = (n: number) => Math.round(n * 10000) / 10000;
  const columns: Column<SkuRow>[] = [
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
    { key: 'name', header: 'Tên hàng', width: 240, value: (r) => nameOf(r.sku, r.name), title: 'Tên theo danh mục mặt hàng' },
    { key: 'groupPath', header: 'Nhóm hàng (đầy đủ)', width: 260, title: 'Đường dẫn nhóm hàng đầy đủ theo danh mục', value: (r) => info(r.sku)?.groupPath ?? '' },
    { key: 'baseUnit', header: 'ĐVT nhỏ nhất', width: 80 },
    { key: 'industry', header: 'Ngành hàng', width: 130, title: 'Cấp 1: ngành hàng', value: (r) => info(r.sku)?.industry ?? '' },
    { key: 'brand', header: 'Nhãn hàng', width: 130, title: 'Cấp 2: nhãn hàng', value: (r) => info(r.sku)?.brand ?? '' },
    { key: 'group', header: 'Nhóm hàng', width: 150, title: 'Cấp 3: nhóm hàng (nhóm cuối)', value: (r) => info(r.sku)?.group ?? '' },
    { key: 'docs', header: 'Số phiếu', type: 'number', width: 70, value: (r) => r.docs.size, title: 'Số phiếu có mã này (một phiếu nhiều mã nên không cộng dồn)' },
    { key: 'ordered', header: 'SL đặt', type: 'qty', width: 90, sum: true, value: (r) => q(r.ordered), title: 'Đơn đặt hàng trong các phiếu đang lọc' },
    { key: 'inQty', header: 'SL nhập', type: 'qty', width: 90, sum: true, value: (r) => q(r.inQty), title: 'Nhập mua + nhận quà + đổi hàng (nhận về), quy ĐVT nhỏ nhất' },
    { key: 'giftQty', header: 'Trong đó hàng tặng', type: 'qty', width: 110, sum: true, value: (r) => q(r.giftQty) },
    { key: 'outQty', header: 'SL trả / xuất', type: 'qty', width: 100, sum: true, value: (r) => q(r.outQty), title: 'Trả NCC + xuất quà + đổi hàng (trả đi)' },
    { key: 'net', header: 'SL thuần', type: 'qty', width: 90, sum: true, value: (r) => q(r.inQty - r.outQty) },
    { key: 'inGross', header: 'Tiền hàng nhập trước CK (chưa thuế)', type: 'money', width: 160, sum: true, value: (r) => Math.round(r.inGross) },
    { key: 'inDisc', header: 'Chiết khấu (chưa thuế)', type: 'money', width: 120, sum: true, value: (r) => Math.round(r.inDisc) },
    { key: 'inValue', header: 'Tiền hàng nhập sau CK (chưa thuế)', type: 'money', width: 160, sum: true, value: (r) => Math.round(r.inValue), title: '= trước CK − chiết khấu' },
    { key: 'outValue', header: 'Tiền hàng trả (chưa thuế)', type: 'money', width: 140, sum: true, value: (r) => Math.round(r.outValue) },
    { key: 'netValue', header: 'Tiền hàng thuần cuối (chưa thuế)', type: 'money', width: 160, sum: true, value: (r) => Math.round(r.inValue - r.outValue), title: '= nhập sau CK − trả' },
    { key: 'tax', header: 'Thuế GTGT', type: 'money', width: 110, sum: true, value: (r) => Math.round(r.tax) },
    { key: 'totalPay', header: 'Tổng thanh toán (gồm thuế)', type: 'money', width: 150, sum: true, value: (r) => Math.round(r.inValue - r.outValue + r.tax) },
    { key: 'avg', header: 'Giá nhập BQ / ĐVT nhỏ nhất', type: 'price', width: 140, value: (r) => (r.inQty - r.giftQty > 0 ? Math.round((r.inValue / (r.inQty - r.giftQty)) * 10000) / 10000 : 0), title: 'Tiền hàng nhập ÷ SL nhập không kể hàng tặng (chưa thuế, sau CK)' },
  ];
  return <DataGrid storageKey="mh-chung-tu-ma" exportName="chung-tu-mua-hang-theo-ma" rows={sums} rowKey={(r) => r.key} columns={columns} footerLabel="Cộng" emptyText="Không có mã hàng nào trong các phiếu đang lọc" />;
}
