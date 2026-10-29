/**
 * NHẬP HOÁ ĐƠN NCC HÀNG LOẠT — hai nguồn, chung một màn xem trước:
 *   Excel     tệp bảng kê / báo cáo hoá đơn NCC gửi (mỗi dòng một mặt hàng; cột tự nhận theo tên tiêu đề, gom theo ký hiệu + số HĐ)
 *   Quét AI   ảnh / PDF hoá đơn → dịch vụ đọc hoá đơn đơn vị cấu hình (ChatGPT, Claude…) trả về khuôn chung
 * Xem trước: mỗi hoá đơn — dòng hàng theo cách NCC ghi, mã bên mình đã nhận diện / gợi ý (bấm để chọn), cảnh báo (trùng, lệch tổng).
 * Ghi: hoá đơn trùng bỏ qua; dòng chưa chọn mã vẫn lưu (chọn sau ở MH22); dòng đã chọn mã → phần mềm học cách ghi của NCC.
 */
import { useRef, useState } from 'react';
import { FileUp, ScanLine } from 'lucide-react';
import { invoiceLabel, readTable, type ParsedInvoice } from '@ketoan/contracts/mua-hang';
import { Modal } from '@/components/ui';
import { PartnerPicker } from '@/components/pickers';
import { errorText } from '@/lib/api';
import { useNames, vnd } from '../du-lieu';
import { dmy } from '../chung';
import { ExcelGuide, type GuideColumn } from '../thanh-phan/ExcelGuide';
import { docNgay } from '../thanh-phan/NhapExcelChung';
import { BangDongHoaDon } from './BangDongHoaDon';
import { invoiceApi, type Prepared } from './api';

const COLS: GuideColumn[] = [
  { name: 'Ký hiệu mẫu hoá đơn', aliases: 'Mẫu số', example: '1', note: 'Tuỳ chọn' },
  { name: 'Ký hiệu hoá đơn', aliases: 'Ký hiệu', example: 'C26MHZ', note: 'Cùng số HĐ nhưng khác ký hiệu là hai hoá đơn' },
  { name: 'Số hoá đơn', required: true, aliases: 'Số HĐ', example: '134608', note: 'Các dòng cùng ký hiệu + số gom thành một hoá đơn' },
  { name: 'Ngày hoá đơn', aliases: 'Ngày, tháng, năm lập hoá đơn; Ngày lập', example: '20/08/2026', note: 'dd/mm/yyyy (có giờ cũng được)' },
  { name: 'MST người bán', aliases: 'MST NCC', example: '0101234567', note: 'Tuỳ chọn — để đối chiếu đúng NCC' },
  { name: 'Mã hàng', aliases: 'Mã hàng hoá, Mã SP', example: 'AB-G800', note: 'Mã bên NCC (có thì nhận diện chắc hơn)' },
  { name: 'Tên hàng', required: true, aliases: 'Tên hàng hoá, dịch vụ; Tên sản phẩm', example: 'Sữa bột Abbott Grow vani 800g', note: 'Tên theo cách NCC ghi' },
  { name: 'ĐVT', aliases: 'Đơn vị tính', example: 'Thùng', note: 'ĐVT bên NCC' },
  { name: 'Số lượng', required: true, aliases: 'SL', example: 2, note: 'Theo ĐVT bên NCC' },
  { name: 'Đơn giá', aliases: 'Đơn giá chưa thuế', example: 9600000, note: 'Chưa thuế. Tệp ghi giá gồm thuế thì đặt tên cột "Đơn giá gồm thuế"' },
  { name: 'Chiết khấu', aliases: 'Tiền chiết khấu', example: '', note: 'Số tiền CK của dòng' },
  { name: 'Thành tiền', aliases: 'Thành tiền chưa thuế', example: 19200000, note: 'Trống = SL × đơn giá − CK' },
  { name: 'Thuế suất', aliases: 'Thuế suất GTGT, % thuế', example: '8%', note: '0 / 5 / 8 / 10, KCT = không chịu thuế' },
  { name: 'Tiền thuế', aliases: 'Tiền thuế GTGT', example: 1536000, note: 'Trống = thành tiền × thuế suất' },
  { name: 'Hàng khuyến mại', aliases: 'Khuyến mại, Tặng', example: '', note: '"có" = hàng tặng (giá 0)' },
];
type K = 'form' | 'series' | 'no' | 'date' | 'seller' | 'nccSku' | 'nccName' | 'unit' | 'qty' | 'price' | 'priceInc' | 'disc' | 'amount' | 'rate' | 'tax' | 'gift';
const SPEC: [K, string[]][] = [
  ['form', ['ky hieu mau hoa don', 'ky hieu mau hoa don', 'ky hieu mau so', 'mau so', 'ky hieu mau']],
  ['series', ['ky hieu hoa don', 'ky hieu', 'ky hieu hd']],
  ['no', ['so hoa don', 'so hd']],
  ['date', ['ngay hoa don', 'ngay, thang, nam lap hoa don', 'ngay thang nam lap hoa don', 'ngay lap hoa don', 'ngay lap', 'ngay hd', 'ngay']],
  ['seller', ['mst nguoi ban', 'ma so thue nguoi ban', 'mst ncc', 'mst ben ban']],
  ['nccSku', ['ma hang', 'ma hang hoa', 'ma sp', 'ma hh', 'ma vat tu', 'ma san pham']],
  ['nccName', ['ten hang', 'ten hang hoa', 'ten hang hoa, dich vu', 'ten hang hoa dich vu', 'ten san pham', 'ten hh', 'ten vat tu']],
  ['unit', ['dvt', 'don vi tinh']],
  ['qty', ['so luong', 'sl']],
  ['price', ['don gia', 'don gia chua thue', 'don gia truoc thue', 'don gia chua vat']],
  ['priceInc', ['don gia gom thue', 'don gia sau thue', 'don gia da gom thue', 'don gia gom vat']],
  ['disc', ['chiet khau', 'tien chiet khau', 'ck']],
  ['amount', ['thanh tien', 'thanh tien chua thue', 'thanh tien truoc thue', 'tien hang']],
  ['rate', ['thue suat', 'thue suat gtgt', '% thue', 'ts gtgt']],
  ['tax', ['tien thue', 'tien thue gtgt', 'thue gtgt']],
  ['gift', ['hang khuyen mai', 'khuyen mai', 'tang', 'hang tang']],
];
/** Số từ Excel: 9.600.000 · 9,600,000 · 2,5 · 8% → số; trống → undefined. */
const n = (v: unknown) => {
  let t = String(v ?? '').replace(/[\s%đ]/g, '');
  if (!t) return undefined;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '');
  else t = t.replace(',', '.');
  const x = Number(t);
  return Number.isFinite(x) ? x : undefined;
};
const yes = (v: unknown) => /^(co|có|x|1|yes|true)$/i.test(String(v ?? '').trim());
const toBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(f); });

