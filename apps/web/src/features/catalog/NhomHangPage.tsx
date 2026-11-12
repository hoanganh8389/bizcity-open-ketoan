// [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — màn Nhóm hàng (DM11) làm lại gọn: cây trái, form trên, lưới nhóm con dưới; bỏ các thẻ ngành / nhãn / loại (đóng góp)
// [2026-11-12 Nguyễn Văn Thủy] DM11 thiết kế lại cho dễ hiểu: bên phải là thẻ của nhóm đang chọn (đường dẫn, mã, tên, ai tạo / sửa)
//   với nút ngay tại chỗ (Sửa, + Thêm nhóm con); thêm / sửa mở hộp thoại, mã điền sẵn gợi ý; lưới có lọc theo cấp; không xoá (0116) (đóng góp)
/**
 * NHÓM HÀNG (DM11) — một cây: cấp 1 → cấp 2 → cấp 3 (→ cấp 4, 5 chia nhỏ, không ghép mã hàng).
 *   Trái: cây. Phải: thẻ nhóm đang chọn + thẻ Nhóm con (lọc theo cấp) | Lịch sử.
 *   Mã nhóm hàng ghép vào mã hàng: cấp 1 = 2 chữ số (không bắt đầu bằng 0), cấp 2 = 3 ký tự, cấp 3 = 1 ký tự.
 *   Không có xoá: bỏ tích Đang dùng để ngừng. Mã nội bộ của nhóm tự cấp, không hiện.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Pencil, Plus, RefreshCw } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import { CayNhomHang, indexNhom, MA_NGAN_DAI, useNhomHang, type NhomHang, type NhomIndex } from '@/components/CayNhomHang';
import './lich-su.css';
import './nhom-hang.css';

const QUY_TAC: Record<number, string> = { 1: '2 chữ số, không bắt đầu bằng 0', 2: '3 ký tự (chữ hoặc số)', 3: '1 ký tự (chữ hoặc số)' };
const luc = (d?: string | null) => (d ? new Date(d).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/** Mã gợi ý cho nhóm mới dưới parent: số kế tiếp trong các nhóm cùng cha, đủ độ dài của cấp (cấp 1 từ 10). */
function goiYMa(ix: NhomIndex, parent: string | null): string {
  const lv = ix.level(parent) + 1;
  const n = MA_NGAN_DAI[lv];
  if (!n) return '';
  const used = (parent ? ix.kids.get(parent) ?? [] : ix.roots).map((c) => c.skuCode ?? '');
  const nums = used.filter((x) => x.length === n && /^\d+$/.test(x)).map(Number);
  for (let v = Math.max(lv === 1 ? 9 : 0, ...nums) + 1; String(v).length <= n; v++) { const s = String(v).padStart(n, '0'); if (!used.includes(s)) return s; }
  for (let v = lv === 1 ? 10 : 0; String(v).length <= n; v++) { const s = String(v).padStart(n, '0'); if (!used.includes(s)) return s; }
  return '';
}

