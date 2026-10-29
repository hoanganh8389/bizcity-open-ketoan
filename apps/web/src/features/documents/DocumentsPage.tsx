/**
 * Định khoản tự động (ACC14) — trạm điều khiển chứng từ trước khi vào sổ nhật ký chung.
 * Phiếu mua, bán, chuyển kho, điều chỉnh lập ở hệ thống bán hàng (multisite, WooCommerce…). Đường chính: hệ thống nguồn
 * TỰ ĐẨY từng phiếu ngay khi lưu / sửa / xoá (sự kiện thời gian thực); loại chứng từ đặt "Tự động" thì định khoản luôn,
 * "Chờ định khoản" thì vào cổng chờ. Nút "Kéo chứng từ" (chỉ khi bấm, mở màn KHÔNG tự kéo) để lấy phiếu cũ / bù phiếu sót.
 * Chứng từ luôn với nội dung MỚI NHẤT. Bấm một dòng: xem trước bút toán sẽ ghi, thấy đúng mới định khoản.
 *   thẻ Chờ định khoản : chứng từ mới, hoặc đã định khoản nhưng có phiên bản mới (sổ còn theo phiên bản cũ);
 *   thẻ Lỗi định khoản : không ghi được (thiếu cấu hình…), sửa cấu hình rồi định khoản lại;
 *   thẻ Tự động định khoản: phiếu nguồn đẩy vào và tự ghi sổ (chế độ Tự động) — xem nhanh đã hạch toán thế nào;
 *   thẻ Đã định khoản  : đang nằm trong sổ; "Định khoản lại" khi đổi cấu hình hạch toán;
 *   thẻ Tất cả         : mọi chứng từ;
 *   thẻ Nhật ký định khoản: từng lần nhận phiên bản, định khoản, định khoản lại, lỗi, huỷ — ai, lúc nào, bút toán nào.
 * Định khoản lại không sửa, không xoá bút toán cũ: bút toán cũ được đảo bằng ghi số âm (có liên kết), rồi ghi bút toán mới.
 * Nút "Chế độ định khoản": loại chứng từ nào chờ định khoản (mặc định), loại nào định khoản ngay khi tới.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, CloudDownload, Plug, RefreshCcw, Settings2, X } from 'lucide-react';
import { APPROVABLE_DOC_TYPES, DOC_TYPE_LABELS, type DocType, type PostingModes } from '@ketoan/contracts';
import { api, errorText, ALL_ROWS } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { defaultFrom, defaultTo } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout, BRANCH_NONE } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { FormTabs } from '@/components/FormBlocks';
import { Empty, ErrorBox, Loading, Modal, StatusBadge } from '@/components/ui';
import { dateTimeShort } from '@/components/voucher/VoucherListPage';
import { DocumentDetail } from './DocumentDetail';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ConnectionsModal, PullModal, useConnections } from './Connections';

/** Phiếu xuất điều chỉnh: chứng từ bán nội bộ có lý do (sourceRef.type = export_adjust), hiện thành loại riêng. */
const EXPORT_ADJUST = 'export_adjust';
const typeLabel = (r: { docType: DocType; sourceType?: string | null }) => (r.sourceType === EXPORT_ADJUST ? 'Phiếu xuất điều chỉnh' : DOC_TYPE_LABELS[r.docType] ?? r.docType);
/** Ô lọc Loại chứng từ → tham số API: "Phiếu xuất điều chỉnh" = sale + export_adjust; "Hoá đơn bán hàng" không lẫn phiếu đó. */
const typeParams = (docType: string) => (docType === EXPORT_ADJUST ? { docType: 'sale', sourceType: EXPORT_ADJUST } : docType === 'sale' ? { docType, sourceType: `!${EXPORT_ADJUST}` } : { docType });

