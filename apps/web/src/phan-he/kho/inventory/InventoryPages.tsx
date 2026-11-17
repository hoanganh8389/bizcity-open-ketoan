/**
 * Kho và giá vốn:
 *   CostingPage        Tính giá vốn (ACC49): bình quân gia quyền tháng (hoặc bảng giá vốn tháng nhập từ Excel), ghi sổ giá vốn hàng xuất
 *   StockMovementPage  Báo cáo nhập xuất tồn hàng hoá (ACC83)
 *   ItemLedgerPage     Sổ chi tiết hàng hoá (ACC82)
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorText } from '@/lib/api';
import { defaultFrom, defaultTo, kyText, money, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ChonNhomHang, useLocNhomHang } from '@/components/CayNhomHang';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { ItemPicker } from '@/components/pickers';
import { ExcelImport, type ImportResult } from '@/components/ExcelImport';
import { PrintButton } from '@/components/print';
import { CayDonVi } from '@/components/CayDonVi';
import { useOrgTree } from '@/lib/orgUnits';
import { COST_TEMPLATES, ITEM_LEDGER_TEMPLATES, STOCK_TEMPLATES, type StockSheet } from './mauIn/khoHang';

const thisMonth = () => new Date().toISOString().slice(0, 7);

/* ------------------------------------------------------------------ ACC49 */
interface CostRow { detail?: Record<string, number>; costGroup: string; costGroupName: string; sku: string; name: string; openingQty: number; openingValue: number; inQty: number; inValue: number; unitCost: number; outQty: number; closingQty: number; closingValue: number; giftQty?: number; costSource: 'computed' | 'import' }
interface CostingResult { runIds?: string[]; period: string; monthsComputed: string[]; items: number; branches: { branchCode: string; status: 'posted' | 'empty'; docNo?: string; total: number; filled: number; filledTotal: number }[]; total: number; imported: { count: number; missing: string[]; missingCount: number } | null }

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
  const [nhom, setNhom] = useState('');
  const ln = useLocNhomHang(nhom);
  // [2026-11-17 Nguyễn Văn Thủy] chọn chi nhánh (điểm tính giá vốn trên cơ cấu tổ chức) để xem; tính thì tính cả các chi nhánh một lượt (đóng góp)
  const [cn, setCn] = useState('');
  // [2026-11-17 Nguyễn Văn Thủy] phạm vi chọn trên cây cơ cấu: nút bất kỳ hoặc một shop (đóng góp)
  const [scope, setScope] = useState<{ kind: 'node' | 'shop'; code: string; label: string } | null>(null);
  const [moCay, setMoCay] = useState(false);
  const orgTree = useOrgTree();
  const qc = useQueryClient();
  const [period, setPeriodState] = useState(thisMonth());
  const [search, setSearch] = useState('');
  // Khoảng ngày chứng từ được cập nhật giá vốn (trong tháng đang tính), đổi tháng thì về cả tháng.
  const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [range, setRange] = useState({ from: `${thisMonth()}-01`, to: monthEnd(thisMonth()) });
  const setPeriod = (m: string) => { setPeriodState(m); setRange({ from: `${m}-01`, to: monthEnd(m) }); };
  const wholeMonth = range.from === `${period}-01` && range.to === monthEnd(period);
  const costs = useQuery({ queryKey: ['inventory-costs', period, search], queryFn: () => api.get<CostRow[]>('/api/v1/inventory/costs', { period, search }) });
  // [2026-11-17 Nguyễn Văn Thủy] chọn chi nhánh (cơ cấu) → các lần tính giá vốn (lọc ngày tính) → bấm một lần: bảng đơn giá các mã (đóng góp)
  const [ngay, setNgay] = useState({ from: `${thisMonth().slice(0, 4)}-01-01`, to: new Date().toISOString().slice(0, 10) });
  const runs = useQuery({ queryKey: ['inventory-costing-runs', cn, ngay.from, ngay.to], queryFn: () => api.get<CostRun[]>('/api/v1/inventory/costing-runs', { costCenter: cn || undefined, from: ngay.from, to: ngay.to }) });
  const [runSel, setRunSel] = useState<string | null>(null);
  const curRun = (runs.data ?? []).find((x) => x.id === runSel) ?? runs.data?.[0];
  const lines = useQuery({ queryKey: ['inventory-costing-run-lines', curRun?.id], enabled: Boolean(curRun), queryFn: () => api.get<CostRow[]>(`/api/v1/inventory/costing-runs/${curRun!.id}/lines`) });
  const tim = search.trim().toLowerCase();
  const lineRows = ln.loc((lines.data ?? []).map((l) => ({ ...l, costGroup: curRun?.centerCode ?? '', costGroupName: curRun?.centerName ?? '' }))).filter((l) => !tim || `${l.sku} ${l.name}`.toLowerCase().includes(tim));
  const run = useMutation({
    mutationFn: (extra: { imported?: { sku: string; unitCost: number; name?: string }[]; clearImport?: boolean } = {}) => api.post<CostingResult>('/api/v1/inventory/costing', { period, ...range, ...(scope ? { scope: { kind: scope.kind, code: scope.code } } : {}), ...extra }),
    onSuccess: (res) => { void qc.invalidateQueries({ queryKey: ['inventory-costs'] }); void qc.invalidateQueries({ queryKey: ['inventory-costing-runs'] }); setRunSel(res.runIds?.[0] ?? null); },
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
      errors: missing.length ? [`${res.imported!.missingCount} mã hàng có xuất trong tháng nhưng không có ĐGBQ đầu kỳ trong tệp — dùng tồn cuối tháng trước: ${missing.join(', ')}${res.imported!.missingCount > missing.length ? '…' : ''}`] : [],
    };
  };
  return (
    <>
      <PageHeader
        title="Tính giá vốn"
        code="ACC49"
        subtitle="Bình quân gia quyền theo tháng, riêng từng chi nhánh trên cơ cấu tổ chức (chi nhánh cấp 2 gom mọi shop, kho bên dưới); ghi sổ giá vốn hàng xuất"
        helpKey="tinh-gia-von"
      />
      <div className="card">
        {/* [2026-11-17 Nguyễn Văn Thủy] bố cục: ① phạm vi + tháng + nút tính ở một hàng; ② các lần tính (lọc ngày tính); ③ bảng giá vốn của lần chọn (đóng góp) */}
        <div className="filters" style={{ alignItems: 'flex-end' }}>
          <div className="field"><label title="Chọn nút bất kỳ trên Cơ cấu tổ chức (miền, chi nhánh, tỉnh) hoặc một shop: mọi shop bên dưới dùng chung một giá vốn bình quân">Phạm vi tính (cơ cấu)</label>
            <div className="row" style={{ gap: 4 }}>
              <input className="input w-md" readOnly value={scope ? scope.label : 'Tất cả'} placeholder="Bấm Chọn… trên cây cơ cấu" title={scope ? scope.label : 'Tất cả: xem mọi lần tính; bấm Tính thì tính theo các điểm tính giá vốn đang đặt'} onClick={() => setMoCay(true)} style={{ cursor: 'pointer' }} />
              <button type="button" className="btn btn-sm" onClick={() => setMoCay(true)} title="Chọn trên cây cơ cấu">Chọn…</button>
              {scope && <button type="button" className="btn btn-sm" title="Bỏ chọn — xem mọi lần tính" onClick={() => { setScope(null); setCn(''); setRunSel(null); }}>✕</button>}
            </div></div>
          <div className="field"><label title="Tháng cần tính giá vốn">Tháng</label><input type="month" className="input" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} /></div>
          <div className="field" style={{ flexDirection: 'row', gap: 6, display: 'flex' }}>
            <button className="btn btn-primary" disabled={run.isPending} onClick={() => run.mutate({})}>
              {run.isPending ? 'Đang tính…' : `Tính giá vốn${scope ? ` · ${scope.code}` : ''}${wholeMonth ? '' : ` (chứng từ ${range.from.slice(8)}–${range.to.slice(8)})`}`}
            </button>
            <ExcelImport
              columns={[{ key: 'sku', header: 'Mã hàng' }, { key: 'name', header: 'Tên hàng' }, { key: 'unitCost', header: 'ĐGBQ đầu kỳ' }]}
              keyColumn="sku"
              raw
              disabled={run.isPending}
              buttonLabel={`Nhập ĐGBQ đầu kỳ ${monthText} từ Excel`}
              hint={<>Tệp cần cột <b>Mã hàng</b> và <b>ĐGBQ đầu kỳ</b> (đơn giá vốn bình quân đầu tháng {monthText}; Tên hàng để tham khảo). Hệ thống lấy <b>tồn đầu × ĐGBQ đầu kỳ</b> làm giá trị tồn đầu, rồi bình quân với chứng từ nhập trong tháng ra <b>ĐGBQ cuối kỳ</b> — tháng sau tự lấy tiếp, không cần nhập lại. Mỗi mã một giá cho mọi chi nhánh; mã lặp nhiều dòng lấy giá khác 0 xuất hiện nhiều nhất. Bấm Ghi: tính giá vốn tháng {monthText} ngay.</>}
              onImport={importCosts}
            />
            {hasImport && <button className="btn btn-sm" disabled={run.isPending} onClick={() => window.confirm(`Bỏ ĐGBQ đầu kỳ đã nhập từ Excel của tháng ${monthText}? Tồn đầu quay về tồn cuối tháng trước rồi tính lại.`) && run.mutate({ clearImport: true })} title="Bỏ ĐGBQ đầu kỳ đã nhập — tồn đầu lấy theo tồn cuối tháng trước">Bỏ ĐGBQ đầu kỳ đã nhập</button>}
          </div>
        </div>
        <ErrorBox error={run.error ? errorText(run.error) : runs.error ? errorText(runs.error) : null} />
        {run.data && (
          <div className="card-body muted" style={{ paddingTop: 4, paddingBottom: 4 }}>
            Đã tính tháng {run.data.monthsComputed.join(', ')} · {run.data.items} mặt hàng{run.data.imported ? ` · ${run.data.imported.count} mã theo giá nhập Excel` : ''} · giá vốn ghi sổ <b>{money(run.data.total)}</b>
          </div>
        )}
        <div className="card-body row" style={{ paddingTop: 10, paddingBottom: 4, gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid var(--line, #dfe4ec)' }}>
          <b style={{ marginBottom: 6 }}>Các lần tính giá vốn</b>
          <div className="field" style={{ margin: 0 }}><label title="Lọc theo ngày bấm tính">Ngày tính từ</label><input type="date" className="input" value={ngay.from} onChange={(e) => setNgay((x) => ({ ...x, from: e.target.value }))} /></div>
          <div className="field" style={{ margin: 0 }}><label>đến</label><input type="date" className="input" value={ngay.to} onChange={(e) => setNgay((x) => ({ ...x, to: e.target.value }))} /></div>
          <span className="muted" style={{ marginBottom: 6 }}>bấm một lần để xem các mã hàng</span>
        </div>
        {runs.isLoading ? <Loading /> : !runs.data?.length ? <Empty text={cn ? 'Chi nhánh này chưa có lần tính giá vốn trong khoảng ngày — chọn tháng rồi bấm Tính giá vốn' : 'Chưa có lần tính giá vốn trong khoảng ngày'} /> : (
          <DataGrid
            storageKey="acc49-lan-tinh-v2"
            rows={runs.data}
            rowKey={(x) => x.id}
            rowClassName={(x) => (x.id === curRun?.id ? 'selected' : '')}
            onSelect={(x) => x && setRunSel(x.id)}
            maxHeight="240px"
            columns={[
              { key: 'runAt', header: 'Ngày tính', value: (x) => new Date(x.runAt).toLocaleString('vi-VN') },
              { key: 'centerCode', header: 'Phạm vi', value: (x) => `${x.centerCode} - ${x.centerName}`, title: 'Phạm vi tính trên Cơ cấu tổ chức (nút hoặc shop) — mọi shop bên dưới chung một giá vốn' },
              { key: 'period', header: 'Kỳ', value: (x) => `${x.period.slice(5)}/${x.period.slice(0, 4)}` },
              { key: 'from', header: 'Chứng từ', hidden: true, value: (x) => `${x.from.slice(8)}/${x.from.slice(5, 7)}–${x.to.slice(8)}/${x.to.slice(5, 7)}`, title: 'Khoảng ngày chứng từ được cập nhật giá vốn' },
              { key: 'items', header: 'Số mã', type: 'qty' },
              { key: 'total', header: 'Giá vốn ghi sổ', type: 'money', title: 'Tổng giá vốn hàng xuất đã ghi sổ qua phiếu "Giá vốn hàng xuất" của các shop trong phạm vi' },
              { key: 'vouchers', header: 'Phiếu giá vốn', hidden: true, value: (x) => (Array.isArray(x.vouchers) ? x.vouchers.length : 0), title: 'Phiếu "Giá vốn hàng xuất" (một phiếu / shop / tháng)' },
              { key: 'imported', header: 'Mã nhập ĐGBQ đầu kỳ', type: 'qty', hidden: true, title: 'Số mã lấy ĐGBQ đầu kỳ từ tệp Excel' },
              { key: 'runBy', header: 'Người tính' },
              { key: 'orgUid', header: 'Mốc cơ cấu', type: 'code', hidden: true, title: 'Định danh nút cơ cấu lúc tính (không đổi khi đổi mã, tên)' },
            ]}
          />
        )}
        {curRun && (
          <>
            <div className="card-body row" style={{ paddingTop: 10, paddingBottom: 4, gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid var(--line, #dfe4ec)' }}>
              <b style={{ marginBottom: 6 }}>Bảng giá vốn · {curRun.centerCode} · tháng {curRun.period.slice(5)}/{curRun.period.slice(0, 4)} · tính lúc {new Date(curRun.runAt).toLocaleString('vi-VN')}</b>
              <div className="field" style={{ margin: 0 }}><label>Mã hàng</label><input className="input w-md" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Lọc theo mã, tên hàng" /></div>
              <ChonNhomHang value={nhom} onChange={setNhom} />
              <PrintButton small screen="ACC49" templates={COST_TEMPLATES} disabled={!lineRows.length} getDocs={() => (lineRows.length ? [{ period: curRun?.period ?? period, rows: lineRows }] : [])} />
            </div>
            {lines.isLoading ? <Loading /> : (
              <DataGrid
                storageKey="acc49-v2"
                rows={lineRows}
                rowKey={(x) => x.sku}
                columns={[
                  // [2026-11-17 Nguyễn Văn Thủy] đủ cột theo dòng chảy trong kỳ; rê chuột lên tiêu đề để xem giải thích (đóng góp)
                  // [2026-11-17 Nguyễn Văn Thủy] gọn: 11 cột chính theo công thức đầu kỳ → nhập → xuất → cuối kỳ; chi tiết dòng chảy ẩn, bật ở Cột (đóng góp)
                  { key: 'sku', header: 'Mã hàng', type: 'code' },
                  { key: 'name', header: 'Tên hàng' },
                  { key: 'openingQty', header: 'SL', band: 'Tồn đầu', type: 'qty', sum: true, title: 'Số lượng tồn đầu tháng (tồn cuối tháng trước)' },
                  { key: 'openingValue', header: '$', band: 'Tồn đầu', type: 'money', sum: true, hidden: true, title: 'Giá trị tồn đầu = SL tồn đầu × ĐGBQ đầu kỳ' },
                  { key: 'dgDau', header: 'ĐGBQ đầu kỳ', type: 'money', value: (x) => dt(x, 'openingUnit'), render: (x) => dg(dt(x, 'openingUnit')), title: 'Đơn giá bình quân đầu tháng = Tồn đầu $ ÷ SL. Mã có ĐGBQ đầu kỳ nhập từ Excel thì lấy giá đó' },
                  { key: 'inQty', header: 'SL', band: 'Nhập trong kỳ', type: 'qty', sum: true, title: 'Số lượng nhập tính vào giá: nhập mua − trả NCC + nhập điều chỉnh + nhận từ chi nhánh khác' },
                  { key: 'inValue', header: '$', band: 'Nhập trong kỳ', type: 'money', sum: true, title: 'Giá trị nhập tính vào giá = nhập mua (giá Net) + chi phí phân bổ − thưởng, chiết khấu phân bổ − trả NCC + điều chỉnh + nhận từ chi nhánh khác. Bật cột chi tiết ở nút Cột' },
                  { key: 'outQty', header: 'Xuất', type: 'qty', sum: true, title: 'Số lượng xuất trong tháng (bán, chuyển sang chi nhánh khác, điều chỉnh) — tính giá vốn = SL × ĐGBQ cuối kỳ' },
                  { key: 'closingQty', header: 'SL', band: 'Tồn cuối', type: 'qty', sum: true, title: 'Số lượng tồn cuối tháng' },
                  { key: 'closingValue', header: '$', band: 'Tồn cuối', type: 'money', sum: true, title: 'Giá trị tồn cuối = SL × ĐGBQ cuối kỳ (quà giá 0 không mang giá trị)' },
                  { key: 'unitCost', header: 'ĐGBQ cuối kỳ', type: 'money', bold: true, render: (x) => dg(x.unitCost), title: 'ĐGBQ cuối kỳ = (Tồn đầu $ + Nhập trong kỳ $) ÷ (Tồn đầu SL + Nhập trong kỳ SL). Dùng tính giá vốn hàng xuất trong tháng và làm ĐGBQ đầu kỳ tháng sau' },
                  { key: 'chenh', header: 'Chênh lệch', type: 'money', value: (x) => (dt(x, 'lastPurchaseUnit') ? round2(x.unitCost - dt(x, 'lastPurchaseUnit')) : 0), title: '= ĐGBQ cuối kỳ − Giá nhập lần cuối. Lệch lớn: soát lại phiếu nhập, chi phí / thưởng phân bổ, trả NCC hoặc ĐGBQ đầu kỳ' },
                  // chi tiết (ẩn sẵn)
                  { key: 'muaQ', header: 'Nhập mua SL', type: 'qty', sum: true, hidden: true, value: (x) => dt(x, 'purchaseQty'), title: 'Nhập mua từ nhà cung cấp' },
                  { key: 'muaV', header: 'Nhập mua $', type: 'money', sum: true, hidden: true, value: (x) => dt(x, 'purchaseValue'), title: 'Giá Net = đơn giá chưa VAT − chiết khấu' },
                  { key: 'cpPb', header: 'Chi phí phân bổ (+)', type: 'money', sum: true, hidden: true, value: (x) => dt(x, 'costAlloc'), title: 'Chi phí mua hàng phân bổ vào mã (vận chuyển, bốc xếp…) — TĂNG giá vốn' },
                  { key: 'thPb', header: 'Thưởng, CK phân bổ (−)', type: 'money', sum: true, hidden: true, value: (x) => dt(x, 'rebateAlloc'), title: 'Thưởng doanh số / chiết khấu nhãn hàng phân bổ theo mã — GIẢM giá vốn' },
                  { key: 'traQ', header: 'Trả NCC SL', type: 'qty', sum: true, hidden: true, value: (x) => dt(x, 'returnQty'), title: 'Hàng mua trả lại nhà cung cấp' },
                  { key: 'traV', header: 'Trả NCC $', type: 'money', sum: true, hidden: true, value: (x) => dt(x, 'returnValue'), title: 'Giá trị trả NCC trừ khỏi nhập trong kỳ' },
                  { key: 'nnbQ', header: 'Nhập nội bộ SL', type: 'qty', sum: true, hidden: true, value: (x) => dt(x, 'tInQty'), title: 'Nhận chuyển kho; từ chi nhánh khác tính giá theo bên gửi, cùng chi nhánh không đổi giá' },
                  { key: 'xnbQ', header: 'Xuất nội bộ SL', type: 'qty', sum: true, hidden: true, value: (x) => dt(x, 'tOutQty'), title: 'Chuyển kho đi' },
                  { key: 'banQ', header: 'Xuất bán SL', type: 'qty', sum: true, hidden: true, value: (x) => dt(x, 'saleQty'), title: 'Xuất bán (bán lẻ, bán buôn, tặng kèm)' },
                  { key: 'ntQ', header: 'Nhập trả SL', type: 'qty', sum: true, hidden: true, value: (x) => dt(x, 'saleReturnQty'), title: 'Khách trả hàng' },
                  { key: 'dgKy', header: 'ĐGBQ trong kỳ', type: 'money', hidden: true, value: (x) => dt(x, 'periodUnit'), render: (x) => dg(dt(x, 'periodUnit')), title: 'Đơn giá bình quân của riêng phần nhập trong tháng = Nhập trong kỳ $ ÷ SL' },
                  { key: 'giaCuoi', header: 'Giá nhập lần cuối', type: 'money', hidden: true, value: (x) => dt(x, 'lastPurchaseUnit'), render: (x) => dg(dt(x, 'lastPurchaseUnit')), title: 'Đơn giá Net của lần nhập mua gần nhất (tới hết tháng)' },
                  { key: 'costSource', header: 'Nguồn ĐGBQ đầu kỳ', hidden: true, value: (x) => (x.costSource === 'import' ? 'Nhập Excel' : 'Tồn cuối tháng trước'), title: 'ĐGBQ đầu kỳ lấy từ tệp Excel hay tồn cuối tháng trước' },
                  { key: 'giftQty', header: 'Quà giá 0', type: 'qty', sum: true, hidden: true, title: 'Quà khuyến mại nhận kèm phiếu mua: nằm trong SL tồn nhưng không mang giá trị' },
                ]}
              />
            )}
          </>
        )}
        {moCay && (
          <Modal title="Chọn phạm vi tính giá vốn" onClose={() => setMoCay(false)} footer={<button className="btn" onClick={() => setMoCay(false)}>Thoát</button>}>
            <div className="full muted" style={{ fontSize: 12.5 }}>Bấm một nút (miền, chi nhánh, tỉnh) hoặc một shop. Bấm Tính giá vốn: mọi shop bên dưới dùng chung một giá vốn bình quân từ lần tính đó.</div>
            <div className="full">
              <CayDonVi tree={orgTree.data} showBranches height={460} openLevel={2}
                selected={scope?.kind === 'node' ? scope.code : null}
                onSelect={(n) => { setScope({ kind: 'node', code: n.code, label: `${n.code} - ${n.name}` }); setCn(n.code); setRunSel(null); setMoCay(false); }}
                onSelectBranch={(b) => { setScope({ kind: 'shop', code: b.code, label: `Shop ${b.code} - ${b.name}` }); setCn(b.code); setRunSel(null); setMoCay(false); }} />
            </div>
          </Modal>
        )}
      </div>
    </>
  );
}

/** Lấy một số trong chi tiết dòng chảy (0150); dòng tính trước khi có chi tiết thì 0. */
const dt = (x: { detail?: Record<string, number> }, k: string) => Number(x.detail?.[k] ?? 0) || 0;
const dg = (v: number) => (v ? v.toLocaleString('vi-VN', { maximumFractionDigits: 4 }) : '');
const round2 = (v: number) => Math.round(v * 100) / 100;

interface CostRun { id: string; orgUid: string; centerCode: string; centerName: string; period: string; from: string; to: string; items: number; total: number; imported: number; vouchers: unknown; runBy: string; runAt: string }

/* ------------------------------------------------------------------ ACC83 */
interface StockFigures { openingQty: number; openingValue: number; inQty: number; inValue: number; outQty: number; outValue: number; closingQty: number; closingValue: number; purchaseQty: number; purchaseValue: number; cogsQty: number; cogsValue: number; uncosted: number }
interface StockRow extends StockFigures { branchCode: string; branchName: string; sku: string; name: string; unit: string }
interface StockData { rows: StockRow[]; uncosted: number }
interface GroupRow extends StockFigures { key: string; label: string; skuCount: number }
interface GroupData { rows: GroupRow[]; uncosted: number; purchaseOnly: boolean }
const STOCK_VIEWS: [string, string][] = [
  // [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — xem theo nhóm hàng cấp 1 / 2 / 3: cộng dồn cả nhánh con trên cây nhóm hàng
  ['item', 'Mặt hàng (chi tiết)'], ['itemGroup1', 'Nhóm hàng cấp 1'], ['itemGroup2', 'Nhóm hàng cấp 2'], ['itemGroup3', 'Nhóm hàng cấp 3'], ['itemGroup', 'Nhóm hàng gắn trên mặt hàng'], ['itemType', 'Loại hàng'], ['brand', 'Nhãn hiệu'], ['industry', 'Ngành hàng'], ['postingGroup', 'Nhóm hạch toán (hàng thường, khuyến mại…)'],
  ['branch', 'Chi nhánh'], ['supplier', 'Nhà cung cấp (mua hàng)'], ['supplierGroup', 'Nhóm nhà cung cấp (mua hàng)'],
];
const figureCols = (stock: boolean, extra: boolean): Column<StockFigures>[] => [
  ...(stock ? ([
    { key: 'openingQty', header: 'Số lượng', band: 'Đầu kỳ', type: 'qty', sum: true },
    { key: 'openingValue', header: 'Giá trị', band: 'Đầu kỳ', type: 'money', sum: true },
    { key: 'inQty', header: 'Số lượng', band: 'Nhập kho', type: 'qty', sum: true },
    { key: 'inValue', header: 'Giá trị', band: 'Nhập kho', type: 'money', sum: true },
    { key: 'outQty', header: 'Số lượng', band: 'Xuất kho', type: 'qty', sum: true },
    { key: 'outValue', header: 'Giá trị', band: 'Xuất kho', type: 'money', sum: true },
    { key: 'closingQty', header: 'Số lượng', band: 'Cuối kỳ', type: 'qty', sum: true },
    { key: 'closingValue', header: 'Giá trị', band: 'Cuối kỳ', type: 'money', sum: true },
  ] satisfies Column<StockFigures>[]) : []),
  { key: 'purchaseQty', header: 'Số lượng', band: 'Mua hàng (trừ trả lại)', type: 'qty', sum: true, hidden: !extra },
  { key: 'purchaseValue', header: 'Giá trị', band: 'Mua hàng (trừ trả lại)', type: 'money', sum: true, hidden: !extra },
  ...(stock ? ([
    { key: 'cogsQty', header: 'Số lượng', band: 'Giá vốn hàng bán', type: 'qty', sum: true, hidden: !extra },
    { key: 'cogsValue', header: 'Giá trị', band: 'Giá vốn hàng bán', type: 'money', sum: true, hidden: !extra },
  ] satisfies Column<StockFigures>[]) : []),
];

const FIG_KEYS = ['openingQty', 'openingValue', 'inQty', 'inValue', 'outQty', 'outValue', 'closingQty', 'closingValue', 'purchaseQty', 'purchaseValue', 'cogsQty', 'cogsValue', 'uncosted'] as const;
type ItemRow = StockRow & { kind: 'group' | 'data' | 'subtotal'; label?: string };
/** Tổng hợp tồn kho theo mặt hàng: nhiều kho (chi nhánh) thì nhóm "Kho: …" + Cộng nhóm; gộp thì cộng các kho theo mã. Dòng thiếu tên lấy tên ở kho khác. */
function buildItemRows(rows: StockRow[], merge: boolean): ItemRow[] {
  const names = new Map<string, string>();
  for (const r of rows) if (r.name && r.name !== r.sku && !names.has(r.sku)) names.set(r.sku, r.name);
  const named = rows.map((r) => ({ ...r, name: names.get(r.sku) ?? r.name }));
  const add = (a: StockRow, b: StockRow) => { for (const k of FIG_KEYS) a[k] += b[k]; };
  if (merge) {
    const by = new Map<string, StockRow>();
    for (const r of named) { const x = by.get(r.sku); if (x) add(x, r); else by.set(r.sku, { ...r, branchCode: '', branchName: '' }); }
    return [...by.values()].sort((a, b) => a.sku.localeCompare(b.sku)).map((r) => ({ ...r, kind: 'data' }));
  }
  const branches = [...new Set(named.map((r) => r.branchCode))].sort();
  if (branches.length < 2) return named.map((r) => ({ ...r, kind: 'data' }));
  return branches.flatMap((b): ItemRow[] => {
    const rs = named.filter((r) => r.branchCode === b).sort((x, y) => x.sku.localeCompare(y.sku));
    const sub = { ...rs[0]!, sku: '', name: `Cộng nhóm: ${b}`, unit: '' };
    for (const k of FIG_KEYS) sub[k] = 0;
    rs.forEach((r) => add(sub, r));
    return [{ ...sub, kind: 'group', label: `Kho: ${b}${rs[0]!.branchName ? ` - ${rs[0]!.branchName}` : ''}` }, ...rs.map((r): ItemRow => ({ ...r, kind: 'data' })), { ...sub, kind: 'subtotal' }];
  });
}

export function StockMovementPage() {
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '', warehouseCodes: '', search: '', groups: '' });
  const [view, setView] = useState('item');
  const [merge, setMerge] = useState(false);
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
      <PageHeader title="Tổng hợp tồn kho" code="ACC83" subtitle="Tồn đầu, nhập, xuất, tồn cuối, mua hàng, giá vốn theo mặt hàng hoặc gom theo nhóm, loại, nhãn hiệu, ngành hàng, chi nhánh, nhà cung cấp" helpKey="nhap-xuat-ton" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen="ACC83" templates={STOCK_TEMPLATES} disabled={!d} getDocs={sheet} />}
        filters={
          <>
            <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ search: search.trim() }); }}>
              <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
              <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} warehouses={{ value: f.warehouseCodes, onChange: (warehouseCodes) => set({ warehouseCodes }) }} />
              <ChonNhomHang value={f.groups} onChange={(groups) => set({ groups })} />
              <div className="field"><label>Xem theo</label><select className="select input" value={view} onChange={(e) => setView(e.target.value)}>{STOCK_VIEWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              {view === 'item' && <label className="checkbox"><input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} /> Cộng gộp các kho</label>}
              <div className="field"><label>Mã / tên hàng</label><input className="input w-md" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => set({ search: search.trim() })} /></div>
            </form>
          </>
        }
      >
        <div className="card">
          <div className="rp-tieu-de"><h2>TỔNG HỢP TỒN KHO</h2><i>{kyText(f.from, f.to)}</i></div>
          <ErrorBox error={q.error ? errorText(q.error) : g.error ? errorText(g.error) : null} />
          {g.data?.purchaseOnly && view !== 'item' && <div className="card-body muted" style={{ paddingTop: 0 }}>Gom theo nhà cung cấp chỉ có phần mua hàng trong kỳ (nhập mua trừ hàng trả nhà cung cấp), theo đối tượng của phiếu nhập.</div>}
          {d && d.uncosted > 0 && <div className="card-body muted">Có {d.uncosted} lần xuất / nhập chưa có giá trị (tháng chưa tính giá vốn): cột giá trị chưa đầy đủ. Vào <b>Tính giá vốn</b> để tính.</div>}
          {(view === 'item' ? q.isLoading : g.isLoading) ? <Loading /> : !d?.rows.length ? <Empty text="Không có hàng hoá phát sinh" /> : view === 'item' ? (
            <DataGrid
              storageKey="acc83-v3"
              rows={buildItemRows(q.data?.rows ?? [], merge)}
              rowKey={(r, i) => `${r.kind}-${r.branchCode}-${r.sku}-${i}`}
              rowKind={(r) => r.kind}
              groupLabel={(r) => <b>{r.label}</b>}
              footerLabel="Tổng cộng"
              exportName={`tong-hop-ton-kho-${f.from}-${f.to}`} exportTitle={`Tổng hợp tồn kho — ${kyText(f.from, f.to)}`}
              columns={[
                { key: 'sku', header: 'Mã hàng', type: 'code', width: 120 },
                { key: 'name', header: 'Tên hàng', width: 280 },
                { key: 'unit', header: 'ĐVT', width: 70 },
                ...(figureCols(true, false) as Column<ItemRow>[]),
                // [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1: nút Truy vết → Hành trình mặt hàng đúng mã, đúng khoảng ngày của báo cáo
                { key: 'trace', header: '', noFilter: true, noSort: true, width: 70, render: (r) => r.kind === 'data' && <Link to={`/bao-cao/hanh-trinh-mat-hang?sku=${encodeURIComponent(r.sku)}&from=${f.from}&to=${f.to}`}>Truy vết</Link> },
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

const qtyText = (n: number) => n.toLocaleString('vi-VN');

/** theKho: Thẻ kho (KHO06) — chỉ số lượng, cột ký xác nhận của kế toán; in mặc định mẫu S12-DN. */
export function ItemLedgerPage({ theKho = false }: { theKho?: boolean } = {}) {
  // [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1: nhận mã hàng / khoảng ngày từ URL (từ Hành trình mặt hàng, danh mục mặt hàng)
  const [sp] = useSearchParams();
  const [f, setF] = useState({ from: sp.get('from') || defaultFrom(), to: sp.get('to') || defaultTo(), branchCodes: '', warehouseCodes: '', sku: sp.get('sku') ?? '' });
  const [sku, setSku] = useState(sp.get('sku') ?? '');
  const [docId, setDocId] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['item-ledger', f], enabled: Boolean(f.sku), queryFn: () => api.get<ItemLedger>('/api/v1/inventory/item-ledger', f) });
  const d = q.data;
  return (
    <>
      {theKho ? <PageHeader title="Thẻ kho" code="KHO06" subtitle="Mẫu S12-DN: số lượng nhập, xuất, tồn của một mặt hàng tại kho — cho thủ kho, cửa hàng" helpKey="so-chi-tiet-hang-hoa" />
        : <PageHeader title="Sổ chi tiết vật tư hàng hóa" code="ACC82" subtitle="Từng lần nhập, xuất của một mặt hàng: số tồn đầu kỳ, nhập, xuất, tồn sau mỗi lần, số tồn cuối kỳ" helpKey="so-chi-tiet-hang-hoa" />}
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        print={<PrintButton screen={theKho ? 'KHO06' : 'ACC82'} templates={theKho ? [...ITEM_LEDGER_TEMPLATES].sort((a) => (a.id === 's12' ? -1 : 0)) : ITEM_LEDGER_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...d, from: f.from, to: f.to, branchCodes: f.branchCodes, warehouseCodes: f.warehouseCodes }] : [])} />}
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
              <div className="rp-tieu-de"><h2>{theKho ? 'THẺ KHO (SỔ KHO)' : 'SỔ CHI TIẾT VẬT TƯ HÀNG HÓA'}</h2><i>{kyText(f.from, f.to)}</i></div>
              <div className="card-body" style={{ paddingTop: 0 }}>
                Mã hàng: <b className="mono">{d.sku}</b> · Tên hàng: <b>{d.name}</b>{d.unit && ` · ĐVT: ${d.unit}`} <Link className="btn btn-xs" to={`/bao-cao/hanh-trinh-mat-hang?sku=${encodeURIComponent(d.sku)}&from=${f.from}&to=${f.to}`}>Truy vết</Link>
              </div>
              <DataGrid
                storageKey={theKho ? 'kho06' : 'acc82-v2'}
                rows={theKho ? d.rows.filter((r) => r.inQty || r.outQty) : d.rows}
                rowKey={(r, i) => `${r.eventId}-${i}`}
                onRowClick={(r) => setDocId(r.eventId)}
                footerLabel="Cộng"
                emptyText="Không có phát sinh trong kỳ"
                topRows={[{ key: 'open', label: 'Số tồn đầu kỳ', cells: { balanceQty: qtyText(d.opening.qty), ...(theKho ? {} : { balanceValue: money(d.opening.value) }) } }]}
                bottomRows={[{ key: 'close', label: 'Số tồn cuối kỳ', cells: { balanceQty: qtyText(d.closing.qty), ...(theKho ? {} : { balanceValue: money(d.closing.value) }) } }]}
                exportName={`so-chi-tiet-vthh-${d.sku}`} exportTitle={`Sổ chi tiết vật tư hàng hóa ${d.sku} — ${kyText(f.from, f.to)}`}
                columns={theKho ? [
                  { key: 'docDate', header: 'Ngày, tháng', type: 'date', width: 104 },
                  { key: 'noIn', header: 'Nhập', band: 'Số hiệu chứng từ', type: 'code', width: 130, value: (r) => (r.inQty ? r.docNo : '') },
                  { key: 'noOut', header: 'Xuất', band: 'Số hiệu chứng từ', type: 'code', width: 130, value: (r) => (r.outQty ? r.docNo : '') },
                  { key: 'kindLabel', header: 'Diễn giải', width: 240 },
                  { key: 'inQty', header: 'Nhập', band: 'Số lượng', type: 'qty', sum: true },
                  { key: 'outQty', header: 'Xuất', band: 'Số lượng', type: 'qty', sum: true },
                  { key: 'balanceQty', header: 'Tồn', band: 'Số lượng', type: 'qty' },
                  { key: 'sign', header: 'Ký xác nhận của kế toán', width: 140, noFilter: true, noSort: true, value: () => '' },
                  { key: 'branchCode', header: 'Kho', type: 'code', width: 90 },
                ] : [
                  { key: 'docDate', header: 'Ngày hạch toán', type: 'date', width: 104 },
                  { key: 'docNo', header: 'Số chứng từ', type: 'code', width: 130 },
                  { key: 'kindLabel', header: 'Diễn giải', width: 220 },
                  { key: 'price', header: 'Đơn giá', type: 'price', width: 110, title: 'Giá trị ÷ số lượng của lần nhập / xuất', value: (r) => { const q = r.inQty || r.outQty; const v = r.inQty ? r.inValue : r.outValue; return q ? Math.round((v / q) * 100) / 100 : null; } },
                  { key: 'inQty', header: 'Số lượng', band: 'Nhập', type: 'qty', sum: true },
                  { key: 'inValue', header: 'Giá trị', band: 'Nhập', type: 'money', sum: true },
                  { key: 'outQty', header: 'Số lượng', band: 'Xuất', type: 'qty', sum: true },
                  { key: 'outValue', header: 'Giá trị', band: 'Xuất', type: 'money', sum: true },
                  { key: 'balanceQty', header: 'Số lượng', band: 'Tồn', type: 'qty' },
                  { key: 'balanceValue', header: 'Giá trị', band: 'Tồn', type: 'money' },
                  { key: 'branchCode', header: 'Kho', type: 'code', width: 90 },
                ]}
              />
            </>
          )}
        </div>
      </FilterLayout>
      {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
    </>
  );
}
