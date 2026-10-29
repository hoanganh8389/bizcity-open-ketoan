/**
 * NHẬP ĐƠN ĐẶT / PHIẾU NHẬP TỪ EXCEL — thay gõ tay từng dòng:
 *   1. Chọn loại (đơn đặt hàng / phiếu nhập kho), NCC + chi nhánh mặc định (khi tệp không có cột Mã NCC / Chi nhánh).
 *   2. Chọn tệp .xlsx / .xls / .csv — phần mềm tự nhận cột theo TÊN TIÊU ĐỀ (Mã NCC, Mã hàng, ĐVT, Số lượng, Đơn giá, CK(%),
 *      Số HĐ, LOTNO, EXPDATE, Chi nhánh, Ngày, Ghi chú…) — đúng dạng file xuất phiếu nhập / bảng kê của NCC.
 *   3. Xem trước: mã chưa có trong danh mục, dòng lỗi (đỏ), dòng giá 0 = hàng tặng; gom theo NCC + chi nhánh + phân kho + số HĐ.
 *      Cột Mã kho không bắt buộc: trống = kho mặc định của chi nhánh; kho không thuộc chi nhánh của dòng → dòng lỗi.
 *   4. "Tạo phiếu nháp" → mỗi nhóm một phiếu, mở danh sách để kiểm rồi duyệt.
 */
import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { docsFromImport, importRows, type ImportResult, type PDoc } from '@ketoan/contracts/mua-hang';
import { Modal } from '@/components/ui';
import { BranchPicker } from '@/components/filters';
import { PartnerPicker } from '@/components/pickers';
import { errorText } from '@/lib/api';
import { purchaseApi, today, vnd, type MhData } from '../du-lieu';
import { ExcelGuide, type GuideColumn } from '../thanh-phan/ExcelGuide';
import { NccInfo } from '../thanh-phan/NccInfo';
import { useHierarchy } from '../ton-max/api';

const COLS: GuideColumn[] = [
  { name: 'Mã hàng', required: true, aliases: 'Mã SP, SKU', example: '130181002', note: 'Mã hàng trong danh mục (mã chưa có báo vàng)' },
  { name: 'Số lượng', required: true, aliases: 'SL, Số lượng của ĐVCB', example: 14400, note: 'Số lượng theo ĐVT; dòng SL ≤ 0 bị bỏ qua' },
  { name: 'Đơn giá', aliases: 'Giá, Đơn giá chưa thuế', example: 5389.8125, note: 'Đơn giá 0 (hoặc trống) = HÀNG TẶNG — phần mềm tự chia giá theo chính sách KM của NCC' },
  { name: 'CK(%)', aliases: 'CK %, Chiết khấu (%)', example: 2.5, note: 'Chiết khấu % trên dòng; trống = tự áp theo chính sách' },
  { name: 'Mã NCC', aliases: 'Mã nhà cung cấp', example: 'NC100227', note: 'Có cột này thì mỗi NCC thành phiếu riêng; không có thì dùng NCC chọn ở trên' },
  { name: 'Chi nhánh', aliases: 'Mã chi nhánh', example: 'CN-NA', note: 'Không có thì dùng chi nhánh chọn ở trên' },
  { name: 'Mã kho', aliases: 'Phân kho, Kho', example: '', note: 'Không bắt buộc — trống = kho mặc định của chi nhánh; có thì mỗi kho một phiếu (đơn đặt: kho giao). Kho phải thuộc chi nhánh của dòng' },
  { name: 'Số HĐ', aliases: 'Số hoá đơn', example: '4430', note: 'Phiếu nhập: mỗi số hoá đơn một phiếu' },
  { name: 'Ngày', aliases: 'Ngày HĐ, Ngày chứng từ', example: '23/04/2026', note: 'dd/mm/yyyy, m/d/yyyy hoặc ngày Excel; trống = hôm nay' },
  { name: 'LOTNO', aliases: 'Số lô', example: '9618M', note: 'Số lô (mặt hàng theo dõi lô bắt buộc)' },
  { name: 'EXPDATE', aliases: 'Hạn dùng, HSD', example: '18/11/2026', note: 'Hạn sử dụng của lô' },
  { name: 'ĐVT', aliases: 'Đơn vị tính, ĐVCB', example: 'Hộp', note: 'Trống = ĐVT trong danh mục' },
  { name: 'Tên hàng', example: 'Sữa tươi TH có đường 110ml', note: 'Chỉ để đối chiếu — phần mềm lấy tên theo danh mục' },
  { name: 'Ghi chú', aliases: 'Diễn giải', example: '', note: 'Tuỳ ý' },
];

