/**
 * QUY TRÌNH MUA HÀNG — trang chủ phân hệ Mua hàng (thẻ "Quy trình"): SƠ ĐỒ LUỒNG để người mới / kế toán nhìn là thấy cả bức tranh.
 *   Tầng trên  — khai báo / cấu hình (làm một lần): phân cấp chi nhánh → shop, công thức, mặt hàng, NCC & giá, chính sách…; mỗi ô nối xuống bước dùng nó.
 *   Tầng giữa  — luồng chính, chạy từ TỒN MAX: tồn max → phân tích đặt hàng → đơn đặt (tự áp khuyến mại) → nhập kho khi NCC giao
 *                → đối chiếu tiến độ nhập → công nợ & hạn trả → trả tiền NCC. Mỗi bước ghi rõ máy TỰ ĐỘNG làm gì.
 *   Tầng dưới  — phát sinh bên rìa, treo dưới đúng bước sinh ra nó: ứng trước, chuyển xuống shop, quà, chi phí, lô hạn, trả hàng, thưởng…
 *   Việc cần làm (máy chủ gom ở /purchase/todo) hiện ở trên và gắn cảnh báo vào đúng ô trên sơ đồ.
 */
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as Icons from 'lucide-react';
import { api } from '@/lib/api';
import { workBranch } from '@/lib/workBranch';
import { DEFAULT_FORMULA, normalizeFormula, varLabel, type FormulaConfig } from '@ketoan/contracts/mua-hang';
import { lastParent, stockApi, useHierarchy } from '../ton-max/api';
import { P, vnd } from '../du-lieu';
import { MAU_IN } from '../chung-tu/mauIn';
import './quy-trinh-mua-hang.css';

interface TodoItem { key: string; level: 'error' | 'warn' | 'info'; text: string; count: number; amount?: number; path: string }
interface Todo { byKind: Record<string, { draft: number; pending: number; approved: number }>; items: TodoItem[] }

interface Node {
  label: string;
  code?: string;
  icon: string;
  color: string;
  path: string;
  /** Lập mới (nút "+"). */
  newPath?: string;
  hint?: string;
  /** Phần mềm tự làm sẵn gì ở bước này. */
  auto?: ReactNode[];
  /** Loại chứng từ để đếm nháp / chờ duyệt. */
  kinds?: string[];
  /** Khoá việc cần làm gắn vào ô này. */
  todo?: string[];
  /** Loại phiếu in được ở bước này (tên mẫu lấy từ danh sách mẫu in của MH03) hoặc tên báo cáo in. */
  print?: string[];
  printText?: string[];
}
interface Stage { node: Node; config: Node[]; side: Node[] }

const L = (kind: string) => `/mua-hang/chung-tu?loai=${kind}`;
const N = (kind: string) => `/mua-hang/chung-tu?moi=${kind}`;

