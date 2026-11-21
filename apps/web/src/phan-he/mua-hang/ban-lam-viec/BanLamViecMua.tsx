// [2026-11-20 Nguyễn Văn Thủy] UX MUA HÀNG GỌN — trang chủ Mua hàng: sơ đồ luồng theo đúng thứ tự quy trình + thiếu / lệch trên từng bước (đóng góp)
/**
 * TRANG CHỦ MUA HÀNG (bấm "Mua hàng" ở menu trái là vào đây): sơ đồ luồng thẻ đánh số nối mũi tên (khung chung SoDoNhom,
 * dữ liệu SO_DO_V2['mua-hang']): Khai báo → Kế hoạch đặt hàng → Đơn đặt hàng → Nhận hàng, nhập kho → Hoá đơn & đối chiếu →
 * Công nợ, thanh toán; phát sinh song song: Trả / đổi hàng, Quyết toán.
 * Mỗi thẻ: các màn bấm thẳng, nhãn THIẾU / LỆCH phần mềm tự phát hiện (máy chủ /purchase/todo, chữ ngắn — rê chuột xem đủ câu),
 * nút lập phiếu của bước. Khung Báo cáo bên phải theo danh sách báo cáo của quy trình.
 */
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, HelpCircle, Plus, RefreshCw, Workflow } from 'lucide-react';
import { api } from '@/lib/api';
import type { GonGroup } from '../../../layout/menu-gon';
import { SO_DO_V2, type SoDoNhomBuoc } from '../../../layout/so-do-nhom';
import { SoDoNhom } from '../../../features/launcher/SoDoNhom';
import { P, vnd } from '../du-lieu';
import './ban-lam-viec.css';

interface TodoItem { key: string; level: 'error' | 'warn' | 'info'; text: string; count: number; amount?: number; path: string }
interface Todo { items: TodoItem[] }

/** Chữ ngắn của từng việc (câu đầy đủ ở chú thích rê chuột). */
const NGAN: Record<string, string> = {
  ncc_no_tax: 'NCC chưa có MST', ncc_dup_tax: 'trùng MST',
  contract_expiring: 'HĐ sắp hết hạn', contract_no_price: 'HĐ chưa có giá',
  credit_over: 'vượt hạn mức', order_pending: 'chờ duyệt', order_no_contract: 'không theo hợp đồng', price_diff: 'lệch giá hợp đồng', blocked: 'bị chặn duyệt',
  orders: 'chưa nhận đủ', outside: 'nhập ngoài đơn', expired: 'lô hết hạn', near: 'lô cận date',
  inv_late: 'quá hạn nhận HĐ', receipt_no_invoice: 'thiếu hoá đơn', inv_wait: 'chờ hoá đơn', inv_unmatched: 'HĐ chưa nhận mã', inv_no_receipt: 'HĐ chưa có phiếu nhập', costs: 'chi phí chưa phân bổ',
  overdue: 'nợ quá hạn', due: 'đến hạn hôm nay', soon: 'sắp đến hạn',
  return_no_ref: 'chưa gắn phiếu nhập',
  rebates: 'thưởng chưa quyết toán', contract_expired: 'HĐ hết hạn chưa thanh lý', gifts: 'quà vượt tồn',
};

const BAO_CAO: { label: string; path: string }[] = [
  { label: 'Sổ tổng hợp công nợ phải trả', path: '/bao-cao/cong-no-phai-tra' },
  { label: 'Sổ chi tiết công nợ phải trả', path: '/bao-cao/chi-tiet-thanh-toan' },
  { label: 'Công nợ theo hợp đồng', path: '/mua-hang/cong-no-hop-dong' },
  { label: 'Tổng hợp mua hàng theo mặt hàng', path: '/mua-hang/tong-hop-mat-hang' },
  { label: 'Tổng hợp mua hàng theo chi nhánh', path: '/mua-hang/tong-hop?xem=nhom' },
  { label: 'Biên bản đối chiếu công nợ', path: '/cong-no/doi-chieu' },
  { label: 'Sổ chi tiết mua hàng', path: '/mua-hang/bao-cao' },
  { label: 'Sổ kho theo mặt hàng', path: '/mua-hang/so-kho' },
  { label: 'Tồn kho theo mặt hàng', path: '/mua-hang/ton-kho' },
];

const LAP_NHANH: { label: string; kind: string; chinh?: boolean }[] = [
  { label: 'Đơn đặt hàng', kind: 'order', chinh: true }, { label: 'Phiếu nhập', kind: 'receipt', chinh: true },
  { label: 'Trả hàng', kind: 'return' }, { label: 'Chi phí', kind: 'cost' }, { label: 'Trả tiền', kind: 'payment' },
];

