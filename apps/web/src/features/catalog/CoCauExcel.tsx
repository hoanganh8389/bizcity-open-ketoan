// [2026-11-13 Nguyễn Văn Thủy] Cơ cấu tổ chức kiểu Excel: danh sách theo loại (lọc từng cột), xuất / nhập Excel cùng một mẫu 4 sheet (đóng góp)
/**
 * Danh sách theo loại — Cơ cấu · Cửa hàng · Kho · Phòng ban · Tất cả: lưới có hàng lọc từng cột, sắp xếp, chọn cột, xuất Excel.
 * Xuất Excel: 4 sheet Cơ cấu / Cửa hàng / Kho / Phòng ban. Sửa trong Excel rồi Nhập lại đúng tệp đó:
 *   dòng có mã chưa có → thêm; có mã → so từng ô, đổi thì sửa, không đổi thì bỏ qua; cột không có trong tệp → giữ nguyên.
 *   Xem trước (thêm / sửa / lỗi) rồi mới ghi; có lỗi thì không ghi gì. Ghi lần lượt: cơ cấu (cha trước con) → cửa hàng → kho → phòng ban.
 */
import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { errorText } from '@/lib/api';
import { Field, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { plain } from '@/components/pickers';
import { invalidateOrg } from '@/lib/orgUnits';
import { formOf, ghiChu, loaiNhan, luuNut, mstOf, off, type CC, type CNode, type F, type Loai } from './CoCauToChucPage';

export type KieuDs = 'all' | 'org' | 'branch' | 'warehouse' | 'department';
const yes = (b: boolean) => (b ? 'x' : '');
const parentOf = (cc: CC, n: CNode) => (n.parentKey ? cc.byKey.get(n.parentKey) ?? null : null);
const parentCode = (cc: CC, n: CNode) => { const p = parentOf(cc, n); return p && p.loai !== 'none' ? p.code : ''; };
const parentName = (cc: CC, n: CNode) => { const p = parentOf(cc, n); return p && p.loai !== 'none' ? p.name : ''; };

function rowsOf(cc: CC, kieu: KieuDs, showOff: boolean): CNode[] {
  const want = (n: CNode) => n.loai !== 'none' && (showOff || !off(n)) && (kieu === 'all' || (kieu === 'org' ? n.org : n.loai === kieu));
  return cc.nodes.filter(want).sort((a, b) => a.code.localeCompare(b.code));
}

/** Lưới danh sách theo loại (kiểu Excel). Bấm đúp mở hộp thoại của dòng. */
export function DanhSachLoai({ cc, kieu, showOff, onOpen, exportRef }: { cc: CC; kieu: KieuDs; showOff: boolean; onOpen: (n: CNode) => void; exportRef: { current: (() => void) | null } }) {
  const rows = useMemo(() => rowsOf(cc, kieu, showOff), [cc, kieu, showOff]);
  const count = (n: CNode, l: Loai) => cc.under(n.key).filter((x) => x.loai === l && !off(x)).length;
  const theoDoi: Column<CNode> = { key: 'isActive', header: 'Theo dõi', type: 'check', width: 70, title: 'Đang dùng', value: (n) => !off(n) };
  const cols: Record<KieuDs, Column<CNode>[]> = {
    all: [
      { key: 'loai', header: 'Loại', width: 130, value: (n) => loaiNhan(n) },
      { key: 'code', header: 'Mã', type: 'code', width: 120 },
      { key: 'name', header: 'Tên', width: 260 },
      { key: 'p', header: 'Thuộc (mã)', type: 'code', width: 110, value: (n) => parentCode(cc, n) },
      { key: 'pn', header: 'Thuộc (tên)', width: 220, value: (n) => parentName(cc, n) },
      { key: 'mst', header: 'MST', type: 'code', width: 130, value: (n) => mstOf(n) },
      { key: 'gc', header: 'Ghi chú', width: 200, value: (n) => ghiChu(n, cc) },
      theoDoi,
    ],
    org: [
      { key: 'code', header: 'Mã', type: 'code', width: 110 },
      { key: 'name', header: 'Tên', width: 280 },
      { key: 'loai', header: 'Loại', width: 120, value: (n) => loaiNhan(n) },
      { key: 'p', header: 'Thuộc (mã)', type: 'code', width: 100, value: (n) => parentCode(cc, n) },
      { key: 'pn', header: 'Thuộc (tên)', width: 220, value: (n) => parentName(cc, n) },
      { key: 'mst', header: 'MST', type: 'code', width: 130, value: (n) => n.org?.taxId ?? '' },
      { key: 'shop', header: 'Số cửa hàng', type: 'number', width: 90, title: 'Cửa hàng đang dùng trong cả nhánh', value: (n) => count(n, 'branch') },
      { key: 'kho', header: 'Số kho', type: 'number', width: 80, title: 'Kho đang dùng trong cả nhánh', value: (n) => count(n, 'warehouse') },
      { key: 'note', header: 'Mô tả', width: 200, value: (n) => n.org?.note ?? '' },
      theoDoi,
    ],
    branch: [
      { key: 'code', header: 'Mã', type: 'code', width: 110 },
      { key: 'name', header: 'Tên', width: 200 },
      { key: 'p', header: 'Thuộc cơ cấu', type: 'code', width: 100, value: (n) => parentCode(cc, n) },
      { key: 'pn', header: 'Tên cơ cấu', width: 220, value: (n) => parentName(cc, n) },
      { key: 'mst', header: 'MST', type: 'code', width: 130, value: (n) => n.branch?.taxCode ?? '' },
      { key: 'pb', header: 'Phòng ban', type: 'code', width: 100, value: (n) => n.branch?.departmentCode ?? '' },
      { key: 'cty', header: 'Tên công ty in', width: 200, value: (n) => n.branch?.companyName ?? '' },
      { key: 'dc', header: 'Địa chỉ', width: 260, value: (n) => n.branch?.address ?? '' },
      { key: 'dt', header: 'Điện thoại', type: 'code', width: 110, value: (n) => n.branch?.phone ?? '' },
      { key: 'kho', header: 'Số kho', type: 'number', width: 70, value: (n) => count(n, 'warehouse') },
      theoDoi,
    ],
    warehouse: [
      { key: 'code', header: 'Mã kho', type: 'code', width: 110 },
      { key: 'name', header: 'Tên kho', width: 200 },
      { key: 'p', header: 'Cửa hàng', type: 'code', width: 110, value: (n) => parentCode(cc, n) },
      { key: 'pn', header: 'Tên cửa hàng', width: 200, value: (n) => parentName(cc, n) },
      { key: 'lk', header: 'Loại kho', width: 150, value: (n) => [n.warehouse?.typeCode, n.warehouse?.typeName].filter(Boolean).join(' · ') },
      { key: 'md', header: 'Kho mặc định', type: 'check', width: 90, value: (n) => Boolean(n.warehouse?.isDefault) },
      { key: 'dc', header: 'Địa chỉ', width: 240, value: (n) => n.warehouse?.address ?? '' },
      theoDoi,
    ],
    department: [
      { key: 'code', header: 'Mã', type: 'code', width: 110 },
      { key: 'name', header: 'Tên', width: 240 },
      { key: 'p', header: 'Thuộc cơ cấu', type: 'code', width: 110, value: (n) => parentCode(cc, n) },
      { key: 'pn', header: 'Tên cơ cấu', width: 220, value: (n) => parentName(cc, n) },
      { key: 'note', header: 'Ghi chú', width: 240, value: (n) => n.dept?.note ?? '' },
      theoDoi,
    ],
  };
  return (
    <DataGrid storageKey={`dm16-ds-${kieu}-v1`} exportName={`co-cau-${kieu}`} exportRef={exportRef} rows={rows} rowKey={(n) => n.key} columns={cols[kieu]}
      onRowDoubleClick={onOpen} rowClassName={(n) => (off(n) ? 'muted' : '')} groupable />
  );
}

/* ------------------------------------------------------------------ mẫu Excel */

const SHEETS = {
  org: { name: 'Cơ cấu', head: ['Loại', 'Mã', 'Tên', 'Thuộc (mã)', 'MST', 'Mô tả', 'Theo dõi'], cols: [12, 14, 40, 14, 16, 30, 9] },
  branch: { name: 'Cửa hàng', head: ['Mã', 'Tên', 'Thuộc cơ cấu (mã)', 'MST', 'Phòng ban', 'Tên công ty in', 'Địa chỉ', 'Điện thoại', 'Ghi chú', 'Theo dõi'], cols: [14, 30, 18, 16, 12, 30, 40, 14, 24, 9] },
  warehouse: { name: 'Kho', head: ['Mã kho', 'Tên kho', 'Cửa hàng (mã)', 'Loại kho', 'Kho mặc định', 'Địa chỉ', 'Ghi chú', 'Theo dõi'], cols: [14, 30, 16, 10, 12, 40, 24, 9] },
  department: { name: 'Phòng ban', head: ['Mã', 'Tên', 'Thuộc cơ cấu (mã)', 'Ghi chú', 'Theo dõi'], cols: [14, 34, 18, 30, 9] },
} as const;
type SheetKey = keyof typeof SHEETS;

/** Xuất 4 sheet — cũng là mẫu để nhập lại. */
export async function xuatCoCau(cc: CC) {
  const XLSX = await import('@/lib/excelChuan').then((m) => m.xlsxChuan());
  const all = [...cc.nodes].filter((n) => n.loai !== 'none');
  const byDepth = (a: CNode, b: CNode) => a.depth - b.depth || a.code.localeCompare(b.code);
  const data: Record<SheetKey, (string | number)[][]> = {
    org: all.filter((n) => n.org).sort(byDepth).map((n) => [n.loai === 'company' ? 'Công ty' : 'Cơ cấu', n.code, n.name, parentCode(cc, n), n.org!.taxId ?? '', n.org!.note, yes(n.isActive)]),
    branch: all.filter((n) => n.branch).sort(byDepth).map((n) => { const b = n.branch!; return [b.code, b.name, parentCode(cc, n), b.taxCode, b.departmentCode ?? '', b.companyName, b.address ?? '', b.phone, b.note, yes(b.isActive)]; }),
    warehouse: all.filter((n) => n.warehouse).sort((a, b) => a.code.localeCompare(b.code)).map((n) => { const w = n.warehouse!; return [w.code, w.name, w.branchCode, w.typeCode ?? '', yes(w.isDefault), w.address, w.note, yes(w.isActive)]; }),
    department: all.filter((n) => n.dept).sort(byDepth).map((n) => [n.code, n.name, parentCode(cc, n), n.dept!.note, yes(n.isActive)]),
  };
  const wb = XLSX.utils.book_new();
  for (const k of Object.keys(SHEETS) as SheetKey[]) {
    const ws = XLSX.utils.aoa_to_sheet([[...SHEETS[k].head], ...data[k]] as unknown as string[][]);
    ws['!cols'] = SHEETS[k].cols.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, SHEETS[k].name);
  }
  XLSX.writeFile(wb, 'co-cau-to-chuc.xlsx');
}

