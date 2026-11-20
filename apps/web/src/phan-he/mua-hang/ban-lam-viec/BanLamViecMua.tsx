// [2026-11-20 Nguyễn Văn Thủy] UX MUA HÀNG GỌN — Bàn làm việc mua hàng: bấm "Mua hàng" ở menu trái là vào đây (đóng góp)
/**
 * BÀN LÀM VIỆC MUA HÀNG — trang chủ nhóm Mua hàng. Kế toán mở là thấy ngay:
 *  1. Việc cần làm: 6 ô cố định (chờ duyệt, đơn chưa nhận đủ, hoá đơn chưa khớp, nợ đến hạn, cuối kỳ, lô hạn) — số lấy từ
 *     /purchase/todo, bấm ô ra danh sách đã lọc sẵn. Ô không có việc hiện mờ (vị trí không đổi, mắt quen chỗ).
 *  2. Lập nhanh: các chứng từ hay lập, mở thẳng phiếu mới.
 *  3. Chuỗi chứng từ: Hợp đồng → Đơn đặt → Phiếu nhập → Hoá đơn NCC → Công nợ → Thanh toán, kèm số nháp / chờ duyệt.
 *  4. Mọi màn còn lại theo việc: Hằng ngày / Định kỳ / Khai báo + Báo cáo hay dùng (lấy từ menu gọn, đã lọc quyền).
 * Danh mục chung (mặt hàng, nhóm hàng, cơ cấu…) không nằm ở đây — chỉ ở nhóm Danh mục.
 */
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, HelpCircle, Plus, RefreshCw, Workflow } from 'lucide-react';
import { api } from '@/lib/api';
import type { GonGroup } from '../../../layout/menu-gon';
import { P, vnd } from '../du-lieu';
import './ban-lam-viec.css';

interface TodoItem { key: string; level: 'error' | 'warn' | 'info'; text: string; count: number; amount?: number; path: string }
interface Todo { byKind: Record<string, { draft: number; pending: number; approved: number }>; items: TodoItem[] }

const L = (kind: string) => `/mua-hang/tong-hop?loai=${kind}`;
const N = (kind: string) => `/mua-hang/tong-hop?moi=${kind}`;

/** Ô việc cần làm: gom các khoá việc của máy chủ; `path` = nơi mở khi chưa có việc. */
const O_VIEC: { label: string; keys: string[]; path: string }[] = [
  { label: 'Chờ duyệt', keys: ['pending', 'blocked', 'drafts'], path: '/mua-hang/tong-hop?trang-thai=pending_approval' },
  { label: 'Nhận hàng', keys: ['orders', 'outside'], path: L('order') },
  { label: 'Hoá đơn chưa khớp', keys: ['inv_unmatched', 'inv_no_receipt'], path: '/mua-hang/hoa-don-ncc' },
  { label: 'Nợ NCC đến hạn', keys: ['overdue', 'due', 'soon'], path: '/mua-hang/han-muc?tab=den-han' },
  { label: 'Cuối kỳ', keys: ['rebates', 'costs'], path: '/mua-hang/thuong' },
  { label: 'Lô hạn, quà', keys: ['expired', 'near', 'gifts'], path: '/mua-hang/lo-han' },
];

/** Chứng từ hay lập (mở thẳng phiếu mới). */
const LAP_NHANH: { label: string; kind: string; chinh?: boolean }[] = [
  { label: 'Đơn đặt hàng', kind: 'order', chinh: true },
  { label: 'Phiếu nhập', kind: 'receipt', chinh: true },
  { label: 'Trả lại hàng', kind: 'return' },
  { label: 'Chi phí mua', kind: 'cost' },
  { label: 'Giảm giá', kind: 'rebate' },
  { label: 'Trả tiền NCC', kind: 'payment' },
  { label: 'Ứng trước', kind: 'prepayment' },
];

/** Chuỗi chứng từ mua hàng (đúng thứ tự làm việc). */
const CHUOI: { label: string; path: string; kinds?: string[]; todo?: string[] }[] = [
  { label: 'Hợp đồng', path: '/mua-hang/hop-dong' },
  { label: 'Đơn đặt hàng', path: L('order'), kinds: ['order'], todo: ['orders'] },
  { label: 'Phiếu nhập', path: L('receipt'), kinds: ['receipt'], todo: ['outside'] },
  { label: 'Hoá đơn NCC', path: '/mua-hang/hoa-don-ncc', todo: ['inv_unmatched', 'inv_no_receipt'] },
  { label: 'Công nợ', path: '/mua-hang/han-muc?tab=den-han', todo: ['overdue', 'due'] },
  { label: 'Thanh toán', path: L('payment'), kinds: ['payment', 'prepayment'] },
];

const MUC = { error: 3, warn: 2, info: 1 } as const;