export function NhomHangPage() {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const q = useNhomHang();
  const ix = useMemo(() => indexNhom(q.data), [q.data]);
  const [sel, setSel] = useState<string | null>(null);
  const node = sel ? ix.byCode.get(sel) ?? null : null;
  const [xem, setXem] = useState<'con' | number | 'all'>('con');
  const [tab, setTab] = useState<'con' | 'lich-su'>('con');
  const [form, setForm] = useState<null | { mode: 'add'; parent: string | null } | { mode: 'edit'; code: string }>(null);
  const exportRef = useRef<(() => void) | null>(null);

  const rows = xem === 'all' ? q.data ?? [] : typeof xem === 'number' ? (q.data ?? []).filter((c) => ix.level(c.code) === xem) : sel ? ix.kids.get(sel) ?? [] : ix.roots;
  const lv = node ? ix.level(node.code) : 0;
  const thieuMa = (c: NhomHang) => Boolean(MA_NGAN_DAI[ix.level(c.code)]) && !c.skuCode;

  const cols: Column<NhomHang>[] = [
    { key: 'skuCode', header: 'Mã nhóm', type: 'code', width: 90, title: 'Ghép vào mã hàng — cấp 1: 2 chữ số, cấp 2: 3 ký tự, cấp 3: 1 ký tự', render: (c) => (thieuMa(c) ? <span className="neg" title="Nhóm chưa có mã — bấm Sửa để nhập">chưa có</span> : c.skuCode) },
    { key: 'name', header: 'Tên nhóm hàng', width: 260 },
    { key: 'level', header: 'Cấp', type: 'number', width: 55, value: (c) => ix.level(c.code) },
    { key: 'path', header: 'Đường dẫn', width: 320, value: (c) => ix.path(c.code) },
    { key: 'products', header: 'Số mặt hàng', type: 'number', width: 95, sum: true, title: 'Số mặt hàng gắn đúng nhóm này (không cộng nhóm con)' },
    { key: 'isActive', header: 'Đang dùng', type: 'check', width: 75 },
    { key: 'createdBy', header: 'Người tạo', width: 130 },
    { key: 'createdAt', header: 'Lúc tạo', width: 130, value: (c) => luc(c.createdAt) },
    { key: 'updatedBy', header: 'Người sửa', width: 130 },
    { key: 'updatedAt', header: 'Lúc sửa', width: 130, value: (c) => (c.updatedBy ? luc(c.updatedAt) : '') },
  ];

  return (
    <>
      <PageHeader title="Nhóm hàng" code="DM11" helpKey="nhom-hang" subtitle="Cây nhóm hàng — mã hàng ghép từ mã nhóm cấp 1, 2, 3" />
      <div className="card">
        <div className="nh-bar">
          {canWrite && <button className="btn btn-sm btn-primary" onClick={() => setForm({ mode: 'add', parent: null })}><Plus size={14} /> Thêm nhóm cấp 1</button>}
          <button className="btn btn-sm" onClick={() => void q.refetch()}><RefreshCw size={14} /> Nạp</button>
          <button className="btn btn-sm" onClick={() => exportRef.current?.()}><FileDown size={14} /> Xuất</button>
          {canWrite && <NutNhapExcel loai={nhapLoai('nhom-hang')!} />}
          <span className="muted nh-rule">Mã nhóm: cấp 1 · {QUY_TAC[1]} — cấp 2 · {QUY_TAC[2]} — cấp 3 · {QUY_TAC[3]}</span>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <div className="nh-wrap">
            <div>
              <CayNhomHang list={q.data} selected={sel} onSelect={(c) => { setSel(c); setXem('con'); }} height="calc(100vh - 230px)" />
            </div>
            <div style={{ minWidth: 0 }}>
              {node ? (
                <div className="nh-card">
                  <div className="nh-path">{ix.path(ix.parentOf(node.code)) || 'Nhóm hàng'} ›</div>
                  <div className="nh-title">
                    <span className="nh-code mono">{node.skuCode || (MA_NGAN_DAI[lv] ? <span className="neg">chưa có mã</span> : '—')}</span>
                    <b>{node.name}</b>
                    <span className="badge">Cấp {lv}</span>
                    {!node.isActive && <span className="badge badge-warn">Ngừng dùng</span>}
                    <span style={{ flex: 1 }} />
                    {canWrite && <button className="btn btn-sm" onClick={() => setForm({ mode: 'edit', code: node.code })}><Pencil size={14} /> Sửa</button>}
                    {canWrite && <button className="btn btn-sm btn-primary" onClick={() => setForm({ mode: 'add', parent: node.code })}><Plus size={14} /> Thêm nhóm con</button>}
                  </div>
                  <div className="nh-meta muted">
                    {node.products} mặt hàng · {(ix.kids.get(node.code) ?? []).length} nhóm con
                    {' · '}Tạo: {node.createdBy || '—'}{node.createdAt ? ` (${luc(node.createdAt)})` : ''}
                    {' · '}Sửa: {node.updatedBy || '—'}{node.updatedBy && node.updatedAt ? ` (${luc(node.updatedAt)})` : ''}
                  </div>
                </div>
              ) : (
                <div className="nh-card muted">Chọn một nhóm trên cây để xem, sửa hoặc thêm nhóm con. Thêm ngành mới: bấm <b>Thêm nhóm cấp 1</b>.</div>
              )}
              <div className="nh-tabs">
                <div className="tabs" role="tablist">
                  <button role="tab" className={`tab ${tab === 'con' ? 'active' : ''}`} onClick={() => setTab('con')}>Danh sách nhóm ({rows.length})</button>
                  <button role="tab" className={`tab ${tab === 'lich-su' ? 'active' : ''}`} disabled={!node} title={node ? '' : 'Chọn một nhóm trên cây'} onClick={() => setTab('lich-su')}>Lịch sử</button>
                </div>
                {tab === 'con' && (
                  <select className="select input" style={{ width: 230, height: 28, fontSize: 12.5 }} value={String(xem)} onChange={(e) => setXem(e.target.value === 'con' ? 'con' : e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                    <option value="con">{node ? `Nhóm con của "${node.name}"` : 'Nhóm cấp 1'}</option>
                    {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>Toàn bộ nhóm cấp {l}</option>)}
                    <option value="all">Tất cả nhóm</option>
                  </select>
                )}
              </div>
              {tab === 'lich-su' && node
                ? <LichSuNhom code={node.code} />
                : <DataGrid storageKey="dm11-v5" exportName="nhom-hang" exportRef={exportRef} rows={rows} rowKey={(c) => c.code} columns={cols} footerLabel="Tổng"
                    onRowDoubleClick={(c) => { setSel(c.code); setXem('con'); }} rowClassName={(c) => (c.isActive ? '' : 'muted')}
                    emptyText={node ? 'Chưa có nhóm con — bấm Thêm nhóm con' : 'Chưa có nhóm hàng'} />}
            </div>
          </div>
        )}
      </div>
      {form && <NhomForm ix={ix} list={q.data ?? []} form={form} onClose={() => setForm(null)} onSaved={(c) => { setSel(c); setXem('con'); setForm(null); }} />}
    </>
  );
}

