// [2026-11-11 Nguyễn Văn Thủy] TRÌNH NHẬP EXCEL 4 BƯỚC dùng chung cho mọi loại dữ liệu (đóng góp)
/**
 * Một hộp cho mọi loại nhập (khai ở lib/nhapExcel.ts):
 *   1. Chọn tệp  — kéo thả / chọn tệp, Tải tệp mẫu (sinh từ mô tả trường, có sheet Hướng dẫn), chọn sheet, dòng tiêu đề (tự dò),
 *                  cách nhập Thêm mới / Cập nhật / Cả hai.
 *   2. Ghép cột  — tự ghép theo tên cột (không dấu, tên khác hay gặp); bảng Trường · Bắt buộc · Cột trên tệp · Giá trị mẫu · Ngầm định;
 *                  lọc Tất cả / Đã ghép / Chưa ghép. Cách ghép và ngầm định nhớ theo máy cho lần sau.
 *   3. Kiểm tra  — máy chủ kiểm từng dòng (không ghi): số dòng hợp lệ (thêm mới / cập nhật), không hợp lệ; bảng chi tiết, lọc theo trạng thái;
 *                  Tải tệp lỗi (tệp gốc + cột Lỗi) để sửa rồi nạp lại.
 *   4. Kết quả   — ghi các dòng hợp lệ (dòng lỗi bỏ qua), số thành công / thất bại, Tải tệp kết quả, Mở danh sách.
 * Ô trống ở dòng cập nhật = giữ nguyên giá trị đang có.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileDown, FileSpreadsheet, FileUp, XCircle } from 'lucide-react';
import { ErrorBox, Modal } from './ui';
import { errorText } from '@/lib/api';
import type { NhapCheDo, NhapDong, NhapKetQua, NhapLoai } from '@/lib/nhapExcel';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[()*:.]/g, ' ').replace(/\s+/g, ' ').trim();
const STEPS = ['Chọn tệp nguồn', 'Ghép dữ liệu', 'Kiểm tra dữ liệu', 'Kết quả nhập'];
const STATUS = { create: ['Thêm mới', 'badge-ok'], update: ['Cập nhật', 'badge-info'], error: ['Không hợp lệ', 'badge-bad'] } as const;

type Aoa = string[][];
interface Book { name: string; sheets: string[]; read: (s: string) => Aoa }
interface Saved { map: Record<string, number | null>; headers: string[]; defaults: Record<string, string>; mode: NhapCheDo }
const memKey = (id: string) => `ketoan.nhap-excel.${id}`;
const readMem = (id: string): Partial<Saved> => { try { return JSON.parse(localStorage.getItem(memKey(id)) ?? '{}') as Partial<Saved>; } catch { return {}; } };

/** Tệp mẫu: dòng tiêu đề + dòng ví dụ; sheet "Hướng dẫn" liệt kê từng cột. */
async function taiMau(loai: NhapLoai) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([loai.fields.map((f) => f.header + (f.required === true ? ' (*)' : '')), loai.fields.map((f) => f.example ?? f.defaultValue ?? '')]);
  ws['!cols'] = loai.fields.map((f) => ({ wch: Math.max(14, f.header.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, loai.title.slice(0, 30));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Cột', 'Bắt buộc', 'Ngầm định', 'Cách điền'],
    ...loai.fields.map((f) => [f.header, f.required === true ? 'Có' : f.required === 'moi' ? 'Khi thêm mới' : '', f.defaultValue ?? '', f.note ?? '']),
    [], ['', '', '', 'Dòng 2 của sheet đầu là dòng ví dụ — xoá hoặc sửa trước khi nhập. Ô trống ở dòng cập nhật giữ nguyên giá trị đang có.'],
  ]), 'Hướng dẫn');
  XLSX.writeFile(wb, `mau-nhap-${loai.id}.xlsx`);
}

