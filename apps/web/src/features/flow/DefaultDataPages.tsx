/**
 * Dữ liệu gốc (TI08): các bộ danh mục, cấu hình định khoản chuẩn lưu bằng tệp trong phần mềm; xem nội dung tệp,
 * quay về dữ liệu gốc từng bộ. Nút "Quay về dữ liệu gốc" cũng có ở đầu từng màn danh mục liên quan.
 * [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-8a: quay về = hộp thoại xem trước (chạy thử ?dryRun=1, số thật) → tick đồng ý → ghi với previewToken;
 *   phần mềm tự chụp danh mục trước khi ghi (10 bản gần nhất). Bỏ window.confirm.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';

export interface Dataset { key: string; title: string; file: string; screens: string[]; description: string; seedCount: number; currentCount: number }
interface RestoreResult { added: number; updated: number; removed: number; deactivated: number; warnings: string[] }

/** Mã màn → bộ dữ liệu gốc (đặt nút ở đầu màn). */
export const DEFAULT_DATA_SCREENS: Record<string, { key: string; title: string }> = {
  ACC1: { key: 'account_tracking', title: 'Theo dõi chiều của tài khoản' },
  DM10: { key: 'catalog_sample', title: 'Nhóm hàng + mặt hàng' },
  DM11: { key: 'catalog_sample', title: 'Nhóm hàng + mặt hàng' },
  ACC19: { key: 'tool_group', title: 'Nhóm công cụ dụng cụ' },
  ACC20: { key: 'capital_source', title: 'Danh mục nguồn vốn' },
  DM17: { key: 'cash_item', title: 'Danh mục mục thu/chi' },
  ACC21: { key: 'usage_purpose', title: 'Mục đích sử dụng' },
  ACC24: { key: 'cost_item', title: 'Danh mục khoản mục' },
  ACC25: { key: 'contract', title: 'Danh mục hợp đồng' },
  ACC26: { key: 'department', title: 'Danh mục bộ phận' },
  DM04: { key: 'employee', title: 'Danh mục nhân viên' },
  DM06: { key: 'case', title: 'Danh mục vụ việc' },
  DM07: { key: 'project', title: 'Danh mục dự án' },
  ACC37: { key: 'asset_categories', title: 'Loại tài sản' },
  ACC43: { key: 'tax_codes', title: 'Loại thuế' },
  DM05: { key: 'payment_methods', title: 'Hình thức thanh toán' },
  DM09: { key: 'bank_accounts', title: 'Tài khoản ngân hàng' },
  DM02: { key: 'branches', title: 'Chi nhánh / cửa hàng' },
  DM12: { key: 'warehouses', title: 'Kho theo chi nhánh' },
  DM03: { key: 'partners', title: 'Đối tượng' },
  // Nhà cung cấp là một phần của Đối tượng: quay về dữ liệu gốc Đối tượng (NCC, khách buôn…) ngay từ màn NCC.
  MH01: { key: 'partners', title: 'Đối tượng (gồm nhà cung cấp)' },
  DM13: { key: 'partners', title: 'Đối tượng (gồm nhà cung cấp)' },
  DM08: { key: 'partner_groups', title: 'Nhóm đối tượng' },
};

const resultText = (r: RestoreResult) =>
  [`thêm ${r.added}`, `cập nhật ${r.updated}`, r.removed ? `xoá ${r.removed} mã tự thêm chưa dùng` : '', r.deactivated ? `khoá ${r.deactivated} mã tự thêm đã dùng` : ''].filter(Boolean).join(', ');

type Outcome = { key: string; title: string; result: RestoreResult };
type Meta = Record<string, unknown> | undefined;

// [2026-11-13 Nguyễn Văn Thủy] bộ nhóm hàng + mặt hàng: xoá vĩnh viễn, giữ mã đã phát sinh (đóng góp) — lời cảnh báo giữ nguyên, chuyển vào hộp thoại xem trước (S036-8a)
const CATALOG_SAMPLE_NOTE = 'XOÁ VĨNH VIỄN mọi nhóm hàng, mặt hàng chưa phát sinh trên sổ (kèm ĐVT, giá, khai báo nhà cung cấp của chúng). Mặt hàng đã có chứng từ được giữ nguyên. Nạp lại bộ mẫu: 2 cây nhóm hàng, 8 mặt hàng.';

/**
 * Hộp thoại quay về dữ liệu gốc (một bộ hoặc toàn bộ): 1) xem trước — chạy thử trên máy chủ rồi huỷ, ra số thêm / sửa / xoá / khoá thật;
 * 2) tick "đã xem" → Quay về (gửi mã xem trước; danh mục đổi ở giữa thì máy chủ từ chối, bấm xem trước lại); 3) báo kết quả + số bản chụp.
 */