/** Hộp thoại thêm / sửa nhóm: thuộc nhóm, mã (điền sẵn gợi ý), tên, đang dùng. */
function NhomForm({ ix, list, form, onClose, onSaved }: { ix: NhomIndex; list: NhomHang[]; form: { mode: 'add'; parent: string | null } | { mode: 'edit'; code: string }; onClose: () => void; onSaved: (code: string) => void }) {
  const qc = useQueryClient();
  const old = form.mode === 'edit' ? ix.byCode.get(form.code)! : null;
  const [parent, setParent] = useState<string | null>(form.mode === 'add' ? form.parent : ix.parentOf(form.code));
  const [ma, setMa] = useState(form.mode === 'add' ? goiYMa(ix, form.parent) : old?.skuCode ?? '');
  const [ten, setTen] = useState(old?.name ?? '');
  const [dung, setDung] = useState(old?.isActive ?? true);
  const [moving, setMoving] = useState(false);
  const [err, setErr] = useState('');
  const lv = ix.level(parent) + 1;
  const len = MA_NGAN_DAI[lv];

  const loiMa = (() => {
    if (!len) return '';
    if (!ma) return `Nhập mã nhóm cấp ${lv}: ${QUY_TAC[lv]}`;
    if (lv === 1 ? !/^[1-9][0-9]$/.test(ma) : !/^[A-Z0-9]+$/.test(ma) || ma.length !== len) return `Mã nhóm cấp ${lv} phải là ${QUY_TAC[lv]} (đang "${ma}")`;
    const sib = (parent ? ix.kids.get(parent) ?? [] : ix.roots).find((c) => c.code !== old?.code && c.skuCode === ma);
    return sib ? `Mã ${ma} đã dùng cho nhóm "${sib.name}" cùng cấp` : '';
  })();

  const save = useMutation({
    mutationFn: async () => {
      const nums = list.map((c) => Number(c.code)).filter((n) => Number.isInteger(n));
      const code = old ? old.code : String((nums.length ? Math.max(...nums) : 0) + 1);
      await api.put(`/api/v1/item-classes/group/${encodeURIComponent(code)}${old ? '' : '?new=1'}`, { name: ten.trim(), parentCode: parent || undefined, isActive: dung, skuCode: len ? ma : '' });
      return code;
    },
    onSuccess: (code) => { void qc.invalidateQueries({ queryKey: ['item-classes'] }); void qc.invalidateQueries({ queryKey: ['item-class-history'] }); onSaved(code); },
    onError: (e) => setErr(errorText(e)),
  });
  const ghi = () => { const e = loiMa || (!ten.trim() ? 'Nhập tên nhóm hàng' : ''); setErr(e); if (!e) save.mutate(); };

  return (
    <>
      <Modal title={old ? `Sửa nhóm "${old.name}"` : parent ? `Thêm nhóm con của "${ix.byCode.get(parent)?.name}"` : 'Thêm nhóm cấp 1'} helpKey="nhom-hang" onClose={onClose}
        footer={<>{err && <span className="neg" style={{ marginRight: 'auto', fontWeight: 600, fontSize: 13 }}>{err}</span>}<button className="btn btn-primary" disabled={save.isPending} onClick={ghi}>{save.isPending ? 'Đang ghi…' : 'Ghi'}</button><button className="btn" onClick={onClose}>Huỷ bỏ</button></>}>
        <Field label="Thuộc nhóm" full>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input className="input" readOnly value={parent ? ix.path(parent) : 'Nhóm hàng (gốc)'} style={{ flex: 1 }} />
            <span className="badge">Cấp {lv}</span>
            {old && <button type="button" className="btn btn-sm" title="Chuyển sang nhóm khác" onClick={() => setMoving(true)}>Đổi…</button>}
          </div>
        </Field>
        <Field label={len ? 'Mã nhóm hàng (*)' : 'Mã nhóm hàng'}>
          <input className="input mono" value={ma} disabled={!len} maxLength={len || 1} autoFocus={!old} placeholder={len ? QUY_TAC[lv] : ''}
            onChange={(e) => { setMa(e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase()); setErr(''); }} />
          {loiMa
            ? <div className="neg" style={{ fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>{loiMa}</div>
            : <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{len ? `Cấp ${lv}: ${QUY_TAC[lv]}${form.mode === 'add' ? ' — đã điền sẵn mã kế tiếp, sửa được' : ''}` : 'Cấp 4 trở đi không ghép vào mã hàng'}</div>}
        </Field>
        <Field label="Tên nhóm hàng (*)"><input className="input" value={ten} autoFocus={Boolean(old)} onChange={(e) => { setTen(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') ghi(); }} /></Field>
        <Field label=" "><label className="checkbox"><input type="checkbox" checked={dung} onChange={(e) => setDung(e.target.checked)} /> Đang dùng</label></Field>
      </Modal>
      {moving && old && (
        <ChuyenNhom list={list} self={old.code} current={parent} onClose={() => setMoving(false)}
          onPick={(p) => { if (ix.level(p) !== ix.level(parent)) setMa(goiYMa(ix, p)); setParent(p); setMoving(false); }} />
      )}
    </>
  );
}

/** Lịch sử thêm / sửa một nhóm: ai, lúc nào, đổi gì. */
function LichSuNhom({ code }: { code: string }) {
  const h = useQuery({ queryKey: ['item-class-history', code], queryFn: () => api.get<{ at: string; by: string; action: string; changes: string }[]>(`/api/v1/item-classes/group/${encodeURIComponent(code)}/history`) });
  if (h.isLoading) return <Loading />;
  if (h.error) return <ErrorBox error={errorText(h.error)} />;
  if (!h.data?.length) return <div className="muted" style={{ padding: 8 }}>Chưa có thay đổi nào được ghi (lịch sử ghi từ 12/11/2026).</div>;
  return (
    <div className="ls-wrap">
      {h.data.map((e, i) => (
        <div key={i} className="ls-row">
          <div className="ls-meta"><span className="ls-time">{luc(e.at)}</span><span className="ls-by">{e.by}</span></div>
          <div className="ls-body"><div className="ls-head">{e.action === 'create' ? 'Thêm mới' : 'Sửa'}</div><ul>{e.changes.split('\n').map((x, j) => <li key={j}>{x}</li>)}</ul></div>
        </div>
      ))}
    </div>
  );
}

/** Chọn nhóm cha mới (không chọn được chính nó và nhánh con của nó). */
function ChuyenNhom({ list, self, current, onClose, onPick }: { list: NhomHang[]; self: string; current: string | null; onClose: () => void; onPick: (code: string | null) => void }) {
  const ix = useMemo(() => indexNhom(list), [list]);
  const banned = useMemo(() => ix.subtree(self), [ix, self]);
  const [pick, setPick] = useState<string | null>(current);
  return (
    <Modal title="Chuyển sang nhóm" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={pick !== null && banned.has(pick)} onClick={() => onPick(pick)}>Chọn</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full">
        <CayNhomHang list={list.filter((c) => !banned.has(c.code))} selected={pick} onSelect={setPick} height={420} />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Chọn "Nhóm hàng" (gốc) để thành nhóm cấp 1. Đổi cấp thì mã nhóm điền lại theo cấp mới; mã hàng đã có không đổi.</div>
      </div>
    </Modal>
  );
}