/** Tệp lỗi / kết quả: các cột của tệp gốc + Trạng thái + Lỗi. */
async function taiKetQua(loai: NhapLoai, headers: string[], aoa: Aoa, headRow: number, kq: NhapKetQua, ten: string) {
  const XLSX = await import('xlsx');
  const byRow = new Map(kq.rows.map((r) => [r.row, r]));
  const out = [[...headers, 'Trạng thái', 'Lỗi']];
  aoa.slice(headRow + 1).forEach((line, i) => {
    const r = byRow.get(headRow + 2 + i);
    if (!r) return;
    out.push([...headers.map((_, j) => String(line[j] ?? '')), STATUS[r.action][0], r.errors.join('; ')]);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(out), loai.title.slice(0, 30));
  XLSX.writeFile(wb, ten);
}

export function NhapExcelWizard({ loai, onClose }: { loai: NhapLoai; onClose: () => void }) {
  const qc = useQueryClient();
  const mem = useMemo(() => readMem(loai.id), [loai.id]);
  const [step, setStep] = useState(0);
  const [book, setBook] = useState<Book | null>(null);
  const [sheet, setSheet] = useState('');
  const [headRow, setHeadRow] = useState(0);
  const [mode, setMode] = useState<NhapCheDo>(mem.mode ?? 'both');
  const [map, setMap] = useState<Record<string, number | null>>({});
  const [defaults, setDefaults] = useState<Record<string, string>>(() => ({ ...Object.fromEntries(loai.fields.filter((f) => f.defaultValue).map((f) => [f.key, f.defaultValue!])), ...mem.defaults }));
  const [loc, setLoc] = useState<'all' | 'ghep' | 'chua'>('all');
  const [check, setCheck] = useState<NhapKetQua | null>(null);
  const [done, setDone] = useState<NhapKetQua | null>(null);
  const [only, setOnly] = useState<'' | NhapDong['action']>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const aoa = useMemo(() => (book && sheet ? book.read(sheet) : []), [book, sheet]);
  const headers = useMemo(() => (aoa[headRow] ?? []).map((x) => String(x ?? '').trim()), [aoa, headRow]);

  // Tự ghép: tên cột trùng tiêu đề trường / tên khác hay gặp / khoá trường; giữ cách ghép lần trước nếu cột vẫn còn.
  const autoMap = (hs: string[]) => {
    const f = hs.map(fold);
    return Object.fromEntries(loai.fields.map((t) => {
      const prev = mem.map?.[t.key];
      if (prev !== undefined && prev !== null && mem.headers?.[prev] && fold(mem.headers[prev]!) === f[prev]) return [t.key, prev];
      const names = [t.header, t.key, ...(t.aliases ?? [])].map(fold);
      const i = f.findIndex((h) => names.includes(h.replace(/\s*\(\s*\)\s*$/, '').trim()));
      return [t.key, i >= 0 ? i : null];
    }));
  };
  // Dòng tiêu đề: trong 10 dòng đầu, dòng ghép được nhiều trường nhất.
  const findHead = (rows: Aoa) => {
    let best = 0; let score = -1;
    for (let h = 0; h < Math.min(10, rows.length); h++) {
      const m = autoMap((rows[h] ?? []).map((x) => String(x ?? '')));
      const n = Object.values(m).filter((v) => v !== null).length;
      if (n > score) { score = n; best = h; }
    }
    return best;
  };

  const pick = async (file: File) => {
    setErr(null); setCheck(null); setDone(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const b: Book = { name: file.name, sheets: wb.SheetNames, read: (s) => XLSX.utils.sheet_to_json<string[]>(wb.Sheets[s]!, { header: 1, raw: false, defval: '' }) };
      const first = wb.SheetNames.find((s) => !/hướng dẫn|huong dan/i.test(s)) ?? wb.SheetNames[0] ?? '';
      setBook(b); setSheet(first);
      const rows = b.read(first);
      const h = findHead(rows);
      setHeadRow(h);
      setMap(autoMap((rows[h] ?? []).map((x) => String(x ?? ''))));
    } catch (e) { setErr(`Không đọc được tệp: ${errorText(e)}`); }
  };
  useEffect(() => { if (book) setMap(autoMap(headers)); }, [sheet, headRow]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dòng dữ liệu theo cách ghép: _row = số dòng trong Excel; ô trống lấy ngầm định; bỏ dòng trống hẳn.
  const rows = useMemo(() => aoa.slice(headRow + 1).map((line, i) => {
    const r: Record<string, string> = { _row: String(headRow + 2 + i) };
    let any = false;
    for (const f of loai.fields) {
      const j = map[f.key];
      const v = j === null || j === undefined ? '' : String(line[j] ?? '').trim();
      if (v) any = true;
      r[f.key] = v || defaults[f.key] || '';
    }
    return any ? r : null;
  }).filter((r): r is Record<string, string> => r !== null), [aoa, headRow, map, defaults, loai.fields]);

  const thieuBatBuoc = loai.fields.filter((f) => f.required === true && map[f.key] == null && !defaults[f.key]);
  const nhoCach = () => { try { localStorage.setItem(memKey(loai.id), JSON.stringify({ map, headers, defaults, mode } satisfies Saved)); } catch { /* bỏ qua */ } };

  const kiemTra = async () => {
    setBusy(true); setErr(null); setCheck(null);
    try { nhoCach(); setCheck(await loai.run(rows, { dryRun: true, mode })); setStep(2); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const ghi = async () => {
    setBusy(true); setErr(null);
    try {
      const kq = await loai.run(rows, { dryRun: false, mode });
      setDone(kq); setStep(3);
      for (const k of loai.invalidate) void qc.invalidateQueries({ queryKey: [k] });
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  const hop = check ? check.created + check.updated : 0;
  const shown = (step === 3 ? done : check)?.rows.filter((r) => !only || r.action === only) ?? [];
  // Bảng kết quả: chỉ cột có dữ liệu ở ít nhất một dòng (đỡ rối), luôn có cột mã.
  const kq = step === 3 ? done : check;
  const cols = loai.fields.filter((f) => f.key === loai.keyField || kq?.rows.some((r) => r.values[f.key] || r.before?.[f.key]));
  const sample = aoa[headRow + 1] ?? [];

  const footer = (
    <>
      {step > 0 && step < 3 && <button className="btn" disabled={busy} onClick={() => { setStep(step - 1); setOnly(''); }}>Quay lại</button>}
      {step === 0 && <button className="btn btn-primary" disabled={!book || !rows.length} onClick={() => setStep(1)} title={!book ? 'Chọn tệp trước' : !rows.length ? 'Sheet không có dòng dữ liệu' : ''}>Tiếp tục</button>}
      {step === 1 && <button className="btn btn-primary" disabled={busy || thieuBatBuoc.length > 0} title={thieuBatBuoc.length ? `Chưa ghép cột bắt buộc: ${thieuBatBuoc.map((f) => f.header).join(', ')}` : ''} onClick={() => void kiemTra()}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra dữ liệu'}</button>}
      {step === 2 && <button className="btn btn-primary" disabled={busy || !hop} onClick={() => void ghi()}>{busy ? 'Đang nhập…' : `Nhập ${hop.toLocaleString('vi-VN')} dòng hợp lệ`}</button>}
      {step === 3 && <Link className="btn btn-primary" to={loai.listPath} onClick={onClose}>Mở danh sách {loai.title.toLowerCase()}</Link>}
      <button className="btn" onClick={onClose}>{step === 3 ? 'Đóng' : 'Huỷ bỏ'}</button>
    </>
  );

  return (
    <Modal voucher={{ keys: 'Các bước: chọn tệp → ghép cột → kiểm tra (chưa ghi) → nhập dòng hợp lệ · Esc - Thoát' }} title={`Nhập ${loai.title.toLowerCase()} từ Excel`} onClose={onClose} footer={footer}>
      <div className="full nx-steps">
        {STEPS.map((s, i) => <span key={s} className={i === step ? 'on' : i < step ? 'xong' : undefined}><b>{i + 1}</b>{s}</span>)}
      </div>

      {step === 0 && (
        <div className="full nx-buoc">
          <div className={`nx-drop${drag ? ' over' : ''}`} onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void pick(f); }}>
            <FileSpreadsheet size={34} />
            <div><b>{book ? book.name : 'Kéo thả tệp Excel vào đây'}</b><small>{book ? `${rows.length.toLocaleString('vi-VN')} dòng dữ liệu · bấm để chọn tệp khác` : 'hoặc bấm để chọn tệp (.xlsx, .xls, .csv)'}</small></div>
          </div>
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
          <div className="nx-row">
            <span>Chưa có tệp đúng mẫu?</span>
            <button type="button" className="btn btn-sm" onClick={() => void taiMau(loai)}><FileDown size={14} /> Tải tệp mẫu {loai.title.toLowerCase()}</button>
            <span className="muted">Tệp mẫu có sheet Hướng dẫn ghi cách điền từng cột. Tệp của bạn không cần đúng mẫu: bước sau ghép cột.</span>
          </div>
          {book && (
            <div className="nx-grid">
              <label>Sheet chứa dữ liệu</label>
              <select className="select input" value={sheet} onChange={(e) => setSheet(e.target.value)}>{book.sheets.map((s) => <option key={s}>{s}</option>)}</select>
              <label>Dòng tiêu đề cột</label>
              <select className="select input" value={headRow} onChange={(e) => setHeadRow(Number(e.target.value))} title="Phần mềm tự dò dòng có nhiều tên cột khớp nhất">
                {aoa.slice(0, 10).map((r, i) => <option key={i} value={i}>Dòng {i + 1}: {r.filter(Boolean).slice(0, 4).join(' · ').slice(0, 70)}</option>)}
              </select>
            </div>
          )}
          {loai.modes !== false && (
            <div className="nx-mode">
              <b>Cách nhập</b>
              {([['both', 'Thêm mới và cập nhật', 'Mã chưa có → thêm mới; mã đã có → cập nhật (ô trống giữ nguyên)'], ['create', 'Chỉ thêm mới', 'Mã đã có báo lỗi, không sửa dữ liệu đang có'], ['update', 'Chỉ cập nhật', 'Mã chưa có báo lỗi; dùng để sửa hàng loạt']] as const).map(([k, l, t]) => (
                <label key={k} className="checkbox" title={t}><input type="radio" checked={mode === k} onChange={() => setMode(k)} /> <span><b>{l}</b><small>{t}</small></span></label>
              ))}
            </div>
          )}
          {loai.modes === false && <p className="muted">Mã đã có → cập nhật (ô trống giữ nguyên); mã chưa có → thêm mới.</p>}
        </div>
      )}

      {step === 1 && (
        <div className="full nx-buoc">
          <div className="nx-row">
            {([['all', `Tất cả ${loai.fields.length}`], ['ghep', `Đã ghép ${loai.fields.filter((f) => map[f.key] != null).length}`], ['chua', `Chưa ghép ${loai.fields.filter((f) => map[f.key] == null).length}`]] as const).map(([k, l]) => (
              <button key={k} type="button" className={`btn btn-sm${loc === k ? ' btn-primary' : ''}`} onClick={() => setLoc(k)}>{l}</button>
            ))}
            <span className="muted">{rows.length.toLocaleString('vi-VN')} dòng dữ liệu · cột không ghép thì lấy ô Ngầm định (để trống = bỏ qua)</span>
          </div>
          {thieuBatBuoc.length > 0 && <div className="alert alert-bad">Chưa ghép cột bắt buộc: {thieuBatBuoc.map((f) => f.header).join(', ')}.</div>}
          <div className="nx-table">
            <table className="grid">
              <thead><tr><th style={{ width: 210 }}>Trường trên phần mềm</th><th style={{ width: 90 }}>Bắt buộc</th><th style={{ width: 240 }}>Cột trên tệp Excel</th><th>Giá trị dòng đầu</th><th style={{ width: 200 }}>Ngầm định</th><th>Diễn giải</th></tr></thead>
              <tbody>
                {loai.fields.filter((f) => loc === 'all' || (loc === 'ghep') === (map[f.key] != null)).map((f) => {
                  const j = map[f.key];
                  return (
                    <tr key={f.key}>
                      <td><b>{f.header}</b></td>
                      <td>{f.required === true ? <span className="badge badge-bad">Bắt buộc</span> : f.required === 'moi' ? <span className="badge badge-warn" title="Bắt buộc với dòng thêm mới">Khi thêm mới</span> : ''}</td>
                      <td><select className="select input" style={{ width: '100%' }} value={j ?? ''} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value === '' ? null : Number(e.target.value) }))}>
                        <option value="">— Không nhập —</option>
                        {headers.map((h, i) => (h ? <option key={i} value={i}>{h}</option> : null))}
                      </select></td>
                      <td className="muted">{j == null ? '' : String(sample[j] ?? '')}</td>
                      <td><input className="input" style={{ width: '100%' }} value={defaults[f.key] ?? ''} placeholder={j == null ? 'giá trị dùng chung' : 'khi ô trống'} onChange={(e) => setDefaults((d) => ({ ...d, [f.key]: e.target.value }))} /></td>
                      <td className="muted" style={{ fontSize: 12 }}>{f.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(step === 2 || step === 3) && (check || done) && (
        <div className="full nx-buoc">
          {step === 2 && check && (
            <div className="nx-kq">
              <div className="ok"><CheckCircle2 size={22} /><span><b>{hop.toLocaleString('vi-VN')}</b> dòng hợp lệ<small>{check.created} thêm mới · {check.updated} cập nhật</small></span></div>
              <div className={check.failed ? 'bad' : 'ok'}><XCircle size={22} /><span><b>{check.failed.toLocaleString('vi-VN')}</b> dòng không hợp lệ<small>{check.failed ? 'bỏ qua khi nhập — tải tệp lỗi để sửa' : 'không có'}</small></span></div>
              {check.failed > 0 && <button type="button" className="btn btn-sm" onClick={() => void taiKetQua(loai, headers, aoa, headRow, check, `loi-nhap-${loai.id}.xlsx`)}><FileDown size={14} /> Tải tệp lỗi</button>}
              <span className="muted">Chưa ghi gì. Bấm "Nhập {hop} dòng hợp lệ" để ghi.</span>
            </div>
          )}
          {step === 3 && done && (
            <div className="nx-kq">
              <div className="ok"><CheckCircle2 size={22} /><span><b>{(done.created + done.updated).toLocaleString('vi-VN')}</b> dòng đã nhập<small>{done.created} thêm mới · {done.updated} cập nhật</small></span></div>
              <div className={done.failed ? 'bad' : 'ok'}><XCircle size={22} /><span><b>{done.failed.toLocaleString('vi-VN')}</b> dòng không nhập<small>{done.failed ? 'xem cột Lỗi' : 'không có'}</small></span></div>
              <button type="button" className="btn btn-sm" onClick={() => void taiKetQua(loai, headers, aoa, headRow, done, `ket-qua-nhap-${loai.id}.xlsx`)}><FileDown size={14} /> Tải tệp kết quả</button>
            </div>
          )}
          <div className="nx-row">
            {([['', 'Tất cả'], ['create', 'Thêm mới'], ['update', 'Cập nhật'], ['error', 'Không hợp lệ']] as const).map(([k, l]) => (
              <button key={k} type="button" className={`btn btn-sm${only === k ? ' btn-primary' : ''}`} onClick={() => setOnly(k)}>{l} {((step === 3 ? done : check)?.rows.filter((r) => !k || r.action === k).length ?? 0).toLocaleString('vi-VN')}</button>
            ))}
          </div>
          <div className="nx-table">
            <table className="grid">
              <thead><tr><th style={{ width: 60 }}>Dòng</th><th style={{ width: 110 }}>Trạng thái</th>{cols.map((c) => <th key={c.key}>{c.header}</th>)}<th style={{ minWidth: 260 }}>Lỗi</th></tr></thead>
              <tbody>{shown.slice(0, 2000).map((r) => (
                <tr key={r.row} className={r.action === 'error' ? 'nx-loi' : undefined}>
                  <td className="num">{r.row}</td>
                  <td><span className={`badge ${STATUS[r.action][1]}`}>{STATUS[r.action][0]}</span></td>
                  {cols.map((c) => {
                    const v = r.values[c.key] ?? ''; const old = r.before?.[c.key] ?? '';
                    return <td key={c.key}>{r.action === 'update' && c.key !== loai.keyField && v && old && v !== old ? <span title={`Đang có: ${old}`}><s className="muted">{old}</s> → <b>{v}</b></span> : r.action === 'update' && !v ? <span className="muted" title="Ô trống — giữ nguyên">{old}</span> : v}</td>;
                  })}
                  <td className="nx-loi-chu">{r.errors.join('; ')}</td>
                </tr>
              ))}</tbody>
            </table>
            {shown.length > 2000 && <div className="muted" style={{ fontSize: 12, padding: 6 }}>Hiện 2.000 / {shown.length.toLocaleString('vi-VN')} dòng — tải tệp để xem hết.</div>}
          </div>
        </div>
      )}
      <ErrorBox error={err} />
    </Modal>
  );
}

/** Nút "Nhập Excel" đặt ở danh sách: mở trình nhập của một loại. */
export function NutNhapExcel({ loai, disabled, label = 'Nhập Excel' }: { loai: NhapLoai; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-sm" disabled={disabled} onClick={() => setOpen(true)} title={`Nhập ${loai.title.toLowerCase()} từ tệp Excel: tải mẫu, ghép cột, kiểm tra từng dòng trước khi ghi`}><FileUp size={14} /> {label}</button>
      {open && <NhapExcelWizard loai={loai} onClose={() => setOpen(false)} />}
    </>
  );
}