/* ------------------------------------------------------------------ nhập Excel */

interface PlanRow { sheet: string; row: number; code: string; loai: Exclude<Loai, 'none'>; kind: 'new' | 'edit' | 'same' | 'error'; message: string; f?: F; node?: CNode | null; start?: F | null }
const H = (s: unknown) => plain(String(s ?? '')).replace(/[^a-z0-9]+/g, ' ').trim();
const truthy = (v: string) => !['', '0', 'khong', 'no', 'false', 'ngung'].includes(H(v));
const KEYS: (keyof F)[] = ['loai', 'parentKey', 'code', 'name', 'note', 'isActive', 'taxId', 'address', 'phone', 'companyName', 'departmentCode', 'typeCode', 'isDefault'];

function lapKeHoach(cc: CC, wb: { SheetNames: string[]; Sheets: Record<string, unknown> }, toJson: (ws: unknown) => Record<string, unknown>[]): PlanRow[] {
  const plan: PlanRow[] = [];
  const sheetRows = (k: SheetKey) => {
    const n = wb.SheetNames.find((s) => H(s) === H(SHEETS[k].name));
    return n ? toJson(wb.Sheets[n]) : null;
  };
  // Mã có trong tệp (để nút cha khai cùng tệp được chấp nhận).
  const inFile: Record<'org' | 'branch', Set<string>> = { org: new Set(), branch: new Set() };
  const parsed: { k: SheetKey; rows: { i: number; get: (name: string) => string | undefined }[] }[] = [];
  for (const k of Object.keys(SHEETS) as SheetKey[]) {
    const rows = sheetRows(k);
    if (!rows) continue;
    const list = rows.map((r, i) => {
      const m = new Map(Object.entries(r).map(([key, v]) => [H(key), String(v ?? '').trim()]));
      return { i: i + 2, get: (name: string) => (m.has(H(name)) ? m.get(H(name))! : undefined) };
    });
    parsed.push({ k, rows: list });
    if (k === 'org' || k === 'branch') for (const r of list) { const c = r.get(k === 'branch' ? 'Mã' : 'Mã'); if (c) inFile[k].add(c); }
  }
  const orgOk = (c: string) => cc.byKey.has(`o:${c}`) || inFile.org.has(c);
  const branchOk = (c: string) => cc.byKey.has(`b:${c}`) || inFile.branch.has(c);
  for (const { k, rows } of parsed) {
    const sheet = SHEETS[k].name;
    for (const r of rows) {
      const code = (k === 'warehouse' ? r.get('Mã kho') : r.get('Mã')) ?? '';
      if (!code && !Object.values(SHEETS[k].head).some((h) => r.get(h))) continue;
      const loai: Exclude<Loai, 'none'> = k === 'org' ? (H(r.get('Loại')) === 'cong ty' ? 'company' : 'unit') : k;
      const key = `${k === 'org' ? 'o' : k === 'branch' ? 'b' : k === 'warehouse' ? 'w' : 'd'}:${code}`;
      const node = cc.byKey.get(key) ?? null;
      const err = (message: string) => plan.push({ sheet, row: r.i, code, loai, kind: 'error', message });
      if (!code) { err('Thiếu mã'); continue; }
      const start = node ? formOf(node, null, cc) : null;
      const f: F = { ...(start ?? formOf(null, null, cc)), loai, code };
      const put = <K extends keyof F>(field: K, v: string | undefined, conv: (s: string) => F[K]) => { if (v !== undefined) f[field] = conv(v); };
      put('name', r.get(k === 'warehouse' ? 'Tên kho' : 'Tên'), (s) => s);
      put('isActive', r.get('Theo dõi'), truthy);
      if (k === 'org') {
        const p = r.get('Thuộc (mã)');
        if (p !== undefined) { if (p && !orgOk(p)) { err(`Không có cơ cấu cha ${p}`); continue; } f.parentKey = p ? `o:${p}` : null; }
        put('taxId', r.get('MST'), (s) => s); put('note', r.get('Mô tả'), (s) => s);
        if (f.taxId && !/^[0-9]{10}(-[0-9]{3})?$/.test(f.taxId)) { err('MST gồm 10 số hoặc 10 số-3 số'); continue; }
      } else if (k === 'branch') {
        const p = r.get('Thuộc cơ cấu (mã)');
        if (p !== undefined) { if (p && !orgOk(p)) { err(`Không có cơ cấu ${p}`); continue; } f.parentKey = p ? `o:${p}` : null; }
        put('taxId', r.get('MST'), (s) => s); put('departmentCode', r.get('Phòng ban'), (s) => s); put('companyName', r.get('Tên công ty in'), (s) => s);
        put('address', r.get('Địa chỉ'), (s) => s); put('phone', r.get('Điện thoại'), (s) => s); put('note', r.get('Ghi chú'), (s) => s);
        if (f.departmentCode && !cc.departments.some((d) => d.code === f.departmentCode)) { err(`Không có phòng ban ${f.departmentCode}`); continue; }
      } else if (k === 'warehouse') {
        const p = r.get('Cửa hàng (mã)');
        if (p !== undefined) { if (!p || !branchOk(p)) { err(p ? `Không có cửa hàng ${p}` : 'Thiếu cửa hàng'); continue; } f.parentKey = `b:${p}`; }
        if (!f.parentKey) { err('Thiếu cửa hàng'); continue; }
        put('typeCode', r.get('Loại kho'), (s) => s.toUpperCase() || 'KHH'); put('isDefault', r.get('Kho mặc định'), truthy);
        put('address', r.get('Địa chỉ'), (s) => s); put('note', r.get('Ghi chú'), (s) => s);
        if (code.length > 12) { err('Mã kho tối đa 12 ký tự'); continue; }
      } else {
        const p = r.get('Thuộc cơ cấu (mã)');
        if (p !== undefined) { if (p && !orgOk(p)) { err(`Không có cơ cấu ${p}`); continue; } f.parentKey = p ? `o:${p}` : null; }
        put('note', r.get('Ghi chú'), (s) => s);
      }
      if (!f.name.trim()) { err('Thiếu tên'); continue; }
      if (!node) { plan.push({ sheet, row: r.i, code, loai, kind: 'new', message: 'Thêm mới', f, node, start }); continue; }
      const diff = KEYS.filter((x) => x !== 'loai' || (f.loai !== 'company' && f.loai !== 'unit') ? JSON.stringify(f[x]) !== JSON.stringify(start![x]) : f.loai !== start!.loai);
      plan.push({ sheet, row: r.i, code, loai, kind: diff.length ? 'edit' : 'same', message: diff.length ? `Sửa: ${diff.length} ô` : 'Không đổi', f, node, start });
    }
  }
  return plan;
}

