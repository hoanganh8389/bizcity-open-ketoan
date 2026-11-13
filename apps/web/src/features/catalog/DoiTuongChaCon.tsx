// [2026-11-13 Nguyễn Văn Thủy] Nhà cung cấp / khách hàng theo cha – con: xem dạng cây, ô Đơn vị cha, danh sách đơn vị con, lịch sử (đóng góp)
/**
 * Cha – con của đối tượng (0132): một nhà cung cấp / khách hàng lớn có công ty mẹ và các chi nhánh (cùng hoặc khác MST).
 *   - Chứng từ ghi vào ĐƠN VỊ NHỎ NHẤT (đơn vị xuất / nhận hoá đơn); cha dùng để gom doanh số, công nợ, tính thưởng.
 *   - Mã đơn vị con = mã cha-001, -002… do máy cấp; định danh dt_… không đổi.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, GitBranch, Plus } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { ErrorBox, Hoi, Loading } from '@/components/ui';
import { PartnerPicker } from '@/components/pickers';
import './co-cau.css';

export interface PartnerNode {
  code: string; name: string; kind: string; taxCode: string | null; isActive: boolean; alsoKinds?: string[];
  parentCode?: string | null; parentName?: string | null; childCount?: number;
}
const KIND: Record<string, string> = { customer: 'Khách hàng', supplier: 'Nhà cung cấp', employee: 'Nhân viên', internal: 'Nội bộ', other: 'Khác' };
const vaiTro = (p: PartnerNode) => [KIND[p.kind] ?? p.kind, ...(p.alsoKinds ?? []).map((k) => KIND[k] ?? k)].join(' + ');
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Bảng cây cha – con: bấm dòng mở / đóng, bấm đúp mở hồ sơ. Mặc định chỉ hiện đơn vị có cha – con, tích để hiện tất cả. */
export function CayDoiTuong<T extends PartnerNode>({ rows, selected, onSelect, onOpen }: { rows: T[]; selected?: string; onSelect: (p: T) => void; onOpen: (p: T) => void }) {
  const [onlyFamily, setOnlyFamily] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { roots, kids, byCode } = useMemo(() => {
    const byCode = new Map(rows.map((r) => [r.code, r]));
    const kids = new Map<string, T[]>();
    const roots: T[] = [];
    for (const r of rows) {
      if (r.parentCode && byCode.has(r.parentCode)) kids.set(r.parentCode, [...(kids.get(r.parentCode) ?? []), r]);
      else roots.push(r);
    }
    return { roots, kids, byCode };
  }, [rows]);
  const words = plain(q).split(/\s+/).filter(Boolean);
  // Tìm: giữ dòng khớp và mọi cấp cha của nó, mở sẵn nhánh.
  const hit = useMemo(() => {
    if (!words.length) return null;
    const keep = new Set<string>();
    for (const r of rows) if (words.every((w) => plain(`${r.code} ${r.name} ${r.taxCode ?? ''}`).includes(w))) {
      let x: T | undefined = r;
      for (let i = 0; x && i < 20; i++) { keep.add(x.code); x = x.parentCode ? byCode.get(x.parentCode) : undefined; }
    }
    return keep;
  }, [q, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (c: string) => setOpen((o) => { const s = new Set(o); if (s.has(c)) s.delete(c); else s.add(c); return s; });
  const total = (c: string): number => (kids.get(c) ?? []).reduce((n, k) => n + 1 + total(k.code), 0);
  const out: ReactNode[] = [];
  const walk = (list: T[], depth: number) => {
    for (const r of list) {
      if (hit && !hit.has(r.code)) continue;
      const ks = kids.get(r.code) ?? [];
      if (!hit && depth === 0 && onlyFamily && !ks.length) continue;
      const o = hit ? true : open.has(r.code);
      out.push(
        <tr key={r.code} className={`cc-tr${selected === r.code ? ' on' : ''}${r.isActive ? '' : ' muted'}`} onClick={() => { onSelect(r); if (ks.length && !hit) toggle(r.code); }} onDoubleClick={() => onOpen(r)} title="Bấm: mở / đóng · bấm đúp: xem / sửa">
          <td>
            <div className="cc-cell" style={{ paddingLeft: depth * 20 }}>
              <button type="button" className="cc-tog" disabled={!ks.length} onClick={(e) => { e.stopPropagation(); toggle(r.code); }}>{ks.length ? (o ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}</button>
              <span className="mono">{r.code}</span>
            </div>
          </td>
          <td className="cc-name">{depth === 0 && ks.length > 0 ? <b>{r.name}</b> : r.name}{ks.length > 0 && !o && <span className="cc-count" title="Số đơn vị con (mọi cấp)">{total(r.code)}</span>}</td>
          <td>{depth === 0 ? (ks.length ? 'Đơn vị mẹ' : 'Đơn vị độc lập') : `Đơn vị con cấp ${depth}`}</td>
          <td className="mono">{r.taxCode ?? ''}</td>
          <td>{vaiTro(r)}</td>
          <td style={{ textAlign: 'center' }}><input type="checkbox" readOnly checked={r.isActive} tabIndex={-1} /></td>
        </tr>,
      );
      if (o) walk(ks, depth + 1);
    }
  };
  walk(roots, 0);
  const families = roots.filter((r) => kids.has(r.code)).length;
  return (
    <>
      <div className="cc-filter">
        <input className="input" style={{ width: 300 }} placeholder="Tìm mã, tên, MST" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="checkbox"><input type="checkbox" checked={onlyFamily} onChange={(e) => setOnlyFamily(e.target.checked)} /> Chỉ hiện đơn vị có đơn vị con ({families})</label>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(new Set([...kids.keys()]))}>Mở hết</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(new Set())}>Thu gọn</button>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Bấm một dòng: mở / đóng · bấm đúp: xem / sửa</span>
      </div>
      <div className="table-wrap cc-table">
        <table className="grid">
          <thead><tr>
            <th style={{ width: 260 }} title="Mã; đơn vị con mang mã cha + đuôi -001, -002…">Mã</th><th title="Tên trên hoá đơn">Tên</th>
            <th style={{ width: 150 }} title="Đơn vị mẹ có đơn vị con; đơn vị con tính cấp theo cây">Cấp</th><th style={{ width: 140 }} title="Mã số thuế">MST</th>
            <th style={{ width: 180 }} title="Nhà cung cấp, khách hàng hay cả hai">Vai trò</th><th style={{ width: 70 }} title="Đang dùng">Theo dõi</th>
          </tr></thead>
          <tbody>{out.length ? out : <tr><td colSpan={6} className="muted" style={{ padding: 16, textAlign: 'center' }}>{onlyFamily && !hit ? 'Chưa có đơn vị nào có đơn vị con — mở một đơn vị, bấm "Thêm đơn vị con"; hoặc bỏ tích để xem tất cả.' : 'Không có dòng khớp.'}</td></tr>}</tbody>
        </table>
      </div>
    </>
  );
}

/** Ô Đơn vị cha trong hồ sơ: chọn công ty mẹ; thêm mới thì mã tự thành mã cha-00x. */
export function ODonViCha({ value, onChange, self, isNew, disabled }: { value: string | null | undefined; onChange: (code: string | null) => void; self?: string; isNew: boolean; disabled?: boolean }) {
  return (
    <div className="field full">
      <label>Thuộc đơn vị cha <Hoi text={'Chọn khi đối tượng này là chi nhánh / đơn vị con của một nhà cung cấp hoặc khách hàng lớn (vd Công ty mẹ → Chi nhánh Hà Nội). '
        + 'Phiếu, hoá đơn vẫn ghi vào đúng đơn vị này; đơn vị cha dùng để cộng gộp doanh số, công nợ và tính thưởng cho cả nhóm.'
        + (isNew ? ' Chọn cha thì mã tự thành "mã cha-001", "-002"…' : '')} /></label>
      <div className="row" style={{ gap: 6 }}>
        <div style={{ flex: 1 }}><PartnerPicker value={value ?? ''} onChange={(c) => onChange(c && c !== self ? c : null)} disabled={disabled} placeholder="Không có — là đơn vị độc lập / đơn vị mẹ" /></div>
        {value && !disabled && <button type="button" className="btn btn-sm" title="Bỏ đơn vị cha" onClick={() => onChange(null)}>Bỏ</button>}
      </div>
    </div>
  );
}

/** Thẻ Đơn vị con: danh sách con trực tiếp, bấm đúp mở, nút thêm con. */
export function DonViCon({ code, onOpen, onAdd }: { code: string; onOpen?: (code: string) => void; onAdd?: () => void }) {
  const q = useQuery({ queryKey: ['partners', 'children', code], queryFn: () => api.get<(PartnerNode & { address: string | null })[]>(`/api/v1/partners/${encodeURIComponent(code)}/children`), enabled: Boolean(code) });
  const rows = q.data ?? [];
  return (
    <fieldset className="fgroup full" data-view-ok>
      <legend><GitBranch size={13} style={{ verticalAlign: -2 }} /> Đơn vị con ({rows.length}) <Hoi text="Chi nhánh / đơn vị trực thuộc. Mỗi đơn vị con có mã riêng (mã cha-001…), lập phiếu và nhận hoá đơn riêng; số liệu cộng lên đơn vị này." /></legend>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <div className="full">
          {rows.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 200 }}>
              <table className="grid">
                <thead><tr><th style={{ width: 150 }}>Mã</th><th>Tên</th><th style={{ width: 130 }}>MST</th><th style={{ width: 70 }} title="Số đơn vị con của dòng này">Con</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.code} className={r.isActive ? '' : 'muted'} style={{ cursor: onOpen ? 'pointer' : undefined }} onDoubleClick={() => onOpen?.(r.code)} title={onOpen ? 'Bấm đúp để mở' : undefined}>
                    <td className="mono">{r.code}</td><td>{r.name}</td><td className="mono">{r.taxCode ?? ''}</td><td className="num">{r.childCount || ''}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center' }}>
            {onAdd && <button type="button" className="btn btn-sm" onClick={onAdd}><Plus size={13} /> Thêm đơn vị con</button>}
            {!rows.length && <span className="muted" style={{ fontSize: 12.5 }}>Chưa có đơn vị con.</span>}
            {rows.length > 0 && onOpen && <span className="muted" style={{ fontSize: 12 }}>Bấm đúp một dòng để mở</span>}
          </div>
        </div>
      )}
    </fieldset>
  );
}

