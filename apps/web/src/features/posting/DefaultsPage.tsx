// [2026-11-13 Nguyễn Văn Thủy] Tài khoản ngầm định theo LOẠI chứng từ: danh sách loại, mỗi loại có các cột tài khoản với danh sách lọc + mặc định (0126) (đóng góp)
/**
 * TÀI KHOẢN NGẦM ĐỊNH (ACC41)
 *   Danh sách: Loại · TK Nợ · TK Có (mặc định). Lọc theo nhóm loại chứng từ, tìm theo tên / tài khoản.
 *   Sửa: bảng Tên cột · Lọc tài khoản (vd 111; 641) · TK ngầm định. Dòng chứng từ chọn loại → điền mặc định, chỉ chọn được trong lọc.
 *   Cột bộ định khoản tự dùng (phải thu khách, doanh thu, kho, giá vốn…) đổi ở đây là đổi cho mọi chứng từ ghi sau.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { plain } from '@/components/pickers';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import { AccountPicker } from '@/components/pickers';

export interface AdColumn { key: string; caption: string; filter: string[]; default: string; bind?: string }
export interface AdType { code: string; group: string; name: string; columns: AdColumn[]; isActive: boolean; updatedBy: string; updatedAt: string }

/** Danh sách loại (dùng chung: màn này và dòng chứng từ). */
export const useAccountDefaultTypes = () => useQuery({ queryKey: ['account-default-types'], queryFn: () => api.get<AdType[]>('/api/v1/account-default-types'), staleTime: 60_000 });

const debitOf = (t: AdType) => t.columns.find((c) => c.key === 'debit_account');
const creditOf = (t: AdType) => t.columns.find((c) => c.key === 'credit_account');

export function DefaultsPage() {
  const { can } = useAuth();
  const canWrite = can('settings:write');
  const qc = useQueryClient();
  const q = useAccountDefaultTypes();
  const [group, setGroup] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<AdType | null>(null);
  const groups = useMemo(() => [...new Set((q.data ?? []).map((t) => t.group))], [q.data]);
  const s = plain(search.trim());
  const rows = (q.data ?? []).filter((t) => (!group || t.group === group)
    && (!s || plain(t.name).includes(s) || t.columns.some((c) => c.default.startsWith(s) || c.filter.some((f) => f.startsWith(s)))));
  const restore = useMutation({
    mutationFn: () => api.post('/api/v1/account-default-types/restore', { confirm: true }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['account-default-types'] }),
  });

  return (
    <>
      <PageHeader title="Tài khoản ngầm định" code="ACC41" helpKey="tai-khoan-ngam-dinh" />
      <div className="card">
        <div className="catalog-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: 6 }}>Loại chứng từ
            <select className="select input" style={{ width: 200 }} value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Tất cả</option>{groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <input className="input" style={{ width: 260 }} placeholder="Tìm kiếm" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => void q.refetch()} title="Nạp lại"><RefreshCw size={14} /></button>
          {canWrite && <button className="btn btn-sm" disabled={restore.isPending} title="Đặt lại danh sách lọc và tài khoản mặc định theo dữ liệu gốc"
            onClick={() => window.confirm('Quay về dữ liệu gốc tài khoản ngầm định?\n\nDanh sách lọc và tài khoản mặc định của mọi loại đặt lại như ban đầu (các tài khoản bộ định khoản đang dùng giữ nguyên).') && restore.mutate()}>
            <RotateCcw size={14} /> Quay về dữ liệu gốc</button>}
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : restore.error ? errorText(restore.error) : null} />
        {q.isLoading ? <Loading /> : (
          <div className="table-wrap"><table className="grid">
            <thead><tr>
              <th>Loại</th>
              <th style={{ width: 120 }} title="Tài khoản ghi Nợ mặc định">TK Nợ</th>
              <th style={{ width: 120 }} title="Tài khoản ghi Có mặc định">TK Có</th>
              <th style={{ width: 80 }}>Chức năng</th>
            </tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.code} onDoubleClick={() => setOpen(t)} style={{ cursor: 'pointer' }}>
                  <td>{t.name}{!group && <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{t.group}</span>}</td>
                  <td className="mono">{debitOf(t)?.default ?? ''}</td>
                  <td className="mono">{creditOf(t)?.default ?? ''}</td>
                  <td><button className="link" onClick={() => setOpen(t)}>{canWrite ? 'Sửa' : 'Xem'}</button></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="muted">Không có loại nào khớp.</td></tr>}
            </tbody>
          </table></div>
        )}
        <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>Tổng số: {rows.length}</div>
      </div>
      {open && <SuaLoai type={open} canWrite={canWrite} onClose={() => setOpen(null)} />}
    </>
  );
}

const splitFilter = (s: string) => [...new Set(s.split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean))];

function SuaLoai({ type, canWrite, onClose }: { type: AdType; canWrite: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [cols, setCols] = useState(type.columns.map((c) => ({ ...c, filterText: c.filter.join('; ') })));
  const set = (key: string, patch: Partial<(typeof cols)[number]>) => setCols((xs) => xs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const bad = (c: (typeof cols)[number]) => {
    const f = splitFilter(c.filterText);
    if (f.some((x) => !/^[0-9]+$/.test(x))) return 'Lọc chỉ gồm số tài khoản, cách nhau bằng dấu ;';
    if (c.default && f.length && !f.some((x) => c.default.startsWith(x))) return `${c.default} không nằm trong danh sách lọc`;
    if (c.bind && !c.default) return 'Cần tài khoản mặc định';
    return '';
  };
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/account-default-types/${encodeURIComponent(type.code)}`, { columns: cols.map((c) => ({ key: c.key, filter: splitFilter(c.filterText), default: c.default })) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['account-default-types'] }); void qc.invalidateQueries({ queryKey: ['posting-defaults'] }); onClose(); },
  });
  const anyBad = cols.some((c) => bad(c));
  return (
    <Modal wide title="Sửa tài khoản ngầm định" viewFirst onClose={onClose}
      footer={<>
        {canWrite && <button className="btn btn-primary" disabled={save.isPending || anyBad} onClick={() => save.mutate()}>Ghi</button>}
        <button className="btn" onClick={onClose}>Huỷ</button>
      </>}>
      <div className="full" style={{ marginBottom: 8 }}>Loại chứng từ: <b>{type.name}</b></div>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
      <table className="grid full">
        <thead><tr><th style={{ width: 200 }}>Tên cột</th><th title="Tài khoản được chọn trên dòng chứng từ, theo đầu số, cách nhau bằng dấu ; — để trống là chọn được mọi tài khoản">Lọc tài khoản</th><th style={{ width: 220 }}>TK ngầm định</th></tr></thead>
        <tbody>{cols.map((c) => {
          const err = bad(c);
          return (
            <tr key={c.key}>
              <td title={c.bind ? 'Chứng từ tự hạch toán dùng tài khoản mặc định của cột này' : undefined}>{c.caption}</td>
              <td>
                <input className={`input mono${err && err.startsWith('Lọc') ? ' input-bad' : ''}`} value={c.filterText} readOnly={!canWrite} onChange={(e) => set(c.key, { filterText: e.target.value })} />
              </td>
              <td>
                <AccountPicker postingOnly prefixes={splitFilter(c.filterText)} value={c.default} onChange={(v) => set(c.key, { default: v })} disabled={!canWrite} />
                {err && <div className="neg" style={{ fontSize: 12, marginTop: 2, fontWeight: 600 }}>{err}</div>}
              </td>
            </tr>
          );
        })}</tbody>
      </table>
    </Modal>
  );
}