/** Dòng Excel → hoá đơn (gom theo ký hiệu + số). */
function fromRows(rows: Record<K, string>[]): { invoices: ParsedInvoice[]; errors: string[] } {
  const by = new Map<string, ParsedInvoice>();
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const no = String(r.no ?? '').trim();
    if (!no) { if (r.nccName) errors.push(`Dòng ${i + 1}: thiếu số hoá đơn`); return; }
    const key = `${String(r.series ?? '').trim().toUpperCase()}|${no.replace(/^0+/, '')}`;
    const inc = String(r.priceInc ?? '').trim() !== '';
    let inv = by.get(key);
    if (!inv) {
      const date = r.date ? docNgay(String(r.date).trim().split(/\s+/)[0]!) : undefined;
      if (r.date && !date) errors.push(`HĐ ${no}: ngày "${r.date}" không đọc được`);
      inv = { form: String(r.form ?? '').trim(), series: String(r.series ?? '').trim().toUpperCase(), no, date, sellerTaxCode: String(r.seller ?? '').trim(), priceIncludesVat: inc, lines: [] };
      by.set(key, inv);
    }
    const rateRaw = String(r.rate ?? '').trim();
    const qty = n(r.qty);
    if (!qty) { errors.push(`HĐ ${no}, dòng "${r.nccName}": số lượng "${r.qty}" không hợp lệ`); return; }
    inv.lines.push({
      nccSku: String(r.nccSku ?? '').trim(), nccName: String(r.nccName ?? '').trim(), nccUnit: String(r.unit ?? '').trim(), qty,
      price: n(inc ? r.priceInc : r.price), discountAmount: n(r.disc), amount: inc ? undefined : n(r.amount),
      taxRate: !rateRaw || /kct|khong/i.test(rateRaw) ? null : n(rateRaw) ?? null, taxAmount: n(r.tax), isGift: yes(r.gift),
    });
  });
  return { invoices: [...by.values()], errors };
}

