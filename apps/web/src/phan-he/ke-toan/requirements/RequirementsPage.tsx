/**
 * Yêu cầu nghiệp vụ của công ty và tình trạng đáp ứng (YC01: Tài chính – Kế toán).
 * Dữ liệu ở finance-requirements.ts (lập trình viên cập nhật mỗi khi làm xong một phần).
 *  - Tổng quan tiến độ: số yêu cầu đã đáp ứng / một phần / chưa / chờ đầu vào; tỷ lệ tính năng đã có.
 *  - Bảng theo từng mục của file yêu cầu; bấm một dòng để xem từng tính năng, phần mềm đã làm gì,
 *    mở màn hình liên quan, đọc hướng dẫn sử dụng.
 *  - Xuất Excel đúng bố cục file yêu cầu, thêm cột trạng thái, ghi chú, màn hình, hướng dẫn.
 */
import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MenuItem } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { HelpDrawer } from '@/components/HelpDrawer';
import { CORE_MENU } from '@/layout/menu';
import { listGuides } from '@/help/guides';
import { FINANCE_REQUIREMENTS, REQ_GROUPS, requirementStatus, type FeatureStatus, type Requirement } from './finance-requirements';

const GUIDE_TITLE = new Map(listGuides().map((g) => [g.key, g.title]));

const STATUS: Record<FeatureStatus, { label: string; badge: string; icon: string }> = {
  done: { label: 'Đã đáp ứng', badge: 'badge-ok', icon: '✓' },
  partial: { label: 'Một phần', badge: 'badge-warn', icon: '◐' },
  todo: { label: 'Chưa làm', badge: 'badge-gray', icon: '○' },
  waiting: { label: 'Chờ đầu vào', badge: 'badge-gray', icon: '⏳' },
};

/** Mã màn → tên, đường dẫn (lấy từ menu; màn chưa làm thì không có đường dẫn). */
function useScreens() {
  return useMemo(() => {
    const map = new Map<string, { label: string; path?: string }>();
    const walk = (items: MenuItem[]) => items.forEach((m) => { if (m.code && !map.has(m.code)) map.set(m.code, { label: m.label, path: m.path }); if (m.children) walk(m.children); });
    walk(CORE_MENU);
    return map;
  }, []);
}