const STAGES: Stage[] = [
  {
    node: { label: 'Tồn max', code: 'MH16', icon: 'Gauge', color: '#5b6cff', path: '/mua-hang/ton-max',
      auto: ['Mỗi shop có mức tồn tối đa cho từng mã hàng', 'Shop gửi phiếu đăng ký, duyệt xong là mức mới có hiệu lực'] },
    config: [
      { label: 'Phân cấp chi nhánh – shop', code: 'MH15', icon: 'Network', color: '#64748b', path: '/mua-hang/phan-cap', hint: 'Chi nhánh cha đặt NCC, shop con nhận hàng' },
      { label: 'Phiếu đăng ký tồn max', code: 'MH17', icon: 'FilePen', color: '#64748b', path: '/mua-hang/dang-ky-max', hint: 'Shop đề nghị mức tồn' },
    ],
    side: [],
  },
  {
    node: { label: 'Phân tích đặt hàng', code: 'MH02', icon: 'ScanSearch', color: '#2f80ed', path: '/mua-hang/dat-hang',
      auto: [] },
    config: [
      { label: 'Công thức đặt hàng', code: 'MH18', icon: 'Sigma', color: '#64748b', path: '/mua-hang/cong-thuc', hint: 'Số ngày bán, shop tính vào, kho chuẩn' },
      { label: 'Mặt hàng & phân cha – con', code: 'DM10', icon: 'Package', color: '#64748b', path: '/danh-muc/mat-hang', hint: 'Gắn mã con (quà, kẹp quà, mã Z…) vào mã cha để mua không bị thừa' },
    ],
    side: [],
  },
  {
    node: { label: 'Đơn đặt hàng', icon: 'ClipboardList', color: '#0ea5e9', path: L('order'), newPath: N('order'), kinds: ['order'], todo: ['orders'], print: ['order'],
      auto: ['Khuyến mại, chiết khấu đang chạy được áp sẵn vào đơn', 'Giá lấy theo bảng giá của NCC', 'Báo trước nếu đơn làm vượt hạn mức công nợ'] },
    config: [
      { label: 'Nhà cung cấp & bảng giá', code: 'MH01', icon: 'Building2', color: '#64748b', path: '/mua-hang/nha-cung-cap', hint: 'Hợp đồng, hạn trả, hạn mức, giá mua' },
      { label: 'Chính sách & khuyến mại', code: 'MH04', icon: 'BadgePercent', color: '#64748b', path: '/mua-hang/chinh-sach', hint: 'Chiết khấu, mua X tặng Y, bậc số lượng' },
    ],
    side: [
      { label: 'Ứng trước NCC', icon: 'HandCoins', color: '#9b51e0', path: L('prepayment'), newPath: N('prepayment'), kinds: ['prepayment'], printText: ['Phiếu chi', 'Ủy nhiệm chi'], hint: 'Tự đối trừ khi hàng về' },
    ],
  },
  {
    node: { label: 'Nhập kho khi NCC giao', icon: 'PackageCheck', color: '#27ae60', path: L('receipt'), newPath: N('receipt'), kinds: ['receipt'], print: ['receipt'],
      auto: ['Chọn đơn là có sẵn phần hàng còn chờ giao — hoặc lập từ hoá đơn NCC đã nhập (MH22)', 'Hàng tặng, hạn thanh toán được điền sẵn', 'Nhắc khi giá lệch, trùng số hoá đơn, hàng sắp hết hạn, lệch hoá đơn NCC'] },
    config: [
      { label: 'Cài đặt mua hàng', code: 'MH12', icon: 'Settings', color: '#64748b', path: '/mua-hang/cai-dat', hint: 'Ngưỡng cảnh báo, duyệt, số ngày nhắc' },
    ],
    side: [
      { label: 'Chuyển hàng xuống shop', code: 'MH19', icon: 'Store', color: '#16a085', path: '/mua-hang/chuyen-shop', hint: 'Từ kho chi nhánh về shop theo tồn max' },
      { label: 'Quà tặng', code: 'MH09', icon: 'Gift', color: '#e05a8c', path: L('gift_in'), newPath: N('gift_in'), kinds: ['gift_in', 'gift_out'], todo: ['gifts'], printText: ['Phiếu nhập quà', 'Phiếu xuất kho 02-VT'], hint: 'Nhận quà không hoá đơn, xuất tặng' },
      { label: 'Chi phí mua hàng', icon: 'Truck', color: '#2d9cdb', path: L('cost'), newPath: N('cost'), kinds: ['cost'], todo: ['costs'], print: ['cost'], hint: 'Vận chuyển, bốc xếp → vào giá vốn' },
      { label: 'Lô & hạn dùng', code: 'MH08', icon: 'CalendarClock', color: '#b7791f', path: '/mua-hang/lo-han', todo: ['expired', 'near'], hint: 'Tồn theo lô, nhắc cận date' },
    ],
  },
  {
    node: { label: 'Đối chiếu tiến độ nhập', code: 'MH21', icon: 'GitCompareArrows', color: '#d35400', path: '/mua-hang/doi-chieu', todo: ['outside'],
      auto: ['Thấy ngay đơn nào giao thiếu, giao thừa, lệch giá', 'Phiếu nhập không theo đơn được tách riêng để rà soát', 'Biết đơn nào còn chờ NCC giao', 'Hoá đơn NCC so từng dòng với phiếu nhập: số lượng, giá, thuế, tổng tiền'] },
    config: [],
    side: [
      { label: 'Hoá đơn NCC & đối soát', code: 'MH22', icon: 'FileCheck2', color: '#0f766e', path: '/mua-hang/hoa-don-ncc', todo: ['inv_unmatched', 'inv_no_receipt'], hint: 'Nhập Excel / quét hoá đơn NCC, phần mềm tự nhận mã và so từng dòng với phiếu nhập' },
      { label: 'Trả lại / đổi hàng', icon: 'RotateCcw', color: '#eb5757', path: L('return'), newPath: N('return'), kinds: ['return', 'exchange'], print: ['return', 'exchange'], hint: 'Hàng sai, hỏng, cận date — gắn phiếu gốc' },
    ],
  },
  {
    node: { label: 'Công nợ & hạn trả', code: 'MH05', icon: 'ShieldCheck', color: '#8e44ad', path: '/mua-hang/han-muc', todo: ['overdue', 'due', 'soon'],
      auto: ['Hạn trả tính sẵn theo điều khoản của NCC', 'Nhắc các khoản đến hạn, quá hạn', 'Vượt hạn mức thì cần người có quyền duyệt'] },
    config: [],
    side: [
      { label: 'Chiết khấu sau mua', icon: 'BadgePercent', color: '#d4a017', path: L('rebate'), newPath: N('rebate'), kinds: ['rebate'], print: ['rebate'], hint: 'NCC giảm thêm, hỗ trợ' },
      { label: 'Thưởng cuối kỳ', code: 'MH06', icon: 'Award', color: '#c0392b', path: '/mua-hang/thuong', todo: ['rebates'], hint: 'Doanh số, chỉ tiêu, giai đoạn' },
    ],
  },
  {
    node: { label: 'Trả tiền NCC', icon: 'Banknote', color: '#f2994a', path: L('payment'), newPath: N('payment'), kinds: ['payment'], printText: ['Phiếu chi 02-TT', 'Ủy nhiệm chi (chuyển khoản)'],
      auto: ['Gợi ý khoản nên trả trước', 'Trả đúng hạn được hưởng chiết khấu thanh toán', 'Tiền đã ứng trước được trừ vào nợ'] },
    config: [
      { label: 'Mẫu in chứng từ', code: 'HT05', icon: 'Printer', color: '#64748b', path: '/cau-hinh/mau-in', hint: 'Chọn mẫu mặc định, khổ giấy, chữ ký cho mọi phiếu mua hàng' },
    ],
    side: [
      { label: 'Phân bổ & giá vốn thực tế', code: 'MH07', icon: 'Calculator', color: '#34495e', path: '/mua-hang/phan-bo', hint: 'Chi phí, thưởng, quà → giá từng mã' },
    ],
  },
];


