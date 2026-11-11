/**
 * DM Tài khoản (ACC1) — hệ thống tài khoản, bố cục theo danh mục tài khoản phổ biến của phần mềm kế toán:
 *   Danh sách: Số tài khoản (cây: bấm ⊞ / ⊟ để mở / thu tài khoản con) · Tên · Tính chất · Tên tiếng Anh · Diễn giải · Trạng thái.
 *   Tài khoản tổng hợp in đậm, ngừng sử dụng hiện mờ. Nút Cột bật thêm: TK tổng hợp, Cấp và các ô "theo dõi chi tiết".
 *   Thanh nút: Thêm · Sửa · Xoá · Nạp · Xuất (Excel đúng mẫu "DANH SÁCH HỆ THỐNG TÀI KHOẢN") · Nhân bản · Ngừng / dùng lại ·
 *   Mở rộng / Thu gọn · Nhập Excel. Ô tìm theo số (khớp phần đầu) hoặc tên; lọc trạng thái.
 *   Form: Số TK, Tên TK, TK tổng hợp, Tính chất, Diễn giải; Theo dõi chi tiết theo (tích = bắt buộc nhập khi hạch toán vào tài khoản);
 *   Tên tiếng Anh. Các cờ phân loại cũ không có tác dụng (TK FC, VAT, vay, luôn tăng, sổ cái, giá thành, công nợ nội bộ) không còn trên
 *   màn — dữ liệu vẫn giữ nguyên.
 * [2026-11-11 Nguyễn Văn Thủy] viết lại theo chuẩn danh mục phổ biến, đơn giản hoá (docs/cap-nhat-ux/08-dm-tai-khoan.md) (đóng góp)
 */
import { useMemo, useRef, useState } from 'react';
import { Ban, CheckCircle2, Copy, MinusSquare, PlusSquare } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { AccountPicker } from '@/components/pickers';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import { flashSaved, savedNote, useCatalogWhy, useWarnAck, WarnAckBox, WhyPanel } from '@/components/WhyPanel';
import type { CatalogWarnAck } from '@ketoan/contracts';

export interface Account {
  code: string; name: string; nameEn: string | null; description?: string; parentCode: string | null; level: number; normalSide: string; isPosting: boolean;
  trackPartner: boolean; trackCostItem: boolean; trackDepartment: boolean; trackContract: boolean; trackEmployee: boolean; trackCase: boolean; trackProject: boolean;
  trackCapitalSource: boolean; trackCashflow: boolean; trackProduct: boolean; isDebt: boolean;
  isActive: boolean;
}
type Flag = 'trackPartner' | 'trackEmployee' | 'trackCostItem' | 'trackDepartment' | 'trackContract' | 'trackCase' | 'trackProject' | 'trackCapitalSource' | 'trackCashflow' | 'trackProduct';

export const TINH_CHAT: Record<string, string> = { debit: 'Dư Nợ', credit: 'Dư Có', both: 'Lưỡng tính' };
/** Đối tượng: "theo dõi đối tượng" và "ghi nhận công nợ" có cùng tác dụng (bắt buộc chọn đối tượng, sổ công nợ) — gộp một ô. */
const doiTuong = (a: Partial<Account>) => Boolean(a.trackPartner || a.isDebt);

/** Theo dõi chi tiết theo: [cờ, nhãn, chú thích rê chuột]. */
const THEO_DOI: [Flag, string, string][] = [
  ['trackPartner', 'Đối tượng', 'Bắt buộc chọn khách hàng / nhà cung cấp / nhân viên khi hạch toán; sổ công nợ, số dư theo từng đối tượng'],
  ['trackEmployee', 'Nhân viên', 'Bắt buộc chọn nhân viên trên dòng hạch toán'],
  ['trackCostItem', 'Khoản mục chi phí', 'Bắt buộc chọn khoản mục chi phí; báo cáo chi phí theo khoản mục'],
  ['trackDepartment', 'Bộ phận', 'Bắt buộc chọn bộ phận (đơn vị) trên dòng hạch toán'],
  ['trackContract', 'Hợp đồng', 'Bắt buộc chọn hợp đồng; lãi lỗ theo hợp đồng'],
  ['trackCase', 'Vụ việc', 'Bắt buộc chọn vụ việc / công trình'],
  ['trackProject', 'Dự án', 'Bắt buộc chọn dự án'],
  ['trackCapitalSource', 'Nguồn vốn', 'Bắt buộc chọn nguồn vốn'],
  ['trackCashflow', 'Mục thu / chi', 'Phân loại theo chỉ tiêu lưu chuyển tiền tệ (để trống thì tự xếp)'],
  ['trackProduct', 'Mặt hàng', 'Phân loại theo mặt hàng'],
];