interface DocRow {
  id: string; docKey: string; version: number; postedVersion: number | null; docType: DocType; docNo: string; docDate: string;
  invoiceNo: string | null; total: number; status: string; errorMessage: string | null; cancelRequestedAt?: string | null; cancelReason?: string | null; branchCode: string; partnerName: string | null; sourceSystem: string;
  sourceType: string | null; sourceLabel: string | null; sourceUrl: string | null;
}
export interface LogRow {
  id: string; eventId: string; docType: DocType; docNo: string; version: number; action: 'receive' | 'post' | 'repost' | 'error' | 'cancel' | 'cancel_request' | 'unpost'; branchCode: string;
  entryNos: string[]; reversed: number; total: number | null; message: string | null; actorName: string; createdAt: string; docStatus: string; docVersion: number;
}
type Tab = 'pending' | 'error' | 'auto' | 'posted' | '' | 'log';
export const ACTION_TEXT: Record<LogRow['action'], string> = { receive: 'Nhận phiên bản', post: 'Định khoản', repost: 'Định khoản lại', error: 'Lỗi định khoản', cancel: 'Huỷ', cancel_request: 'Nguồn báo xoá (chờ huỷ)', unpost: 'Bỏ định khoản' };

/** Trạng thái hiển thị: chờ định khoản lại khi sổ còn theo phiên bản cũ. */
export const statusText = (r: { status: string; version: number; postedVersion: number | null; cancelRequestedAt?: string | null }) =>
  r.status === 'pending' && r.cancelRequestedAt ? 'Chờ huỷ (phiếu đã xoá ở nguồn)' : r.status === 'pending' && r.postedVersion ? `Chờ định khoản lại (sổ theo v${r.postedVersion})` : ({ posted: 'Đã định khoản', pending: 'Chờ định khoản', error: 'Lỗi định khoản', cancelled: 'Đã huỷ' } as Record<string, string>)[r.status] ?? r.status;