type Cat = Map<string, { name: string; unit: string; taxInCode: string | null }>;

export function NhapExcel({ data, partnerCode = '', onClose, onDone }: { data: MhData; partnerCode?: string; onClose: () => void; onDone: (n: number) => void }) {
  const [kind, setKind] = useState<'order' | 'receipt'>('order');
  const [partner, setPartner] = useState(partnerCode);
  const [branch, setBranch] = useState('');
  const [incVat, setIncVat] = useState(false);
  const [file, setFile] = useState('');
  const [res, setRes] = useState<ImportResult | null>(null);
  const [cat, setCat] = useState<Cat>(new Map());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const hier = useHierarchy();

  const pick = async (f: File) => {
    setErr(''); setFile(f.name); setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      // Sheet có cột "Mã hàng" (tệp nhiều sheet như VD1: sheet chi tiết + sheet tổng hợp).
      let r: ImportResult | null = null;
      for (const name of wb.SheetNames) {
        const t = importRows(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: '' }));
        if (t.rows.length) { r = t; break; }
      }
      if (!r) throw new Error('Không thấy bảng có cột "Mã hàng" trong tệp');
      setRes(r);
      const found = await purchaseApi.lookupProducts([...new Set(r.rows.map((x) => x.sku))]);
      setCat(new Map(found.map((p) => [p.sku, p])));
    } catch (e) { setErr(e instanceof Error && !('code' in e) ? e.message : errorText(e)); setRes(null); } finally { setBusy(false); }
  };

  // Kho trong tệp phải thuộc chi nhánh của dòng (như máy chủ kiểm khi ghi) — báo ngay ở bước xem trước.
  const whsOf = (b: string) => hier.data?.branches.find((x) => x.code === b)?.warehouses ?? [];
  const defKho = (b: string) => { const ws = whsOf(b); return (ws.find((w) => w.isDefault) ?? (ws.length === 1 ? ws[0] : undefined))?.code ?? ''; };
  const rows = (res?.rows ?? []).map((r) => {
    const b = r.branchCode || branch;
    if (r.error || !r.warehouseCode || !b || !hier.data) return r;
    const ws = whsOf(b);
    return ws.some((w) => w.code === r.warehouseCode) ? r : { ...r, error: `Kho ${r.warehouseCode} không thuộc chi nhánh ${b}${ws.length ? ` (có: ${ws.map((w) => w.code).join(', ')})` : ' — chi nhánh chưa khai kho'}` };
  });
  const missingSku = rows.filter((r) => !cat.has(r.sku));
  const noPartner = rows.some((r) => !r.partnerCode) && !partner;
  const noBranch = rows.some((r) => !r.branchCode) && !branch;
  const docs: PDoc[] = res ? docsFromImport(rows.filter((r) => !r.error), {
    kind, date: today(), partnerCode: partner, branchCode: branch, priceIncludesVat: incVat, policies: data.policies,
    taxOf: (sku) => cat.get(sku)?.taxInCode ?? 'V08', nameOf: (sku) => cat.get(sku),
  }) : [];
  const create = async () => {
    setBusy(true); setErr('');
    try {
      for (const d of docs) await purchaseApi.save(d);
      onDone(docs.length);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const gifts = rows.filter((r) => !r.error && r.price === 0).length;

  return (
    <Modal wide title="Nhập đơn đặt / phiếu nhập từ Excel" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={busy || !docs.length || noPartner || noBranch} onClick={() => void create()}>Tạo {docs.length || ''} {kind === 'order' ? 'đơn đặt' : 'phiếu nhập'} nháp</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full mh-head" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="field"><label>Tạo thành</label><select className="select input" value={kind} onChange={(e) => setKind(e.target.value as 'order')}><option value="order">Đơn đặt hàng</option><option value="receipt">Phiếu nhập kho (gom theo số HĐ)</option></select></div>
        <div className="field"><label>Đơn giá trong tệp là</label><select className="select input" value={incVat ? '1' : '0'} onChange={(e) => setIncVat(e.target.value === '1')}><option value="0">Giá chưa thuế</option><option value="1">Giá đã gồm thuế</option></select></div>
        <div className="field"><label>NCC (khi tệp không có cột Mã NCC)</label><PartnerPicker value={partner} onChange={setPartner} activeOnly /></div>
        <div className="field"><label>Chi nhánh (khi tệp không có cột Chi nhánh)</label><BranchPicker value={branch} onChange={setBranch} activeOnly /></div>
      </div>
      <div className="full" style={{ marginTop: 8 }}><ExcelGuide columns={COLS} file="mau-nhap-don-dat-phieu-nhap.xlsx" defaultOpen={!res} /></div>
      <div className="full mh-drop" style={{ marginTop: 8 }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void pick(f); }}>
        <FileUp size={18} /> <span>{busy ? 'Đang đọc…' : file ? `Tệp: ${file}` : 'Kéo thả tệp Excel vào đây hoặc'}</span>
        <button type="button" className="btn btn-sm" onClick={() => input.current?.click()}>Chọn tệp…</button>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
        <span className="muted" style={{ fontSize: 12 }}>Cột nhận được: Mã NCC, Mã hàng, ĐVT, Số lượng, Đơn giá, CK(%), Số HĐ, LOTNO, EXPDATE, Chi nhánh, Mã kho (không bắt buộc), Ngày, Ghi chú (đúng dạng file xuất phiếu nhập)</span>
      </div>
      {err && <div className="alert alert-bad full" style={{ marginTop: 6 }}>{err}</div>}
      {res && <>
        <div className="full row" style={{ gap: 8, flexWrap: 'wrap', margin: '8px 0', fontSize: 13 }}>
          <span className="badge badge-info">{rows.length} dòng</span>
          {gifts > 0 && <span className="badge badge-ok">{gifts} dòng giá 0 = hàng tặng (tự chia giá theo chính sách)</span>}
          {rows.some((r) => r.error) && <span className="badge badge-bad">{rows.filter((r) => r.error).length} dòng lỗi (bỏ qua)</span>}
          {missingSku.length > 0 && <span className="badge badge-warn">{new Set(missingSku.map((r) => r.sku)).size} mã chưa có trong danh mục</span>}
          {res.missing.length > 0 && <span className="badge badge-bad">Thiếu cột: {res.missing.join(', ')}</span>}
          {noPartner && <span className="badge badge-bad">Chọn NCC mặc định</span>}
          {noBranch && <span className="badge badge-bad">Chọn chi nhánh mặc định</span>}
          <span className="muted">→ sẽ tạo <b>{docs.length}</b> {kind === 'order' ? 'đơn đặt' : 'phiếu nhập'}: {docs.map((d) => `${d.partnerCode} · ${d.branchCode} · kho ${d.warehouseCode || d.deliveryWarehouse || defKho(d.branchCode) || 'mặc định'}${d.invoice ? ` HĐ ${d.invoice.no}` : ''} (${d.lines.length} dòng)`).join(' · ')}</span>
        </div>
        <div className="full" style={{ maxHeight: 360, overflow: 'auto' }}>
          <table className="mh-mini">
            <thead><tr><th>Dòng</th><th>Mã NCC</th><th>Mã hàng</th><th>Tên (theo danh mục)</th><th>ĐVT</th><th className="num">SL</th><th className="num">Đơn giá</th><th className="num">CK %</th><th>Số HĐ</th><th>Lô</th><th>Hạn dùng</th><th>Chi nhánh</th><th title="Cột Mã kho trong tệp; trống = kho mặc định của chi nhánh">Phân kho</th><th>Kiểm tra</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const c = cat.get(r.sku);
                return (
                  <tr key={r.row} className={r.error ? 'mh-row-bad' : !c ? 'mh-row-warn' : ''}>
                    <td>{r.row}</td><td className="mono">{r.partnerCode || partner}{(r.partnerCode || partner) ? <> <NccInfo code={r.partnerCode || partner} showName={false} /></> : null}</td><td className="mono">{r.sku}</td><td>{c?.name ?? r.name ?? ''}</td><td>{c?.unit ?? r.unit}</td>
                    <td className="num">{r.qty.toLocaleString('vi-VN')}</td><td className="num">{r.price ? vnd(r.price) : <span className="badge badge-ok">tặng</span>}</td><td className="num">{r.discountPct ?? ''}</td>
                    <td className="mono">{r.invoiceNo}</td><td className="mono">{r.lotNo}</td><td>{r.expDate?.split('-').reverse().join('/')}</td><td>{r.branchCode || branch}</td><td className="mono">{r.warehouseCode || <span className="muted">{defKho(r.branchCode || branch) || 'mặc định'}</span>}</td>
                    <td>{r.error ? <span className="mh-bad">{r.error}</span> : !c ? <span className="mh-warn">mã chưa có trong danh mục</span> : '✓'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
    </Modal>
  );
}
