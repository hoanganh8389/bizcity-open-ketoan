// [2026-11-20 Nguyễn Văn Thủy] UX MUA HÀNG GỌN — Bàn làm việc mua hàng theo 11 bước của quy trình mua hàng (motamuahangsau) (đóng góp)
/**
 * BÀN LÀM VIỆC MUA HÀNG — trang chủ nhóm Mua hàng (bấm "Mua hàng" ở menu trái là vào đây).
 *  - Lập nhanh: các chứng từ hay lập, mở thẳng phiếu mới.
 *  - 11 BƯỚC mua hàng, chia 3 chặng (Chuẩn bị → Đặt & nhận hàng → Thanh toán & kết thúc). Mỗi bước: màn làm việc, nút lập,
 *    dòng "Kiểm soát" đúng như quy trình, và THIẾU / LỆCH phần mềm tự phát hiện (máy chủ /purchase/todo, khoá việc gắn vào bước).
 *    Bước không có gì: "Đã khớp". Bấm một dòng thiếu / lệch là ra danh sách đã lọc sẵn.
 *  - Báo cáo: đúng các báo cáo công nợ / mua hàng của quy trình.
 * Danh mục chung (mặt hàng, nhóm hàng, cơ cấu…) chỉ có lối tắt ở bước 1, khai ở nhóm Danh mục.
 */
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, HelpCircle, Plus, RefreshCw, Workflow } from 'lucide-react';
import { api } from '@/lib/api';
import type { GonGroup } from '../../../layout/menu-gon';
import { P, vnd } from '../du-lieu';
import './ban-lam-viec.css';

interface TodoItem { key: string; level: 'error' | 'warn' | 'info'; text: string; count: number; amount?: number; path: string }
interface Todo { byKind: Record<string, { draft: number; pending: number; approved: number }>; items: TodoItem[] }

const L = (kind: string) => `/mua-hang/tong-hop?loai=${kind}`;
const N = (kind: string) => `/mua-hang/tong-hop?moi=${kind}`;

interface Buoc {
  so: number;
  ten: string;
  /** Bộ phận làm (theo quy trình). */
  ai: string;
  /** Kiểm soát hệ thống (theo quy trình). */
  kiem: string;
  man: { label: string; path: string }[];
  lap?: { label: string; path: string }[];
  /** Khoá việc của máy chủ gắn vào bước. */
  viec: string[];
  /** Loại chứng từ để đếm nháp / chờ duyệt. */
  kinds?: string[];
}