export function DocumentsPage() {
  const [params] = useSearchParams();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>((params.get('status') as Tab | null) ?? 'pending');
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', docType: '', sourceSystem: '', search: '', page: 1 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modes, setModes] = useState(false);
  const [connOpen, setConnOpen] = useState(false);
  const [pullOpen, setPullOpen] = useState(false);
  const connections = useConnections();
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch, page: patch.page ?? 1 }));
  const changeTab = (t: Tab) => { setTab(t); setSelected(new Set()); setNotice(null); };
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['documents', f, tab],
    enabled: tab !== 'log',
    queryFn: () => api.getPage<DocRow[]>('/api/v1/documents', { ...f, ...typeParams(f.docType), status: tab || undefined, pageSize: ALL_ROWS }),
    placeholderData: keepPreviousData,
  });
  const logQ = useQuery({
    queryKey: ['posting-log', f],
    enabled: tab === 'log',
    queryFn: () => api.get<LogRow[]>('/api/v1/posting-log', { from: f.from, to: f.to, docType: (f.docType === EXPORT_ADJUST ? 'sale' : f.docType) || undefined, branchCodes: f.branchCodes || undefined }),
    placeholderData: keepPreviousData,
  });
  const pendingCount = useQuery({ queryKey: ['documents', 'count', 'pending', f], queryFn: async () => Number((await api.getPage<DocRow[]>('/api/v1/documents', { ...f, ...typeParams(f.docType), status: 'pending', pageSize: 1 })).meta?.total ?? 0) }).data ?? 0;
  const errorCount = useQuery({ queryKey: ['documents', 'count', 'error', f], queryFn: async () => Number((await api.getPage<DocRow[]>('/api/v1/documents', { ...f, ...typeParams(f.docType), status: 'error', pageSize: 1 })).meta?.total ?? 0) }).data ?? 0;
  const rows = q.data?.data ?? [];
  const picked = rows.filter((r) => selected.has(r.id));
  const canPost = can('documents:write');

  // Chi nhánh đang chọn cho nút Kéo chứng từ: rỗng = tất cả (null: nguồn quét mọi cửa hàng), BRANCH_NONE = chưa chọn ([]).
  const pickedBranches: string[] | null = f.branchCodes === BRANCH_NONE ? [] : f.branchCodes ? f.branchCodes.split(',').map((x) => x.trim()).filter(Boolean) : null;
  const sourceName = (code: string) => (code === 'manual' ? 'Lập tay' : connections.find((c) => c.code === code)?.name ?? code);

  /** Định khoản / định khoản lại theo lô 50 chứng từ, hiện tiến độ sau mỗi lô. */
  const post = useMutation({
    mutationFn: async ({ list, repost }: { list: DocRow[]; repost: boolean }) => {
      let posted = 0;
      let unchanged = 0;
      const skipped: { docNo: string; message: string }[] = [];
      const errors: { docNo: string; message: string }[] = [];
      setProgress({ done: 0, total: list.length });
      for (let i = 0; i < list.length; i += 50) {
        const r = await api.post<{ posted: number; unchanged?: number; skipped: typeof skipped; errors: typeof errors }>('/api/v1/documents/post', { ids: list.slice(i, i + 50).map((x) => x.id), repost });
        posted += r.posted;
        unchanged += r.unchanged ?? 0;
        skipped.push(...r.skipped);
        errors.push(...r.errors);
        setProgress({ done: Math.min(i + 50, list.length), total: list.length });
      }
      return { posted, unchanged, skipped, errors, repost };
    },
    onSuccess: (r) => {
      const few = (xs: { docNo: string; message: string }[]) => xs.slice(0, 5).map((x) => `${x.docNo} (${x.message})`).join('; ') + (xs.length > 5 ? '…' : '');
      setNotice(`Đã ${r.repost ? 'định khoản lại' : 'định khoản'} ${r.posted.toLocaleString('vi-VN')} chứng từ.${r.unchanged ? ` Không có thay đổi (giữ nguyên bút toán): ${r.unchanged.toLocaleString('vi-VN')}.` : ''}${r.skipped.length ? ` Bỏ qua ${r.skipped.length}: ${few(r.skipped)}.` : ''}${r.errors.length ? ` Lỗi ${r.errors.length}: ${few(r.errors)}.` : ''}`);
      setSelected(new Set());
    },
    onSettled: () => { setProgress(null); void qc.invalidateQueries(); },
  });
  const doPost = (list: DocRow[], repost: boolean) => {
    if (!list.length) return setNotice('Chưa tích ô Chọn ở chứng từ nào.');
    if (window.confirm(repost
      ? `Định khoản lại ${list.length} chứng từ theo cấu hình hiện tại?\nBút toán nào thay đổi thì ghi số âm để đảo (lưu vết) rồi ghi bút toán mới; bút toán không đổi giữ nguyên.`
      : `Định khoản ${list.length} chứng từ vào sổ nhật ký chung?`)) post.mutate({ list, repost });
  };
  const remove = useMutation({
    mutationFn: async ({ list, reason }: { list: DocRow[]; reason: string }) => { for (const r of list) await api.post('/api/v1/documents/cancel', { docKey: r.docKey, reason }); return list.length; },
    onSuccess: (n) => { setNotice(`Đã huỷ ${n} chứng từ.`); setSelected(new Set()); void qc.invalidateQueries({ queryKey: ['documents'] }); },
  });
  const doRemove = () => {
    if (!picked.length) return setNotice('Chưa tích ô Chọn ở chứng từ nào.');
    const reason = window.prompt(`Huỷ ${picked.length} chứng từ (chứng từ đã định khoản thì bút toán được ghi số âm để đảo). Lý do:`);
    if (reason) remove.mutate({ list: picked, reason });
  };

  const pickCol: Column<DocRow> = {
    key: 'pick', noFilter: true, noSort: true, width: 46,
    header: <label className="checkbox" title="Chọn tất cả"><input type="checkbox" checked={rows.length > 0 && rows.every((r) => selected.has(r.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /> Chọn</label>,
    value: () => '',
    render: (r) => <input type="checkbox" checked={selected.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />,
  };
  const columns: Column<DocRow>[] = [
    pickCol,
    { key: 'docDate', header: 'Ngày', type: 'date' },
    { key: 'docNo', header: 'Số chứng từ', type: 'code', render: (r) => <>{r.docNo}{r.version > 1 ? <span className="muted"> (v{r.version})</span> : null}</> },
    { key: 'docType', header: 'Loại', value: typeLabel },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
    { key: 'partnerName', header: 'Đối tượng' },
    { key: 'invoiceNo', header: 'Số hoá đơn', type: 'code' },
    { key: 'total', header: 'Tổng tiền', type: 'money', sum: true, value: (r) => (r.docType === 'sale_return' ? -r.total : r.total) },
    { key: 'status', header: 'Trạng thái', value: statusText, render: (r) => (r.status === 'pending' && r.cancelRequestedAt ? <b className="text-bad" title={r.cancelReason ?? ''}>{statusText(r)}</b> : r.status === 'pending' && r.postedVersion ? <b className="text-warn" title={`Sổ đang theo phiên bản ${r.postedVersion}, chứng từ đã có phiên bản ${r.version}`}>{statusText(r)}</b> : <span title={r.errorMessage ?? ''}><StatusBadge status={r.status} /></span>) },
    { key: 'source', header: 'Nguồn', value: (r) => sourceName(r.sourceSystem) },
    { key: 'sourceLabel', header: 'Phiếu nguồn', value: (r) => r.sourceLabel ?? '', render: (r) => (r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.sourceLabel ?? 'Mở'}</a> : r.sourceLabel ?? '') },
    ...(tab === 'error' ? [{ key: 'errorMessage', header: 'Lỗi', value: (r: DocRow) => r.errorMessage ?? '' } as Column<DocRow>] : []),
  ];
  const logColumns: Column<LogRow>[] = [
    { key: 'createdAt', header: 'Thời gian', value: (r) => dateTimeShort(r.createdAt) },
    { key: 'docNo', header: 'Số chứng từ', type: 'code' },
    { key: 'docType', header: 'Loại', value: (r) => DOC_TYPE_LABELS[r.docType] ?? r.docType },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
    { key: 'version', header: 'Phiên bản', type: 'number' },
    { key: 'action', header: 'Hành động', value: (r) => ACTION_TEXT[r.action], render: (r) => <span className={r.action === 'error' ? 'text-bad' : r.action === 'repost' ? 'text-warn' : undefined}>{ACTION_TEXT[r.action]}</span> },
    { key: 'entryNos', header: 'Bút toán ghi', value: (r) => r.entryNos.join(', ') },
    { key: 'reversed', header: 'Số bút toán đảo', type: 'number' },
    { key: 'total', header: 'Tổng tiền', type: 'money' },
    { key: 'actorName', header: 'Người làm' },
    { key: 'message', header: 'Ghi chú', value: (r) => r.message ?? '' },
  ];

  const busy = post.isPending || remove.isPending;
  return (
    <>
      <PageHeader
        title="Định khoản tự động" code="ACC14" helpKey="chung-tu"
        subtitle="Trạm điều khiển: chứng từ từ mọi nguồn lưu ở đây trước; lọc, tích chọn rồi định khoản vào sổ nhật ký chung theo lô"
        actions={<>
          <button className="btn" disabled={!canPost} onClick={() => setPullOpen(true)} title="Kéo các phiếu đang chờ đẩy sang từ hệ thống kết nối"><CloudDownload size={15} /> Kéo chứng từ</button>
          <button className="btn" onClick={() => setConnOpen(true)}><Plug size={15} /> Kết nối</button>
          <button className="btn" onClick={() => setModes(true)}><Settings2 size={15} /> Chế độ định khoản</button>
        </>}
      />
      <FilterLayout
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <div className="field">
              <label>Loại chứng từ</label>
              <select className="select input w-md" value={f.docType} onChange={(e) => set({ docType: e.target.value })}>
                <option value="">Tất cả</option>
                {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
                <option value={EXPORT_ADJUST}>Phiếu xuất điều chỉnh</option>
              </select>
            </div>
            {tab !== 'log' && (
              <div className="field">
                <label>Nguồn</label>
                <select className="select input w-md" value={f.sourceSystem} onChange={(e) => set({ sourceSystem: e.target.value })}>
                  <option value="">Tất cả</option>
                  {connections.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  <option value="manual">Lập tay</option>
                </select>
              </div>
            )}
            {tab !== 'log' && (
              <div className="field">
                <label>Tìm số chứng từ, số hoá đơn, khách</label>
                <input className="input w-lg" value={f.search} onChange={(e) => set({ search: e.target.value })} placeholder="Gõ để tìm…" />
              </div>
            )}
          </>
        }
      >
        <div className="card">
          <FormTabs<Tab>
            tabs={[
              ['pending', `Chờ định khoản${pendingCount ? ` (${pendingCount.toLocaleString('vi-VN')})` : ''}`],
              ['error', `Lỗi định khoản${errorCount ? ` (${errorCount.toLocaleString('vi-VN')})` : ''}`],
              ['auto', 'Tự động định khoản'], ['posted', 'Đã định khoản'], ['', 'Tất cả chứng từ'], ['log', 'Nhật ký định khoản'],
            ]}
            value={tab} onChange={changeTab}
          />
          {tab !== 'log' && (
            <div className="vf-toolbar" style={{ marginTop: 6 }}>
              {tab !== 'posted' && tab !== 'auto' && (
                <>
                  <button disabled={!canPost || busy || !picked.length} onClick={() => doPost(picked, false)} title="Định khoản các chứng từ đã tích vào sổ nhật ký chung"><CheckCheck size={15} className="text-ok" /> Định khoản {picked.length ? `${picked.length} chứng từ đã chọn` : 'các chứng từ đã chọn'}</button>
                  <button disabled={!canPost || busy || !rows.length} onClick={() => doPost(rows.filter((r) => r.status === 'pending' || r.status === 'error'), false)}><CheckCheck size={15} className="text-ok" /> Định khoản tất cả đang hiện</button>
                </>
              )}
              {tab !== 'pending' && (
                <button disabled={!canPost || busy || !picked.length} onClick={() => doPost(picked, true)} title="Đảo bút toán cũ (ghi số âm), ghi lại theo cấu hình hạch toán hiện tại"><RefreshCcw size={15} /> Định khoản lại {picked.length ? `${picked.length} chứng từ` : 'các chứng từ đã chọn'}</button>
              )}
              <button disabled={!canPost || busy || !picked.length} onClick={doRemove}><X size={15} className="text-bad" /> Huỷ chứng từ</button>
              {progress && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>Đang định khoản {progress.done.toLocaleString('vi-VN')} / {progress.total.toLocaleString('vi-VN')}…</span>}
            </div>
          )}
          {notice && <div className="alert alert-ok" style={{ margin: '6px 0' }}>{notice}</div>}
          {tab === 'auto' && <div className="muted" style={{ margin: '4px 0', fontSize: 12 }}>Phiếu hệ thống nguồn đẩy vào ngay khi lưu / sửa và tự ghi sổ theo Chế độ định khoản "Tự động". Bấm một dòng để xem chứng từ và thẻ Bút toán.</div>}
          <ErrorBox error={(tab === 'log' ? logQ.error : q.error) ? errorText(tab === 'log' ? logQ.error : q.error) : post.error ? errorText(post.error) : remove.error ? errorText(remove.error) : null} />
          {tab === 'log' ? (
            logQ.isLoading ? <Loading /> : !(logQ.data ?? []).length ? <Empty text="Chưa có lần định khoản nào trong khoảng này" /> : (
              <DataGrid storageKey="acc14-log" rows={logQ.data!} rowKey={(r) => r.id} onRowClick={(r) => setOpenId(r.eventId)} columns={logColumns} exportName={`ACC14-nhat-ky-${f.from}-${f.to}`} />
            )
          ) : q.isLoading ? <Loading /> : rows.length === 0 ? (
            <Empty text={tab === 'pending' ? 'Không có chứng từ nào chờ định khoản' : tab === 'error' ? 'Không có chứng từ lỗi định khoản' : tab === 'auto' ? 'Chưa có chứng từ tự động định khoản trong khoảng này' : undefined} />
          ) : (
            <DataGrid storageKey={`acc14-${tab || 'all'}`} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => setOpenId(r.id)} columns={columns} exportName={`ACC14-${f.from}-${f.to}`} />
          )}
        </div>
      </FilterLayout>
      {openId && <DocumentDetail id={openId} onClose={() => setOpenId(null)} />}
      {connOpen && <ConnectionsModal onClose={() => setConnOpen(false)} canEdit={can('settings:write')} />}
      {pullOpen && <PullModal from={f.from} to={f.to} branchCodes={pickedBranches} onClose={() => setPullOpen(false)} />}
      {modes && <PostingModesModal onClose={() => setModes(false)} canEdit={can('settings:write')} />}
    </>
  );
}

/** Chế độ định khoản theo loại chứng từ: chờ định khoản (mặc định) hay định khoản ngay. */
function PostingModesModal({ onClose, canEdit }: { onClose: () => void; canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['posting-modes'], queryFn: () => api.get<PostingModes>('/api/v1/settings/posting-modes') });
  const [draft, setDraft] = useState<PostingModes | null>(null);
  const cur = draft ?? q.data;
  const save = useMutation({
    mutationFn: (body: PostingModes) => api.put<PostingModes>('/api/v1/settings/posting-modes', body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['posting-modes'] }); onClose(); },
  });
  return (
    <Modal title="Chế độ định khoản theo loại chứng từ" onClose={onClose}
      footer={<>{canEdit && <button className="btn btn-primary" disabled={!draft || save.isPending} onClick={() => draft && save.mutate(draft)}>Ghi</button>}<button className="btn" onClick={onClose}>Đóng</button></>}>
      <div className="full muted" style={{ fontSize: 12, marginBottom: 8 }}>
        <b>Vào cổng chờ</b> (mặc định): phiếu hệ thống bán hàng đẩy sang chỉ được lưu, hiện ở thẻ Chờ định khoản; chưa vào sổ, kho, bán hàng, sổ hoá đơn cho tới khi kế toán định khoản. Phiếu bị xoá ở nguồn vào Chờ huỷ.
        <b> Tự động định khoản</b>: phiếu đẩy sang (ngay khi lưu / sửa ở cửa hàng) là vào sổ luôn; phiếu sửa thì tự định khoản lại phần thay đổi; phiếu bị xoá / bỏ duyệt thì tự huỷ (ghi số âm). Xem ở thẻ Tự động định khoản.
        Phiếu lấy bằng nút Kéo chứng từ luôn vào cổng chờ. Phiếu thu chi, phiếu kế toán kế toán tự lập ghi ngay ở chính phiếu.
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : null} />
      {cur && (
        <table className="grid full">
          <thead><tr><th>Loại chứng từ</th><th>Chế độ</th></tr></thead>
          <tbody>
            {APPROVABLE_DOC_TYPES.map((t) => (
              <tr key={t}>
                <td>{DOC_TYPE_LABELS[t]}</td>
                <td>
                  <select className="select input" value={cur[t]} disabled={!canEdit} onChange={(e) => setDraft({ ...cur, [t]: e.target.value as 'auto' | 'approve' })}>
                    <option value="approve">Vào cổng chờ</option>
                    <option value="auto">Tự động định khoản</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!canEdit && <div className="full muted" style={{ marginTop: 6, fontSize: 12 }}>Đổi chế độ cần quyền cấu hình (kế toán trưởng).</div>}
    </Modal>
  );
}
