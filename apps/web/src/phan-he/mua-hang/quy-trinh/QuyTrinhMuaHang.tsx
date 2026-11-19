/**
 * QUY TRÌNH MUA HÀNG — trang chủ phân hệ Mua hàng (thẻ "Quy trình"): SƠ ĐỒ LUỒNG để người mới / kế toán nhìn là thấy cả bức tranh.
 *   Tầng trên  — khai báo / cấu hình (làm một lần): phân cấp chi nhánh → shop, công thức, mặt hàng, NCC & giá, chính sách…; mỗi ô nối xuống bước dùng nó.
 *   Tầng giữa  — luồng chính, chạy từ TỒN MAX: tồn max → phân tích đặt hàng → đơn đặt (tự áp khuyến mại) → nhập kho khi NCC giao
 *                → đối chiếu tiến độ nhập → công nợ & hạn trả → trả tiền NCC. Mỗi bước ghi rõ máy TỰ ĐỘNG làm gì.
 *   Tầng dưới  — phát sinh bên rìa, treo dưới đúng bước sinh ra nó: ứng trước, chuyển xuống shop, quà, chi phí, lô hạn, trả hàng, thưởng…
 *   Việc cần làm (máy chủ gom ở /purchase/todo) hiện ở trên và gắn cảnh báo vào đúng ô trên sơ đồ.
 *
 * [2026-11-13 02:50 PM Võ Hoàng] UX-14 — khung vẽ chuyển sang khuôn dùng chung components/quy-trinh/LuongChiTiet (chữ chốt cap-nhat-ux/14); trang này chỉ còn khai
 * dữ liệu (STAGES), việc cần làm, số phiếu, mẫu in, công thức đặt hàng sống. Giao diện không đổi (đóng góp).
 */
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuongChiTiet, type LuongNode } from '@/components/quy-trinh/LuongChiTiet';
import { useQuery } from '@tanstack/react-query';
import * as Icons from 'lucide-react';
import { api } from '@/lib/api';
import { workBranch } from '@/lib/workBranch';
import { DEFAULT_FORMULA, normalizeFormula, varLabel, type FormulaConfig } from '@bizcity/mua-hang-domain';
import { lastParent, stockApi, useHierarchy } from '../ton-max/api';
import { P, vnd } from '../du-lieu';
import { MAU_IN } from '../chung-tu/mauIn';

interface TodoItem { key: string; level: 'error' | 'warn' | 'info'; text: string; count: number; amount?: number; path: string }
interface Todo { byKind: Record<string, { draft: number; pending: number; approved: number }>; items: TodoItem[] }