export function RequirementsPage() {
  const navigate = useNavigate();
  const screens = useScreens();
  const [group, setGroup] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [guide, setGuide] = useState<string | null>(null);
  const all = FINANCE_REQUIREMENTS;
  const s = search.trim().toLowerCase();
  const rows = all.filter((r) => (!group || r.group === group) && (!status || requirementStatus(r) === status)
    && (!s || `${r.code} ${r.name} ${r.solution} ${r.features.map((x) => `${x.text} ${x.note ?? ''}`).join(' ')}`.toLowerCase().includes(s)));
  const count = (st: FeatureStatus) => all.filter((r) => requirementStatus(r) === st).length;
  const features = all.flatMap((r) => r.features);
  const featureDone = features.filter((x) => x.status === 'done').length;
  const featurePartial = features.filter((x) => x.status === 'partial').length;
  const pct = Math.round(((featureDone + featurePartial / 2) / features.length) * 100);
  const toggle = (code: string) => setOpen((o) => { const n = new Set(o); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const aoa: (string | number)[][] = [['Mục', 'Chức năng', 'Tính năng yêu cầu', 'Trạng thái', 'Ghi chú', 'Đã đáp ứng thế nào', 'Màn hình', 'Hướng dẫn', 'Phần còn lại', 'Cập nhật']];
    for (const g of REQ_GROUPS) {
      const items = all.filter((r) => r.group === g.key);
      if (!items.length) continue;
      aoa.push([g.label]);
      for (const r of items) {
        r.features.forEach((x, i) => aoa.push([
          i === 0 ? r.code : '', i === 0 ? r.name : '', x.text, STATUS[x.status].label, x.note ?? '',
          i === 0 ? r.solution : '', i === 0 ? r.screens.map((c) => `${c} ${screens.get(c)?.label ?? ''}`.trim()).join('; ') : '',
          i === 0 ? r.guides.map((g) => GUIDE_TITLE.get(g) ?? g).join('; ') : '', i === 0 ? r.plan ?? '' : '', i === 0 ? r.updated : '',
        ]));
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 60 }, { wch: 14 }, { wch: 50 }, { wch: 80 }, { wch: 40 }, { wch: 30 }, { wch: 16 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TaiChinh-KeToan');
    XLSX.writeFile(wb, `yeu-cau-tai-chinh-ke-toan-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <>
      <PageHeader title="Yêu cầu nghiệp vụ Tài chính – Kế toán" code="YC01" helpKey="yeu-cau-nghiep-vu"
        subtitle="Từng yêu cầu trong file yêu cầu của công ty (sheet TaiChinh-KeToan): đã đáp ứng tới đâu, dùng ở màn nào, hướng dẫn ở đâu"
        actions={<button className="btn" onClick={() => void exportExcel()}>Xuất Excel</button>} />
      <div className="card">
        <div className="row" style={{ padding: '14px 16px 4px', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <div className="muted" style={{ marginBottom: 4 }}>Tính năng đã đáp ứng: <b>{featureDone}</b> / {features.length} (một phần: {featurePartial}) — tiến độ khoảng <b>{pct}%</b></div>
            <div style={{ height: 8, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand-500)' }} /></div>
          </div>
          {(['done', 'partial', 'todo', 'waiting'] as FeatureStatus[]).map((st) => (
            <button key={st} className={`btn btn-sm ${status === st ? 'btn-primary' : ''}`} onClick={() => setStatus(status === st ? '' : st)} title="Bấm để lọc">
              {STATUS[st].icon} {STATUS[st].label}: <b style={{ marginLeft: 4 }}>{count(st)}</b>
            </button>
          ))}
        </div>
        <div className="filters">
          <div className="field">
            <label>Nhóm</label>
            <select className="select input" value={group} onChange={(e) => setGroup(e.target.value)}><option value="">Tất cả</option>{REQ_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select>
          </div>
          <div className="field">
            <label>Trạng thái</label>
            <select className="select input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả</option>{(Object.keys(STATUS) as FeatureStatus[]).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}</select>
          </div>
          <div className="field"><label>Tìm</label><input className="input w-lg" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mã, chức năng, tính năng, ghi chú…" /></div>
          <div className="field"><label>&nbsp;</label>
            <div className="row" style={{ height: 34, gap: 6 }}>
              <button className="btn btn-sm" onClick={() => setOpen(new Set(rows.map((r) => r.code)))}>Mở hết</button>
              <button className="btn btn-sm" onClick={() => setOpen(new Set())}>Thu hết</button>
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th style={{ width: 90 }}>Mục</th><th>Chức năng</th><th style={{ width: 130 }}>Trạng thái</th><th style={{ width: 90 }} className="num">Tính năng</th><th>Màn hình</th><th style={{ width: 120 }}>Phần còn lại</th></tr></thead>
            <tbody>
              {REQ_GROUPS.map((g) => {
                const items = rows.filter((r) => r.group === g.key);
                if (!items.length) return null;
                return (
                  <Fragment key={g.key}>
                    <tr><td colSpan={6} style={{ background: 'var(--brand-50)', fontWeight: 700 }}>{g.label}</td></tr>
                    {items.map((r) => <ReqRow key={r.code} r={r} open={open.has(r.code)} onToggle={() => toggle(r.code)} screens={screens} onOpenScreen={(p) => navigate(p)} onGuide={setGuide} />)}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && <div className="muted" style={{ padding: 16 }}>Không có yêu cầu nào khớp.</div>}
      </div>
      {guide && <HelpDrawer guideKey={guide} onClose={() => setGuide(null)} />}
    </>
  );
}

function ReqRow({ r, open, onToggle, screens, onOpenScreen, onGuide }: { r: Requirement; open: boolean; onToggle: () => void; screens: Map<string, { label: string; path?: string }>; onOpenScreen: (path: string) => void; onGuide: (key: string) => void }) {
  const st = requirementStatus(r);
  const done = r.features.filter((x) => x.status === 'done').length;
  const chip = (code: string) => {
    const s = screens.get(code);
    return s?.path
      ? <button key={code} className="btn btn-sm" style={{ marginRight: 4, marginBottom: 2 }} title={s.label} onClick={(e) => { e.stopPropagation(); onOpenScreen(s.path!); }}><span className="mono">{code}</span> {s.label}</button>
      : <span key={code} className="badge badge-gray" style={{ marginRight: 4 }} title="Màn chưa làm">{code}</span>;
  };
  return (
    <>
      <tr className="clickable" onClick={onToggle}>
        <td className="mono">{open ? '▾' : '▸'} {r.code}</td>
        <td>{r.name}</td>
        <td><span className={`badge ${STATUS[st].badge}`}>{STATUS[st].icon} {STATUS[st].label}</span></td>
        <td className="num">{done}/{r.features.length}</td>
        <td>{r.screens.map(chip)}</td>
        <td className="muted">{st === 'done' ? '' : r.plan ?? ''}</td>
      </tr>
      {open && (
        <tr>
          <td />
          <td colSpan={5} style={{ background: 'var(--surface)', paddingBottom: 14 }}>
            <table className="grid" style={{ marginBottom: 10 }}>
              <thead><tr><th>Tính năng yêu cầu</th><th style={{ width: 130 }}>Trạng thái</th><th>Ghi chú</th></tr></thead>
              <tbody>
                {r.features.map((x, i) => (
                  <tr key={i}>
                    <td>{x.text}</td>
                    <td><span className={`badge ${STATUS[x.status].badge}`}>{STATUS[x.status].icon} {STATUS[x.status].label}</span></td>
                    <td className="muted">{x.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginBottom: 8 }}><b>Phần mềm đã đáp ứng:</b> {r.solution}</div>
            {r.guides.length > 0 && (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <b>Hướng dẫn sử dụng:</b>
                {r.guides.map((g) => (GUIDE_TITLE.has(g) ? <button key={g} className="btn btn-sm" onClick={() => onGuide(g)}>{GUIDE_TITLE.get(g)}</button> : <span key={g} className="badge badge-gray" title={`Chưa có tệp docs/huong-dan/${g}.md`}>{g} (chưa viết)</span>))}
              </div>
            )}
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>Cập nhật {r.updated}{r.plan && st !== 'done' ? ` · phần còn lại dự kiến: ${r.plan}` : ''}</div>
          </td>
        </tr>
      )}
    </>
  );
}
