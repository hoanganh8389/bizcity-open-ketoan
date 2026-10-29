/**
 * XEM NHANH TỆP ĐÍNH KÈM ngay trên web, giống khi mở bằng phần mềm trên máy — không phải tải về:
 *   - PDF: trình xem PDF của trình duyệt (màu, trang, phóng to, in);
 *   - Ảnh: đúng màu gốc, bấm để xem cỡ thật / vừa khung;
 *   - Excel (.xlsx): giữ màu nền, màu chữ, đậm / nghiêng, viền, căn lề, gộp ô, độ rộng cột (excelView.ts); .xls / .csv: chữ;
 *   - Word (.docx): dàn trang như Word (docx-preview: font, màu, bảng, ảnh, đầu / chân trang);
 *   - Tệp chữ: nội dung. Loại khác (.doc cũ…) thì nút Tải về.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Modal } from '@/components/ui';
import { errorText } from '@/lib/api';
import { purchaseApi, type Attachment } from '../du-lieu';
import { readStyledWorkbook, type XSheet } from './excelView';

type View = { kind: 'url'; url: string; type: 'pdf' | 'img' } | { kind: 'sheets'; sheets: XSheet[] } | { kind: 'docx'; buf: ArrayBuffer } | { kind: 'text'; text: string } | { kind: 'none' };

/** Tên cột kiểu Excel: 0 → A, 25 → Z, 26 → AA. */
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const ext = (n: string) => n.toLowerCase().split('.').pop() ?? '';
const IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
export const canPreview = (f: Pick<Attachment, 'fileName' | 'mime'>) => /pdf|image|sheet|excel|csv|text|wordprocessingml/.test(f.mime) || ['pdf', ...IMG, 'xlsx', 'xlsm', 'xls', 'csv', 'txt', 'docx'].includes(ext(f.fileName));

export function XemTep({ file, onClose }: { file: Attachment; onClose: () => void }) {
  const [view, setView] = useState<View | null>(null);
  const [sheet, setSheet] = useState(0);
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let url = '';
    (async () => {
      try {
        const blob = await purchaseApi.attachmentBlob(file);
        const e = ext(file.fileName);
        if (file.mime.includes('pdf') || e === 'pdf') { url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })); setView({ kind: 'url', url, type: 'pdf' }); return; }
        if (file.mime.startsWith('image/') || IMG.includes(e)) { url = URL.createObjectURL(e === 'svg' ? new Blob([blob], { type: 'image/svg+xml' }) : blob); setView({ kind: 'url', url, type: 'img' }); return; }
        if (e === 'docx' || file.mime.includes('wordprocessingml')) { setView({ kind: 'docx', buf: await blob.arrayBuffer() }); return; }
        if (/sheet|excel|csv/.test(file.mime) || ['xlsx', 'xlsm', 'xls', 'csv'].includes(e)) { setView({ kind: 'sheets', sheets: await readStyledWorkbook(await blob.arrayBuffer(), file.fileName) }); return; }
        if (file.mime.startsWith('text/') || e === 'txt') { setView({ kind: 'text', text: await blob.text() }); return; }
        setView({ kind: 'none' });
      } catch (x) { setErr(errorText(x)); }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [file]);
  const sh = view?.kind === 'sheets' ? view.sheets[sheet] : undefined;
  return (
    <Modal wide title={`Xem tệp: ${file.fileName}`} onClose={onClose} footer={<><button className="btn" onClick={() => void purchaseApi.openAttachment(file)}>Tải về</button><button className="btn" onClick={onClose}>Đóng</button></>}>
      <div className="full" style={{ minHeight: 300 }}>
        {err && <div className="alert alert-bad">{err}</div>}
        {!view && !err && <div className="muted">Đang mở tệp…</div>}
        {view?.kind === 'url' && view.type === 'pdf' && <iframe title={file.fileName} src={view.url} style={{ width: '100%', height: '74vh', border: '1px solid var(--line)', borderRadius: 6 }} />}
        {view?.kind === 'url' && view.type === 'img' && (
          <div style={{ textAlign: 'center', overflow: 'auto', maxHeight: '74vh', background: '#f1f5f9', borderRadius: 6, padding: 8 }}>
            <img src={view.url} alt={file.fileName} onClick={() => setZoom(!zoom)} title={zoom ? 'Bấm để thu vừa khung' : 'Bấm để xem cỡ thật'}
              style={zoom ? { maxWidth: 'none', cursor: 'zoom-out' } : { maxWidth: '100%', maxHeight: '70vh', cursor: 'zoom-in', imageRendering: 'auto' }} />
          </div>
        )}
        {view?.kind === 'docx' && <WordView buf={view.buf} />}
        {view?.kind === 'text' && <pre style={{ maxHeight: '74vh', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12.5 }}>{view.text}</pre>}
        {view?.kind === 'none' && <div className="alert alert-info">Loại tệp này chưa xem được trên web (vd Word .doc đời cũ) — bấm <b>Tải về</b> để mở bằng phần mềm trên máy.</div>}
        {view?.kind === 'sheets' && sh && <>
          {view.sheets.length > 1 && <div className="tabs" style={{ padding: 0, marginBottom: 6 }}>{view.sheets.map((s, i) => <button key={s.name} className={`tab ${i === sheet ? 'active' : ''}`} style={s.tabColor ? { boxShadow: `inset 0 -3px 0 ${s.tabColor}` } : undefined} onClick={() => setSheet(i)}>{s.name}</button>)}</div>}
          <SheetView sh={sh} />
          {sh.truncated && <div className="muted" style={{ fontSize: 12 }}>Chỉ hiện 3.000 dòng / 120 cột đầu — tải về để xem đủ.</div>}
        </>}
      </div>
    </Modal>
  );
}