/** Tên các mẫu in của bước: theo loại phiếu (danh sách mẫu in MH03) + tên ghi tay; bỏ trùng. */
const printNames = (n: Node) => [...new Set([...(n.print ?? []).flatMap((k) => (MAU_IN[k as keyof typeof MAU_IN] ?? []).map((t) => t.name)), ...(n.printText ?? [])])];
const PrintLine = ({ n, short }: { n: Node; short?: boolean }) => {
  const names = printNames(n);
  return names.length ? <span className="mf-print" title={`Mở phiếu → bấm In (chọn mẫu, khổ giấy). Mẫu: ${names.join('; ')}`}><Icons.Printer size={12} /> In: {short && names.length > 1 ? `${names[0]} (+${names.length - 1} mẫu)` : names.join(' · ')}</span> : null;
};

const Icon = ({ name, size = 18, color }: { name: string; size?: number; color?: string }) => {
  const C = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] || Icons.Circle;
  return <C size={size} color={color} />;
};

/** Các thành phần đang bật của công thức đặt hàng, mỗi dòng một dấu + / −. */
function FormulaTerms({ cfg }: { cfg: FormulaConfig }) {
  const on = cfg.terms.filter((t) => t.on);
  if (!on.length) return <span className="mf-formula muted"> chưa bật thành phần nào</span>;
  return (
    <span className="mf-formula">
      {on.map((t) => {
        const name = t.key === 'banShop' ? `Bán ${t.days ?? 7} ngày của mọi shop` : t.key === 'maxShop' && cfg.shopGapMode === 'positive' ? 'Phần thiếu của từng shop' : varLabel(t.key);
        const f = t.factor && t.factor !== 1 ? ` × ${String(t.factor).replace('.', ',')}` : '';
        return <span key={t.key} className={t.sign < 0 ? 'minus' : 'plus'}><b>{t.sign < 0 ? '−' : '+'}</b> {name}{f}</span>;
      })}
    </span>
  );
}

