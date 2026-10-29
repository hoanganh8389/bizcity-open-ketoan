/**
 * Khung NHẬP EXCEL dùng chung: hướng dẫn cột + tải file mẫu (ExcelGuide) → kéo thả / chọn tệp → đọc theo TÊN CỘT (readTable,
 * thứ tự cột tuỳ ý, tệp nhiều sheet lấy sheet có cột chính) → xem trước từng dòng (dòng lỗi tô đỏ, ghi lý do) → đưa dòng hợp lệ vào.
 * Mỗi màn chỉ khai: các cột, cách đổi một dòng Excel thành dữ liệu (map trả { value } hoặc { error }), cột xem trước.
 */
import { useRef, useState, type ReactNode } from 'react';
import { FileUp } from 'lucide-react';
import { readTable } from '@ketoan/contracts/mua-hang';
import { Modal } from '@/components/ui';
import { ExcelGuide, type GuideColumn } from './ExcelGuide';

export interface ExcelImportSpec<K extends string, T> {
  title: string;
  file: string;
  columns: GuideColumn[];
  spec: [K, string[]][];
  keyField: K;
  map: (row: Record<K, string>) => { value?: T; error?: string };
  head: string[];
  cells: (t: T) => ReactNode[];
  note?: ReactNode;
  /** Kiểm thêm cần tra máy chủ (mã có trong danh mục, ĐVT đã khai…): trả lỗi theo từng dòng hợp lệ, undefined = đạt. */
  check?: (list: T[]) => Promise<(string | undefined)[]>;
}

export function NhapExcelChung<K extends string, T>({ s, onClose, onAdd }: { s: ExcelImportSpec<K, T>; onClose: () => void; onAdd: (list: T[]) => void }) {
  const [rows, setRows] = useState<{ row: number; value?: T; error?: string }[]>([]);
  const [file, setFile] = useState('');
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const ok = rows.filter((r) => r.value && !r.error).map((r) => r.value!);
  const pick = async (f: File) => {
    setErr(''); setFile(f.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false });
      for (const name of wb.SheetNames) {
        const t = readTable(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: '' }), s.spec, s.keyField, { keepBlankKey: true });
        if (t.rows.some((r) => r[s.keyField])) {
          // Dòng có dữ liệu mà trống cột khoá: báo đỏ, không lặng lẽ bỏ qua.
          const keyName = t.columns[s.keyField] ?? s.columns.find((c) => c.required)?.name ?? String(s.keyField);
          const read = t.rows.map((r) => ({ row: r.row, ...(r[s.keyField] ? s.map(r as Record<K, string>) : { error: `thiếu ${keyName}` }) }));
          setRows(read);
          if (s.check) {
            const good = read.filter((r) => r.value && !r.error);
            const errs = await s.check(good.map((r) => r.value!));
            const bad = new Map(good.map((r, i) => [r.row, errs[i]]));
            setRows(read.map((r) => (bad.get(r.row) ? { ...r, error: bad.get(r.row) } : r)));
          }
          return;
        }
      }
      throw new Error(`Không thấy bảng có cột "${s.columns.find((c) => c.required)?.name ?? s.columns[0]?.name}"`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setRows([]); }
  };
  return (
    <Modal wide title={s.title} onClose={onClose} footer={<><button className="btn btn-primary" disabled={!ok.length} onClick={() => onAdd(ok)}>Đưa {ok.length.toLocaleString('vi-VN')} dòng hợp lệ vào</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full"><ExcelGuide columns={s.columns} file={s.file} defaultOpen={!rows.length} /></div>
      <div className="full mh-drop" style={{ marginTop: 8 }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void pick(f); }}>
        <FileUp size={18} /> <span>{file ? `Tệp: ${file}` : 'Kéo thả tệp Excel vào đây hoặc'}</span>
        <button type="button" className="btn btn-sm" onClick={() => input.current?.click()}>Chọn tệp…</button>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
      </div>
      {err && <div className="alert alert-bad full" style={{ marginTop: 6 }}>{err}</div>}
      {s.note && <div className="full muted" style={{ fontSize: 12, marginTop: 6 }}>{s.note}</div>}
      {rows.length > 0 && <>
        <div className="full muted" style={{ fontSize: 12, margin: '6px 0' }}>{rows.length.toLocaleString('vi-VN')} dòng — {ok.length.toLocaleString('vi-VN')} hợp lệ, {(rows.length - ok.length).toLocaleString('vi-VN')} dòng đỏ bị bỏ qua.</div>
        <div className="full scroll-box" style={{ maxHeight: 320 }}>
          <table className="mh-mini"><thead><tr><th>Dòng</th>{s.head.map((h) => <th key={h}>{h}</th>)}<th>Kiểm tra</th></tr></thead>
            <tbody>{rows.slice(0, 500).map((r) => <tr key={r.row} className={r.error ? 'mh-row-bad' : ''}><td>{r.row}</td>{r.value ? s.cells(r.value).map((c, i) => <td key={i}>{c}</td>) : s.head.map((h) => <td key={h} />)}<td>{r.error ? <span className="mh-bad">{r.error}</span> : '✓'}</td></tr>)}</tbody>
          </table>
        </div>
      </>}
    </Modal>
  );
}

/** Xuất một danh sách ra tệp Excel (tiêu đề = khoá của object). */
export async function xuatExcel(file: string, sheet: string, rows: Record<string, unknown>[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet.slice(0, 31));
  XLSX.writeFile(wb, file);
}

/** Ngày có thật (45/13/2028, 30/02 → undefined). */
const thatNgay = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : undefined; };
/** Đọc ngày dd/mm/yyyy, yyyy-mm-dd hoặc số ngày Excel → yyyy-mm-dd (sai thì undefined). */
export function docNgay(v: string): string | undefined {
  const t = String(v ?? '').trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return thatNgay(`${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return thatNgay(`${m[1]}-${m[2]}-${m[3]}`);
  if (/^\d{5}$/.test(t)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000); return d.toISOString().slice(0, 10); }
  return undefined;
}