interface HistoryLine { at: string; by: string; action: string; changes: string[] }
/** Lịch sử thay đổi của đối tượng: ai, lúc nào, đổi ô nào từ gì sang gì. */
export function LichSuDoiTuong({ code }: { code: string }) {
  const q = useQuery({ queryKey: ['co-cau-history', 'partner', code], queryFn: () => api.get<HistoryLine[]>('/api/v1/co-cau/history', { type: 'partner', code }), enabled: Boolean(code) });
  const t = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  const rows = q.data ?? [];
  return (
    <fieldset className="fgroup full" data-view-ok>
      <legend>Lịch sử thay đổi</legend>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : !rows.length ? <div className="muted full" style={{ fontSize: 13 }}>Chưa có thay đổi nào được ghi nhận.</div> : (
        <div className="table-wrap full" style={{ maxHeight: 200 }}>
          <table className="grid cc-log">
            <thead><tr><th title="Thời điểm ghi">Thời gian</th><th title="Người thực hiện">Người làm</th><th title="Việc đã làm">Việc</th><th title="Ô đã đổi: giá trị cũ → giá trị mới">Thay đổi</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}><td className="mono" style={{ whiteSpace: 'nowrap' }}>{t(r.at)}</td><td>{r.by}</td><td>{r.action}</td>
                <td>{r.changes.length ? r.changes.map((c, j) => <div key={j}>{c}</div>) : <span className="muted">—</span>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </fieldset>
  );
}
