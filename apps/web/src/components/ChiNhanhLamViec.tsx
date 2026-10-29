/**
 * Chọn CHI NHÁNH ĐANG LÀM VIỆC (lib/workBranch): nút trên thanh trên cùng (hiện chi nhánh đang ở, bấm để chuyển) và màn Hệ
 * thống → HT04. Danh sách gõ tìm được (mã / tên, không dấu), xếp theo chi nhánh cha → shop; phím ↑ ↓ Enter để chọn nhanh.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { useWorkBranch, workBranch } from '@/lib/workBranch';
import { useBranches } from './filters';
import { Modal } from './ui';

interface Node { code: string; name: string; level: '' | 'branch' | 'shop'; parentCode: string | null; isActive: boolean }
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Danh sách chi nhánh theo cây (có phân cấp thì cha trước, shop sau, thụt vào); không đọc được cây thì danh sách phẳng. */
function useBranchList() {
  const flat = useBranches();
  const tree = useQuery({ queryKey: ['ton-max', 'hierarchy'], queryFn: () => api.get<{ branches: Node[] }>('/api/v1/stock/hierarchy'), staleTime: 60_000, retry: false });
  return useMemo(() => {
    const nodes: Node[] = tree.data?.branches ?? (flat.data ?? []).map((b) => ({ code: b.code, name: b.name, level: '' as const, parentCode: null, isActive: b.isActive }));
    const parents = nodes.filter((b) => b.level === 'branch');
    const out: (Node & { depth: number; parentName?: string })[] = [];
    for (const p of parents) {
      out.push({ ...p, depth: 0 });
      for (const s of nodes.filter((x) => x.parentCode === p.code)) out.push({ ...s, depth: 1, parentName: p.name });
    }
    for (const b of nodes.filter((x) => x.level !== 'branch' && !parents.some((p) => p.code === x.parentCode))) out.push({ ...b, depth: 0 });
    return out;
  }, [tree.data, flat.data]);
}

export function useWorkBranchName() {
  const code = useWorkBranch();
  const list = useBranchList();
  const b = list.find((x) => x.code === code);
  return { code, name: b?.name ?? '', node: b };
}

/** Bảng chọn chi nhánh (dùng trong hộp thoại và màn HT04). */
export function ChonChiNhanh({ onPicked, autoFocus = true }: { onPicked?: (code: string) => void; autoFocus?: boolean }) {
  const list = useBranchList();
  const current = useWorkBranch();
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => {
    const f = fold(q.trim());
    return list.filter((b) => (b.isActive || b.code === current) && (!f || fold(`${b.code} ${b.name} ${b.parentName ?? ''}`).includes(f)));
  }, [list, q, current]);
  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector('.cnlv-item.hi')?.scrollIntoView({ block: 'nearest' }); }, [hi]);
  const pick = (code: string) => { workBranch.set(code); onPicked?.(code); };
  const cur = list.find((b) => b.code === current);
  return (
    <div className="cnlv">
      <div className="cnlv-now">
        <MapPin size={15} /> Đang làm việc ở: {cur ? <b>{cur.code} · {cur.name}</b> : <span className="muted">chưa chọn — phiếu mới chưa tự điền chi nhánh</span>}
        {cur?.parentName && <span className="muted"> (thuộc {cur.parentName})</span>}
        {current && <button type="button" className="btn btn-xs" style={{ marginLeft: 'auto' }} onClick={() => pick('')}>Bỏ chọn</button>}
      </div>
      <input className="input" type="search" autoFocus={autoFocus} placeholder="Gõ mã hoặc tên chi nhánh (vd 08000, phu tho, lam thao)…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === 'Enter' && shown[hi]) { e.preventDefault(); pick(shown[hi]!.code); }
        }} />
      <div className="cnlv-list" ref={listRef}>
        {shown.map((b, i) => (
          <button type="button" key={b.code} className={`cnlv-item${b.code === current ? ' on' : ''}${i === hi ? ' hi' : ''}${b.depth ? ' shop' : ''}${b.level === 'branch' ? ' parent' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(b.code)}>
            <span className="mono">{b.code}</span> <span className="nm">{b.name}</span>
            {b.level === 'branch' && <span className="badge badge-warn">chi nhánh cha</span>}
            {b.code === current && <span className="badge badge-ok">đang ở</span>}
          </button>
        ))}
        {!shown.length && <div className="muted" style={{ padding: 8 }}>Không thấy chi nhánh nào.</div>}
      </div>
    </div>
  );
}

/** Nút trên thanh trên cùng: hiện chi nhánh đang ở, bấm để chuyển (phím tắt Alt + B). */
export function NutChiNhanh() {
  const { code, name } = useWorkBranchName();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.altKey && e.key.toLowerCase() === 'b') { e.preventDefault(); setOpen(true); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <>
      <button type="button" className={`cnlv-btn${code ? '' : ' empty'}`} onClick={() => setOpen(true)} title={`${code ? `Đang làm việc: ${code} ${name}` : 'Chưa chọn chi nhánh làm việc'} — phiếu mới tự điền chi nhánh này. Bấm để chuyển (Alt + B)`}>
        <MapPin size={15} /> <span>{code ? <><b>{code}</b><span className="cnlv-name"> {name}</span></> : <>Chọn chi nhánh<span className="cnlv-name"> làm việc</span></>}</span>
      </button>
      {open && <Modal title="Chuyển chi nhánh làm việc" onClose={() => setOpen(false)} footer={<button className="btn" onClick={() => setOpen(false)}>Đóng</button>}>
        <div className="full"><ChonChiNhanh onPicked={() => setOpen(false)} /></div>
      </Modal>}
    </>
  );
}