export function NhapHoaDon({ mode, partnerCode = '', lockPartner, onClose, onDone }: { mode: 'excel' | 'scan'; partnerCode?: string; lockPartner?: boolean; onClose: () => void; onDone: () => void }) {
  const names = useNames();
  const [partner, setPartner] = useState(partnerCode);
  const [file, setFile] = useState('');
  const [list, setList] = useState<Prepared[]>([]);
  const [readErr, setReadErr] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const pick = async (f: File) => {
    setErr(''); setDone(''); setList([]); setReadErr([]); setFile(f.name);
    if (!partner) { setErr('Chọn nhà cung cấp trước'); return; }
    setBusy(true);
    try {
      if (mode === 'excel') {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false });
        let parsed: ReturnType<typeof fromRows> | null = null;
        for (const name of wb.SheetNames) {
          const t = readTable(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: '' }), SPEC, 'nccName');
          if (t.rows.length) { parsed = fromRows(t.rows); if (!t.columns.no) parsed.errors.unshift('Tệp không có cột "Số hoá đơn"'); break; }
        }
        if (!parsed) throw new Error('Không thấy cột "Tên hàng" trong tệp — xem hướng dẫn cột bên trên');
        setReadErr(parsed.errors);
        if (parsed.invoices.length) setList(await invoiceApi.prepare(partner, parsed.invoices));
      } else {
        if (f.size > 20 * 1024 * 1024) throw new Error('Tệp quá 20 MB');
        setList(await invoiceApi.scan({ partnerCode: partner, fileName: f.name, mime: f.type, dataBase64: await toBase64(f) }));
      }
    } catch (e) { setErr(e instanceof Error && !('code' in e) ? e.message : errorText(e)); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  const ok = list.filter((x) => !x.duplicateOf && x.no && x.date);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const res = await invoiceApi.import(ok.map((x) => ({ ...x, partnerCode: partner, source: mode === 'scan' ? 'ai' : 'excel', note: '', data: { ...(x.data ?? {}), fileName: file } })));
      setDone(`Đã ghi ${res.saved.length} hoá đơn${res.skipped.length ? `, bỏ qua ${res.skipped.length} (${res.skipped.map((s) => `${s.label}: ${s.reason}`).join('; ')})` : ''}.`);
      setList([]);
      onDone();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const unmatched = ok.reduce((s, x) => s + x.lines.filter((l) => !l.sku).length, 0);
  return (
    <Modal wide title={mode === 'excel' ? 'Nhập hoá đơn NCC từ Excel' : 'Quét ảnh / PDF hoá đơn NCC (AI)'} onClose={onClose}
      footer={<>
        {!!ok.length && <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Đang ghi…' : `Ghi ${ok.length} hoá đơn`}</button>}
        <button className="btn" onClick={onClose}>Đóng</button>
      </>}>
      <div className="full">
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13 }}>Nhà cung cấp</span>
        <div style={{ width: 280 }}><PartnerPicker value={partner} onChange={setPartner} disabled={lockPartner} /></div>
        <button className="btn" disabled={busy || !partner} onClick={() => input.current?.click()}>{mode === 'excel' ? <FileUp size={14} /> : <ScanLine size={14} />} {busy ? 'Đang đọc…' : mode === 'excel' ? 'Chọn tệp Excel…' : 'Chọn ảnh / PDF…'}</button>
        <input ref={input} type="file" hidden accept={mode === 'excel' ? '.xlsx,.xls,.csv' : 'image/*,application/pdf'} onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
        {file && <span className="muted" style={{ fontSize: 12 }}>{file}</span>}
      </div>
      {mode === 'excel' && !list.length && <ExcelGuide columns={COLS} file="mau-hoa-don-ncc.xlsx" defaultOpen={false} />}
      {mode === 'scan' && !list.length && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Ảnh chụp / PDF hoá đơn được gửi tới dịch vụ đọc hoá đơn đơn vị đã cấu hình. Kết quả hiện ở đây để kiểm tra, sửa mã rồi mới ghi. Nhớ đính kèm tệp gốc vào hoá đơn sau khi ghi (thẻ Tệp đính kèm).</div>}
      {err && <div className="alert alert-bad" style={{ marginTop: 6 }}>{err}</div>}
      {done && <div className="alert alert-ok" style={{ marginTop: 6 }}>{done} Mở từng hoá đơn ở danh sách để chọn mã còn thiếu, xem đối soát.</div>}
      {!!readErr.length && <div className="alert alert-warn" style={{ marginTop: 6 }}>{readErr.slice(0, 8).map((x, i) => <div key={i}>{x}</div>)}{readErr.length > 8 && <div>… và {readErr.length - 8} lỗi khác</div>}</div>}
      {!!list.length && <div style={{ marginTop: 8, fontSize: 13 }}>Đọc được {list.length} hoá đơn của {names.partnerName(partner)} · ghi được {ok.length}{unmatched ? ` · ${unmatched} dòng chưa nhận diện mã (chọn ngay hoặc để sau)` : ''}</div>}
      {list.map((x, k) => (
        <div key={k} className="card" style={{ marginTop: 8, padding: 8, opacity: x.duplicateOf ? 0.6 : 1 }}>
          <div style={{ fontWeight: 600 }}>Hoá đơn {invoiceLabel(x)} · {dmy(x.date)} · tiền hàng {vnd(x.totalBeforeTax)} · thuế {vnd(x.totalTax)} · tổng {vnd(x.total)}{x.duplicateOf && <span className="badge badge-gray" style={{ marginLeft: 6 }}>Đã có — bỏ qua</span>}</div>
          {!x.date && !x.duplicateOf && <div style={{ fontSize: 12, margin: '4px 0' }}>Ngày hoá đơn (tệp không có): <input className="input" type="date" style={{ height: 26, width: 150 }} onChange={(e) => setList(list.map((y, i) => (i === k ? { ...y, date: e.target.value, warnings: y.warnings.filter((w) => w !== 'Thiếu ngày hoá đơn') } : y)))} /></div>}
          {!!x.warnings.length && <div className="mh-warn" style={{ fontSize: 12 }}>{x.warnings.join(' · ')}</div>}
          <BangDongHoaDon lines={x.lines} partnerCode={partner} readOnly={Boolean(x.duplicateOf)} onChange={(lines) => setList(list.map((y, i) => (i === k ? { ...y, lines } : y)))} />
        </div>
      ))}
      </div>
    </Modal>
  );
}