export function BanLamViecMua({ g, canOpen, onHelp }: { g: GonGroup; canOpen: (path: string) => boolean; onHelp: () => void }) {
  const [, setSp] = useSearchParams();
  const q = useQuery({ queryKey: ['mua-hang', 'todo'], queryFn: () => api.get<Todo>(`${P}/todo`), refetchOnWindowFocus: true });
  const items = q.data?.items ?? [];
  const of = (keys: string[] = []) => keys.flatMap((k) => items.filter((t) => t.key === k && t.count > 0));
  const soDo = SO_DO_V2['mua-hang']!;
  const tatCa = [...(soDo.nhom?.chuoi ?? []), ...(soDo.nhom?.nhanh ?? [])].flatMap((b) => of(b.viec));
  const loi = tatCa.filter((t) => t.level === 'error').length, can = tatCa.filter((t) => t.level === 'warn').length;

  /** Phần gắn cuối mỗi thẻ: nhãn thiếu / lệch + nút lập phiếu. */
  const them = (b: SoDoNhomBuoc): ReactNode => {
    const its = of(b.viec);
    if (!its.length && !b.lap && !b.viec?.length) return null;
    return (
      <div className="blv-them">
        {/* [2026-11-21 Nguyễn Văn Thủy] thẻ bước chỉ còn một nhãn đếm gọn; danh sách việc cần xử lý ở khung "Cần xử lý" góc dưới bên phải (đỡ ngợp) (đóng góp) */}
        {its.length > 0 ? (() => { const err = its.some((t) => t.level === 'error'); const n = its.reduce((x, t) => x + t.count, 0);
          return <a href="#blv-can" className={`blv-nhan ${err ? 'error' : 'warn'}`} title={its.map((t) => `${t.count} ${NGAN[t.key] ?? t.text}`).join('\n')}
            onClick={(e) => { e.preventDefault(); document.getElementById('blv-can')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}><b>{n}</b> cần xử lý</a>; })()
          : b.viec?.length && !q.isLoading ? <span className="blv-nhan ok"><Check size={12} /> Đã khớp</span> : null}
        {b.lap?.map((x) => <Link key={x.label} to={x.path} className="blv-lap-nho"><Plus size={12} /> {x.label}</Link>)}
      </div>
    );
  };

  const dau = (
    <div className="blv-dau">
      <b>Nghiệp vụ mua hàng — làm theo thứ tự</b>
      <span className="blv-tong">
        {q.isLoading ? '' : loi + can === 0 ? <span className="ok"><Check size={14} /> Không có thiếu / lệch</span>
          : <>{loi > 0 && <span className="error">{loi} lỗi</span>}{can > 0 && <span className="warn">{can} cần xử lý</span>}</>}
      </span>
      <button type="button" className="btn btn-sm" onClick={() => void q.refetch()} title="Soát lại thiếu / lệch"><RefreshCw size={14} className={q.isFetching ? 'spin' : ''} /></button>
      <button type="button" className="btn btn-sm" onClick={() => setSp({ xem: 'chi-tiet' }, { replace: true })} title="Luồng chi tiết: từng bước phần mềm tự làm gì"><Workflow size={14} /></button>
      <button type="button" className="btn btn-sm" onClick={onHelp} title="Hướng dẫn"><HelpCircle size={14} /></button>
    </div>
  );

  return (
    <>
      <div className="blv-lap">
        {LAP_NHANH.map((x) => <Link key={x.kind} to={`/mua-hang/tong-hop?moi=${x.kind}`} className={`btn btn-sm${x.chinh ? ' btn-primary' : ''}`}><Plus size={14} /> {x.label}</Link>)}
      </div>
      <div className="sd-layout">
        <div className="sd-main"><SoDoNhom soDo={soDo} canOpen={canOpen} sections={g.sections} them={them} dau={dau} /></div>
        <div className="blv-phai">
        <aside className="card sd-bc">
          <b>Báo cáo</b>
          {BAO_CAO.filter((r) => canOpen(r.path.split('?')[0]!)).map((r) => <Link key={r.label} to={r.path}>{r.label}</Link>)}
          <Link className="sd-bc-all" to={`/bao-cao?nhom=${g.key}`}>Tất cả báo cáo ›</Link>
        </aside>
        <aside className="card sd-bc blv-can" id="blv-can">
          <b>Cần xử lý {tatCa.length > 0 && <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>({tatCa.length})</span>}</b>
          {q.isLoading ? <span className="muted">Đang soát…</span> : !tatCa.length ? <span className="ok" style={{ fontSize: 13 }}><Check size={13} /> Không có thiếu / lệch</span>
            : [...(soDo.nhom?.chuoi ?? []), ...(soDo.nhom?.nhanh ?? [])].filter((b) => of(b.viec).length).map((b, i) => (
              <div key={i} className="blv-can-nhom">
                <small className="muted">{b.nhom}</small>
                {of(b.viec).map((t) => <Link key={t.key} to={t.path} className={`blv-can-dong ${t.level}`} title={t.amount ? `${t.text} · ${vnd(t.amount)}` : t.text}><b>{t.count}</b> {NGAN[t.key] ?? t.text}</Link>)}
              </div>
            ))}
        </aside>
        </div>
      </div>
    </>
  );
}