export function QuyTrinhMuaHang() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['mua-hang', 'todo'], queryFn: () => api.get<Todo>(`${P}/todo`), refetchOnWindowFocus: true });
  const items = q.data?.items ?? [];
  // Công thức đặt hàng đang lưu của chi nhánh cha (chi nhánh đang làm việc → cha của shop → lần chọn trước → chi nhánh đầu).
  const h = useHierarchy();
  const branches = h.data?.branches ?? [];
  const parents = branches.filter((b) => b.level === 'branch');
  const wb = branches.find((b) => b.code === workBranch.get());
  const want = wb?.level === 'branch' ? wb.code : wb?.level === 'shop' ? wb.parentCode ?? '' : lastParent.get();
  const parent = parents.find((p) => p.code === want) ?? parents[0];
  const fq = useQuery({ queryKey: ['ton-max', 'formula', parent?.code], enabled: Boolean(parent), queryFn: () => stockApi.formula(parent!.code) });
  const cfg: FormulaConfig = fq.data ? normalizeFormula(fq.data.config) : DEFAULT_FORMULA;
  const orderAuto: ReactNode[] = [
    <><b>Số cần mua</b>{parent ? ` (${parent.code})` : ''} =<FormulaTerms cfg={cfg} /></>,
    <><b>Phân cha – con:</b> tồn của mã con (quà, kẹp quà, mã Z…) cộng vào mã cha — mã con còn nhiều thì mua mã cha ít đi, không bị thừa</>,
    'Chia sẵn theo NCC, bấm một lần là ra đơn',
  ];
  const count = (kinds?: string[]) => {
    const k = (kinds ?? []).map((x) => q.data?.byKind[x] ?? { draft: 0, pending: 0, approved: 0 });
    const pending = k.reduce((s, x) => s + x.pending, 0), draft = k.reduce((s, x) => s + x.draft, 0);
    return pending ? <span className="mf-badge warn">{pending} chờ duyệt</span> : draft ? <span className="mf-badge info">{draft} nháp</span> : null;
  };
  const alerts = (keys?: string[]) => items.filter((t) => keys?.includes(t.key)).map((t) => (
    <Link key={t.key} to={t.path} className={`mf-alert ${t.level}`} onClick={(e) => e.stopPropagation()}><b>{t.count}</b> {t.text}</Link>
  ));
  const NewBtn = ({ n }: { n: Node }) => n.newPath ? <button type="button" className="mf-new" onClick={(e) => { e.stopPropagation(); navigate(n.newPath!); }}><Icons.Plus size={13} /> Lập mới</button> : null;

  const small = (n: Node, kind: 'cfg' | 'side') => (
    <div key={n.path} className={`mf-small ${kind}`} role="button" tabIndex={0} title={n.hint} onClick={() => navigate(n.path)} onKeyDown={(e) => e.key === 'Enter' && navigate(n.path)}>
      <span className="mf-small-icon" style={{ color: n.color }}><Icon name={n.icon} size={16} /></span>
      <span className="mf-small-text">
        <span className="mf-small-label">{n.label}{n.code && <i>{n.code}</i>}</span>
        {n.hint && <span className="mf-small-hint">{n.hint}</span>}
        <PrintLine n={n} short />
        {count(n.kinds)}{alerts(n.todo)}
        <NewBtn n={n} />
      </span>
    </div>
  );

  return (
    <div className="mf">
      <div className="mf-card">
        <div className="mf-head">Việc cần làm {q.isFetching && <span className="muted" style={{ fontWeight: 400 }}>· đang cập nhật…</span>}</div>
        {items.length ? (
          <div className="mf-todo">
            {items.map((t) => <Link key={t.key} to={t.path} className={`mf-todo-item ${t.level}`}><b>{t.count}</b><span>{t.text}{t.amount ? ` · ${vnd(t.amount)}` : ''}</span></Link>)}
          </div>
        ) : <div className="mf-todo-ok">{q.isLoading ? 'Đang kiểm tra…' : '✓ Không có việc tồn đọng — mọi chứng từ đã xử lý.'}</div>}
      </div>

      <div className="mf-card">
        <div className="mf-head">
          Luồng mua hàng — đi từ tồn max đến trả tiền nhà cung cấp
        </div>
        <div className="mf-scroll">
          <div className="mf-grid" style={{ ['--n' as string]: STAGES.length, gridTemplateColumns: `96px ${STAGES.map((_, i) => (i === 1 ? 'minmax(230px, 1.9fr)' : 'minmax(132px, 1fr)')).join(' ')}` }}>
            <div className="mf-lane-label cfg"><Icons.Settings2 size={15} /> Khai báo<small>làm một lần, sửa khi cần</small></div>
            {STAGES.map((s, i) => <div key={i} className={`mf-cell cfg ${s.config.length ? 'has' : ''}`}>{s.config.map((n) => small(n, 'cfg'))}</div>)}

            <div className="mf-lane-label main"><Icons.Workflow size={15} /> Luồng chính<small>theo thứ tự thời gian</small></div>
            {STAGES.map((s, i) => (
              <div key={i} className={`mf-cell main ${i < STAGES.length - 1 ? 'next' : ''}`}>
                <div className="mf-stage" role="button" tabIndex={0} title="Bấm để mở" style={{ ['--c' as string]: s.node.color }}
                  onClick={() => navigate(s.node.path)} onKeyDown={(e) => e.key === 'Enter' && navigate(s.node.path)}>
                  <div className="mf-stage-top">
                    <span className="mf-num">{i + 1}</span>
                    <span className="mf-stage-icon"><Icon name={s.node.icon} size={22} color="#fff" /></span>
                    {count(s.node.kinds)}
                  </div>
                  <div className="mf-stage-label">{s.node.label}{s.node.code && <i>{s.node.code}</i>}</div>
                  <ul className="mf-auto">{(i === 1 ? orderAuto : s.node.auto)?.map((a, i) => <li key={i}><Icons.Sparkles size={12} /> <span>{a}</span></li>)}</ul>
                  <PrintLine n={s.node} />
                  {alerts(s.node.todo)}
                  <NewBtn n={s.node} />
                </div>
              </div>
            ))}

            <div className="mf-lane-label side"><Icons.CornerDownRight size={15} /> Phát sinh<small>treo dưới bước sinh ra nó</small></div>
            {STAGES.map((s, i) => <div key={i} className={`mf-cell side ${s.side.length ? 'has' : ''}`}>{s.side.map((n) => small(n, 'side'))}</div>)}
          </div>
          <div className="mf-loop"><Icons.RefreshCcw size={14} /> Hàng bán ra ở shop làm tồn giảm → <b>Phân tích đặt hàng</b> tự đề xuất lần đặt kế tiếp — vòng mua hàng lặp lại.</div>
        </div>
      </div>
    </div>
  );
}
