// [2026-11-05 11:50 PM Nguyễn Văn Thủy] MENU — trang Báo cáo chung: phân loại bên trái, thẻ báo cáo, ô tìm, thẻ đã ghim (đóng góp)
/**
 * BÁO CÁO: mọi báo cáo, sổ sách gom một trang thay vì nằm rải trong menu. Bên trái chọn loại, bên phải các thẻ báo cáo,
 * bấm thẻ để mở. Danh sách lấy từ bố trí menu (menu-gon.ts) nên tự theo quyền và phân hệ đang bật.
 * Mở từ một nhóm thì địa chỉ có ?nhom=<nhóm> và trang lọc sẵn theo nhóm đó.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Pin, PinOff, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useAppMenu } from '../../layout/useAppMenu';
import { useGonGroups } from '../../layout/useGon';
import { usePins } from '../../layout/pins';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export function BaoCaoChungPage() {
  const groups = useGonGroups(useAppMenu()).filter((g) => g.reports.length);
  const [sp, setSp] = useSearchParams();
  const { isPinned, toggle } = usePins();
  const nhom = sp.get('nhom');
  const [q, setQ] = useState('');
  const [chiGhim, setChiGhim] = useState(false);
  const shown = useMemo(() => {
    const k = norm(q.trim());
    const seen = new Set<string>();
    return groups
      .filter((g) => !nhom || g.key === nhom)
      .map((g) => ({
        ...g,
        reports: g.reports
          .map((s) => ({
            ...s,
            // Một báo cáo xếp ở nhiều nhóm thì khi xem tất cả chỉ hiện một lần.
            items: s.items.filter((m) => (!k || norm(`${m.label} ${m.code ?? ''}`).includes(k)) && (!chiGhim || isPinned(m.key)) && (nhom ? true : !seen.has(m.path!) && Boolean(seen.add(m.path!)))),
          }))
          .filter((s) => s.items.length),
      }))
      .filter((g) => g.reports.length);
  }, [groups, nhom, q, chiGhim, isPinned]);
  const pick = (key: string | null) => setSp(key ? { nhom: key } : {}, { replace: true });
  return (
    <>
      <PageHeader title="Báo cáo" helpKey="bao-cao-chung" subtitle="Tất cả báo cáo, sổ sách theo từng loại" />
      <div className="gon-bc">
        <nav className="card gon-bc-loai" aria-label="Loại báo cáo">
          <button type="button" className={!nhom ? 'active' : ''} onClick={() => pick(null)}>Tất cả</button>
          {groups.map((g) => <button key={g.key} type="button" className={nhom === g.key ? 'active' : ''} onClick={() => pick(g.key)}>{g.label}</button>)}
        </nav>
        <div style={{ minWidth: 0 }}>
          <div className="gon-bc-tim">
            <label className="gon-bc-o"><Search size={14} /><input className="input" placeholder="Tìm báo cáo theo tên hoặc mã" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <label title="Chỉ hiện các báo cáo đã ghim lên thanh trên cùng"><input type="checkbox" checked={chiGhim} onChange={(e) => setChiGhim(e.target.checked)} /> Đã ghim</label>
          </div>
          {!shown.length && <div className="card card-body muted">Không có báo cáo phù hợp.</div>}
          {shown.map((g) => g.reports.map((s) => (
            <section key={`${g.key}:${s.label}`} className="gon-bc-sec">
              <h3>{s.label}</h3>
              <div className="gon-bc-the">
                {s.items.map((m) => (
                  <div key={m.key} className="card gon-bc-card">
                    <Link to={m.path!} title={m.code ? `Mở ${m.label} (${m.code})` : `Mở ${m.label}`}>{m.label}</Link>
                    <div className="gon-bc-chan">
                      <small className="muted">{m.code}</small>
                      <button type="button" className="btn btn-sm btn-ghost" title={isPinned(m.key) ? 'Bỏ ghim khỏi thanh trên cùng' : 'Ghim lên thanh trên cùng (báo cáo hay dùng)'} onClick={() => toggle(m.key)}>
                        {isPinned(m.key) ? <PinOff size={14} /> : <Pin size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )))}
        </div>
      </div>
    </>
  );
}
