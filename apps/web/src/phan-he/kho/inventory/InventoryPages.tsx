/**
 * Kho và giá vốn:
 *   CostingPage        Tính giá vốn (ACC49): bình quân gia quyền tháng (hoặc bảng giá vốn tháng nhập từ Excel), ghi sổ giá vốn hàng xuất
 *   StockMovementPage  Báo cáo nhập xuất tồn hàng hoá (ACC83)
 *   ItemLedgerPage     Sổ chi tiết hàng hoá (ACC82)
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { defaultFrom, defaultTo, money, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { ItemPicker } from '@/components/pickers';
import { ExcelImport, type ImportResult } from '@/components/ExcelImport';
import { PrintButton } from '@/components/print';
import { COST_TEMPLATES, ITEM_LEDGER_TEMPLATES, STOCK_TEMPLATES, type StockSheet } from './mauIn/khoHang';

const thisMonth = () => new Date().toISOString().slice(0, 7);

/* ------------------------------------------------------------------ ACC49 */
interface CostRow { costGroup: string; costGroupName: string; sku: string; name: string; openingQty: number; openingValue: number; inQty: number; inValue: number; unitCost: number; outQty: number; closingQty: number; closingValue: number; giftQty?: number; costSource: 'computed' | 'import' }
interface CostingResult { period: string; monthsComputed: string[]; items: number; branches: { branchCode: string; status: 'posted' | 'empty'; docNo?: string; total: number; filled: number; filledTotal: number }[]; total: number; imported: { count: number; missing: string[]; missingCount: number } | null }

/**
 * Ô giá vốn trong tệp Excel → số. Ô số giữ nguyên (đủ số lẻ); ô chữ nhận cả "434442.8361", "434,442.84", "434.442,84".
 * Không đọc được thì null (bỏ dòng).
 */