export function BanLamViecMua({ g, onHelp }: { g: GonGroup; onHelp: () => void }) {
  const [, setSp] = useSearchParams();
  const q = useQuery({ queryKey: ['mua-hang', 'todo'], queryFn: () => api.get<Todo>(`${P}/todo`), refetchOnWindowFocus: true });
  const items = q.data?.items ?? [];
  const of = (keys: string[]) => items.filter((t) => keys.includes(t.key) && t.count > 0);
  const dem = (kinds?: string[]) => (kinds ?? []).reduce((s, k) => {
    const x = q.data?.byKind[k];
    return { draft: s.draft + (x?.draft ?? 0), pending: s.pending + (x?.pending ?? 0) };
  }, { draft: 0, pending: 0 });
  const baoCao = g.reports.flatMap((s) => s.items).slice(0, 8);

  return (
    <div className="blv">
      <div className="blv-top">
        <h1>Bàn làm việc mua hàng</h1>
        <div className="blv-tools">
          <button type="button" className="btn btn-sm" onClick={() => void q.refetch()} title="Tải lại số việc cần làm"><RefreshCw size={14} className={q.isFetching ? 'spin' : ''} /></button>
          <button type="button" className="btn btn-sm" onClick={() => setSp({ xem: 'chi-tiet' }, { replace: true })} title="Sơ đồ quy trình mua hàng: từng bước phần mềm tự làm gì"><Workflow size={14} /> Quy trình</button>
          <button type="button" className="btn btn-sm" onClick={onHelp}><HelpCircle size={14} /> Hướng dẫn</button>
        </div>
      </div>

      <section className="blv-lap" aria-label="Lập nhanh chứng từ">
        {LAP_NHANH.map((x) => (
          <Link key={x.kind} to={N(x.kind)} className={`btn btn-sm${x.chinh ? ' btn-primary' : ''}`} title={`Lập ${x.label.toLowerCase()} mới`}><Plus size={14} /> {x.label}</Link>
        ))}
      </section>

      <section className="blv-viec" aria-label="Việc cần làm">
        {O_VIEC.map((o) => {
          const its = of(o.keys);
          const n = its.reduce((s, t) => s + t.count, 0);
          const lv = its.reduce<TodoItem['level'] | ''>((m, t) => (!m || MUC[t.level] > MUC[m] ? t.level : m), '');
          return (
            <Link key={o.label} to={(its[0]?.path ?? o.path).replace('/mua-hang/chung-tu', '/mua-hang/tong-hop')} className={`blv-o${n ? ` co ${lv}` : ''}`} title={its.length ? its.map((t) => `${t.count} ${t.text}`).join('\n') : 'Không có việc tồn'}>
              <span className="blv-o-ten">{o.label}</span>
              <b className="blv-o-so">{q.isLoading ? '…' : n}</b>
              <span className="blv-o-ct">
                {its.length ? its.map((t) => <span key={t.key}><b>{t.count}</b> {t.text}{t.amount ? ` · ${vnd(t.amount)}` : ''}</span>) : <span>Không có việc tồn</span>}
              </span>
            </Link>
          );
        })}
      </section>

      <section className="blv-chuoi" aria-label="Chuỗi chứng từ mua hàng">
        {CHUOI.map((c, i) => {
          const k = dem(c.kinds);
          const viec = of(c.todo ?? []).reduce((s, t) => s + t.count, 0);
          return (
            <span key={c.label} className="blv-chuoi-buoc">
              {i > 0 && <ArrowRight size={14} className="blv-mui" />}
              <Link to={c.path} className="blv-nut">
                <span>{c.label}</span>
                {(k.pending > 0 || k.draft > 0 || viec > 0) && (
                  <small>{[k.pending ? `${k.pending} chờ duyệt` : '', k.draft ? `${k.draft} nháp` : '', viec ? `${viec} cần xử lý` : ''].filter(Boolean).join(' · ')}</small>
                )}
              </Link>
            </span>
          );
        })}
      </section>

      <section className="blv-cot" aria-label="Các màn mua hàng">
        {g.sections.map((s, i) => (
          <div key={s.label ?? i} className="blv-khoi">
            <div className="blv-khoi-ten">{s.label ?? g.label}</div>
            {s.items.map((m) => <Link key={m.key} to={m.path!} title={m.code ? `${m.label} (${m.code})` : m.label}>{m.label}{m.code && <small>{m.code}</small>}</Link>)}
          </div>
        ))}
        {baoCao.length > 0 && (
          <div className="blv-khoi">
            <div className="blv-khoi-ten">Báo cáo</div>
            {baoCao.map((m) => <Link key={m.key} to={m.path!} title={m.code ? `${m.label} (${m.code})` : m.label}>{m.label}{m.code && <small>{m.code}</small>}</Link>)}
            <Link className="blv-tat-ca" to={`/bao-cao?nhom=${g.key}`}>Tất cả báo cáo ›</Link>
          </div>
        )}
      </section>
    </div>
  );
}
