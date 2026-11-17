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
import { Empty, ErrorBox, Hoi, Loading, Modal } from '@/components/ui';
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
  // [2026-11-17 Nguyễn Văn Thủy] công thức giá vốn tuỳ chọn: chọn ở mỗi lần tính, sửa / thêm trong hộp thoại (đóng góp)
  const formulas = useQuery({ queryKey: ['costing-formulas'], queryFn: () => api.get<Formula[]>('/api/v1/inventory/costing-formulas') });
  const [xemCt, setXemCt] = useState(false);
  const qc = useQueryClient();
  const [period, setPeriodState] = useState(thisMonth());
  // [2026-11-17 Nguyễn Văn Thủy] công thức cố định: tháng đang tính dùng công thức có "áp dụng từ" gần nhất ≤ tháng; chỉ xem, đổi ở hộp Xem (mật khẩu) (đóng góp)
  const ct = ctCuaThang(formulas.data ?? [], period);
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
      errors: missing.length ? [`${res.imported!.missingCount} mã hàng có xuất trong tháng nhưng không có giá vốn bình quân đầu kỳ trong tệp — dùng tồn cuối tháng trước: ${missing.join(', ')}${res.imported!.missingCount > missing.length ? '…' : ''}`] : [],
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
          <div className="field"><label title="Công thức giá vốn áp dụng cho tháng đang chọn — cố định, bấm để xem các lựa chọn">Công thức</label>
            <button type="button" className="btn" style={{ minWidth: 200, justifyContent: 'flex-start' }} title={ct ? `${moTaCt(ct.options)}\nÁp dụng từ ${thangVn(ct.applyFrom)}` : ''} onClick={() => setXemCt(true)}>
              {ct?.name ?? 'Mặc định (giá Net)'}
            </button></div>
          <div className="field"><label title="Tháng cần tính giá vốn">Tháng</label><input type="month" className="input" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} /></div>
          <div className="field" style={{ flexDirection: 'row', gap: 6, display: 'flex' }}>
            <button className="btn btn-primary" disabled={run.isPending} onClick={() => run.mutate({})}>
              {run.isPending ? 'Đang tính…' : `Tính giá vốn${scope ? ` · ${scope.code}` : ''}${wholeMonth ? '' : ` (chứng từ ${range.from.slice(8)}–${range.to.slice(8)})`}`}
            </button>
            <ExcelImport
              columns={[{ key: 'sku', header: 'Mã hàng' }, { key: 'name', header: 'Tên hàng' }, { key: 'unitCost', header: 'Giá vốn bình quân đầu kỳ' }]}
              keyColumn="sku"
              raw
              disabled={run.isPending}
              buttonLabel={`Nhập giá vốn bình quân đầu kỳ ${monthText} từ Excel`}
              hint={<>Tệp cần cột <b>Mã hàng</b> và <b>Giá vốn bình quân đầu kỳ</b> (giá vốn bình quân đầu tháng {monthText}; Tên hàng để tham khảo). Hệ thống lấy <b>tồn đầu × giá vốn bình quân đầu kỳ</b> làm giá trị tồn đầu, rồi bình quân với chứng từ nhập trong tháng ra <b>giá vốn bình quân cuối kỳ</b> — tháng sau tự lấy tiếp, không cần nhập lại. Mỗi mã một giá cho mọi chi nhánh; mã lặp nhiều dòng lấy giá khác 0 xuất hiện nhiều nhất. Bấm Ghi: tính giá vốn tháng {monthText} ngay.</>}
              onImport={importCosts}
            />
            {hasImport && <button className="btn btn-sm" disabled={run.isPending} onClick={() => window.confirm(`Bỏ giá vốn bình quân đầu kỳ đã nhập từ Excel của tháng ${monthText}? Tồn đầu quay về tồn cuối tháng trước rồi tính lại.`) && run.mutate({ clearImport: true })} title="Bỏ giá vốn bình quân đầu kỳ đã nhập — tồn đầu lấy theo tồn cuối tháng trước">Bỏ giá đầu kỳ đã nhập</button>}
          </div>
        </div>
        <ErrorBox error={run.error ? errorText(run.error) : runs.error ? errorText(runs.error) : null} />
        {run.data && (
          <div className="card-body muted" style={{ paddingTop: 4, paddingBottom: 4 }}>
            Đã tính tháng {run.data.monthsComputed.join(', ')} · {run.data.items} mặt hàng{run.data.imported ? ` · ${run.data.imported.count} mã theo giá nhập Excel` : ''}
          </div>
        )}
        {/* [2026-11-17 Nguyễn Văn Thủy] LỊCH SỬ TÍNH bên trái (gom theo ngày, mỗi lần một thẻ), bảng giá vốn lần đang chọn bên phải (đóng góp) */}
        <div className="gv-wrap">
          <aside className="gv-ls">
            <div className="gv-ls-head"><b>Lịch sử tính</b></div>
            <div className="gv-ls-loc">
              <input type="date" className="input" value={ngay.from} title="Ngày tính từ" onChange={(e) => setNgay((x) => ({ ...x, from: e.target.value }))} />
              <span>–</span>
              <input type="date" className="input" value={ngay.to} title="Ngày tính đến" onChange={(e) => setNgay((x) => ({ ...x, to: e.target.value }))} />
            </div>
            <div className="gv-ls-list">
              {runs.isLoading ? <Loading /> : !runs.data?.length ? <div className="muted" style={{ padding: 12, fontSize: 12.5 }}>{cn ? 'Phạm vi này chưa có lần tính trong khoảng ngày — chọn tháng rồi bấm Tính giá vốn.' : 'Chưa có lần tính trong khoảng ngày.'}</div>
                : [...new Map(runs.data.map((x) => [new Date(x.runAt).toLocaleDateString('vi-VN'), runs.data!.filter((y) => new Date(y.runAt).toLocaleDateString('vi-VN') === new Date(x.runAt).toLocaleDateString('vi-VN'))])).entries()].map(([ngayTinh, ds]) => (
                  <div key={ngayTinh}>
                    <div className="gv-ls-ngay">{ngayTinh}</div>
                    {ds.map((x) => (
                      <button key={x.id} type="button" className={`gv-ls-item${x.id === curRun?.id ? ' on' : ''}`} onClick={() => setRunSel(x.id)}
                        title={`Tính lúc ${new Date(x.runAt).toLocaleString('vi-VN')} · ${x.centerCode} - ${x.centerName} · kỳ ${x.period.slice(5)}/${x.period.slice(0, 4)} · ${x.items} mã · ${x.runBy}\nCông thức: ${x.formulaName || 'Mặc định'} — ${moTaCt(x.formula)}`}>
                        <span className="gv-ls-gio">{new Date(x.runAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="gv-ls-nd">
                          <b>{x.centerCode ? `${x.centerCode} - ` : ''}{x.centerName}</b>
                          <small>Kỳ {x.period.slice(5)}/{x.period.slice(0, 4)} · {x.items} mã · {x.runBy}</small>
                          <small className="gv-ls-ct" title={moTaCt(x.formula)}>{x.formulaName || 'Mặc định'}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
            </div>
          </aside>
          <div className="gv-main">
        {curRun && (
          <>
            <div className="card-body row" style={{ paddingTop: 10, paddingBottom: 4, gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <b style={{ marginBottom: 6 }}>Bảng giá vốn · {curRun.centerCode} · tháng {curRun.period.slice(5)}/{curRun.period.slice(0, 4)} · tính lúc {new Date(curRun.runAt).toLocaleString('vi-VN')} · <span title={moTaCt(curRun.formula)} style={{ borderBottom: '1px dotted', cursor: 'help' }}>{curRun.formulaName || 'Mặc định'}</span></b>
              <div className="field" style={{ margin: 0 }}><label>Mã hàng</label><input className="input w-md" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Lọc theo mã, tên hàng" /></div>
              <ChonNhomHang value={nhom} onChange={setNhom} />
              <PrintButton small screen="ACC49" templates={COST_TEMPLATES} disabled={!lineRows.length} getDocs={() => (lineRows.length ? [{ period: curRun?.period ?? period, rows: lineRows }] : [])} />
            </div>
            {lines.isLoading ? <Loading /> : (
              <DataGrid
                storageKey="acc49-v3"
                rows={lineRows}
                rowKey={(x) => x.sku}
                columns={[
                  // [2026-11-17 Nguyễn Văn Thủy] đủ cột theo dòng chảy trong kỳ; rê chuột lên tiêu đề để xem giải thích (đóng góp)
                  // [2026-11-17 Nguyễn Văn Thủy] đủ thành phần cộng ra Giá vốn bình quân cuối kỳ: Tồn đầu + Nhập mua + Chi phí phân bổ − Thưởng, CK + Nhập khác;
                  // chi tiết khác ẩn sẵn, bật ở Cột. Rê chuột lên tiêu đề xem giải thích (đóng góp)
                  { key: 'sku', header: 'Mã hàng', type: 'code' },
                  { key: 'name', header: 'Tên hàng' },
                  { key: 'openingQty', header: 'SL', band: 'Tồn đầu', type: 'qty', sum: true, title: 'Số lượng tồn đầu tháng (= tồn cuối tháng trước)' },
                  { key: 'openingValue', header: '$', band: 'Tồn đầu', type: 'money', sum: true, title: 'Giá trị tồn đầu = SL tồn đầu × Giá vốn bình quân đầu kỳ' },
                  { key: 'dgDau', header: 'Giá vốn BQ đầu kỳ', type: 'money', value: (x) => dt(x, 'openingUnit'), render: (x) => dg(dt(x, 'openingUnit')), title: 'Giá vốn bình quân đầu kỳ = Tồn đầu $ ÷ SL tồn đầu (= giá vốn bình quân cuối kỳ tháng trước). Mã có giá nhập từ Excel thì lấy giá đó' },
                  { key: 'muaQ', header: 'SL', band: 'Nhập mua', type: 'qty', sum: true, value: (x) => dt(x, 'purchaseQty'), title: 'Số lượng nhập mua từ nhà cung cấp trong tháng' },
                  { key: 'muaV', header: '$', band: 'Nhập mua', type: 'money', sum: true, value: (x) => dt(x, 'purchaseValue'), title: 'Giá trị nhập mua theo giá Net (đơn giá chưa VAT − chiết khấu trên phiếu)' },
                  { key: 'cpPb', header: 'Chi phí (+)', type: 'money', sum: true, value: (x) => dt(x, 'costAlloc'), title: 'Chi phí mua hàng phân bổ vào mã (vận chuyển, bốc xếp…) — làm TĂNG giá vốn. Lập ở phiếu Chi phí mua hàng, phân bổ theo phiếu nhập' },
                  { key: 'thPb', header: 'Thưởng, CK (−)', type: 'money', sum: true, value: (x) => dt(x, 'rebateAlloc'), title: 'Thưởng doanh số / chiết khấu của nhãn hàng phân bổ theo mã — làm GIẢM giá vốn. Lập ở Giảm giá hàng mua hoặc Tính thưởng cuối kỳ' },
                  { key: 'khQ', header: 'SL', band: 'Nhập khác', type: 'qty', sum: true, value: (x) => round2(x.inQty - dt(x, 'purchaseQty')), title: 'Phần nhập khác tính vào giá: trả nhà cung cấp (âm), nhập điều chỉnh, nhận từ chi nhánh khác. Bật cột chi tiết ở nút Cột' },
                  { key: 'khV', header: '$', band: 'Nhập khác', type: 'money', sum: true, value: (x) => Math.round(x.inValue - dt(x, 'purchaseValue') - dt(x, 'costAlloc') + dt(x, 'rebateAlloc')), title: 'Giá trị nhập khác: trả nhà cung cấp (âm), nhập điều chỉnh, nhận từ chi nhánh khác (theo giá vốn bên gửi)' },
                  { key: 'unitCost', header: 'Giá vốn BQ cuối kỳ', type: 'money', bold: true, render: (x) => dg(x.unitCost), title: 'Giá vốn bình quân cuối kỳ = (Tồn đầu $ + Nhập mua $ + Chi phí − Thưởng, CK + Nhập khác $) ÷ (Tồn đầu SL + Nhập mua SL + Nhập khác SL). Dùng tính giá vốn hàng xuất trong tháng và làm giá vốn bình quân đầu kỳ tháng sau' },
                  { key: 'outQty', header: 'Xuất', type: 'qty', sum: true, title: 'Số lượng xuất trong tháng (bán, chuyển sang chi nhánh khác, điều chỉnh) — giá vốn hàng xuất = SL × Giá vốn bình quân cuối kỳ' },
                  { key: 'closingQty', header: 'SL', band: 'Tồn cuối', type: 'qty', sum: true, title: 'Số lượng tồn cuối tháng' },
                  { key: 'closingValue', header: '$', band: 'Tồn cuối', type: 'money', sum: true, title: 'Giá trị tồn cuối = SL × Giá vốn bình quân cuối kỳ (quà giá 0 không mang giá trị)' },
                  // chi tiết (ẩn sẵn)
                  { key: 'traQ', header: 'Trả NCC SL', type: 'qty', sum: true, hidden: true, value: (x) => dt(x, 'returnQty'), title: 'Hàng mua trả lại nhà cung cấp (nằm trong Nhập khác, số âm)' },
                  { key: 'traV', header: 'Trả NCC $', type: 'money', sum: true, hidden: true, value: (x) => dt(x, 'returnValue'), title: 'Giá trị trả nhà cung cấp trừ khỏi giá vốn' },
                  { key: 'nnbQ', header: 'Nhập nội bộ SL', type: 'qty', sum: true, hidden: true, value: (x) => dt(x, 'tInQty'), title: 'Nhận chuyển kho; từ chi nhánh khác tính giá theo bên gửi, cùng chi nhánh không đổi giá' },
                  { key: 'xnbQ', header: 'Xuất nội bộ SL', type: 'qty', sum: true, hidden: true, value: (x) => dt(x, 'tOutQty'), title: 'Chuyển kho đi' },
                  { key: 'banQ', header: 'Xuất bán SL', type: 'qty', sum: true, hidden: true, value: (x) => dt(x, 'saleQty'), title: 'Xuất bán (bán lẻ, bán buôn, tặng kèm)' },
                  { key: 'ntQ', header: 'Nhập trả SL', type: 'qty', sum: true, hidden: true, value: (x) => dt(x, 'saleReturnQty'), title: 'Khách trả hàng' },
                  { key: 'giaCuoi', header: 'Giá nhập lần cuối', type: 'money', hidden: true, value: (x) => dt(x, 'lastPurchaseUnit'), render: (x) => dg(dt(x, 'lastPurchaseUnit')), title: 'Giá Net của lần nhập mua gần nhất (tới hết tháng)' },
                  { key: 'chenh', header: 'Chênh lệch', type: 'money', hidden: true, value: (x) => (dt(x, 'lastPurchaseUnit') ? round2(x.unitCost - dt(x, 'lastPurchaseUnit')) : 0), title: '= Giá vốn bình quân cuối kỳ − Giá nhập lần cuối. Lệch lớn: soát lại phiếu nhập, chi phí / thưởng phân bổ, trả NCC hoặc giá vốn đầu kỳ' },
                  { key: 'costSource', header: 'Nguồn giá đầu kỳ', hidden: true, value: (x) => (x.costSource === 'import' ? 'Nhập Excel' : 'Tồn cuối tháng trước'), title: 'Giá vốn bình quân đầu kỳ lấy từ tệp Excel hay tồn cuối tháng trước' },
                  { key: 'giftQty', header: 'Quà giá 0', type: 'qty', sum: true, hidden: true, title: 'Quà khuyến mại nhận kèm phiếu mua: nằm trong SL tồn nhưng không mang giá trị' },
                ]}
              />
            )}
          </>
        )}
            {!curRun && !runs.isLoading && <div className="muted" style={{ padding: 24 }}>Chọn một lần tính bên trái để xem bảng giá vốn.</div>}
          </div>
        </div>
        {xemCt && <XemCongThuc ds={formulas.data ?? []} period={period} onClose={() => setXemCt(false)} />}
        {moCay && (
          <Modal title="Chọn phạm vi tính giá vốn" onClose={() => setMoCay(false)} footer={<button className="btn" onClick={() => setMoCay(false)}>Thoát</button>}>
            <div className="full muted" style={{ fontSize: 12.5 }}>Bấm một nút (miền, chi nhánh, tỉnh) hoặc một shop. Bấm Tính giá vốn: mọi shop bên dưới dùng chung một giá vốn bình quân từ lần tính đó.</div>
            <div className="full">
              <CayDonVi tree={orgTree.data} showBranches hideActiveToggle height={460} openLevel={2}
                selected={scope?.kind === 'node' ? scope.code : null}
                onSelect={(n) => { setScope({ kind: 'node', code: n.code, label: `${n.code} - ${n.name}` }); setCn(n.code); setRunSel(null); setMoCay(false); }}
                onSelectBranch={(b) => { setScope({ kind: 'shop', code: b.code, label: `Shop ${b.code} - ${b.name}` }); setCn(b.code); setRunSel(null); setMoCay(false); }} />
            </div>
          </Modal>
        )}
      </div>

      <style>{`
        .gv-wrap { display: grid; grid-template-columns: 260px minmax(0, 1fr); border-top: 1px solid var(--line, #dfe4ec); }
        .gv-ls { border-right: 1px solid var(--line, #dfe4ec); display: flex; flex-direction: column; min-height: 420px; }
        .gv-ls-head { padding: 10px 12px 4px; }
        .gv-ls-loc { display: flex; align-items: center; gap: 4px; padding: 0 12px 8px; }
        .gv-ls-loc .input { width: 100%; min-width: 0; padding: 4px 6px; font-size: 12.5px; }
        .gv-ls-list { overflow: auto; max-height: 560px; padding-bottom: 8px; }
        .gv-ls-ngay { position: sticky; top: 0; background: var(--subtle, #f4f6fa); padding: 4px 12px; font-size: 11.5px; font-weight: 600; color: var(--muted, #6b7686); }
        .gv-ls-item { display: flex; gap: 10px; width: 100%; text-align: left; padding: 8px 12px; border: 0; border-left: 3px solid transparent; background: none; cursor: pointer; font: inherit; }
        .gv-ls-item:hover { background: var(--hover, #eef3fc); }
        .gv-ls-item.on { background: var(--brand-50, #e8f0fe); border-left-color: var(--nav, #2457B3); }
        .gv-ls-gio { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--nav, #2457B3); flex: none; }
        .gv-ls-nd { display: flex; flex-direction: column; min-width: 0; }
        .gv-ls-nd b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gv-ls-nd small { color: var(--muted, #6b7686); font-size: 11.5px; }
        .gv-ls-nd .gv-ls-ct { color: var(--nav, #2457B3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gv-main { min-width: 0; }
        @media (max-width: 900px) { .gv-wrap { grid-template-columns: 1fr; } .gv-ls { border-right: 0; min-height: 0; } .gv-ls-list { max-height: 220px; } }
      `}</style>
    </>
  );
}

/** Lấy một số trong chi tiết dòng chảy (0150); dòng tính trước khi có chi tiết thì 0. */
const dt = (x: { detail?: Record<string, number> }, k: string) => Number(x.detail?.[k] ?? 0) || 0;
const dg = (v: number) => (v ? v.toLocaleString('vi-VN', { maximumFractionDigits: 4 }) : '');
const round2 = (v: number) => Math.round(v * 100) / 100;

interface CtOptions { price: 'net' | 'before_discount' | 'with_vat'; costAlloc: boolean; rebateAlloc: boolean; purchaseReturn: 'reason' | 'doc' | 'opening'; transferIn: 'doc' | 'sender'; adjustIn: boolean }
interface Formula { code: string; name: string; options: CtOptions; applyFrom: string; note: string; updatedBy?: string; updatedAt?: string }
/** Công thức áp dụng cho tháng: "áp dụng từ" lớn nhất ≤ tháng. */
const ctCuaThang = (ds: Formula[], thang: string) => ds.filter((f) => f.applyFrom && f.applyFrom <= thang).sort((x, y) => y.applyFrom.localeCompare(x.applyFrom))[0];
const thangVn = (t: string) => (t && t > '2000-01' ? `${t.slice(5)}/${t.slice(0, 4)}` : 'đầu');
const CT_MD: CtOptions = { price: 'net', costAlloc: true, rebateAlloc: true, purchaseReturn: 'reason', transferIn: 'doc', adjustIn: true };
const GIA_NHAP: Record<CtOptions['price'], [string, string]> = {
  net: ['Giá Net', 'Đơn giá chưa VAT, đã trừ chiết khấu trên phiếu (mặc định, đúng công thức giá vốn nội bộ)'],
  before_discount: ['Giá trước chiết khấu', 'Đơn giá chưa VAT, CHƯA trừ chiết khấu trên phiếu'],
  with_vat: ['Giá gồm VAT', 'Đơn giá đã trừ chiết khấu, CỘNG thuế GTGT (dùng khi không khấu trừ thuế đầu vào)'],
};
const TRA_NCC: Record<CtOptions['purchaseReturn'], [string, string]> = {
  doc: ['Giá trên phiếu trả', 'Trừ đúng thành tiền ghi trên phiếu trả hàng. VD trả 10 cái, phiếu ghi 9.000đ/cái → trừ 90.000đ'],
  opening: ['Giá vốn đầu tháng', 'Trừ theo giá vốn bình quân đầu tháng, bỏ qua giá trên phiếu. VD giá vốn đầu tháng 8.500đ/cái, trả 10 cái → trừ 85.000đ'],
  reason: ['Tuỳ lý do trả (mặc định)', 'Mỗi lý do trả hàng đã cài sẵn lấy giá nào (Danh mục lý do): lý do đánh dấu "định giá theo tồn đầu" thì lấy giá vốn đầu tháng, còn lại lấy giá trên phiếu trả'],
};
const NHAN_CN: Record<CtOptions['transferIn'], [string, string]> = {
  doc: ['Theo giá trên phiếu', 'Phiếu chuyển có giá thì lấy giá đó; không có giá thì lấy giá vốn bên gửi (mặc định)'],
  sender: ['Theo giá vốn bên gửi', 'Luôn lấy giá vốn bình quân của chi nhánh gửi, bỏ giá ghi trên phiếu'],
};
/** Mô tả một dòng các lựa chọn của công thức (hiện khi rê chuột). */
const moTaCt = (o?: Partial<CtOptions>) => {
  const f = { ...CT_MD, ...(o ?? {}) };
  return [GIA_NHAP[f.price][0], f.costAlloc ? 'cộng chi phí phân bổ' : 'không cộng chi phí phân bổ', f.rebateAlloc ? 'trừ thưởng, CK phân bổ' : 'không trừ thưởng, CK',
    `trả NCC trừ theo ${TRA_NCC[f.purchaseReturn][0].replace(' (mặc định)', '').toLowerCase()}`, `nhận chi nhánh khác ${NHAN_CN[f.transferIn][0].toLowerCase()}`, f.adjustIn ? 'nhập điều chỉnh tính vào giá' : 'nhập điều chỉnh không tính vào giá'].join(' · ');
};

/** [2026-11-17 Nguyễn Văn Thủy] Công thức giá vốn viết dạng phân số, các khoản đổi theo lựa chọn (đóng góp) */
function CongThucPhanSo({ o }: { o: CtOptions }) {
  const tu = ['Giá trị tồn đầu kỳ', `Giá trị nhập mua (${GIA_NHAP[o.price][0]})`, ...(o.costAlloc ? ['Chi phí mua phân bổ'] : []), ...(o.rebateAlloc ? ['− Thưởng, CK phân bổ'] : []),
    '− Giá trị trả NCC', ...(o.adjustIn ? ['Giá trị nhập điều chỉnh'] : []), 'Giá trị nhận từ chi nhánh khác'];
  const mau = ['SL tồn đầu kỳ', 'SL nhập mua', '− SL trả NCC', ...(o.adjustIn ? ['SL nhập điều chỉnh'] : []), 'SL nhận từ chi nhánh khác'];
  const noi = (ds: string[]) => ds.map((x, i) => (i === 0 ? x : x.startsWith('−') ? ` ${x} ` : ` + ${x}`)).join('');
  return (
    <div className="ct-ps">
      <div className="ct-ps-cong">
        <span className="ct-ps-ten">Giá vốn BQ cuối kỳ =</span>
        <span className="ct-ps-frac"><span className="ct-ps-tu">{noi(tu)}</span><span className="ct-ps-mau">{noi(mau)}</span></span>
      </div>
      <ul className="ct-ps-gc">
        <li><b>Giá nhập mua</b>: {GIA_NHAP[o.price][1]}</li>
        <li><b>Trả NCC</b> trừ theo {TRA_NCC[o.purchaseReturn][0].replace(' (mặc định)', '').toLowerCase()}: {TRA_NCC[o.purchaseReturn][1]}</li>
        <li><b>Nhận từ chi nhánh khác</b> {NHAN_CN[o.transferIn][0].toLowerCase()}: {NHAN_CN[o.transferIn][1]}</li>
        {!o.costAlloc && <li>Không cộng chi phí mua phân bổ.</li>}
        {!o.rebateAlloc && <li>Không trừ thưởng, CK phân bổ.</li>}
        <li><b>Giá vốn hàng xuất</b> = SL xuất × Giá vốn BQ cuối kỳ. Tồn cuối kỳ thành tồn đầu kỳ tháng sau.</li>
      </ul>
      <style>{`
        .ct-ps { background: var(--subtle, #f4f6fa); border-radius: 6px; padding: 14px 16px; }
        .ct-ps-cong { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 15px; }
        .ct-ps-ten { font-weight: 600; white-space: nowrap; }
        .ct-ps-frac { display: inline-flex; flex-direction: column; text-align: center; }
        .ct-ps-tu { padding: 0 6px 4px; border-bottom: 1.5px solid currentColor; }
        .ct-ps-mau { padding: 4px 6px 0; }
        .ct-ps-gc { margin: 12px 0 0; padding-left: 18px; font-size: 12.5px; color: var(--muted, #555); }
        .ct-ps-gc li { margin: 2px 0; }
      `}</style>
    </div>
  );
}

/**
 * [2026-11-17 Nguyễn Văn Thủy] Xem công thức giá vốn (chỉ đọc). Đổi công thức: bấm "Đổi công thức…", chọn tháng áp dụng (tháng chưa khoá sổ)
 * và mật khẩu — tháng trước giữ công thức cũ để lãi lỗ, kết chuyển, khoá sổ nhất quán (đóng góp)
 */
function XemCongThuc({ ds, period, onClose }: { ds: Formula[]; period: string; onClose: () => void }) {
  const qc = useQueryClient();
  const hienTai = ctCuaThang(ds, period);
  const [doi, setDoi] = useState(false);
  const [v, setV] = useState({ name: hienTai?.name ?? 'Mặc định (giá Net)', options: { ...CT_MD, ...(hienTai?.options ?? {}) }, applyFrom: period, password: '', note: '' });
  const o = v.options;
  const ro = !doi;
  const set = (x: Partial<CtOptions>) => setV((s) => ({ ...s, options: { ...s.options, ...x } }));
  const save = useMutation({
    mutationFn: () => api.post('/api/v1/inventory/costing-formulas', { name: v.name.trim(), options: v.options, applyFrom: v.applyFrom, password: v.password, note: v.note }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['costing-formulas'] }); onClose(); },
  });
  const chon = <K extends keyof CtOptions>(k: K, m: Record<string, [string, string]>, label: string, tip: string) => (
    <div className="field full"><label>{label} <Hoi text={tip} /></label>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
        {Object.entries(m).map(([val, [ten, giai]]) => (
          <label key={val} className="checkbox" title={giai}><input type="radio" disabled={ro} checked={o[k] === val} onChange={() => set({ [k]: val } as Partial<CtOptions>)} /> {ten}</label>
        ))}
      </div></div>
  );
  const lichSu = ds.filter((f) => f.applyFrom).sort((x, y) => y.applyFrom.localeCompare(x.applyFrom));
  return (
    <Modal wide title={doi ? 'Đổi công thức giá vốn' : `Công thức giá vốn tháng ${thangVn(period)}`} onClose={onClose}
      footer={doi ? <>
        <button className="btn btn-primary" disabled={!v.name.trim() || !v.applyFrom || !v.password || save.isPending} onClick={() => save.mutate()}>Ghi</button>
        <button className="btn" onClick={() => { setDoi(false); save.reset(); }}>Huỷ đổi</button>
      </> : <>
        <button className="btn" title="Đổi công thức từ một tháng trở đi (tháng chưa khoá sổ), cần mật khẩu" onClick={() => setDoi(true)}>Đổi công thức…</button>
        <button className="btn" onClick={onClose}>Đóng</button>
      </>}>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
      {doi ? <>
        <div className="field"><label>Tên công thức</label><input className="input" value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} /></div>
        <div className="field"><label>Áp dụng từ tháng <Hoi text="Công thức mới dùng cho tháng này và các tháng sau; các tháng trước giữ công thức cũ. Không chọn được tháng đã khoá sổ" /></label>
          <input type="month" className="input" value={v.applyFrom} onChange={(e) => setV((s) => ({ ...s, applyFrom: e.target.value }))} /></div>
      </> : (
        <div className="field full"><label>Đang áp dụng</label>
          <div><b>{hienTai?.name ?? 'Mặc định (giá Net)'}</b> <span className="muted">· từ tháng {thangVn(hienTai?.applyFrom ?? '')}{hienTai?.updatedBy && hienTai.updatedBy !== 'system' ? ` · ${hienTai.updatedBy}` : ''}</span></div></div>
      )}
      {!doi && <div className="full"><CongThucPhanSo o={o} /></div>}
      {doi && <>
      {chon('price', GIA_NHAP, 'Giá nhập lấy theo', 'Giá trị hàng nhập mua đưa vào công thức bình quân')}
      <div className="field full"><label>Phân bổ <Hoi text="Các khoản phân bổ vào giá vốn" /></label>
        <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
          <label className="checkbox" title="Chi phí mua hàng (vận chuyển, bốc xếp…) phân bổ vào mã — làm TĂNG giá vốn"><input type="checkbox" disabled={ro} checked={o.costAlloc} onChange={(e) => set({ costAlloc: e.target.checked })} /> Cộng chi phí phân bổ (+)</label>
          <label className="checkbox" title="Thưởng doanh số / chiết khấu nhãn hàng phân bổ theo mã — làm GIẢM giá vốn"><input type="checkbox" disabled={ro} checked={o.rebateAlloc} onChange={(e) => set({ rebateAlloc: e.target.checked })} /> Trừ thưởng, CK phân bổ (−)</label>
        </div></div>
      {chon('purchaseReturn', TRA_NCC, 'Hàng trả nhà cung cấp trừ khỏi giá vốn theo', 'Khi trả hàng cho nhà cung cấp, số tiền trừ khỏi giá vốn lấy theo giá nào. Rê chuột lên từng lựa chọn xem ví dụ')}
      <div className="field full"><label>Hàng nhập điều chỉnh kho (kiểm kê thừa…) <Hoi text="Hàng nhập thêm do điều chỉnh kho có được cộng vào khi tính giá vốn bình quân hay không. Lý do nào đã cài 'không tính giá vốn' thì luôn bỏ ra" /></label>
        <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
          <label className="checkbox" title="Cộng số lượng và giá trị hàng nhập điều chỉnh vào công thức bình quân"><input type="radio" disabled={ro} checked={o.adjustIn} onChange={() => set({ adjustIn: true })} /> Tính vào giá vốn</label>
          <label className="checkbox" title="Bỏ hàng nhập điều chỉnh ra khỏi công thức, giá vốn chỉ tính từ hàng mua"><input type="radio" disabled={ro} checked={!o.adjustIn} onChange={() => set({ adjustIn: false })} /> Không tính</label>
        </div></div>
      {chon('transferIn', NHAN_CN, 'Nhận từ chi nhánh khác', 'Giá trị hàng nhận chuyển kho từ phạm vi khác')}
      <div className="full"><CongThucPhanSo o={o} /></div>
        <div className="field full"><label>Ghi chú</label><input className="input" value={v.note} onChange={(e) => setV((s) => ({ ...s, note: e.target.value }))} placeholder="Lý do đổi công thức" /></div>
        <div className="field"><label>Mật khẩu đổi công thức</label><input type="password" className="input" autoComplete="new-password" value={v.password} onChange={(e) => setV((s) => ({ ...s, password: e.target.value }))} /></div>
      </>}
      {!doi && lichSu.length > 1 && (
        <div className="field full"><label>Các lần đổi công thức</label>
          <table className="table" style={{ fontSize: 12.5 }}><tbody>
            {lichSu.map((f) => <tr key={f.code} title={moTaCt(f.options)}><td style={{ width: 120 }}>Từ tháng {thangVn(f.applyFrom)}</td><td>{f.name}</td><td className="muted">{f.note}</td><td className="muted">{f.updatedBy !== 'system' ? f.updatedBy : ''}</td></tr>)}
          </tbody></table></div>
      )}
    </Modal>
  );
}

interface CostRun { formulaCode?: string; formulaName?: string; formula?: Partial<CtOptions>; id: string; orgUid: string; centerCode: string; centerName: string; period: string; from: string; to: string; items: number; total: number; imported: number; vouchers: unknown; runBy: string; runAt: string }

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