interface Node extends LuongNode {
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

const L = (kind: string) => `/mua-hang/tong-hop?loai=${kind}`;
const N = (kind: string) => `/mua-hang/tong-hop?moi=${kind}`;

// [2026-11-18 Nguyễn Văn Thủy] sắp theo quy trình mua hàng của kế toán: khai báo → hợp đồng (giá, chính sách) → nhu cầu → đơn đặt → nhận hàng
// → hoá đơn & công nợ → thanh toán → trả hàng / quyết toán / thanh lý (đóng góp)
const STAGES: Stage[] = [
  {
    node: { label: '1. Khai báo NCC, mặt hàng', code: 'MH01', icon: 'Building2', color: '#5b6cff', path: '/mua-hang/nha-cung-cap',
      auto: ['Kiểm tra trùng mã số thuế', 'Mặt hàng: mã, ĐVT, lô / hạn dùng, thuế suất — nhãn, ngành tự theo nhóm hàng'] },
    config: [
      { label: 'Danh mục mặt hàng', code: 'DM10', icon: 'Package', color: '#64748b', path: '/danh-muc/mat-hang', hint: 'Mã, ĐVT, thuế; mã con (quà, mã Z…) gắn mã cha' },
      { label: 'Nhóm hàng', code: 'DM11', icon: 'FolderTree', color: '#64748b', path: '/danh-muc/phan-loai-hang', hint: 'Ngành → nhãn → nhóm; chọn nhóm là mã hàng tự sinh' },
      { label: 'Cơ cấu tổ chức', code: 'DM16', icon: 'Network', color: '#64748b', path: '/danh-muc/so-do-to-chuc', hint: 'Chi nhánh mua cho các shop bên dưới' },
    ],
    side: [],
  },
  {
    node: { label: '2. Ký hợp đồng mua', code: 'MH29', icon: 'FileSignature', color: '#0f766e', path: '/mua-hang/hop-dong', newPath: '/mua-hang/hop-dong',
      auto: ['Một hợp đồng gom: bảng giá mua, chiết khấu, thưởng, quà, hạn mức, hạn thanh toán', 'Có hiệu lực từ – đến; sửa sau khi ký = phụ lục (giữ từng bản)', 'Lưu bản scan hợp đồng'] },
    config: [
      { label: 'Giá mua của NCC', code: 'MH01', icon: 'Tags', color: '#64748b', path: '/mua-hang/nha-cung-cap', hint: 'Mở hợp đồng › Mặt hàng & giá' },
      { label: 'Chính sách mua hàng', code: 'MH04', icon: 'BadgePercent', color: '#64748b', path: '/mua-hang/chinh-sach', hint: 'Mở hợp đồng › Chiết khấu, Thưởng, Hạn mức; MH04 xem tổng hợp' },
    ],
    side: [],
  },
  {
    node: { label: '3. Xác định nhu cầu', code: 'MH02', icon: 'ScanSearch', color: '#2f80ed', path: '/mua-hang/dat-hang', auto: [] },
    config: [
      { label: 'Tồn max', code: 'MH16', icon: 'Gauge', color: '#64748b', path: '/mua-hang/ton-max', hint: 'Shop đăng ký, kế toán mua hàng duyệt / sửa' },
      { label: 'Phiếu đăng ký tồn max', code: 'MH17', icon: 'FilePen', color: '#64748b', path: '/mua-hang/dang-ky-max', hint: 'Shop lập, kế toán mua hàng duyệt' },
      { label: 'Công thức đặt hàng', code: 'MH18', icon: 'Sigma', color: '#64748b', path: '/mua-hang/cong-thuc', hint: 'Số ngày bán, shop tính vào, kho chuẩn' },
    ],
    side: [],
  },
  {
    node: { label: '4. Đơn đặt hàng', icon: 'ClipboardList', color: '#0ea5e9', path: L('order'), newPath: N('order'), kinds: ['order'], todo: ['orders'], print: ['order'],
      auto: ['Chọn NCC là tự lấy hợp đồng đang hiệu lực: giá, chiết khấu, kỳ hạn theo hợp đồng', 'Giá lệch hợp đồng: báo ngay, lệch nhiều cần cấp trên duyệt', 'Báo trước nếu vượt hạn mức công nợ'] },
    config: [],
    side: [
      { label: 'Ứng trước NCC', icon: 'HandCoins', color: '#9b51e0', path: L('prepayment'), newPath: N('prepayment'), kinds: ['prepayment'], printText: ['Phiếu chi', 'Ủy nhiệm chi'], hint: 'Đặt cọc, trả trước — tự đối trừ khi hàng về' },
    ],
  },
  {
    node: { label: '5. Nhận hàng, nhập kho', icon: 'PackageCheck', color: '#27ae60', path: L('receipt'), newPath: N('receipt'), kinds: ['receipt'], print: ['receipt'],
      auto: ['Lập từ đơn: có sẵn phần hàng còn chờ giao, số hợp đồng, số đơn', 'Ghi số lô, hạn dùng; không nhập vượt đơn', 'Hàng tặng, hạn thanh toán điền sẵn'] },
    config: [
      { label: 'Cài đặt mua hàng', code: 'MH12', icon: 'Settings', color: '#64748b', path: '/mua-hang/cai-dat', hint: 'Ngưỡng lệch giá, bắt buộc theo đơn' },
    ],
    side: [
      { label: 'Lô & hạn dùng', code: 'MH08', icon: 'CalendarClock', color: '#b7791f', path: '/mua-hang/lo-han', todo: ['expired', 'near'], hint: 'Tồn theo lô, nhắc cận date' },
      { label: 'Quà tặng', code: 'MH09', icon: 'Gift', color: '#e05a8c', path: L('gift_in'), newPath: N('gift_in'), kinds: ['gift_in', 'gift_out'], todo: ['gifts'], printText: ['Phiếu nhập quà', 'Phiếu xuất kho 02-VT'], hint: 'Nhận quà không hoá đơn, xuất tặng' },
      { label: 'Chuyển hàng xuống shop', code: 'MH19', icon: 'Store', color: '#16a085', path: '/mua-hang/chuyen-shop', hint: 'Từ kho chi nhánh về shop theo tồn max' },
    ],
  },
  {
    node: { label: '6. Hoá đơn mua & công nợ', code: 'MH22', icon: 'FileCheck2', color: '#8e44ad', path: '/mua-hang/hoa-don-ncc', todo: ['inv_unmatched', 'inv_no_receipt', 'overdue', 'due', 'soon'],
      auto: ['Đối chiếu hợp đồng, đơn đặt với hoá đơn và phiếu nhập', 'Ghi nhận công nợ tự động, hạn trả theo hợp đồng', 'Công nợ theo từng hợp đồng'] },
    config: [],
    side: [
      { label: 'Chi phí mua hàng', icon: 'Truck', color: '#2d9cdb', path: L('cost'), newPath: N('cost'), kinds: ['cost'], todo: ['costs'], print: ['cost'], hint: 'Vận chuyển, bốc xếp → phân bổ vào giá vốn' },
      { label: 'Đối chiếu đơn ↔ phiếu nhập', code: 'MH21', icon: 'GitCompareArrows', color: '#d35400', path: '/mua-hang/doi-chieu', todo: ['outside'], hint: 'Giao thiếu, thừa, lệch giá' },
      { label: 'Công nợ & hạn trả', code: 'MH05', icon: 'ShieldCheck', color: '#8e44ad', path: '/mua-hang/han-muc', hint: 'Hạn mức, khoản đến hạn, quá hạn' },
      { label: 'Công nợ theo hợp đồng', code: 'MH30', icon: 'BookOpenCheck', color: '#0f766e', path: '/mua-hang/cong-no-hop-dong', hint: 'Sổ tổng hợp / chi tiết theo hợp đồng' },
    ],
  },
  {
    node: { label: '7. Thanh toán', icon: 'Banknote', color: '#f2994a', path: L('payment'), newPath: N('payment'), kinds: ['payment'], printText: ['Phiếu chi 02-TT', 'Ủy nhiệm chi (chuyển khoản)'],
      auto: ['Chỉ trả khoản đã khớp hợp đồng, hoá đơn, đơn đặt', 'Trả đúng hạn được chiết khấu thanh toán', 'Tiền ứng trước được trừ vào nợ'] },
    config: [
      { label: 'Mẫu in chứng từ', code: 'HT05', icon: 'Printer', color: '#64748b', path: '/cau-hinh/mau-in', hint: 'Mẫu mặc định, khổ giấy, chữ ký' },
    ],
    side: [],
  },
  {
    node: { label: '8. Trả hàng, quyết toán, thanh lý', code: 'MH06', icon: 'Award', color: '#c0392b', path: '/mua-hang/thuong', todo: ['rebates'],
      auto: ['Thưởng, chiết khấu tự tính theo số mua thực tế', 'Trả hàng tham chiếu phiếu nhập gốc', 'Thanh lý hợp đồng khi hết hiệu lực'] },
    config: [],
    side: [
      { label: 'Trả lại / đổi hàng', icon: 'RotateCcw', color: '#eb5757', path: L('return'), newPath: N('return'), kinds: ['return', 'exchange'], print: ['return', 'exchange'], hint: 'Gắn phiếu nhập gốc' },
      { label: 'Chiết khấu sau mua', icon: 'BadgePercent', color: '#d4a017', path: L('rebate'), newPath: N('rebate'), kinds: ['rebate'], print: ['rebate'], hint: 'NCC giảm thêm, hỗ trợ' },
      { label: 'Phân bổ & giá vốn thực tế', code: 'MH07', icon: 'Calculator', color: '#34495e', path: '/mua-hang/phan-bo', hint: 'Chi phí, thưởng, quà → giá từng mã' },
      { label: 'Thanh lý hợp đồng', code: 'MH29', icon: 'FileX2', color: '#64748b', path: '/mua-hang/hop-dong', hint: 'Mở hợp đồng → Trạng thái "Đã thanh lý"' },
    ],
  },
];


/** Tên các mẫu in của bước: theo loại phiếu (danh sách mẫu in MH03) + tên ghi tay; bỏ trùng. */
const printNames = (n: Node) => [...new Set([...(n.print ?? []).flatMap((k) => (MAU_IN[k as keyof typeof MAU_IN] ?? []).map((t) => t.name)), ...(n.printText ?? [])])];
const PrintLine = ({ n, short }: { n: Node; short?: boolean }) => {
  const names = printNames(n);
  return names.length ? <span className="mf-print" title={`Mở phiếu → bấm In (chọn mẫu, khổ giấy). Mẫu: ${names.join('; ')}`}><Icons.Printer size={12} /> In: {short && names.length > 1 ? `${names[0]} (+${names.length - 1} mẫu)` : names.join(' · ')}</span> : null;
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

  const stages = STAGES.map((st, i) => (i === 2 ? { ...st, node: { ...st.node, auto: orderAuto } } : st));
  return (
    <LuongChiTiet
      title="Quy trình mua hàng — từ khai báo, ký hợp đồng đến thanh toán và thanh lý"
      stages={stages}
      column={(i) => (i === 2 ? 'minmax(220px, 1.7fr)' : 'minmax(128px, 1fr)')}
      badge={(n) => count((n as Node).kinds)}
      extra={(n, place) => <><PrintLine n={n as Node} short={place !== 'stage'} />{alerts((n as Node).todo)}<NewBtn n={n as Node} /></>}
      todo={{ items, loading: q.isLoading, fetching: q.isFetching, error: q.isError, retry: () => void q.refetch(), money: vnd }}
      loop={<>Hàng bán ra ở shop làm tồn giảm → <b>Phân tích đặt hàng</b> tự đề xuất lần đặt kế tiếp — vòng mua hàng lặp lại.</>}
    />
  );
}