export function RestorePreviewModal({ scope, title, onClose }: { scope: string; title: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [agree, setAgree] = useState(false);
  const url = `/api/v1/default-data/${scope}/restore`;
  const toList = (data: RestoreResult | Outcome[]): Outcome[] => (Array.isArray(data) ? data : [{ key: scope, title, result: data }]);
  const preview = useQuery({
    queryKey: ['default-data-preview', scope], gcTime: 0, staleTime: 0, retry: false,
    queryFn: async () => { const r = await api.postMeta<RestoreResult | Outcome[]>(url, { confirm: true }, { dryRun: 1 }); return { list: toList(r.data), meta: r.meta as Meta }; },
  });
  const run = useMutation({
    mutationFn: async () => { const r = await api.postMeta<RestoreResult | Outcome[]>(url, { confirm: true, previewToken: preview.data?.meta?.previewToken }); return { list: toList(r.data), meta: r.meta as Meta }; },
    onSuccess: () => void qc.invalidateQueries(),
  });
  const shown = run.data ?? preview.data;
  const changed = (r: RestoreResult) => r.added + r.updated + r.removed + r.deactivated;
  const total = shown?.list.reduce((n, o) => n + changed(o.result), 0) ?? 0;
  return (
    <Modal wide title={`Quay về dữ liệu gốc: ${title}`} onClose={onClose}
      footer={run.data
        ? <button className="btn btn-primary" onClick={onClose}>Đóng</button>
        : <>
            <button className="btn" onClick={onClose}>Huỷ</button>
            <button className="btn" disabled={preview.isFetching || run.isPending} onClick={() => { setAgree(false); run.reset(); void preview.refetch(); }}>Xem trước lại</button>
            <button className="btn btn-primary" disabled={!agree || !preview.data || total === 0 || run.isPending}
              title={!preview.data ? 'Đang xem trước' : total === 0 ? 'Danh mục đã đúng dữ liệu gốc — không có gì để ghi' : !agree ? 'Tick ô "Tôi đã xem" trước' : undefined}
              onClick={() => run.mutate()}><RotateCcw size={16} /> {run.isPending ? 'Đang quay về…' : 'Quay về'}</button>
          </>}>
      <div className="full">
        <ErrorBox error={preview.error ? errorText(preview.error) : run.error ? errorText(run.error) : null} />
        {preview.isLoading && <Loading />}
        {shown && (
          <>
            <p style={{ marginTop: 0 }}>
              {run.data
                ? <><b>Đã quay về.</b> Danh mục trước khi ghi đã được chụp lại{run.data.meta?.backupId ? <> (bản chụp số <b className="mono">{String(run.data.meta.backupId)}</b>, {Number(run.data.meta.backupRows ?? 0).toLocaleString('vi-VN')} dòng)</> : null} — giữ 10 bản gần nhất.</>
                : total === 0
                  ? <>Danh mục đã đúng dữ liệu gốc — không có gì thay đổi.</>
                  : <><b>Xem trước</b> (chưa ghi gì): nếu bấm Quay về, phần mềm sẽ làm đúng các việc dưới đây. Chứng từ, sổ cái đã ghi không đổi.</>}
            </p>
            {scope === 'catalog_sample' && !run.data && <div className="alert alert-warn" style={{ marginBottom: 8 }}>{CATALOG_SAMPLE_NOTE}</div>}
            <table className="grid">
              <thead><tr><th>Bộ dữ liệu</th><th className="num">Thêm</th><th className="num">Ghi đè</th><th className="num">Xoá</th><th className="num">Khoá</th><th>Cần xem</th></tr></thead>
              <tbody>{shown.list.map((o) => (
                <tr key={o.key}>
                  <td>{o.title}</td><td className="num">{o.result.added}</td><td className="num">{o.result.updated}</td>
                  <td className="num">{o.result.removed ? <b>{o.result.removed}</b> : 0}</td><td className="num">{o.result.deactivated}</td>
                  <td>{o.result.warnings.map((w) => <div key={w} className="muted" style={{ fontSize: 12 }}>{w}</div>)}</td>
                </tr>
              ))}</tbody>
            </table>
            {!run.data && total > 0 && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12 }}>
                <input id="dd-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>Tôi đã xem: bản ghi có trong dữ liệu gốc sẽ bị <b>ghi đè</b> theo tệp gốc; bản ghi tự thêm chưa dùng sẽ bị <b>xoá</b>, đã dùng thì khoá. Phần mềm tự chụp danh mục hiện tại trước khi ghi.</span>
              </label>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Nút "Quay về dữ liệu gốc" ở đầu màn danh mục: mở hộp thoại xem trước. Chỉ hiện cho người có quyền cài đặt. */
export function RestoreDefaultsButton({ datasetKey, title }: { datasetKey: string; title: string }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  if (!can('settings:write')) return null;
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} title="Xem trước rồi đưa danh mục về đúng dữ liệu gốc"><RotateCcw size={16} /> Quay về dữ liệu gốc</button>
      {open && <RestorePreviewModal scope={datasetKey} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

const AN_DI = new Set(['posting_defaults', 'posting_groups', 'reasons']);

export function DefaultDataPage() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['default-data'], queryFn: () => api.get<{ datasets: Dataset[]; seedItems: number }>('/api/v1/default-data') });
  const [view, setView] = useState<{ d: Dataset; file: 'main' | 'items' } | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  return (
    <>
      <PageHeader title="Dữ liệu gốc" code="TI08" subtitle="Bộ danh mục và cấu hình định khoản chuẩn của công ty, lưu bằng tệp trong phần mềm; quay về khi danh mục bị sửa lộn xộn" helpKey="du-lieu-goc"
        actions={can('settings:write') && <button className="btn btn-primary" onClick={() => setAllOpen(true)}><RotateCcw size={16} /> Quay về toàn bộ</button>} />
      {allOpen && <RestorePreviewModal scope="all" title="toàn bộ danh mục (theo thứ tự trong bảng)" onClose={() => setAllOpen(false)} />}
      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <p className="muted" style={{ margin: 0 }}>
            Dữ liệu gốc nằm trong thư mục <b className="mono">apps/api/seeds</b> của phần mềm (mỗi bộ một tệp, dòng đầu mô tả tệp). Danh mục đang dùng nằm trong cơ sở dữ liệu
            vì chứng từ, sổ cái trỏ tới. Người dùng thêm, sửa, xoá thoải mái; bấm <b>Quay về dữ liệu gốc</b> để chép đè bộ đó từ tệp về.
            Mặt hàng: tệp gốc có {q.data ? q.data.seedItems.toLocaleString('vi-VN') : '…'} mặt hàng kèm bộ tài khoản, loại thuế; mặt hàng chưa có trong phần mềm thì bộ định khoản đọc thẳng từ tệp.
          </p>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : !q.data?.datasets.length ? <Empty /> : (
          <table className="grid" style={{ margin: 16, width: 'calc(100% - 32px)' }}>
            <thead><tr><th>Bộ dữ liệu</th><th>Màn danh mục</th><th className="num">Trong tệp gốc</th><th className="num">Đang có</th><th>Mô tả</th><th /></tr></thead>
            <tbody>
              {/* [2026-11-13 Nguyễn Văn Thủy] bộ chạy ngầm cho bộ định khoản (lý do, nhóm hạch toán, khoá ngầm định cũ) không hiện — khai ở Tài khoản ngầm định (đóng góp) */}
              {q.data.datasets.filter((d) => !AN_DI.has(d.key)).map((d) => (
                <tr key={d.key}>
                  <td><b>{d.title}</b><div className="muted mono" style={{ fontSize: 12 }}>{d.file}</div></td>
                  <td className="mono">{d.screens.join(', ')}</td>
                  <td className="num">{d.seedCount.toLocaleString('vi-VN')}</td>
                  <td className="num">{d.currentCount.toLocaleString('vi-VN')}</td>
                  <td style={{ maxWidth: 480 }}>{d.description}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {d.file.endsWith('.jsonl') && <button className="btn btn-sm" onClick={() => setView({ d, file: 'main' })}>Xem tệp</button>}{' '}
                    {d.key === 'posting_groups' && <button className="btn btn-sm" onClick={() => setView({ d, file: 'items' })}>Xem mặt hàng</button>}{' '}
                    <RestoreDefaultsButton datasetKey={d.key} title={d.title} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {view && <SeedRowsDialog d={view.d} file={view.file} onClose={() => setView(null)} />}
    </>
  );
}

function SeedRowsDialog({ d, file, onClose }: { d: Dataset; file: 'main' | 'items'; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [s, setS] = useState('');
  const q = useQuery({ queryKey: ['default-data-rows', d.key, file, s], queryFn: () => api.get<{ columns: string[]; total: number; matched: number; rows: Record<string, unknown>[] }>(`/api/v1/default-data/${d.key}/rows`, { search: s || undefined, file }) });
  const cols: Column<Record<string, unknown>>[] = (q.data?.columns ?? []).map((c) => ({ key: c, header: c, value: (r) => { const v = r[c]; return v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 'có' : '') : (v as string | number); } }));
  return (
    <Modal wide title={`Tệp gốc: ${file === 'items' ? 'mặt hàng – tài khoản' : d.title}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      <form className="full row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); setS(search.trim()); }}>
        <input className="input w-lg" placeholder="Tìm mã, tên, tài khoản…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn">Tìm</button>
        {q.data && <span className="muted">{q.data.matched.toLocaleString('vi-VN')} / {q.data.total.toLocaleString('vi-VN')} dòng</span>}
      </form>
      <div className="full">
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : <DataGrid storageKey={`lk02-${d.key}-${file}`} rows={q.data?.rows ?? []} rowKey={(r) => String(r.code ?? r.sku ?? r.key ?? JSON.stringify(r))} columns={cols} />}
      </div>
    </Modal>
  );
}