const fold = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Xuất Excel đúng mẫu danh sách hệ thống tài khoản: tiêu đề, dòng trống, tiêu đề cột nền xám, STT. */
async function xuatExcel(rows: Account[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DANH SÁCH HỆ THỐNG TÀI KHOẢN');
  ws.columns = [{ width: 6 }, { width: 21 }, { width: 40.5 }, { width: 16 }, { width: 40.5 }, { width: 27.5 }, { width: 19.4 }];
  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = 'DANH SÁCH HỆ THỐNG TÀI KHOẢN';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.mergeCells('A2:G2');
  const head = ws.getRow(3);
  head.values = ['STT', 'Số tài khoản', 'Tên tài khoản', 'Tính chất', 'Tên tiếng Anh', 'Diễn giải', 'Trạng thái'];
  const border = { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } };
  head.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD8D8D8' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border; });
  rows.forEach((a, i) => {
    const r = ws.addRow([i + 1, a.code, a.name, TINH_CHAT[a.normalSide] ?? a.normalSide, a.nameEn ?? '', a.description ?? '', a.isActive ? 'Đang sử dụng' : 'Ngừng sử dụng']);
    r.eachCell({ includeEmpty: true }, (c) => { c.border = border; c.alignment = { vertical: 'top', wrapText: true }; });
    r.getCell(2).numFmt = '@';
    if (!a.isPosting) r.font = { bold: true };
  });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'Danh_sach_he_thong_tai_khoan.xlsx'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function AccountsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [editing, setEditingState] = useState<Partial<Account> & { isNew?: boolean } | null>(null);
  // Mỗi lần mở form một lượt mới (Ghi và thêm mở form trống kế tiếp).
  const [lan, setLan] = useState(0);
  const setEditing = (x: Partial<Account> & { isNew?: boolean } | null) => { if (x) setLan((n) => n + 1); setEditingState(x); };
  const [sel, setSel] = useState<Account | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'inactive'>('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Truyền exportRef để lưới không hiện nút Xuất riêng — Xuất ở thanh nút xuất đúng mẫu danh sách hệ thống tài khoản.
  const exportRef = useRef<(() => void) | null>(null);
  const q = useQuery({ queryKey: ['accounts', 'all'], queryFn: () => api.get<Account[]>('/api/v1/accounts', { includeInactive: true }) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['accounts'] });
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/accounts/${code}`), onSuccess: () => { setSel(null); refresh(); } });
  const doiTrangThai = useMutation({ mutationFn: (a: Account) => api.patch(`/api/v1/accounts/${a.code}`, { isActive: !a.isActive }), onSuccess: (_d, a) => { setSel({ ...a, isActive: !a.isActive }); refresh(); } });
  const remove = () => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá tài khoản ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); };
  const ngung = () => {
    if (!sel) return;
    if (window.confirm(sel.isActive ? `Ngừng sử dụng tài khoản ${sel.code} - ${sel.name}? (không chọn được khi lập chứng từ mới, số liệu cũ giữ nguyên)` : `Dùng lại tài khoản ${sel.code} - ${sel.name}?`)) doiTrangThai.mutate(sel);
  };

  const all = useMemo(() => [...(q.data ?? [])].sort((a, b) => a.code.localeCompare(b.code)), [q.data]);
  const filtering = Boolean(search.trim() || status);
  const matched = useMemo(() => {
    const k = fold(search.trim());
    return all.filter((a) => (!k || fold(a.code).startsWith(k) || fold(a.name).includes(k)) && (!status || (status === 'active') === a.isActive));
  }, [all, search, status]);
  const children = useMemo(() => {
    const m = new Map<string, Account[]>();
    for (const a of all) if (a.parentCode) m.set(a.parentCode, [...(m.get(a.parentCode) ?? []), a]);
    return m;
  }, [all]);
  const coCon = useMemo(() => all.filter((a) => children.has(a.code)).map((a) => a.code), [all, children]);
  const moHet = open.size > 0 && open.size >= coCon.length;
  // Cây: tài khoản khớp kèm đường dẫn tài khoản cha; đang tìm / lọc thì mở sẵn các nhánh có kết quả.
  const tree = useMemo(() => {
    const byCode = new Map(all.map((a) => [a.code, a]));
    const keep = new Set<string>();
    const hit = new Set(matched.map((a) => a.code));
    for (const a of matched) { let c: string | null = a.code; while (c && !keep.has(c)) { keep.add(c); c = byCode.get(c)?.parentCode ?? null; } }
    const rows: Account[] = [];
    const walk = (list: Account[]) => { for (const a of list) { if (!keep.has(a.code)) continue; rows.push(a); if (filtering || open.has(a.code)) walk(children.get(a.code) ?? []); } };
    walk(all.filter((a) => !a.parentCode || !byCode.has(a.parentCode)));
    return { rows, path: new Set([...keep].filter((c) => !hit.has(c))) };
  }, [all, matched, children, open, filtering]);
  const toggle = (code: string) => setOpen((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  const columns: Column<Account>[] = [
    {
      key: 'code', header: 'Số tài khoản', type: 'code', width: 140, noSort: true, noFilter: true, title: 'Bấm ⊞ để mở tài khoản con, ⊟ để thu lại',
      render: (a) => {
        const kids = children.get(a.code)?.length ?? 0;
        const mo = filtering || open.has(a.code);
        return (
          <span className="acc-tree" style={{ paddingLeft: (a.level - 1) * 14 }}>
            {kids ? <button className="acc-caret" title={mo ? 'Thu gọn' : `Mở ${kids} tài khoản con`} disabled={filtering} onClick={(e) => { e.stopPropagation(); toggle(a.code); }}>{mo ? <MinusSquare size={13} /> : <PlusSquare size={13} />}</button> : <span className="acc-caret-gap" />}
            <span style={a.isPosting ? undefined : { fontWeight: 600 }}>{a.code}</span>
          </span>
        );
      },
    },
    { key: 'name', header: 'Tên tài khoản', width: 360, noSort: true, bold: (a) => !a.isPosting },
    { key: 'normalSide', header: 'Tính chất', width: 100, noSort: true, value: (a) => TINH_CHAT[a.normalSide] ?? a.normalSide, title: 'Dư Nợ / Dư Có: số dư thường ở bên đó. Lưỡng tính: số dư tách Nợ / Có theo từng đối tượng (131, 331…)' },
    { key: 'nameEn', header: 'Tên tiếng Anh', width: 300, noSort: true },
    { key: 'description', header: 'Diễn giải', width: 220, noSort: true },
    { key: 'isActive', header: 'Trạng thái', width: 120, noSort: true, value: (a) => (a.isActive ? 'Đang sử dụng' : 'Ngừng sử dụng') },
    // Bật thêm ở nút Cột.
    { key: 'parentCode', header: 'TK tổng hợp', type: 'code', width: 100, hidden: true },
    { key: 'level', header: 'Cấp', type: 'number', width: 50, hidden: true },
    ...THEO_DOI.map(([k, l, t]): Column<Account> => ({ key: k, header: l, type: 'check', width: 90, hidden: true, title: `Theo dõi chi tiết theo ${l.toLowerCase()}: ${t}`, value: (a) => (k === 'trackPartner' ? doiTuong(a) : a[k]) })),
  ];

  return (
    <>
      <PageHeader title="Hệ thống tài khoản" code="ACC1" subtitle="Theo Thông tư 99/2025; tài khoản tổng hợp (có tài khoản con) in đậm, chỉ tài khoản chi tiết được ghi sổ" helpKey="tai-khoan" />
      <div className="card">
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending || doiTrangThai.isPending}
          onAdd={() => setEditing({ isNew: true, normalSide: 'debit', parentCode: sel?.isActive ? sel.code : undefined })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={remove}
          onRefresh={() => q.refetch()}
          onExport={() => void xuatExcel(all)}
          extra={
            <>
              {canWrite && <button className="btn btn-sm" disabled={!sel} title="Thêm tài khoản mới chép thông tin của tài khoản đang chọn (để trống số tài khoản)" onClick={() => sel && setEditing({ ...sel, code: '', isNew: true, isActive: true })}><Copy size={14} /> Nhân bản</button>}
              {canWrite && <button className="btn btn-sm" disabled={!sel || doiTrangThai.isPending} title={sel?.isActive === false ? 'Dùng lại tài khoản đang ngừng' : 'Ngừng sử dụng: không chọn được khi lập chứng từ mới, số liệu cũ giữ nguyên'} onClick={ngung}>{sel?.isActive === false ? <><CheckCircle2 size={14} /> Dùng lại</> : <><Ban size={14} /> Ngừng sử dụng</>}</button>}
              {canWrite && <NutNhapExcel loai={nhapLoai('tai-khoan')!} />}
            </>
          }
        />
        <div className="acc-filters">
          <input className="input" style={{ width: 280 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo số hoặc tên tài khoản" />
          <select className="select input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} title="Trạng thái">
            <option value="">Mọi trạng thái</option><option value="active">Đang sử dụng</option><option value="inactive">Ngừng sử dụng</option>
          </select>
          {!filtering && <button className="btn btn-sm btn-ghost" onClick={() => setOpen(moHet ? new Set() : new Set(coCon))} title={moHet ? 'Thu gọn về tài khoản cấp 1' : 'Mở toàn bộ cây tài khoản'}>{moHet ? 'Thu gọn' : 'Mở rộng'}</button>}
          <span className="muted">{filtering ? `${matched.length} / ${all.length} tài khoản khớp` : `Tổng số: ${all.length}`}</span>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : doiTrangThai.error ? errorText(doiTrangThai.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey="acc1-v4"
            exportRef={exportRef}
            rows={tree.rows}
            rowKey={(a) => a.code}
            onSelect={setSel}
            onRowDoubleClick={(a) => canWrite && setEditing(a)}
            rowClassName={(a) => [a.isActive ? '' : 'muted', tree.path.has(a.code) ? 'acc-path' : ''].join(' ')}
            footerLabel={false}
            emptyText={all.length === 0 ? 'Chưa có dữ liệu tài khoản kế toán' : 'Không tìm thấy tài khoản phù hợp'}
            columns={columns}
          />
        )}
      </div>
      {editing && <AccountForm key={lan} value={editing} codes={all.map((a) => a.code)} onClose={() => setEditing(null)} onAddNext={(p) => setEditing({ isNew: true, normalSide: 'debit', parentCode: p })} />}
    </>
  );
}

function AccountForm({ value, codes, onClose, onAddNext }: { value: Partial<Account> & { isNew?: boolean }; codes: string[]; onClose: () => void; onAddNext: (parentCode?: string) => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ ...value, trackPartner: doiTuong(value) });
  const set = (p: Partial<Account>) => setV((x) => ({ ...x, ...p }));
  const viewAgain = useViewAgain();
  const isNew = Boolean(value.isNew);
  // Lỗi tại ô (viền đỏ): trùng số, số tài khoản con không bắt đầu bằng số tài khoản tổng hợp.
  const loiSo = !isNew || !v.code ? null
    : codes.includes(v.code) ? `Số tài khoản ${v.code} đã có`
      : !/^[0-9A-Za-z]{3,20}$/.test(v.code) ? 'Số tài khoản 3–20 ký tự chữ, số, không có khoảng trắng'
        : v.parentCode && !v.code.startsWith(v.parentCode) ? `Tài khoản con của ${v.parentCode} phải bắt đầu bằng ${v.parentCode}` : null;
  const why = useCatalogWhy('/api/v1/accounts/validate', isNew
    ? { mode: 'create', code: v.code ?? '', parentCode: v.parentCode || undefined, normalSide: v.normalSide ?? 'debit', trackPartner: Boolean(v.trackPartner), isDebt: Boolean(v.trackPartner) }
    : { mode: 'update', code: value.code ?? '', normalSide: v.normalSide, trackPartner: Boolean(v.trackPartner), isDebt: Boolean(v.trackPartner), isActive: v.isActive !== false }, Boolean(v.code && v.code.length >= 3));
  const ack = useWarnAck(why.findings);
  const themTiep = useRef(false);
  const save = useMutation({
    mutationFn: (warnAck?: CatalogWarnAck) => {
      const body: Record<string, unknown> = { name: v.name?.trim(), nameEn: v.nameEn?.trim() ?? '', description: v.description?.trim() ?? '', normalSide: v.normalSide, warnAck };
      for (const [k] of THEO_DOI) body[k] = Boolean(v[k]);
      body.isDebt = Boolean(v.trackPartner);
      return isNew ? api.post('/api/v1/accounts', { ...body, code: v.code, parentCode: v.parentCode || undefined }) : api.patch(`/api/v1/accounts/${value.code}`, body);
    },
    onSuccess: () => {
      flashSaved(savedNote(why.findings));
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      if (themTiep.current) onAddNext(v.parentCode || undefined); else if (isNew) onClose(); else viewAgain[1]();
    },
  });
  const ghi = (tiep: boolean) => { if (loiSo) return; themTiep.current = tiep; ack.request((a) => save.mutate(a)); };
  return (
    <Modal viewAgain={viewAgain} viewFirst={!isNew}
      title={isNew ? 'Thêm tài khoản' : `Sửa tài khoản ${value.code}`}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Huỷ</button>
        {isNew && <button className="btn" disabled={save.isPending || why.blocked} title="Ghi rồi mở form trống để thêm tài khoản tiếp (cùng tài khoản tổng hợp)" onClick={() => ghi(true)}>Ghi và thêm</button>}
        <button className="btn btn-primary" disabled={save.isPending || why.blocked} title="Ctrl + S" onClick={() => ghi(false)}>{ack.label}</button>
      </>}
    >
      <div className="tk-form">
        <Field label="Số tài khoản (*)" error={loiSo}><input className="input mono" value={v.code ?? ''} disabled={!isNew} autoFocus={isNew} onChange={(e) => set({ code: e.target.value.trim() })} /></Field>
        <Field label="Tên tài khoản (*)"><input className="input" value={v.name ?? ''} autoFocus={!isNew} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Tài khoản tổng hợp" tip="Tài khoản cấp trên; số tài khoản con bắt đầu bằng số tài khoản tổng hợp. Trống = tài khoản cấp 1">
          {isNew ? <AccountPicker value={v.parentCode ?? ''} onChange={(parentCode) => set({ parentCode })} placeholder="Trống = cấp 1" /> : <input className="input mono" value={v.parentCode ?? ''} disabled />}
        </Field>
        <Field label="Tính chất (*)" tip="Dư Nợ / Dư Có: số dư thường ở bên đó. Lưỡng tính: số dư tách Nợ / Có theo từng đối tượng (131, 331…)">
          <select className="select input" value={v.normalSide ?? 'debit'} onChange={(e) => set({ normalSide: e.target.value })}>
            <option value="debit">Dư Nợ</option><option value="credit">Dư Có</option><option value="both">Lưỡng tính</option>
          </select>
        </Field>
        <Field label="Diễn giải" full><textarea className="input" rows={2} value={v.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="Ghi chú cách dùng tài khoản (không ảnh hưởng ghi sổ)" /></Field>
      </div>
      <fieldset className="fgroup">
        <legend title="Tích = khi hạch toán vào tài khoản này bắt buộc nhập thông tin đó trên dòng chứng từ">Theo dõi chi tiết theo</legend>
        <div className="tk-theo-doi">
          {THEO_DOI.map(([k, l, t]) => <label key={k} className="checkbox" title={t}><input type="checkbox" checked={Boolean(v[k])} onChange={(e) => set({ [k]: e.target.checked } as Partial<Account>)} /> {l}</label>)}
        </div>
      </fieldset>
      <fieldset className="fgroup">
        <legend>Tên tài khoản theo ngôn ngữ</legend>
        <Field label="Tên tiếng Anh" full><input className="input" value={v.nameEn ?? ''} onChange={(e) => set({ nameEn: e.target.value })} /></Field>
      </fieldset>
      <WhyPanel findings={why.findings} onFix={(p) => set(p as Partial<Account>)} />
      <WarnAckBox ack={ack} />
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}