/** Một sheet Excel có định dạng: lưới ô, tiêu đề cột A B C…, số dòng, gộp ô, độ rộng cột như trong tệp. */
function SheetView({ sh }: { sh: XSheet }) {
  const head: CSSProperties = { background: '#e9eef4', color: '#475569', fontWeight: 400, position: 'sticky', top: 0, zIndex: 2, border: '1px solid #cfd8e3', padding: '1px 4px', fontSize: 11 };
  const grid = '1px solid #e3e8ef';
  return (
    <div style={{ overflow: 'auto', maxHeight: '70vh', border: '1px solid var(--line)', background: '#fff' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 42 + sh.colWidths.reduce((t, w) => t + w, 0), fontFamily: 'Calibri, Arial, sans-serif', fontSize: 14.7, color: '#000' }}>
        <colgroup><col style={{ width: 42 }} />{sh.colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead><tr><th style={{ ...head, left: 0, zIndex: 3 }} />{sh.colWidths.map((_, i) => <th key={i} style={head}>{colName(i)}</th>)}</tr></thead>
        <tbody>{sh.rows.map((r, i) => (
          <tr key={i} style={sh.rowHeights[i] ? { height: sh.rowHeights[i] } : undefined}>
            <td style={{ ...head, position: 'sticky', left: 0, top: 'auto', zIndex: 1, textAlign: 'center' }}>{i + 1}</td>
            {r.map((c, j) => (c === null ? null : (
              <td key={j} rowSpan={c.rowSpan} colSpan={c.colSpan}
                style={{ border: grid, padding: '1px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip', verticalAlign: 'bottom', ...(c.style as CSSProperties) }}>{c.text}</td>
            )))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** Word (.docx) dàn trang như Word: trang giấy, font, màu, bảng, ảnh. */
function WordView({ buf }: { buf: ArrayBuffer }) {
  const box = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.innerHTML = '';
    void import('docx-preview').then((m) => m.renderAsync(buf, el, undefined, { className: 'docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, renderHeaders: true, renderFooters: true, renderFootnotes: true }))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [buf]);
  return <>{err && <div className="alert alert-bad">Không đọc được tệp Word: {err}</div>}<div ref={box} style={{ overflow: 'auto', maxHeight: '74vh', background: '#e5e7eb', borderRadius: 6 }} /></>;
}
