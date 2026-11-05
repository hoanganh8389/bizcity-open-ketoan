// [2026-11-06 02:10 AM Nguyễn Văn Thủy] MENU — Tổng quan thành bảng điều hành: truy cập nhanh, tình hình tài chính, banner, lịch việc (đóng góp)
/**
 * TỔNG QUAN (/): bảng điều hành, không lặp lại menu.
 *  - Truy cập nhanh: thẻ Phân hệ (nhóm việc, icon gọn) và thẻ Hay dùng (tự nhớ theo số lần mở màn).
 *  - Tình hình tài chính: số thật lấy từ báo cáo. Tiền, phải thu, phải trả từ cân đối phát sinh; doanh thu, chi phí, lợi nhuận từ B02-DN.
 *  - Lịch: ngày có việc có chấm. Việc có ngày là đợt phải trả NCC và việc cuối tháng; ngày hôm nay kèm việc cần làm của thanh mép phải.
 * Số liệu chưa có quyền xem thì hiện "—", không chặn các phần khác của trang.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, CircleDollarSign, HelpCircle, Landmark, Pin, Receipt, RefreshCw, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { HelpDrawer } from '@/components/HelpDrawer';
import { KhoiAnh } from '../system/image-blocks';
import { useAppMenu, useEnabledModules } from '../../layout/useAppMenu';
import { useGonGroups } from '../../layout/useGon';
import { GonIcon } from '../../layout/SideNav';
import { groupCount, REPORT_PAGE } from '../../layout/menu-gon';
import { useHayDung } from '../../layout/hay-dung';
import { useViec, viecOf } from '../../layout/rail/useViec';
import { ViecRow } from '../../layout/rail/ViecPanel';
import { sdkSlots } from '../../phan-he/sdk-modules';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function TruyCapNhanh() {
  const navigate = useNavigate();
  const menu = useAppMenu();
  const groups = useGonGroups(menu);
  const hay = useHayDung(menu);
  const [the, setThe] = useState<'nhom' | 'hay'>('nhom');
  return (
    <section className="card tq-card">
      <div className="tq-head"><h3>Truy cập nhanh</h3></div>
      <div className="tq-tabs" role="tablist">
        <button role="tab" aria-selected={the === 'nhom'} className={the === 'nhom' ? 'active' : ''} onClick={() => setThe('nhom')}>Phân hệ</button>
        <button role="tab" aria-selected={the === 'hay'} className={the === 'hay' ? 'active' : ''} title="Màn đã ghim, rồi tới màn bạn mở nhiều nhất trên máy này" onClick={() => setThe('hay')}>Hay dùng</button>
      </div>
      {the === 'nhom' ? (
        <div className="tq-apps">
          {groups.map((g) => (
            <button key={g.key} type="button" title={`${g.description} (${groupCount(g)} chức năng)`} onClick={() => navigate(g.home)}>
              <span style={{ color: g.color, background: `${g.color}1a` }}><GonIcon name={g.icon} size={22} /></span>{g.label}
            </button>
          ))}
          <button type="button" title="Tất cả báo cáo, sổ sách" onClick={() => navigate(REPORT_PAGE)}>
            <span style={{ color: '#2a6cc4', background: '#2a6cc41a' }}><BarChart3 size={22} /></span>Báo cáo
          </button>
        </div>
      ) : hay.length ? (
        <>
          <div className="tq-hay">{hay.map(({ item: m, count, pinned }) => <Link key={m.key} to={m.path!} title={`${m.code ? `${m.label} (${m.code})` : m.label}. ${pinned ? 'Đã ghim. ' : ''}Đã mở ${count} lần trên máy này.`}>{pinned && <Pin size={12} />}{m.label}</Link>)}</div>
          <div className="tq-note">Tự xếp theo màn đã ghim và số lần mở trên máy này</div>
        </>
      ) : <div className="tq-empty">Chưa có. Ghim một màn ở menu trái hoặc mở vài màn, danh sách sẽ tự có.</div>}
    </section>
  );
}

interface ChartDay { day: string; revenue: number }
/** Một chuỗi: doanh thu theo ngày, kỳ dài hơn 62 ngày thì theo tháng. Trục đủ mọi ngày / tháng trong kỳ; máy chủ chỉ trả ngày có phát sinh. */
export function BieuDoDoanhThu({ days, from, to, empty }: { days: ChartDay[]; from: string; to: string; empty?: ReactNode }) {
  const year = (Date.parse(to) - Date.parse(from)) / 86_400_000 > 62;
  const points = useMemo(() => {
    const m = new Map<string, number>();
    const end = new Date(`${to}T00:00:00`);
    for (const d = new Date(`${from}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) m.set(year ? iso(d).slice(0, 7) : iso(d), 0);
    for (const d of days) { const k = year ? d.day.slice(0, 7) : d.day; if (m.has(k)) m.set(k, m.get(k)! + d.revenue); }
    return [...m.entries()].map(([key, value]) => ({ key, value, label: year ? `T${Number(key.slice(5))}/${key.slice(2, 4)}` : `${key.slice(8)}/${key.slice(5, 7)}` }));
  }, [days, from, to, year]);
  const max = Math.max(0, ...points.map((p) => p.value));
  const [hover, setHover] = useState<string | null>(null);
  const cur = points.find((p) => p.key === hover);
  if (max <= 0) return <div className="tq-chart-empty">Chưa có doanh thu trong kỳ{empty}</div>;
  return (
    <div className="tq-chart">
      <div className="tq-chart-title"><b>Doanh thu theo {year ? 'tháng' : 'ngày'}</b><span>{cur ? `${cur.label}: ${money(cur.value)}` : `Cao nhất ${money(max)}`}</span></div>
      <div className="tq-bars" onMouseLeave={() => setHover(null)}>
        {points.map((p) => (
          <div key={p.key} className={`tq-bar-hit${hover === p.key ? ' on' : ''}`} onMouseEnter={() => setHover(p.key)} title={`${p.label}: ${money(p.value)}`}>
            <i style={{ height: `${Math.max(p.value > 0 ? 3 : 0, (p.value / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="tq-axis"><span>{points[0]!.label}</span><span>{points[points.length - 1]!.label}</span></div>
    </div>
  );
}

export function Tile({ icon: Icon, label, value, hint, path, strong }: { icon: LucideIcon; label: string; value: number | null; hint: string; path: string; strong?: boolean }) {
  return (
    <Link to={path} className={`tq-tile${strong ? ' strong' : ''}`} title={`${hint}. Bấm để xem chi tiết.`}>
      <span className="tq-tile-icon"><Icon size={18} /></span>
      <span className="tq-tile-label">{label}</span>
      <b className={value !== null && value < 0 ? 'am' : ''}>{value === null ? '—' : money(value) || '0'}</b>
    </Link>
  );
}

function TaiChinh() {
  const now = new Date();
  const today = iso(now);
  const [ky, setKy] = useState<'thang' | 'nam'>('thang');
  const from = ky === 'nam' ? `${now.getFullYear()}-01-01` : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const range = { from, to: today };
  const opts = { retry: false, staleTime: 60_000 } as const;
  const tb = useQuery({ ...opts, queryKey: ['tq', 'tb', range], queryFn: () => api.get<{ rows: { code: string; closingDebit: number; closingCredit: number }[] }>('/api/v1/reports/trial-balance', range) });
  const kq = useQuery({ ...opts, queryKey: ['tq', 'kq', range], queryFn: () => api.get<{ rows: { code: string; current: number }[] }>('/api/v1/reports/income-statement', range) });
  const db = useQuery({ ...opts, queryKey: ['tq', 'db', range], queryFn: () => api.get<{ days: ChartDay[] }>('/api/v1/reports/dashboard', range) });
  const acc = (code: string) => tb.data?.rows.find((r) => r.code === code);
  const co = tb.data ? 1 : null;
  const row = (...codes: string[]) => (kq.data ? codes.reduce((s, c) => s + (kq.data!.rows.find((r) => r.code === c)?.current ?? 0), 0) : null);
  const net = (code: string) => (acc(code)?.closingDebit ?? 0) - (acc(code)?.closingCredit ?? 0);
  const refresh = () => { void tb.refetch(); void kq.refetch(); void db.refetch(); };
  return (
    <section className="card tq-card">
      <div className="tq-head">
        <h3>Tình hình tài chính</h3>
        <select className="select" value={ky} aria-label="Kỳ xem" onChange={(e) => setKy(e.target.value as 'thang' | 'nam')}><option value="thang">Tháng này</option><option value="nam">Năm nay</option></select>
        <button type="button" className="tq-icon" title="Tải lại" onClick={refresh}><RefreshCw size={15} /></button>
      </div>
      <div className="tq-tiles">
        <Tile icon={Wallet} label="Tiền" value={co && net('111') + net('112')} hint="Tiền mặt 111 và tiền gửi 112, số dư tới hôm nay" path="/quy/so-du-tien" />
        <Tile icon={ArrowDownLeft} label="Phải thu" value={co && (acc('131')?.closingDebit ?? 0)} hint="Dư Nợ TK 131 tới hôm nay" path="/bao-cao/cong-no" />
        <Tile icon={ArrowUpRight} label="Phải trả" value={co && (acc('331')?.closingCredit ?? 0)} hint="Dư Có TK 331 tới hôm nay" path="/bao-cao/cong-no" />
        <Tile icon={Receipt} label="Doanh thu" value={row('10')} hint="Doanh thu thuần trong kỳ, chỉ tiêu 10 của B02-DN" path="/bao-cao/ket-qua-kinh-doanh" />
        <Tile icon={CircleDollarSign} label="Chi phí" value={row('11', '23', '25', '26', '32', '51', '52')} hint="Giá vốn, chi phí tài chính, bán hàng, quản lý, khác và thuế TNDN trong kỳ" path="/bao-cao/ket-qua-kinh-doanh" />
        <Tile icon={TrendingUp} label="Lợi nhuận" value={row('60')} hint="Lợi nhuận sau thuế trong kỳ, chỉ tiêu 60 của B02-DN" path="/bao-cao/ket-qua-kinh-doanh" strong />
      </div>
      {db.data && <BieuDoDoanhThu days={db.data.days} from={from} to={today} empty={ky === 'thang' ? <button type="button" className="rail-link" onClick={() => setKy('nam')}>Xem cả năm</button> : undefined} />}
      <Link to="/bang-dieu-khien" className="tq-more"><Landmark size={14} /> Bảng điều khiển</Link>
    </section>
  );
}

interface DueRow { debtItemId: string; partnerName: string; dueDate: string; remaining: number }
interface LichViec { key: string; text: string; sub?: string; path: string }

function LichCongViec() {
  const nowIso = iso(new Date());
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sel, setSel] = useState(nowIso);
  const { can } = useAuth();
  const viec = useViec();
  const due = useQuery({ enabled: can('documents:read'), retry: false, staleTime: 60_000, queryKey: ['tq', 'due'], queryFn: () => api.get<{ rows: DueRow[] }>('/api/v1/purchase/due') });
  const y = month.getFullYear(), m = month.getMonth();
  const start = (new Date(y, m, 1).getDay() + 6) % 7;
  const total = new Date(y, m + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((start + total) / 7) * 7 }, (_, i) => new Date(y, m, i - start + 1));

  const byDay = useMemo(() => {
    const map = new Map<string, LichViec[]>();
    const add = (d: string, v: LichViec) => map.set(d, [...(map.get(d) ?? []), v]);
    for (const r of due.data?.rows ?? []) if (r.dueDate) add(r.dueDate, { key: r.debtItemId + r.dueDate, text: `Trả ${r.partnerName}`, sub: money(r.remaining), path: '/mua-hang/han-muc' });
    // Việc cuối mỗi tháng: ngày cuối của tháng đang xem.
    const last = iso(new Date(y, m + 1, 0));
    add(last, { key: 'cuoi-gia-von', text: 'Tính giá vốn', path: '/nghiep-vu/tinh-gia-von' });
    add(last, { key: 'cuoi-ket-chuyen', text: 'Kết chuyển lãi lỗ', path: '/nghiep-vu/ket-chuyen' });
    add(last, { key: 'cuoi-khoa-so', text: 'Khoá sổ', path: '/cau-hinh/ky-ke-toan' });
    return map;
  }, [due.data, y, m]);

  const list = byDay.get(sel) ?? [];
  const homNay = sel === nowIso ? viecOf(viec.items).slice(0, 4) : [];
  const shift = (n: number) => setMonth(new Date(y, m + n, 1));
  return (
    <section className="card tq-card">
      <div className="tq-head">
        <h3>Công việc</h3>
        <button type="button" className="tq-icon" title="Tháng trước" onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
        <b className="tq-month">Tháng {m + 1}/{y}</b>
        <button type="button" className="tq-icon" title="Tháng sau" onClick={() => shift(1)}><ChevronRight size={16} /></button>
      </div>
      <div className="tq-cal" role="grid" aria-label={`Lịch tháng ${m + 1} năm ${y}`}>
        {WEEK.map((w) => <span key={w} className="tq-wd">{w}</span>)}
        {cells.map((d) => {
          const k = iso(d);
          const n = byDay.get(k)?.length ?? 0;
          return (
            <button key={k} type="button" className={`${d.getMonth() !== m ? 'out' : ''}${k === nowIso ? ' today' : ''}${k === sel ? ' sel' : ''}`} title={n ? `${n} việc` : undefined} onClick={() => setSel(k)}>
              {d.getDate()}{n > 0 && <i />}
            </button>
          );
        })}
      </div>
      <div className="tq-day">
        <b>{sel === nowIso ? 'Hôm nay' : `Ngày ${sel.slice(8)}/${sel.slice(5, 7)}`}</b>
        {homNay.map((v) => <ViecRow key={v.key} v={v} onGo={() => undefined} />)}
        {list.map((v) => <Link key={v.key} to={v.path} className="tq-job"><span>{v.text}</span>{v.sub && <small>{v.sub}</small>}</Link>)}
        {!homNay.length && !list.length && <div className="tq-empty">Không có việc</div>}
      </div>
    </section>
  );
}

export function TongQuanPage() {
  const { user, can } = useAuth();
  const enabled = useEnabledModules();
  const [help, setHelp] = useState(false);
  const name = user?.fullName ?? '';
  const initials = name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase() || 'ERP';
  const widgets = sdkSlots('dashboard.widget').filter((s) => (!enabled || enabled.has(s.module)) && (!s.permission || can(s.permission)));
  return (
    <>
      <div className="tq-hello">
        <span className="tq-avatar">{initials}</span>
        <div><b>Xin chào{name ? `, ${name}` : ''}</b><span>{user?.tenant.name}</span></div>
        <button type="button" className="btn btn-help" onClick={() => setHelp(true)}><HelpCircle size={16} /> Hướng dẫn</button>
      </div>
      <div className="tq-grid">
        <div className="tq-col">
          <TruyCapNhanh />
          <TaiChinh />
          {widgets.length > 0 && <div className="launcher-widgets">{widgets.map((s) => <div key={s.module} className="card card-body"><b>{s.label}</b><s.component /></div>)}</div>}
        </div>
        <div className="tq-col">
          <KhoiAnh blockKey="tong-quan-banner" className="tq-banner" />
          <LichCongViec />
        </div>
      </div>
      {help && <HelpDrawer guideKey="trang-chu" onClose={() => setHelp(false)} />}
    </>
  );
}