const CHANG: { ten: string; buoc: Buoc[] }[] = [
  {
    ten: 'Chuẩn bị',
    buoc: [
      { so: 1, ten: 'Khai báo NCC, mặt hàng', ai: 'Mua hàng', kiem: 'Trùng mã số thuế, trạng thái MST',
        man: [{ label: 'Nhà cung cấp', path: '/mua-hang/nha-cung-cap' }, { label: 'Mặt hàng', path: '/danh-muc/mat-hang' }], viec: ['ncc_dup_tax', 'ncc_no_tax'] },
      { so: 2, ten: 'Ký hợp đồng mua', ai: 'Mua hàng', kiem: 'Lưu bản scan, có hiệu lực từ – đến',
        man: [{ label: 'Hợp đồng mua hàng', path: '/mua-hang/hop-dong' }], viec: ['contract_expiring'] },
      { so: 3, ten: 'Bảng giá, chiết khấu, thưởng', ai: 'Mua hàng', kiem: 'Gắn theo hợp đồng, có hiệu lực, được duyệt',
        man: [{ label: 'Giá trong hợp đồng', path: '/mua-hang/hop-dong' }, { label: 'Chính sách mua hàng', path: '/mua-hang/chinh-sach' }], viec: ['contract_no_price'] },
    ],
  },
  {
    ten: 'Đặt & nhận hàng',
    buoc: [
      { so: 4, ten: 'Xác định nhu cầu', ai: 'Kho, kinh doanh, mua hàng', kiem: 'Gợi ý số lượng từ tồn kho, tồn max',
        man: [{ label: 'Phân tích đặt hàng', path: '/mua-hang/dat-hang' }, { label: 'Tồn max', path: '/mua-hang/ton-max' }, { label: 'Đăng ký tồn max (shop)', path: '/mua-hang/dang-ky-max' }, { label: 'Công thức đặt hàng', path: '/mua-hang/cong-thuc' }], viec: [] },
      { so: 5, ten: 'Lập đơn đặt hàng', ai: 'Mua hàng', kiem: 'Lấy giá, chiết khấu, kỳ hạn theo hợp đồng',
        man: [{ label: 'Đơn đặt hàng', path: L('order') }], lap: [{ label: 'Đơn đặt hàng', path: N('order') }], viec: ['order_no_contract'], kinds: ['order'] },
      { so: 6, ten: 'Duyệt đơn, gửi NCC', ai: 'Trưởng mua hàng', kiem: 'Giá lệch hợp đồng cần cấp cao hơn duyệt',
        man: [{ label: 'Đơn chờ duyệt', path: '/mua-hang/tong-hop?loai=order&trang-thai=pending_approval' }], viec: ['order_pending', 'price_diff', 'blocked'] },
      { so: 7, ten: 'Nhận hàng, kiểm lô / HSD', ai: 'Kho', kiem: 'Đúng số lượng, chất lượng, lô / hạn dùng',
        man: [{ label: 'Tình hình thực hiện đơn', path: '/mua-hang/doi-chieu' }, { label: 'Lô & hạn dùng', path: '/mua-hang/lo-han' }], viec: ['orders', 'expired', 'near'] },
      { so: 8, ten: 'Nhập kho, hoá đơn, công nợ', ai: 'Kho, kế toán', kiem: 'Không nhập vượt đơn; đối chiếu hợp đồng – đơn – hoá đơn – phiếu nhập',
        man: [{ label: 'Phiếu nhập', path: L('receipt') }, { label: 'Hoá đơn đầu vào', path: '/mua-hang/hoa-don-ncc' }, { label: 'Chi phí mua', path: L('cost') }, { label: 'Phân bổ & giá vốn', path: '/mua-hang/phan-bo' }, { label: 'Chuyển xuống shop', path: '/mua-hang/chuyen-shop' }],
        lap: [{ label: 'Phiếu nhập', path: N('receipt') }, { label: 'Chi phí', path: N('cost') }], viec: ['outside', 'inv_unmatched', 'inv_no_receipt', 'receipt_no_invoice', 'costs'], kinds: ['receipt', 'cost'] },
    ],
  },
  {
    ten: 'Thanh toán & kết thúc',
    buoc: [
      { so: 9, ten: 'Thanh toán NCC', ai: 'Kế toán, thủ quỹ', kiem: 'Chỉ trả khoản đã khớp hợp đồng, hoá đơn, đơn; bù trừ khoản phải trả',
        man: [{ label: 'Công nợ đến hạn', path: '/mua-hang/han-muc?tab=den-han' }, { label: 'Phiếu trả tiền', path: L('payment') }],
        lap: [{ label: 'Trả tiền', path: N('payment') }, { label: 'Ứng trước', path: N('prepayment') }], viec: ['overdue', 'due', 'soon'], kinds: ['payment', 'prepayment'] },
      { so: 10, ten: 'Trả hàng NCC', ai: 'Kho, mua hàng', kiem: 'Tham chiếu phiếu nhập gốc',
        man: [{ label: 'Trả / đổi hàng', path: L('return') }], lap: [{ label: 'Trả hàng', path: N('return') }, { label: 'Đổi hàng', path: N('exchange') }], viec: ['return_no_ref'], kinds: ['return', 'exchange'] },
      { so: 11, ten: 'Quyết toán thưởng, thanh lý', ai: 'Mua hàng, kế toán', kiem: 'Số liệu tự tính theo mua thực tế',
        man: [{ label: 'Tính thưởng cuối kỳ', path: '/mua-hang/thuong' }, { label: 'Quà tặng', path: '/mua-hang/qua-tang' }, { label: 'Thanh lý hợp đồng', path: '/mua-hang/hop-dong' }],
        lap: [{ label: 'Giảm giá', path: N('rebate') }], viec: ['rebates', 'contract_expired', 'gifts'], kinds: ['rebate', 'gift_in', 'gift_out'] },
    ],
  },
];

