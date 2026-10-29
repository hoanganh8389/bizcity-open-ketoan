/**
 * Dữ liệu gốc (TI08): các bộ danh mục, cấu hình định khoản chuẩn lưu bằng tệp trong phần mềm; xem nội dung tệp,
 * quay về dữ liệu gốc từng bộ. Nút "Quay về dữ liệu gốc" cũng có ở đầu từng màn danh mục liên quan.
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
  ACC41: { key: 'posting_defaults', title: 'Tài khoản ngầm định' },
  DM10: { key: 'products', title: 'Danh mục mặt hàng' },
  DM11: { key: 'item_classes', title: 'Phân loại hàng hoá' },
  ACC17: { key: 'posting_groups', title: 'Mặt hàng – tài khoản' },
  ACC18: { key: 'reasons', title: 'Lý do – tài khoản' },
  ACC19: { key: 'tool_group', title: 'Nhóm công cụ dụng cụ' },
  ACC20: { key: 'capital_source', title: 'Danh mục nguồn vốn' },
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

/** Nút "Quay về dữ liệu gốc": hỏi xác nhận, chạy, báo kết quả. Chỉ hiện cho người có quyền cài đặt. */
export function RestoreDefaultsButton({ datasetKey, title }: { datasetKey: string; title: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [done, setDone] = useState<RestoreResult | null>(null);
  const run = useMutation({
    mutationFn: () => api.post<RestoreResult>(`/api/v1/default-data/${datasetKey}/restore`, { confirm: true }),
    onSuccess: (r) => { setDone(r); void qc.invalidateQueries(); },
  });
  if (!can('settings:write')) return null;
  const ask = () => window.confirm(
    `Quay về dữ liệu gốc: ${title}?\n\n` +
    '- Bản ghi có trong dữ liệu gốc: thêm lại nếu thiếu, ghi đè tên, tài khoản… theo dữ liệu gốc.\n' +
    '- Bản ghi tự thêm: chưa dùng thì xoá; đã dùng trên sổ sách thì khoá (ngừng dùng).\n\n' +
    'Không sửa chứng từ, sổ cái đã ghi. Tiếp tục?',
  ) && run.mutate();
  return (
    <>
      <button className="btn" disabled={run.isPending} onClick={ask} title="Đưa danh mục về đúng dữ liệu gốc"><RotateCcw size={16} /> {run.isPending ? 'Đang quay về…' : 'Quay về dữ liệu gốc'}</button>
      {(done || run.error) && (
        <Modal title={`Quay về dữ liệu gốc: ${title}`} onClose={() => { setDone(null); run.reset(); }} footer={<button className="btn btn-primary" onClick={() => { setDone(null); run.reset(); }}>Đóng</button>}>
          <div className="full">
            <ErrorBox error={run.error ? errorText(run.error) : null} />
            {done && <p>Xong: {resultText(done)}.</p>}
            {done?.warnings.map((w) => <div key={w} className="alert alert-warn" style={{ marginBottom: 6 }}>{w}</div>)}
          </div>
        </Modal>
      )}
    </>
  );
}

export function DefaultDataPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['default-data'], queryFn: () => api.get<{ datasets: Dataset[]; seedItems: number }>('/api/v1/default-data') });
  const [view, setView] = useState<{ d: Dataset; file: 'main' | 'items' } | null>(null);
  const all = useMutation({
    mutationFn: () => api.post<{ key: string; title: string; result: RestoreResult }[]>('/api/v1/default-data/all/restore', { confirm: true }),
    onSuccess: () => void qc.invalidateQueries(),
  });
  const askAll = () => window.confirm(
    'Quay về dữ liệu gốc TOÀN BỘ danh mục (theo thứ tự trong bảng)?\n\n' +
    '- Bản ghi có trong dữ liệu gốc: thêm lại nếu thiếu, ghi đè theo dữ liệu gốc.\n' +
    '- Bản ghi tự thêm: chưa dùng thì xoá; đã dùng thì khoá. Chi nhánh, đối tượng, mặt hàng tự thêm giữ nguyên.\n\n' +
    'Không sửa chứng từ, sổ cái đã ghi. Có thể mất vài chục giây. Tiếp tục?',
  ) && all.mutate();
  return (
    <>
      <PageHeader title="Dữ liệu gốc" code="TI08" subtitle="Bộ danh mục và cấu hình định khoản chuẩn của công ty, lưu bằng tệp trong phần mềm; quay về khi danh mục bị sửa lộn xộn" helpKey="du-lieu-goc"
        actions={can('settings:write') && <button className="btn btn-primary" disabled={all.isPending} onClick={askAll}><RotateCcw size={16} /> {all.isPending ? 'Đang quay về toàn bộ…' : 'Quay về toàn bộ'}</button>} />
      {(all.data || all.error) && (
        <div className="card">
          <div className="card-body">
            <ErrorBox error={all.error ? errorText(all.error) : null} />
            {all.data && (
              <>
                <b>Đã quay về toàn bộ dữ liệu gốc.</b>
                <table className="grid" style={{ marginTop: 8 }}>
                  <thead><tr><th>Bộ dữ liệu</th><th>Kết quả</th><th>Cần xem</th></tr></thead>
                  <tbody>{all.data.map((o) => <tr key={o.key}><td>{o.title}</td><td>{resultText(o.result)}</td><td>{o.result.warnings.map((w) => <div key={w} className="muted" style={{ fontSize: 12 }}>{w}</div>)}</td></tr>)}</tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
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
              {q.data.datasets.map((d) => (
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
