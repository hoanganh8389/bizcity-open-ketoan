/**
 * Nhập Excel theo tiêu đề cột cho màn danh mục (ACC17, ACC18…):
 *  - Chọn tệp .xlsx / .xls; tệp nhiều sheet thì chọn sheet.
 *  - Dòng tiêu đề tìm trong 10 dòng đầu: cột nào trùng tên tiêu đề cột của lưới thì nạp, cột khác bỏ qua.
 *  - Xem trước số dòng, cột nhận được; bấm Ghi để cập nhật. Ô trống trong tệp = giữ nguyên giá trị đang có.
 * "Tạo mẫu nhập liệu" = xuất lưới đang xem ra Excel (đúng tiêu đề cột), sửa rồi nạp lại.
 * Có onCheck: bước xem trước gọi kiểm tra từng dòng (máy chủ, không ghi) và liệt kê dòng lỗi theo số dòng Excel; bấm Ghi chỉ
 * ghi dòng đúng. Mỗi dòng gửi kèm `_row` = số dòng trong Excel.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileDown, FileUp } from 'lucide-react';
import { ErrorBox, Modal } from './ui';
import { errorText } from '@/lib/api';

export interface ImportColumn { key: string; header: string }
export interface ImportResult { updated: number; skipped?: number; errors: string[] }
/** Kết quả kiểm tra trước khi ghi: số dòng ghi được (kèm diễn giải, ví dụ "5 thêm mới, 3 cập nhật") và lỗi theo dòng Excel. */
export interface ImportCheck { ok: number; okText?: string; errors: { row: number; key: string; text: string }[]; preview?: ImportPreview }
/** Xem trước thông tin từng dòng: values = sẽ ghi; before = đang có (dòng cập nhật) — ô đổi hiện cũ → mới, ô trống hiện mờ giá trị giữ nguyên. */
export interface ImportPreview {
  columns: ImportColumn[];
  rows: { row: number; status: 'create' | 'update' | 'error'; values: Record<string, string | undefined>; before?: Record<string, string | undefined>; errors: string[] }[];
}
const STATUS = { create: ['Thêm mới', 'badge-ok'], update: ['Cập nhật', 'badge-info'], error: ['Lỗi', 'badge-bad'] } as const;