/** Báo cáo của quy trình mua hàng. */
const BAO_CAO: { label: string; path: string }[] = [
  { label: 'Sổ tổng hợp công nợ phải trả', path: '/bao-cao/cong-no-phai-tra' },
  { label: 'Sổ chi tiết công nợ phải trả', path: '/bao-cao/chi-tiet-thanh-toan' },
  { label: 'Công nợ theo hợp đồng', path: '/mua-hang/cong-no-hop-dong' },
  { label: 'Tổng hợp mua hàng theo mặt hàng', path: '/mua-hang/tong-hop-mat-hang' },
  { label: 'Tổng hợp mua hàng theo chi nhánh', path: '/mua-hang/tong-hop?xem=nhom' },
  { label: 'Biên bản đối chiếu công nợ', path: '/cong-no/doi-chieu' },
  { label: 'Sổ chi tiết mua hàng', path: '/mua-hang/bao-cao' },
];

const LAP_NHANH: { label: string; kind: string; chinh?: boolean }[] = [
  { label: 'Đơn đặt hàng', kind: 'order', chinh: true },
  { label: 'Phiếu nhập', kind: 'receipt', chinh: true },
  { label: 'Trả lại hàng', kind: 'return' },
  { label: 'Chi phí mua', kind: 'cost' },
  { label: 'Trả tiền NCC', kind: 'payment' },
];

const MUC = { error: 3, warn: 2, info: 1 } as const;
const muc = (its: TodoItem[]) => its.reduce<TodoItem['level'] | ''>((m, t) => (!m || MUC[t.level] > MUC[m] ? t.level : m), '');