function parseCost(v: string | number | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v ?? '').replace(/\s/g, '');
  if (!t) return null;
  const dot = t.lastIndexOf('.');
  const comma = t.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) t = dot > comma ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.');
  else if (comma >= 0) t = /^-?\d+,\d{1,4}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function CostingPage() {
  const qc = useQueryClient();
  const [period, setPeriodState] = useState(thisMonth());
  const [search, setSearch] = useState('');
  // Khoảng ngày chứng từ được cập nhật giá vốn (trong tháng đang tính), đổi tháng thì về cả tháng.
  const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [range, setRange] = useState({ from: `${thisMonth()}-01`, to: monthEnd(thisMonth()) });
  const setPeriod = (m: string) => { setPeriodState(m); setRange({ from: `${m}-01`, to: monthEnd(m) }); };
  const wholeMonth = range.from === `${period}-01` && range.to === monthEnd(period);
  const costs = useQuery({ queryKey: ['inventory-costs', period, search], queryFn: () => api.get<CostRow[]>('/api/v1/inventory/costs', { period, search }) });
  const run = useMutation({
    mutationFn: (extra: { imported?: { sku: string; unitCost: number; name?: string }[]; clearImport?: boolean } = {}) => api.post<CostingResult>('/api/v1/inventory/costing', { period, ...range, ...extra }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inventory-costs'] }),
  });
  const hasImport = (costs.data ?? []).some((r) => r.costSource === 'import');
  const monthText = `${period.slice(5)}/${period.slice(0, 4)}`;
  /** Nhập bảng giá vốn tháng từ Excel (Mã hàng, Tên hàng, Giá vốn) rồi tính giá vốn tháng đang chọn ngay. */
  const importCosts = async (rows: Record<string, string>[]): Promise<ImportResult> => {
    const items = rows.flatMap((r) => {
      const unitCost = parseCost(r.unitCost as string | number | undefined);
      return unitCost === null || unitCost < 0 ? [] : [{ sku: String(r.sku).trim(), unitCost, name: r.name ? String(r.name) : undefined }];
    });
    const res = await run.mutateAsync({ imported: items });
    const missing = res.imported?.missing ?? [];
    return {
      updated: res.imported?.count ?? 0,
      skipped: rows.length - items.length,
      errors: missing.length ? [`${res.imported!.missingCount} mã hàng có xuất trong tháng nhưng không có trong tệp — đang tính bình quân: ${missing.join(', ')}${res.imported!.missingCount > missing.length ? '…' : ''}`] : [],
    };
  };
  return (
    <>
      <PageHeader
        title="Tính giá vốn"
        code="ACC49"
        subtitle="Bình quân gia quyền theo tháng, chung cho các chi nhánh cùng đơn vị hạch toán; ghi sổ giá vốn hàng xuất"
        helpKey="tinh-gia-von"
        actions={
          <>
            <ExcelImport
              columns={[{ key: 'sku', header: 'Mã hàng' }, { key: 'name', header: 'Tên hàng' }, { key: 'unitCost', header: 'Giá vốn' }]}
              keyColumn="sku"
              raw
              disabled={run.isPending}
              buttonLabel={`Nhập giá vốn tháng ${monthText} từ Excel`}
              hint={<>Tệp cần cột <b>Mã hàng</b> và <b>Giá vốn</b> (Tên hàng để tham khảo). Mỗi mã một giá vốn cho mọi chi nhánh, hàng chính hay khuyến mãi như nhau; mã lặp nhiều dòng (tệp xuất từ thẻ kho) lấy giá khác 0 xuất hiện nhiều nhất. Bấm Ghi: thay toàn bộ giá đã nhập của tháng {monthText} rồi tính giá vốn và ghi phiếu giá vốn tháng của từng chi nhánh ngay.</>}
              onImport={importCosts}
            />
            <PrintButton small screen="ACC49" templates={COST_TEMPLATES} disabled={!costs.data?.length} getDocs={() => (costs.data?.length ? [{ period, rows: costs.data }] : [])} />
            {hasImport && <button className="btn btn-sm" disabled={run.isPending} onClick={() => window.confirm(`Bỏ toàn bộ giá vốn đã nhập từ Excel của tháng ${monthText} và tính lại bình quân cho mọi mã?`) && run.mutate({ clearImport: true })}>Bỏ giá đã nhập</button>}
            <button className="btn btn-primary" disabled={run.isPending} onClick={() => run.mutate({})}>
              {run.isPending ? 'Đang tính…' : `Tính giá vốn tháng ${monthText}${wholeMonth ? '' : ` (chứng từ ${range.from.slice(8)}–${range.to.slice(8)})`}`}
            </button>
          </>
        }
      />
      <div className="card">
        <div className="filters">
          <div className="field"><label>Tháng</label><input type="month" className="input w-md" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} /></div>
          <div className="field"><label>Mã hàng</label><input className="input w-md" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Lọc theo mã hàng" /></div>
        </div>
        <div className="card-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
          <p className="muted" style={{ margin: 0 }}>
            Đơn giá = (giá trị tồn đầu + nhập mua − trả nhà cung cấp + điều chỉnh tăng + nhận từ đơn vị khác) ÷ (số lượng tương ứng).
            Phiếu bán, hoàn, chuyển kho, điều chỉnh <b>không mang giá vốn</b>: tính giá vốn (tự tính hay nhập Excel) sinh
            <b>một phiếu "Giá vốn hàng xuất" cho mỗi chi nhánh</b> (ngày cuối tháng, số GV tháng/năm mã chi nhánh) liệt kê từng mã hàng
            với số tiền = số lượng × đơn giá; tính lại thì phiếu cũ được đảo và ghi phiếu mới.
            Giai đoạn chạy song song: bấm <b>Nhập giá vốn từ Excel</b> với bảng giá vốn tháng lấy từ phần mềm kế toán đang dùng — mã có trong tệp
            dùng đúng giá đó (cột Nguồn giá: Nhập Excel), mã không có thì tính bình quân; tính lại tháng đó vẫn giữ giá đã nhập.
            <b> Tính giá vốn trước, rồi mới kết chuyển lãi lỗ.</b>
          </p>
        </div>
        <ErrorBox error={run.error ? errorText(run.error) : costs.error ? errorText(costs.error) : null} />
        {run.data && (
          <div className="card-body">
            <div>
              Đã tính tháng {run.data.monthsComputed.join(', ')} · {run.data.items} mặt hàng{run.data.imported ? ` · ${run.data.imported.count} mã theo giá nhập Excel` : ''} · giá vốn ghi sổ <b>{money(run.data.total)}</b>
              {run.data.branches.length > 0 && <span className="muted"> ({run.data.branches.map((b) => `${b.branchCode}: ${money(b.total)}${b.docNo ? ` (${b.docNo})` : ''}`).join('; ')})</span>}
            </div>
          </div>
        )}
        {costs.isLoading ? <Loading /> : !costs.data?.length ? <Empty text="Tháng này chưa tính giá vốn" /> : (
          <DataGrid
            storageKey="acc49"
            rows={costs.data}
            rowKey={(r) => `${r.costGroup}-${r.sku}`}
            columns={[
              { key: 'costGroup', header: 'Đơn vị hạch toán', type: 'code' },
              { key: 'sku', header: 'Mã hàng', type: 'code' },
              { key: 'name', header: 'Tên hàng' },
              { key: 'openingQty', header: 'Số lượng', band: 'Tồn đầu', type: 'qty', sum: true },
              { key: 'openingValue', header: 'Giá trị', band: 'Tồn đầu', type: 'money', sum: true },
              { key: 'inQty', header: 'Số lượng', band: 'Nhập tính giá', type: 'qty', sum: true },
              { key: 'inValue', header: 'Giá trị', band: 'Nhập tính giá', type: 'money', sum: true },
              { key: 'unitCost', header: 'Đơn giá vốn', type: 'money', render: (r) => r.unitCost.toLocaleString('vi-VN', { maximumFractionDigits: 4 }) },
              { key: 'costSource', header: 'Nguồn giá', value: (r) => (r.costSource === 'import' ? 'Nhập Excel' : 'Tính bình quân') },
              { key: 'outQty', header: 'Xuất', type: 'qty', sum: true },
              { key: 'closingQty', header: 'Số lượng', band: 'Tồn cuối', type: 'qty', sum: true },
              { key: 'closingValue', header: 'Giá trị', band: 'Tồn cuối', type: 'money', sum: true },
              { key: 'giftQty', header: 'Trong đó: quà giá 0', band: 'Tồn cuối', type: 'qty', sum: true, title: 'Quà khuyến mại người tiêu dùng nhận kèm phiếu mua: nằm trong số lượng tồn nhưng không có giá trị (tặng khách lấy từ phần này trước, giá vốn 0)' },
            ]}
          />
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ ACC83 */
interface StockFigures { openingQty: number; openingValue: number; inQty: number; inValue: number; outQty: number; outValue: number; closingQty: number; closingValue: number; purchaseQty: number; purchaseValue: number; cogsQty: number; cogsValue: number; uncosted: number }
interface StockRow extends StockFigures { branchCode: string; branchName: string; sku: string; name: string; unit: string }
interface StockData { rows: StockRow[]; uncosted: number }
interface GroupRow extends StockFigures { key: string; label: string; skuCount: number }
interface GroupData { rows: GroupRow[]; uncosted: number; purchaseOnly: boolean }
const STOCK_VIEWS: [string, string][] = [
  ['item', 'Mặt hàng (chi tiết)'], ['itemGroup', 'Nhóm hàng'], ['itemType', 'Loại hàng'], ['brand', 'Nhãn hiệu'], ['industry', 'Ngành hàng'], ['postingGroup', 'Nhóm hạch toán (hàng thường, khuyến mại…)'],
  ['branch', 'Chi nhánh'], ['supplier', 'Nhà cung cấp (mua hàng)'], ['supplierGroup', 'Nhóm nhà cung cấp (mua hàng)'],
];
const figureCols = (stock: boolean, extra: boolean): Column<StockFigures>[] => [
  ...(stock ? ([
    { key: 'openingQty', header: 'SL tồn đầu', type: 'qty', sum: true },
    { key: 'openingValue', header: 'TT Tồn đầu', type: 'money', sum: true },
    { key: 'inQty', header: 'SL nhập', type: 'qty', sum: true },
    { key: 'inValue', header: 'TT nhập', type: 'money', sum: true },
    { key: 'outQty', header: 'SL xuất', type: 'qty', sum: true },
    { key: 'outValue', header: 'TT xuất', type: 'money', sum: true },
    { key: 'closingQty', header: 'SL tồn cuối', type: 'qty', sum: true },
    { key: 'closingValue', header: 'TT tồn cuối', type: 'money', sum: true },
  ] satisfies Column<StockFigures>[]) : []),
  { key: 'purchaseQty', header: 'Số lượng', band: 'Mua hàng (trừ trả lại)', type: 'qty', sum: true, hidden: !extra },
  { key: 'purchaseValue', header: 'Giá trị', band: 'Mua hàng (trừ trả lại)', type: 'money', sum: true, hidden: !extra },
  ...(stock ? ([
    { key: 'cogsQty', header: 'Số lượng', band: 'Giá vốn hàng bán', type: 'qty', sum: true, hidden: !extra },
    { key: 'cogsValue', header: 'Giá trị', band: 'Giá vốn hàng bán', type: 'money', sum: true, hidden: !extra },
  ] satisfies Column<StockFigures>[]) : []),
];

export function StockMovementPage() {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '', warehouseCodes: '', search: '' });
  const [view, setView] = useState('item');
  const [search, setSearch] = useState('');
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['stock-movement', f], enabled: view === 'item', queryFn: () => api.get<StockData>('/api/v1/inventory/stock-movement', f) });
  const g = useQuery({ queryKey: ['stock-summary', f, view], enabled: view !== 'item', queryFn: () => api.get<GroupData>('/api/v1/inventory/stock-summary', { ...f, groupBy: view }) });
  const d = view === 'item' ? q.data : g.data;
  const viewLabel = STOCK_VIEWS.find(([k]) => k === view)?.[1] ?? '';
  const sheet = (): StockSheet[] => {
    if (!d) return [];
    const base = { from: f.from, to: f.to, branchCodes: f.branchCodes, warehouseCodes: f.warehouseCodes, view, viewLabel };
    return view === 'item'
      ? [{ ...base, rows: (q.data?.rows ?? []).map((r) => ({ ...r, code: r.sku })) }]
      : [{ ...base, purchaseOnly: g.data?.purchaseOnly, rows: (g.data?.rows ?? []).map((r) => ({ ...r, code: r.key, name: r.label })) }];
  };
  return (
    <>
      <PageHeader title="Báo cáo nhập xuất tồn hàng hoá" code="ACC83" subtitle="Tồn đầu, nhập, xuất, tồn cuối, mua hàng, giá vốn theo mặt hàng hoặc gom theo nhóm, loại, nhãn hiệu, ngành hàng, chi nhánh, nhà cung cấp" helpKey="nhap-xuat-ton" />
      <FilterLayout
        print={<PrintButton screen="ACC83" templates={STOCK_TEMPLATES} disabled={!d} getDocs={sheet} />}
        filters={
          <>
            <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ search: search.trim() }); }}>
              <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
              <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} warehouses={{ value: f.warehouseCodes, onChange: (warehouseCodes) => set({ warehouseCodes }) }} />
              <div className="field"><label>Xem theo</label><select className="select input" value={view} onChange={(e) => setView(e.target.value)}>{STOCK_VIEWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div className="field"><label>Mã / tên hàng</label><input className="input w-md" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => set({ search: search.trim() })} /></div>
            </form>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : g.error ? errorText(g.error) : null} />
          {g.data?.purchaseOnly && view !== 'item' && <div className="card-body muted" style={{ paddingTop: 0 }}>Gom theo nhà cung cấp chỉ có phần mua hàng trong kỳ (nhập mua trừ hàng trả nhà cung cấp), theo đối tượng của phiếu nhập.</div>}
          {d && d.uncosted > 0 && <div className="card-body muted">Có {d.uncosted} lần xuất / nhập chưa có giá trị (tháng chưa tính giá vốn): cột giá trị chưa đầy đủ. Vào <b>Tính giá vốn</b> để tính.</div>}
          {(view === 'item' ? q.isLoading : g.isLoading) ? <Loading /> : !d?.rows.length ? <Empty text="Không có hàng hoá phát sinh" /> : view === 'item' ? (
            <DataGrid
              storageKey="acc83-v2"
              rows={q.data?.rows ?? []}
              rowKey={(r) => `${r.branchCode}-${r.sku}`}
              exportName={`nhap-xuat-ton-${f.from}-${f.to}`}
              columns={[
                { key: 'sku', header: 'Mã hàng', type: 'code' },
                { key: 'name', header: 'Diễn giải' },
                { key: 'unit', header: 'Đơn vị' },
                ...(figureCols(true, false) as Column<StockRow>[]),
                { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
              ]}
            />
          ) : (
            <DataGrid
              storageKey={`acc83-${view}-v2`}
              rows={g.data?.rows ?? []}
              rowKey={(r) => r.key}
              exportName={`nhap-xuat-ton-theo-${view}-${f.from}-${f.to}`}
              exportTitle={`Nhập xuất tồn theo ${viewLabel.toLowerCase()}`}
              columns={[
                { key: 'key', header: 'Mã', type: 'code' },
                { key: 'label', header: viewLabel.replace(/ \(.*\)$/, '') },
                { key: 'skuCount', header: 'Số mặt hàng', type: 'number' },
                ...(figureCols(!g.data?.purchaseOnly, true) as Column<GroupRow>[]),
              ]}
            />
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ ACC82 */
interface LedgerRow { eventId: string; docDate: string; docNo: string; docType: string; kindLabel: string; branchCode: string; inQty: number; inValue: number; outQty: number; outValue: number; balanceQty: number; balanceValue: number; uncosted: boolean }
interface ItemLedger { sku: string; name: string; unit: string; opening: { qty: number; value: number }; rows: LedgerRow[]; closing: { qty: number; value: number } }

export function ItemLedgerPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', warehouseCodes: '', sku: '' });
  const [sku, setSku] = useState('');
  const [docId, setDocId] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['item-ledger', f], enabled: Boolean(f.sku), queryFn: () => api.get<ItemLedger>('/api/v1/inventory/item-ledger', f) });
  const d = q.data;
  return (
    <>
      <PageHeader title="Sổ chi tiết hàng hoá" code="ACC82" subtitle="Từng lần nhập, xuất của một mặt hàng và tồn luỹ kế" helpKey="so-chi-tiet-hang-hoa" />
      <FilterLayout
        print={<PrintButton screen="ACC82" templates={ITEM_LEDGER_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...d, from: f.from, to: f.to, branchCodes: f.branchCodes, warehouseCodes: f.warehouseCodes }] : [])} />}
        filters={
          <>
            <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ sku: sku.trim() }); }}>
              <div className="field"><label>Mã hàng</label><ItemPicker className="input w-lg" value={sku} onChange={(v) => { setSku(v); set({ sku: v }); }} placeholder="Bấm để chọn mã hàng" /></div>
              <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
              <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} warehouses={{ value: f.warehouseCodes, onChange: (warehouseCodes) => set({ warehouseCodes }) }} />
            </form>
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {!f.sku ? <Empty text="Chưa chọn mặt hàng — bấm vào ô Mã hàng ở trên để tìm theo mã hoặc tên." /> : q.isLoading ? <Loading /> : !d ? null : (
            <>
              <div className="card-body">
                <b className="mono">{d.sku}</b> {d.name} {d.unit && `(${d.unit})`} · Tồn đầu: <b>{d.opening.qty.toLocaleString('vi-VN')}</b> = {money(d.opening.value)} · Tồn cuối: <b>{d.closing.qty.toLocaleString('vi-VN')}</b> = {money(d.closing.value)}
              </div>
              {!d.rows.length ? <Empty text="Không có phát sinh trong khoảng này" /> : (
                <DataGrid
                  storageKey="acc82"
                  rows={d.rows}
                  rowKey={(r, i) => `${r.eventId}-${i}`}
                  onRowClick={(r) => setDocId(r.eventId)}
                  columns={[
                    { key: 'docDate', header: 'Ngày', type: 'date' },
                    { key: 'docNo', header: 'Số chứng từ', type: 'code' },
                    { key: 'kindLabel', header: 'Nghiệp vụ' },
                    { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
                    { key: 'inQty', header: 'Số lượng', band: 'Nhập', type: 'qty', sum: true },
                    { key: 'inValue', header: 'Giá trị', band: 'Nhập', type: 'money', sum: true },
                    { key: 'outQty', header: 'Số lượng', band: 'Xuất', type: 'qty', sum: true },
                    { key: 'outValue', header: 'Giá trị', band: 'Xuất', type: 'money', sum: true },
                    { key: 'balanceQty', header: 'Số lượng', band: 'Tồn', type: 'qty' },
                    { key: 'balanceValue', header: 'Giá trị', band: 'Tồn', type: 'money' },
                  ]}
                />
              )}
            </>
          )}
        </div>
      </FilterLayout>
      {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
    </>
  );
}
