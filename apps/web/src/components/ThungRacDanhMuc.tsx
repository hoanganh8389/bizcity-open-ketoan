// [2026-11-17 Nguyễn Văn Thủy] Nút Xoá / Thùng rác / Xoá hết dùng chung cho mọi danh mục (API catalog-trash, 0146) (đóng góp)
/**
 * <ThungRacDanhMuc catalog="tax-codes" sel={{ key, label }} title="Biểu thuế" />
 *   Xoá       dòng đang chọn vào thùng rác (lưu nguyên, khôi phục được).
 *   Thùng rác hộp thoại: Khôi phục / Xoá vĩnh viễn từng dòng; Khôi phục hết; Xoá hết vĩnh viễn (mật khẩu).
 *   Xoá hết   cả danh mục vào thùng rác (mật khẩu) — để làm mới, nhập lại.
 * Dòng đang được chứng từ / sổ dùng thì không xoá được: báo lại danh sách bỏ qua.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Loading, Modal } from '@/components/ui';

type Res = { done: number; skipped: { key: string; reason: string }[]; keptItems?: number };
type TrashRow = { id: string; key: string; label: string; deletedBy: string; deletedAt: string };

const bao = (r: Res, viec: string) => {
  const bo = r.skipped.length ? `\nKhông làm được ${r.skipped.length} dòng:\n${r.skipped.slice(0, 15).map((s) => `• ${s.key}: ${s.reason}`).join('\n')}${r.skipped.length > 15 ? '\n…' : ''}` : '';
  const giu = r.keptItems ? `\n${r.keptItems} mặt hàng đã có chứng từ: giữ định danh (ngừng dùng), chỉ bỏ khỏi thùng rác.` : '';
  window.alert(`${viec} ${r.done} dòng.${bo}${giu}`);
};

export function ThungRacDanhMuc({ catalog, sel, title, onDone }: { catalog: string; sel?: { key: string; label?: string } | null; title: string; onDone?: () => void }) {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const qc = useQueryClient();
  const [mo, setMo] = useState(false);
  const trash = useQuery({ queryKey: ['catalog-trash', catalog], queryFn: () => api.get<TrashRow[]>('/api/v1/catalog-trash', { catalog }) });
  const xong = () => { void qc.invalidateQueries(); onDone?.(); };
  const xoa = useMutation({
    mutationFn: (b: { keys?: string[]; all?: boolean; password?: string }) => api.post<Res>('/api/v1/catalog-trash/trash', { catalog, ...b }),
    onSuccess: (r) => { bao(r, 'Đã chuyển vào thùng rác'); xong(); },
    onError: (e) => window.alert(errorText(e)),
  });
  return (
    <>
      <button className="btn btn-sm" disabled={!canWrite || !sel || xoa.isPending} title="Chuyển dòng đang chọn vào Thùng rác — vẫn lưu, khôi phục được"
        onClick={() => { if (sel && window.confirm(`Xoá ${sel.key}${sel.label ? ` - ${sel.label}` : ''}?\nChuyển vào Thùng rác (khôi phục được).`)) xoa.mutate({ keys: [sel.key] }); }}><Trash2 size={14} /> Xoá</button>
      <button className="btn btn-sm" onClick={() => setMo(true)} title="Mục đã xoá: khôi phục hoặc xoá vĩnh viễn"><ArchiveRestore size={14} /> Thùng rác{trash.data?.length ? ` (${trash.data.length})` : ''}</button>
      <button className="btn btn-sm" disabled={!canWrite || xoa.isPending} title={`Xoá hết ${title} vào Thùng rác (cần mật khẩu) — để làm mới, nhập lại`}
        onClick={() => {
          const pw = window.prompt(`Xoá HẾT ${title} vào Thùng rác?\nNhập mật khẩu để xác nhận:`);
          if (pw) xoa.mutate({ all: true, password: pw });
        }}>{xoa.isPending ? 'Đang xoá…' : 'Xoá hết'}</button>
      {mo && <HopThungRac catalog={catalog} title={title} rows={trash.data ?? []} loading={trash.isLoading} canWrite={canWrite} canPurge={can('settings:write')} onDone={xong} onClose={() => setMo(false)} />}
    </>
  );
}

function HopThungRac({ catalog, title, rows, loading, canWrite, canPurge, onDone, onClose }: { catalog: string; title: string; rows: TrashRow[]; loading: boolean; canWrite: boolean; canPurge: boolean; onDone: () => void; onClose: () => void }) {
  const [loc, setLoc] = useState('');
  const restore = useMutation({ mutationFn: (b: { ids?: string[]; all?: boolean }) => api.post<Res>('/api/v1/catalog-trash/restore', { catalog, ...b }), onSuccess: (r) => { bao(r, 'Đã khôi phục'); onDone(); }, onError: (e) => window.alert(errorText(e)) });
  const purge = useMutation({ mutationFn: (b: { ids?: string[]; all?: boolean; password?: string }) => api.post<Res>('/api/v1/catalog-trash/purge', { catalog, ...b }), onSuccess: (r) => { bao(r, 'Đã xoá vĩnh viễn'); onDone(); }, onError: (e) => window.alert(errorText(e)) });
  const busy = restore.isPending || purge.isPending;
  const q = loc.trim().toLowerCase();
  const view = q ? rows.filter((r) => `${r.key} ${r.label}`.toLowerCase().includes(q)) : rows;
  return (
    <Modal wide title={`Thùng rác — ${title}`} onClose={onClose} footer={<>
      <button className="btn" disabled={!canWrite || busy || !rows.length} onClick={() => { if (window.confirm(`Khôi phục hết ${rows.length} dòng?`)) restore.mutate({ all: true }); }}>Khôi phục hết</button>
      <button className="btn" disabled={!canPurge || busy || !rows.length} title={canPurge ? 'Bỏ hẳn mọi dòng trong thùng rác (cần mật khẩu)' : 'Cần quyền quản trị'}
        onClick={() => { const pw = window.prompt(`Xoá HẾT VĨNH VIỄN ${rows.length} dòng trong thùng rác ${title}? Không khôi phục được.\nNhập mật khẩu:`); if (pw) purge.mutate({ all: true, password: pw }); }}>Xoá hết vĩnh viễn</button>
      <button className="btn" onClick={onClose}>Đóng</button>
    </>}>
      <div className="row full" style={{ gap: 8, alignItems: 'center' }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Tìm mã, tên" value={loc} onChange={(e) => setLoc(e.target.value)} />
        <span className="muted">{rows.length} dòng{busy ? ' · đang xử lý…' : ''}</span>
      </div>
      {loading ? <Loading /> : !rows.length ? <div className="muted full" style={{ padding: 16, textAlign: 'center' }}>Thùng rác trống.</div> : (
        <div className="full" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <table className="grid full">
            <thead><tr><th style={{ width: 160 }}>Mã</th><th>Tên</th><th style={{ width: 150 }}>Xoá lúc</th><th style={{ width: 140 }}>Người xoá</th><th style={{ width: 210 }} /></tr></thead>
            <tbody>{view.slice(0, 500).map((r) => (
              <tr key={r.id}>
                <td>{r.key}</td><td>{r.label}</td><td>{new Date(r.deletedAt).toLocaleString('vi-VN')}</td><td>{r.deletedBy}</td>
                <td>
                  <button className="btn btn-sm" disabled={!canWrite || busy} onClick={() => restore.mutate({ ids: [r.id] })}>Khôi phục</button>{' '}
                  <button className="btn btn-sm" disabled={!canPurge || busy} title={canPurge ? 'Bỏ hẳn khỏi dữ liệu' : 'Cần quyền quản trị'}
                    onClick={() => { if (window.confirm(`Xoá vĩnh viễn ${r.key} - ${r.label}? Không khôi phục được.`)) purge.mutate({ ids: [r.id] }); }}>Xoá vĩnh viễn</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {view.length > 500 && <div className="muted" style={{ padding: 8 }}>Đang hiện 500 / {view.length} dòng — gõ tìm để lọc.</div>}
        </div>
      )}
    </Modal>
  );
}