export function BanLamViecMua({ g, onHelp }: { g: GonGroup; onHelp: () => void }) {
  const [, setSp] = useSearchParams();
  const q = useQuery({ queryKey: ['mua-hang', 'todo'], queryFn: () => api.get<Todo>(`${P}/todo`), refetchOnWindowFocus: true });
  const items = q.data?.items ?? [];
  const of = (keys: string[]) => items.filter((t) => keys.includes(t.key) && t.count > 0);
  const dem = (kinds?: string[]) => (kinds ?? []).reduce((s, k) => {
    const x = q.data?.byKind[k];
    return { draft: s.draft + (x?.draft ?? 0), pending: s.pending + (x?.pending ?? 0) };
  }, { draft: 0, pending: 0 });
  const tatCa = CHANG.flatMap((c) => c.buoc.flatMap((b) => of(b.viec)));
  const loi = tatCa.filter((t) => t.level === 'error').length, canXuLy = tatCa.filter((t) => t.level !== 'error').length;
  const nhap = q.data?.byKind ? Object.values(q.data.byKind).reduce((s, x) => s + x.draft, 0) : 0;
  // Báo cáo người dùng có quyền mở (theo menu); MH11 luôn có vì đang ở phân hệ Mua hàng.
  const coQuyen = new Set([...g.sections, ...g.reports].flatMap((s) => s.items.map((m) => m.path!.split('?')[0])));

  return (
    <div className="blv">
      <div className="blv-top">
        <h1>Bàn làm việc mua hàng</h1>
        <span className="blv-tong">
          {q.isLoading ? 'Đang soát…' : loi + canXuLy === 0 ? <span className="ok"><Check size={14} /> Không phát hiện thiếu / lệch</span>
            : <span>Phát hiện {loi > 0 && <b className="error">{loi} lỗi</b>}{loi > 0 && canXuLy > 0 && ', '}{canXuLy > 0 && <b className="warn">{canXuLy} việc cần xử lý</b>}</span>}
          {nhap > 0 && <Link to="/mua-hang/tong-hop?trang-thai=draft" className="blv-nhap">{nhap} phiếu nháp</Link>}
        </span>
        <div className="blv-tools">
          <button type="button" className="btn btn-sm" onClick={() => void q.refetch()} title="Soát lại thiếu / lệch"><RefreshCw size={14} className={q.isFetching ? 'spin' : ''} /></button>
          <button type="button" className="btn btn-sm" onClick={() => setSp({ xem: 'chi-tiet' }, { replace: true })} title="Sơ đồ chi tiết: từng bước phần mềm tự làm gì"><Workflow size={14} /> Sơ đồ chi tiết</button>
          <button type="button" className="btn btn-sm" onClick={onHelp}><HelpCircle size={14} /> Hướng dẫn</button>
        </div>
      </div>

      <section className="blv-lap" aria-label="Lập nhanh chứng từ">
        {LAP_NHANH.map((x) => (
          <Link key={x.kind} to={N(x.kind)} className={`btn btn-sm${x.chinh ? ' btn-primary' : ''}`} title={`Lập ${x.label.toLowerCase()} mới`}><Plus size={14} /> {x.label}</Link>
        ))}
      </section>

      {CHANG.map((c, ci) => (
        <section key={c.ten} className="blv-chang" aria-label={c.ten}>
          <div className="blv-chang-ten"><span>{String.fromCharCode(65 + ci)}</span>{c.ten}</div>
          <div className={`blv-buoc-hang n${c.buoc.length}`}>
            {c.buoc.map((b) => {
              const its = of(b.viec);
              const lv = muc(its);
              const k = dem(b.kinds);
              return (
                <div key={b.so} className={`blv-buoc${lv ? ` co ${lv}` : ''}`}>
                  <div className="blv-buoc-dau">
                    <span className="blv-so">{b.so}</span>
                    <div><b>{b.ten}</b><small>{b.ai}</small></div>
                  </div>
                  <div className="blv-kiem" title="Kiểm soát của phần mềm ở bước này">{b.kiem}</div>
                  <div className="blv-phat-hien">
                    {q.isLoading ? <span className="muted">Đang soát…</span>
                      : its.length ? its.map((t) => (
                        <Link key={t.key} to={t.path} className={t.level} title={t.amount ? `${t.text} · ${vnd(t.amount)}` : t.text}><b>{t.count}</b> {t.text}</Link>
                      ))
                      : b.viec.length ? <span className="ok"><Check size={12} /> Đã khớp</span> : null}
                    {(k.pending > 0 || k.draft > 0) && <span className="muted">{[k.pending ? `${k.pending} chờ duyệt` : '', k.draft ? `${k.draft} nháp` : ''].filter(Boolean).join(' · ')}</span>}
                  </div>
                  <div className="blv-man">{b.man.map((m) => <Link key={m.label} to={m.path}>{m.label}</Link>)}</div>
                  {b.lap && <div className="blv-buoc-lap">{b.lap.map((x) => <Link key={x.label} to={x.path} className="btn btn-xs"><Plus size={12} /> {x.label}</Link>)}</div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="blv-bc" aria-label="Báo cáo mua hàng">
        <b>Báo cáo</b>
        {BAO_CAO.filter((r) => coQuyen.has(r.path.split('?')[0]!)).map((r) => <Link key={r.label} to={r.path}>{r.label}</Link>)}
        <Link className="blv-tat-ca" to={`/bao-cao?nhom=${g.key}`}>Tất cả báo cáo ›</Link>
      </section>
    </div>
  );
}