/** Thứ tự ghi: cơ cấu cha trước con → cửa hàng → kho → phòng ban. */
function thuTu(plan: PlanRow[]): PlanRow[] {
  const work = plan.filter((p) => p.kind === 'new' || p.kind === 'edit');
  const org = work.filter((p) => p.loai === 'company' || p.loai === 'unit');
  const done = new Set<string>(), out: PlanRow[] = [];
  const codes = new Set(org.map((p) => p.code));
  for (let pass = 0; pass < 20 && out.length < org.length; pass++) {
    for (const p of org) {
      if (done.has(p.code)) continue;
      const parent = p.f!.parentKey?.slice(2);
      if (parent && codes.has(parent) && !done.has(parent) && parent !== p.code) continue;
      out.push(p); done.add(p.code);
    }
  }
  for (const p of org) if (!done.has(p.code)) out.push(p);
  for (const l of ['branch', 'warehouse', 'department'] as const) out.push(...work.filter((p) => p.loai === l));
  return out;
}

export function NhapCoCau({ cc, onClose, onDone }: { cc: CC; onClose: () => void; onDone: (text: string) => void }) {
  const qc = useQueryClient();
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number; fails: string[] } | null>(null);
  const [only, setOnly] = useState<'change' | 'all'>('change');
  const stop = useRef(false);
  const read = async (file: File) => {
    setErr(''); setPlan(null); setProg(null);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    const p = lapKeHoach(cc, wb as never, (ws) => XLSX.utils.sheet_to_json<Record<string, unknown>>(ws as never, { defval: '' }));
    if (!p.length) { setErr('Không đọc được sheet Cơ cấu / Cửa hàng / Kho / Phòng ban — dùng tệp từ nút Xuất làm mẫu.'); return; }
    setPlan(p);
  };
  const errors = plan?.filter((p) => p.kind === 'error') ?? [];
  const work = plan ? thuTu(plan) : [];
  const run = async () => {
    setBusy(true); stop.current = false;
    const fails: string[] = [];
    let done = 0;
    setProg({ done, total: work.length, fails });
    for (const p of work) {
      if (stop.current) break;
      try { await luuNut(cc, p.f!, p.node ?? null, p.start ?? null, null); }
      catch (e) { fails.push(`${p.sheet} dòng ${p.row} (${p.code}): ${errorText(e)}`); }
      done++;
      setProg({ done, total: work.length, fails: [...fails] });
    }
    invalidateOrg(qc);
    for (const k of [['warehouses'], ['dimensions', 'department'], ['co-cau-history']]) void qc.invalidateQueries({ queryKey: k });
    setBusy(false);
    if (!fails.length) onDone(`Đã nhập: ${work.filter((p) => p.kind === 'new').length} dòng thêm, ${work.filter((p) => p.kind === 'edit').length} dòng sửa.`);
  };
  const shown = (plan ?? []).filter((p) => only === 'all' || p.kind !== 'same');
  const count = (k: PlanRow['kind']) => plan?.filter((p) => p.kind === k).length ?? 0;
  return (
    <Modal wide title="Nhập cơ cấu tổ chức từ Excel" onClose={() => { stop.current = true; onClose(); }} helpKey="so-do-to-chuc"
      footer={<><button className="btn btn-primary" disabled={!plan || errors.length > 0 || !work.length || busy} onClick={() => void run()}>Ghi</button><button className="btn" onClick={() => { stop.current = true; onClose(); }}>Thoát</button></>}>
      <div className="full" style={{ fontSize: 13 }}>
        Dùng tệp từ nút <b>Xuất</b> làm mẫu (4 sheet: <b>Cơ cấu</b>, <b>Cửa hàng</b>, <b>Kho</b>, <b>Phòng ban</b>). Mã chưa có → thêm; mã đã có → sửa các ô khác đi;
        cột bỏ khỏi tệp → giữ nguyên. Có lỗi thì không ghi gì.
      </div>
      <Field label="Tệp Excel" full><input type="file" accept=".xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); }} /></Field>
      {err && <div className="alert alert-bad full">{err}</div>}
      {plan && (
        <div className="full" style={{ fontSize: 13 }}>
          <div className={`alert ${errors.length ? 'alert-bad' : 'alert-ok'}`}>
            {errors.length ? `${errors.length} dòng lỗi — sửa tệp rồi chọn lại.` : `Xem trước: ${count('new')} dòng thêm, ${count('edit')} dòng sửa, ${count('same')} dòng không đổi. Bấm Ghi để lưu.`}
          </div>
          {prog && <div className={`alert ${prog.fails.length ? 'alert-bad' : 'alert-ok'}`}>Đã ghi {prog.done}/{prog.total}{busy ? '…' : ''}{prog.fails.length ? ` · ${prog.fails.length} dòng không ghi được` : ''}
            {prog.fails.slice(0, 20).map((x, i) => <div key={i}>{x}</div>)}</div>}
          {busy && <Loading />}
          <div className="row" style={{ gap: 12, margin: '4px 0' }}>
            <label className="checkbox"><input type="radio" checked={only === 'change'} onChange={() => setOnly('change')} /> Chỉ dòng thêm / sửa / lỗi</label>
            <label className="checkbox"><input type="radio" checked={only === 'all'} onChange={() => setOnly('all')} /> Tất cả</label>
          </div>
          <div className="table-wrap" style={{ maxHeight: 360 }}>
            <table className="grid">
              <thead><tr><th>Sheet</th><th>Dòng</th><th>Mã</th><th>Tên</th><th>Kết quả</th></tr></thead>
              <tbody>{shown.slice(0, 500).map((p, i) => (
                <tr key={i}><td>{p.sheet}</td><td>{p.row}</td><td className="mono">{p.code}</td><td>{p.f?.name ?? ''}</td>
                  <td className={p.kind === 'error' ? 'text-bad' : p.kind === 'same' ? 'muted' : ''}>{p.message}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
