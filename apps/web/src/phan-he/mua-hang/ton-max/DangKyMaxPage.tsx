/**
 * PHIẾU ĐĂNG KÝ TỒN MAX (MH17) — 2 lần / tháng shop đăng ký lại max; chi nhánh cha đăng ký max cho hàng mới.
 *   Mã có sẵn: chọn shop → phần mềm điền sẵn mọi mã của shop (tồn, bán / ngày, max hiện tại, max gợi ý) → sửa max đề nghị → gửi duyệt.
 *     Duyệt = ghi max (Tồn max MH16). Lệch nhỏ (≤ % cài ở Công thức) thì duyệt tự động. POS gửi phiếu qua API cùng khuôn.
 *   Hàng mới (NCC gửi mẫu, mã chưa có): bảng mặt hàng × shop, mỗi shop điền max; duyệt khi chưa có mã thì chờ — có mã (tạo ở
 *     Danh mục mặt hàng khi hàng về) thì gắn mã vào dòng, max ghi ngay cho từng shop.
 * Danh sách lọc theo ngày lập, không phân trang.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, FileUp, Plus } from 'lucide-react';
import { MAX_REQUEST_STATUS, type MaxRequestItem, type MaxRequestKind, type MaxRequestStatus } from '@ketoan/contracts/mua-hang';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import { errorText } from '@/lib/api';
import { monthStart, today } from '../du-lieu';
import { ChonMatHang } from '../thanh-phan/ChonMatHang';
import { NhapExcelChung } from '../thanh-phan/NhapExcelChung';
import { fold, num, qtyFmt, stockApi, useHierarchy, type BranchNode, type MaxRequest } from './api';
import { ChonChiNhanhCha, ChuaPhanCap, KhoiSo } from './chung';

const TONE: Record<MaxRequestStatus, string> = { draft: 'info', submitted: 'warn', approved: 'ok', cancelled: 'bad' };

export function DangKyMaxPage() {
  const h = useHierarchy();
  const [parent, setParent] = useState('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<{ id?: string; kind: MaxRequestKind; branchCode?: string } | null>(null);
  const q = useQuery({ queryKey: ['ton-max', 'max-requests', parent, from, to], enabled: Boolean(parent), queryFn: () => stockApi.maxRequests({ from, to, branchCode: parent }) });
  const all = q.data ?? [];
  const rows = all.filter((r) => !status || r.status === status || (status === 'unlinked' && r.unlinked > 0));
  const cols: Column<MaxRequest>[] = [
    { key: 'code', header: 'Số phiếu', type: 'code', width: 120 },
    { key: 'createdAt', header: 'Ngày lập', width: 130, value: (r) => r.createdAt, render: (r) => new Date(r.createdAt).toLocaleString('vi-VN') },
    { key: 'kind', header: 'Loại', width: 110, value: (r) => (r.kind === 'new_item' ? 'Hàng mới' : 'Mã có sẵn'), render: (r) => <span className={`tm-chip ${r.kind === 'new_item' ? 'warn' : 'info'}`}>{r.kind === 'new_item' ? 'Hàng mới' : 'Mã có sẵn'}</span> },
    { key: 'branch', header: 'Chi nhánh / shop', width: 200, value: (r) => `${r.branchCode} ${r.branchName}`, render: (r) => <><b className="mono">{r.branchCode}</b> {r.branchName}</> },
    { key: 'title', header: 'Tiêu đề', width: 220 },
    { key: 'itemCount', header: 'Số mã', type: 'number', width: 70, sum: true },
    { key: 'unlinked', header: 'Chưa có mã', type: 'number', width: 80, render: (r) => (r.unlinked ? <span className="tm-low">{r.unlinked}</span> : '') },
    { key: 'status', header: 'Trạng thái', width: 110, value: (r) => MAX_REQUEST_STATUS[r.status], render: (r) => <span className={`tm-chip ${TONE[r.status]}`}>{MAX_REQUEST_STATUS[r.status]}</span> },
    { key: 'source', header: 'Nguồn', width: 70, value: (r) => r.source.toUpperCase() },
    { key: 'createdBy', header: 'Người lập', width: 120 },
    { key: 'approvedBy', header: 'Người duyệt', width: 140 },
  ];
  return (
    <>
      <PageHeader title="Phiếu đăng ký tồn max" code="MH17" helpKey="mua-hang-dang-ky-max" subtitle="Shop đăng ký lại max (2 lần / tháng, gợi ý từ tốc độ bán); chi nhánh đăng ký max cho hàng mới chưa có mã. Duyệt = ghi tồn max" />
      <div className="card">
        <ChuaPhanCap branches={h.data?.branches} />
        <div className="tm-bar">
          <ChonChiNhanhCha value={parent} onChange={setParent} />
          <label className="tm-parent"><span>Từ</span><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="tm-parent"><span>Đến</span><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <span className="grow" />
          <button className="btn btn-sm" disabled={!parent} onClick={() => setOpen({ kind: 'new_item', branchCode: parent })}><Plus size={14} /> Phiếu hàng mới</button>
          <button className="btn btn-primary" disabled={!parent} onClick={() => setOpen({ kind: 'existing' })}><Plus size={14} /> Phiếu shop đăng ký max</button>
        </div>
        <div className="tm-stats">
          <KhoiSo label="Tất cả" value={all.length} active={!status} onClick={() => setStatus('')} />
          <KhoiSo label="Chờ duyệt" value={all.filter((r) => r.status === 'submitted').length} tone="orange" active={status === 'submitted'} onClick={() => setStatus('submitted')} />
          <KhoiSo label="Nháp" value={all.filter((r) => r.status === 'draft').length} tone="grey" active={status === 'draft'} onClick={() => setStatus('draft')} />
          <KhoiSo label="Đã duyệt" value={all.filter((r) => r.status === 'approved').length} tone="green" active={status === 'approved'} onClick={() => setStatus('approved')} />
          <KhoiSo label="Hàng mới chờ gắn mã" value={all.filter((r) => r.unlinked > 0).length} tone="red" active={status === 'unlinked'} onClick={() => setStatus('unlinked')} />
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : <DataGrid rows={rows} columns={cols} rowKey={(r) => r.id} storageKey="dang-ky-max" onRowClick={(r) => setOpen({ id: r.id, kind: r.kind })} exportName={`phieu-dang-ky-max-${parent}`} emptyText="Chưa có phiếu nào trong khoảng ngày này." />}
      </div>
      {open && parent && <PhieuDangKy key={open.id ?? open.kind} parent={parent} init={open} branches={h.data?.branches ?? []} onClose={() => setOpen(null)} />}
    </>
  );
}

function PhieuDangKy({ parent, init, branches, onClose }: { parent: string; init: { id?: string; kind: MaxRequestKind; branchCode?: string }; branches: BranchNode[]; onClose: () => void }) {
  const qc = useQueryClient();
  const shops = branches.filter((b) => b.level === 'shop' && b.parentCode === parent);
  const cur = useQuery({ queryKey: ['ton-max', 'max-request', init.id], enabled: Boolean(init.id), queryFn: () => stockApi.maxRequest(init.id!) });
  const [branch, setBranch] = useState(init.branchCode ?? '');
  const [items, setItems] = useState<MaxRequestItem[] | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [search, setSearch] = useState('');
  const [add, setAdd] = useState(false);
  const [imp, setImp] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const req = cur.data;
  const kind = req?.kind ?? init.kind;
  const br = req?.branchCode ?? branch;
  const list = items ?? req?.items ?? [];
  const locked = req?.status === 'cancelled' || (req?.status === 'approved' && kind === 'existing');
  // Phiếu mới của shop: điền sẵn mọi mã của shop theo gợi ý.
  const sug = useQuery({ queryKey: ['ton-max', 'max-suggest', branch], enabled: !init.id && kind === 'existing' && Boolean(branch), queryFn: () => stockApi.maxSuggest(branch) });
  const rows = items ?? (init.id ? req?.items ?? [] : kind === 'existing' ? (sug.data ?? []) : []);
  const tonOf = useMemo(() => new Map((sug.data ?? []).map((s) => [s.sku, s.ton])), [sug.data]);
  const set = (key: string, p: Partial<MaxRequestItem>) => setItems(rows.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const shown = rows.filter((r) => (!onlyChanged || (r.proposedMax ?? 0) !== (r.currentMax ?? 0)) && (!search || fold(`${r.sku} ${r.name} ${r.nccSku ?? ''}`).includes(fold(search))));

  const save = async (opt: { submit?: boolean; approve?: boolean }) => {
    setBusy(true); setErr('');
    try {
      const body = { kind, branchCode: br, title: title ?? req?.title ?? '', note: note ?? req?.note ?? '', items: rows.filter((r) => kind === 'new_item' || (r.proposedMax ?? 0) !== (r.currentMax ?? -1) || init.id), submit: opt.submit || opt.approve };
      if (!body.items.length) throw new Error('Không có dòng nào đổi max so với hiện tại');
      let saved = await stockApi.saveMaxRequest(body, req?.id);
      if (opt.approve && saved.status !== 'approved') saved = await stockApi.approveMaxRequest(saved.id);
      await qc.invalidateQueries({ queryKey: ['ton-max'] });
      onClose();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const approve = async () => { setBusy(true); try { await stockApi.approveMaxRequest(req!.id); await qc.invalidateQueries({ queryKey: ['ton-max'] }); onClose(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); } };
  const cancel = async () => { if (!window.confirm('Huỷ phiếu này?')) return; try { await stockApi.cancelMaxRequest(req!.id); await qc.invalidateQueries({ queryKey: ['ton-max'] }); onClose(); } catch (e) { setErr(errorText(e)); } };
  const template = async () => {
    const XLSX = await import('xlsx');
    const head = ['Tên hàng', 'Mã bên NCC', 'Mã hàng', 'ĐVT', 'Quy cách', 'Ghi chú', ...shops.map((s) => s.code)];
    const body = rows.length ? rows.map((r) => [r.name, r.nccSku ?? '', r.sku, r.unit ?? '', r.pack ?? '', r.note ?? '', ...shops.map((s) => r.maxByShop?.[s.code] ?? '')]) : [['Sữa bột mới 800g', 'NCC-001', '', 'Lon', 6, '', ...shops.map(() => '')]];
    const ws = XLSX.utils.aoa_to_sheet([head, shops.length ? ['', '', '', '', '', 'Tên shop →', ...shops.map((s) => s.name)] : [], ...body]);
    ws['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 9 }, { wch: 18 }, ...shops.map(() => ({ wch: 9 }))];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Dang ky max'); XLSX.writeFile(wb, `dang-ky-max-hang-moi-${parent}.xlsx`);
  };
  const exportExisting = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([['Mã hàng', 'Tên hàng', 'Tồn', 'Bán / ngày', 'Max hiện tại', 'Max gợi ý', 'Max đề nghị', 'Ghi chú'], ...rows.map((r) => [r.sku, r.name, tonOf.get(r.sku) ?? '', r.avgPerDay ?? '', r.currentMax ?? 0, r.suggestedMax ?? 0, r.proposedMax ?? 0, r.note ?? ''])]);
    ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 8 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 11 }, { wch: 24 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Dang ky max'); XLSX.writeFile(wb, `dang-ky-max-${br}.xlsx`);
  };

  return (
    <Modal wide title={req ? `${req.code} · ${kind === 'new_item' ? 'Đăng ký max hàng mới' : 'Shop đăng ký tồn max'} — ${MAX_REQUEST_STATUS[req.status]}` : kind === 'new_item' ? 'Phiếu đăng ký max hàng mới (mặt hàng × shop)' : 'Phiếu shop đăng ký tồn max'} onClose={onClose}
      footer={<>
        {req && req.status !== 'cancelled' && !(req.status === 'approved' && kind === 'existing') && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => void cancel()}>Huỷ phiếu</button>}
        <button className="btn" onClick={() => void (kind === 'new_item' ? template() : exportExisting())}><FileDown size={14} /> Xuất Excel</button>
        {!locked && <>
          {(!req || req.status === 'draft') && <button className="btn" disabled={busy} onClick={() => void save({})}>Lưu nháp</button>}
          {(!req || req.status === 'draft') && <button className="btn" disabled={busy} onClick={() => void save({ submit: true })}>Gửi duyệt</button>}
          {req?.status === 'approved' && kind === 'new_item' && <button className="btn btn-primary" disabled={busy} onClick={() => void save({})}>Lưu (gắn mã → ghi max)</button>}
          {req?.status === 'submitted' && <button className="btn" disabled={busy} onClick={() => void save({ submit: true })}>Lưu sửa</button>}
          {req?.status === 'submitted' ? <button className="btn btn-primary" disabled={busy} onClick={() => void approve()}>Duyệt (ghi max)</button>
            : req?.status !== 'approved' && <button className="btn btn-primary" disabled={busy} onClick={() => void save({ approve: true })}>Lưu & duyệt</button>}
        </>}
        <button className="btn" onClick={onClose}>Đóng</button>
      </>}>
      {init.id && cur.isLoading ? <Loading /> : <>
        <div className="full row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {kind === 'existing' ? (
            <label className="tm-parent"><span>Shop</span><select className="select input" disabled={Boolean(req)} value={br} onChange={(e) => { setBranch(e.target.value); setItems(null); }}>
              <option value="">— chọn shop —</option><option value={parent}>★ Kho chi nhánh cha {parent}</option>
              {shops.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</select></label>
          ) : <span className="tm-chip warn">Chi nhánh cha {parent} · {shops.length} shop</span>}
          <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Tiêu đề (vd Đăng ký max kỳ 2 tháng 10)" value={title ?? req?.title ?? ''} disabled={locked} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" type="search" placeholder="Tìm mã / tên…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 180 }} />
          {kind === 'existing' && <label className="checkbox"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Chỉ mã đổi max</label>}
          {!locked && kind === 'existing' && br && <button className="btn btn-sm" onClick={() => setAdd(true)}><Plus size={13} /> Thêm mã</button>}
          {!locked && kind === 'new_item' && <>
            <button className="btn btn-sm" onClick={() => setItems([...rows, { key: `n${Date.now().toString(36)}`, sku: '', name: '', maxByShop: {} }])}><Plus size={13} /> Thêm dòng</button>
            <button className="btn btn-sm" onClick={() => setImp(true)}><FileUp size={13} /> Nhập Excel (mẫu NCC / shop điền)</button>
          </>}
        </div>
        {req && <div className="full muted" style={{ fontSize: 12 }}>Lập bởi {req.createdBy} lúc {new Date(req.createdAt).toLocaleString('vi-VN')} (nguồn {req.source.toUpperCase()}){req.approvedBy ? ` · duyệt bởi ${req.approvedBy}` : ''}{req.pendingApply ? ` · còn ${req.pendingApply} dòng chờ gắn mã mới ghi max` : ''}</div>}
        {kind === 'existing' ? (
          !br ? <div className="full empty">Chọn shop — phần mềm điền sẵn mọi mã của shop kèm max gợi ý theo tốc độ bán.</div> : sug.isLoading ? <Loading /> : (
            <div className="full tm-matrix"><table><thead><tr><th>Mã hàng</th><th>Tên hàng</th><th className="num">Tồn</th><th className="num">Bán / ngày</th><th className="num">Max hiện tại</th><th className="num">Gợi ý</th><th className="num">Max đề nghị</th><th className="num">Chênh</th><th>Ghi chú</th></tr></thead><tbody>
              {shown.map((r) => {
                const d = (r.proposedMax ?? 0) - (r.currentMax ?? 0);
                return <tr key={r.key}>
                  <td className="mono">{r.sku}</td><td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.name}>{r.name}</td>
                  <td className="num tm-stock">{qtyFmt(tonOf.get(r.sku))}</td><td className="num">{qtyFmt(r.avgPerDay)}</td><td className="num">{qtyFmt(r.currentMax)}</td>
                  <td className="num">{r.suggestedMax ? <button className="tm-opt" disabled={locked} onClick={() => set(r.key, { proposedMax: r.suggestedMax })}><span className="tm-sug">{qtyFmt(r.suggestedMax)}</span></button> : ''}</td>
                  <td className="num"><input className={`tm-input${d ? ' dirty' : ''}`} disabled={locked} value={r.proposedMax ?? ''} onChange={(e) => set(r.key, { proposedMax: num(e.target.value) })} /></td>
                  <td className="num">{d ? <span className={d > 0 ? 'tm-sug' : 'tm-low'}>{d > 0 ? '+' : ''}{qtyFmt(d)}{r.currentMax ? ` (${Math.round((d / r.currentMax) * 100)}%)` : ''}</span> : ''}</td>
                  <td><input className="input" style={{ height: 26, width: 160 }} disabled={locked} value={r.note ?? ''} onChange={(e) => set(r.key, { note: e.target.value })} /></td>
                </tr>;
              })}
              {!shown.length && <tr><td colSpan={9} className="muted">Không có dòng nào.</td></tr>}
            </tbody></table></div>
          )
        ) : (
          <div className="full tm-matrix"><table><thead><tr>
            <th className="stick">Tên hàng (theo NCC)</th><th>Mã bên NCC</th><th>Mã hàng</th><th>ĐVT</th><th>Quy cách</th><th className="num">Tổng max</th>
            {shops.map((s) => <th key={s.code} className="num" title={s.name}>{s.code}<div className="muted" style={{ fontSize: 10, fontWeight: 400, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div></th>)}
            <th /></tr></thead><tbody>
            {shown.map((r) => <tr key={r.key}>
              <td className="stick"><input className="input" style={{ height: 26, width: 230 }} disabled={locked} value={r.name} placeholder="Tên hàng" onChange={(e) => set(r.key, { name: e.target.value })} /></td>
              <td><input className="input" style={{ height: 26, width: 100 }} disabled={locked} value={r.nccSku ?? ''} onChange={(e) => set(r.key, { nccSku: e.target.value })} /></td>
              <td><input className="input mono" style={{ height: 26, width: 110, background: r.sku ? '#effbf3' : '#fff7e6' }} disabled={req?.status === 'cancelled'} value={r.sku} placeholder="chưa có mã" title="Có mã hàng (tạo ở Danh mục mặt hàng khi hàng về) thì gõ vào đây — lưu là ghi max" onChange={(e) => set(r.key, { sku: e.target.value.trim() })} /></td>
              <td><input className="input" style={{ height: 26, width: 60 }} disabled={locked} value={r.unit ?? ''} onChange={(e) => set(r.key, { unit: e.target.value })} /></td>
              <td><input className="tm-input" style={{ width: 54 }} disabled={locked} value={r.pack ?? ''} onChange={(e) => set(r.key, { pack: num(e.target.value) || undefined })} /></td>
              <td className="num"><b>{qtyFmt(Object.values(r.maxByShop ?? {}).reduce((s, x) => s + x, 0))}</b></td>
              {shops.map((s) => <td key={s.code}><input className="tm-input" style={{ width: 54 }} disabled={req?.status === 'cancelled' || (req?.status === 'approved' && Boolean(r.sku))} value={r.maxByShop?.[s.code] ?? ''} onChange={(e) => set(r.key, { maxByShop: { ...(r.maxByShop ?? {}), [s.code]: num(e.target.value) } })} /></td>)}
              <td>{!locked && <button className="btn btn-xs" onClick={() => setItems(rows.filter((x) => x.key !== r.key))}>✕</button>}</td>
            </tr>)}
            {!shown.length && <tr><td colSpan={7 + shops.length} className="muted">Bấm "Thêm dòng" hoặc "Nhập Excel" (tệp NCC gửi / shop đã điền theo mẫu — nút Xuất Excel tải mẫu có sẵn cột từng shop).</td></tr>}
          </tbody></table></div>
        )}
        <textarea className="input full" rows={2} placeholder="Ghi chú phiếu" disabled={locked} value={note ?? req?.note ?? ''} onChange={(e) => setNote(e.target.value)} />
        {err && <div className="full alert alert-bad">{err}</div>}
      </>}
      {add && <ChonMatHang existing={new Map(rows.map((r) => [r.sku, '✓ đã có']))} onClose={() => setAdd(false)} onPick={(p) => setItems([...rows, { key: p.sku, sku: p.sku, name: p.name, unit: p.unit, currentMax: 0, proposedMax: 0 }])} />}
      {imp && <NhapExcelChung<string, MaxRequestItem> onClose={() => setImp(false)} onAdd={(l) => { setImp(false); setItems([...rows, ...l]); }} s={{
        title: 'Nhập hàng mới từ Excel (mỗi shop một cột max)', file: `mau-dang-ky-max-hang-moi-${parent}.xlsx`, keyField: 'name',
        columns: [
          { name: 'Tên hàng', required: true, aliases: 'Tên sản phẩm', example: 'Sữa bột mới 800g', note: 'Tên theo NCC' },
          { name: 'Mã bên NCC', aliases: 'Mã NCC', example: 'NCC-001', note: 'Mã hàng của NCC' },
          { name: 'Mã hàng', aliases: 'Mã SP', example: '', note: 'Để trống nếu chưa có mã' },
          { name: 'ĐVT', example: 'Lon', note: 'ĐVT nhỏ nhất' },
          { name: 'Quy cách', example: 6, note: 'Số ĐVT / thùng' },
          ...shops.map((s) => ({ name: s.code, example: '', note: `Max của shop ${s.name}` })),
        ],
        spec: [['name', ['ten hang', 'ten san pham']], ['ncc', ['ma ben ncc', 'ma ncc']], ['sku', ['ma hang', 'ma sp']], ['unit', ['dvt']], ['pack', ['quy cach']], ...shops.map((s) => [s.code, [fold(s.code)]] as [string, string[]])],
        map: (r) => {
          const name = String(r.name ?? '').trim();
          if (!name || name === 'Tên shop →') return { error: 'thiếu tên hàng' };
          const maxByShop: Record<string, number> = {};
          for (const s of shops) { const v = String(r[s.code] ?? '').trim(); if (v) maxByShop[s.code] = num(v); }
          return { value: { key: `n${Math.random().toString(36).slice(2, 8)}`, name, nccSku: String(r.ncc ?? '').trim() || undefined, sku: String(r.sku ?? '').trim(), unit: String(r.unit ?? '').trim() || undefined, pack: num(String(r.pack ?? '')) || undefined, maxByShop } };
        },
        head: ['Tên hàng', 'Mã NCC', 'Mã hàng', 'Số shop có max', 'Tổng max'], cells: (x) => [x.name, x.nccSku ?? '', x.sku || '—', Object.keys(x.maxByShop ?? {}).length, qtyFmt(Object.values(x.maxByShop ?? {}).reduce((s, v) => s + v, 0))],
      }} />}
    </Modal>
  );
}