function PreviewTable({ p, keyColumn }: { p: ImportPreview; keyColumn: string }) {
  const [only, setOnly] = useState<'' | 'create' | 'update' | 'error'>('');
  const n = (st: string) => p.rows.filter((r) => r.status === st).length;
  const rows = p.rows.filter((r) => !only || r.status === only);
  const cell = (r: ImportPreview['rows'][number], key: string) => {
    const v = r.values[key] ?? '';
    const old = r.before?.[key] ?? '';
    if (r.status !== 'update' || key === keyColumn) return v;
    if (!v) return <span className="muted" title="Ô trống trong tệp — giữ nguyên">{old}</span>;
    if (v === old) return v;
    return <span title={`Đang có: ${old || '(trống)'}`}><s className="muted">{old}</s>{old ? ' → ' : ''}<b>{v}</b></span>;
  };
  return (
    <>
      <div className="row" style={{ gap: 6, margin: '6px 0' }}>
        {([['', `Tất cả ${p.rows.length}`], ['create', `Thêm mới ${n('create')}`], ['update', `Cập nhật ${n('update')}`], ['error', `Lỗi ${n('error')}`]] as const).map(([k, l]) => (
          <button key={k} type="button" className={`btn btn-xs${only === k ? ' btn-primary' : ''}`} onClick={() => setOnly(k)}>{l}</button>
        ))}
      </div>
      <div style={{ maxHeight: 380, overflow: 'auto' }}>
        <table className="table" style={{ fontSize: 12.5 }}>
          <thead><tr><th style={{ width: 52 }}>Dòng</th><th style={{ width: 84 }}>Trạng thái</th>{p.columns.map((c) => <th key={c.key}>{c.header}</th>)}<th>Lỗi</th></tr></thead>
          <tbody>{rows.slice(0, 1000).map((r) => (
            <tr key={r.row} style={r.status === 'error' ? { background: 'var(--bad-bg, #fef3f2)' } : undefined}>
              <td className="num">{r.row}</td><td><span className={`badge ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td>
              {p.columns.map((c) => <td key={c.key} className={c.key === keyColumn ? 'mono' : undefined}>{cell(r, c.key)}</td>)}
              <td style={{ color: 'var(--bad, #b42318)' }}>{r.errors.join('; ')}</td>
            </tr>
          ))}</tbody>
        </table>
        {rows.length > 1000 && <div className="muted" style={{ fontSize: 12 }}>Hiện 1.000 / {rows.length.toLocaleString('vi-VN')} dòng.</div>}
      </div>
    </>
  );
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();

export function ExcelImport({ columns, keyColumn, onImport, onTemplate, disabled, raw, buttonLabel, hint, onCheck }: {
  columns: ImportColumn[];
  /** Cột khoá (bắt buộc có trong tệp), ví dụ mã hàng. */
  keyColumn: string;
  onImport: (rows: Record<string, string>[]) => Promise<ImportResult>;
  onTemplate?: () => void;
  disabled?: boolean;
  /** Đọc số gốc trong ô (không lấy chữ đã định dạng) — giữ đủ số lẻ, ví dụ đơn giá vốn 434442.8361. */
  raw?: boolean;
  buttonLabel?: string;
  /** Ghi chú hiện ở bước xem trước (thay câu "Ô trống trong tệp giữ nguyên…"). */
  hint?: ReactNode;
  onCheck?: (rows: Record<string, string>[]) => Promise<ImportCheck>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [book, setBook] = useState<{ name: string; sheets: string[]; read: (sheet: string) => unknown[][] } | null>(null);
  const [sheet, setSheet] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (file: File) => {
    setErr(null); setResult(null);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    setBook({ name: file.name, sheets: wb.SheetNames, read: (s) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[s]!, { header: 1, raw: Boolean(raw), defval: '' }) });
    setSheet(wb.SheetNames[0] ?? '');
  };

  // Dòng tiêu đề và ánh xạ cột của sheet đang chọn.
  const parsed = (() => {
    if (!book || !sheet) return null;
    const aoa = book.read(sheet);
    const byName = new Map(columns.map((c) => [fold(c.header), c.key]));
    for (let h = 0; h < Math.min(10, aoa.length); h++) {
      const head = (aoa[h] ?? []).map((x) => fold(String(x ?? '')));
      const map = head.map((x) => byName.get(x) ?? null);
      if (!map.includes(keyColumn)) continue;
      // Kiểm tra trước (onCheck): giữ cả dòng thiếu mã có dữ liệu khác để báo lỗi; _row = số dòng trong Excel.
      const rows = aoa.slice(h + 1).map((r, i) => ({ ...Object.fromEntries(map.flatMap((k, j) => (k ? [[k, String(r[j] ?? '').trim()]] : []))), ...(onCheck ? { _row: String(h + 2 + i) } : {}) }) as Record<string, string>)
        .filter((r) => (onCheck ? Object.entries(r).some(([k, v]) => k !== '_row' && v) : r[keyColumn]));
      return { rows, found: columns.filter((c) => map.includes(c.key)), missing: columns.filter((c) => !map.includes(c.key)) };
    }
    return { rows: [], found: [], missing: columns };
  })();

  const [check, setCheck] = useState<ImportCheck | null>(null);
  const sig = parsed ? `${book?.name}|${sheet}|${parsed.rows.length}` : '';
  useEffect(() => {
    setCheck(null);
    if (!onCheck || !parsed?.rows.length) return;
    let live = true;
    setBusy(true); setErr(null);
    onCheck(parsed.rows).then((c) => { if (live) setCheck(c); }, (e) => { if (live) setErr(errorText(e)); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const run = async () => {
    if (!parsed) return;
    setBusy(true); setErr(null);
    try { setResult(await onImport(parsed.rows)); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const close = () => { setBook(null); setResult(null); setErr(null); if (input.current) input.current.value = ''; };
  const keyHeader = columns.find((c) => c.key === keyColumn)?.header ?? keyColumn;

  return (
    <>
      <button className="btn btn-sm" disabled={disabled} onClick={() => input.current?.click()} title="Nạp tệp Excel theo tiêu đề cột của lưới"><FileUp size={14} /> {buttonLabel ?? 'Tìm file excel để nhập'}</button>
      {onTemplate && <button className="btn btn-sm" onClick={onTemplate} title="Xuất lưới đang xem làm mẫu nhập liệu"><FileDown size={14} /> Tạo mẫu nhập liệu</button>}
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
      {book && (
        <Modal title={`Nhập Excel: ${book.name}`} onClose={close} wide={Boolean(check?.preview)}
          footer={<>{!result && <button className="btn btn-primary" disabled={busy || !parsed?.rows.length || (onCheck ? !check?.ok : false)} onClick={() => void run()}>{busy ? (onCheck && !check ? 'Đang kiểm tra…' : 'Đang ghi…') : onCheck && check ? `Ghi ${check.ok.toLocaleString('vi-VN')} dòng đúng` : 'Ghi'}</button>}<button className="btn" onClick={close}>Đóng</button></>}>
          {book.sheets.length > 1 && (
            <div className="field full"><label>Sheet</label>
              <select className="select input" value={sheet} onChange={(e) => { setSheet(e.target.value); setResult(null); }}>{book.sheets.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </div>
          )}
          {parsed && !parsed.found.length && <div className="alert alert-bad full">Không thấy dòng tiêu đề có cột "{keyHeader}". Dùng "Tạo mẫu nhập liệu" để lấy đúng tiêu đề cột.</div>}
          {parsed && parsed.found.length > 0 && !result && (
            <div className="full">
              <p><b>{parsed.rows.length.toLocaleString('vi-VN')}</b> dòng có {keyHeader}.</p>
              <p>Cột nạp: {parsed.found.map((c) => c.header).join(', ')}.</p>
              {parsed.missing.length > 0 && <p className="muted">Không có trong tệp (giữ nguyên): {parsed.missing.map((c) => c.header).join(', ')}.</p>}
              <p className="muted">{hint ?? 'Ô trống trong tệp giữ nguyên giá trị đang có.'}</p>
              {check && (
                <>
                  <div className={check.ok ? 'alert alert-ok' : 'alert alert-warn'}>Ghi được <b>{check.ok.toLocaleString('vi-VN')}</b> dòng{check.okText ? ` (${check.okText})` : ''}{check.errors.length ? <> · <b>{new Set(check.errors.map((e) => e.row)).size.toLocaleString('vi-VN')}</b> dòng lỗi sẽ bỏ qua — sửa trong tệp rồi nạp lại</> : ' · không có dòng lỗi'}.</div>
                  {check.preview && <PreviewTable p={check.preview} keyColumn={keyColumn} />}
                  {!check.preview && check.errors.length > 0 && (
                    <div style={{ maxHeight: 260, overflow: 'auto' }}>
                      <table className="table"><thead><tr><th style={{ width: 70 }}>Dòng</th><th style={{ width: 130 }}>{keyHeader}</th><th>Lỗi</th></tr></thead>
                        <tbody>{check.errors.slice(0, 500).map((e, i) => <tr key={i}><td className="num">{e.row}</td><td className="mono">{e.key}</td><td style={{ color: 'var(--bad, #b42318)' }}>{e.text}</td></tr>)}</tbody></table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {result && (
            <div className="full">
              <div className="alert alert-ok">Đã cập nhật {result.updated.toLocaleString('vi-VN')} dòng{result.skipped ? `, bỏ qua ${result.skipped.toLocaleString('vi-VN')} dòng không đổi` : ''}.</div>
              {result.errors.length > 0 && <div className="alert alert-bad" style={{ maxHeight: 220, overflow: 'auto' }}>{result.errors.slice(0, 200).map((e, i) => <div key={i}>{e}</div>)}</div>}
            </div>
          )}
          <ErrorBox error={err} />
        </Modal>
      )}
    </>
  );
}
