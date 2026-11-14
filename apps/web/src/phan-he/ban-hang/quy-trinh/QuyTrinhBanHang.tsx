// [2026-11-13 03:20 PM Võ Hoàng] UX-14 — Luồng chi tiết phân hệ Bán hàng theo khuôn dùng chung (chữ chốt cap-nhat-ux/14, phiếu NT-BH-013) (đóng góp)
/**
 * QUY TRÌNH BÁN HÀNG — thẻ "Luồng chi tiết" ở /nhom/ban-hang?xem=chi-tiet. Chỉ khai dữ liệu; khung vẽ ở components/quy-trinh/LuongChiTiet.
 *   7 bước: giá & chính sách → bán hàng (máy POS + phiếu bán) → hoá đơn điện tử → thu tiền → trả / đổi hàng → công nợ phải thu → đối chiếu.
 *   Việc cần làm: Core (/api/v1/ban-hang/viec-can-lam — chứng từ lỗi / chờ, hạn mức chương trình, phải thu quá hạn) + module pos (đơn chờ
 *   tiền QR, ca chưa chốt từ hôm trước). Module pos tắt / không có quyền xem → ẩn ô máy POS, không đếm.
 */
// [2026-11-13 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-014: ô Định khoản bán hàng mở khối tài khoản của Cài đặt bán hàng BH17 (đóng góp)
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LuongChiTiet, type LuongNode, type LuongStage, type ViecCanLam } from '@/components/quy-trinh/LuongChiTiet';

interface Node extends LuongNode { kinds?: ('sale' | 'sale_return')[]; todo?: string[]; pos?: boolean }
interface CoreTodo { byKind: Record<string, { pending: number; error: number }>; items: ViecCanLam[] }

const GRAY = '#64748b';
const day = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);

const STAGES: { node: Node; config: Node[]; side: Node[] }[] = [
  {
    node: { label: 'Giá & chính sách', code: 'BH18', icon: 'BadgePercent', color: '#7c3aed', path: '/app/pos/khuyen-mai', todo: ['program_quota'], hint: 'Chương trình khuyến mại: 6 loại khuyến mại + tặng / giảm có hạn mức cửa hàng',
      auto: ['Giá lấy theo bảng giá cửa hàng → chi nhánh → công ty', 'Khuyến mại do phần mềm kế toán tính, mọi máy cùng một kết quả', 'Mỗi cửa hàng một hạn mức chương trình, tự trừ khi bán, tự trả khi huỷ / trả hàng'] },
    config: [
      { label: 'Bảng giá', code: 'DM14', icon: 'Tags', color: GRAY, path: '/danh-muc/bang-gia', hint: 'Bảng giá công ty, chi nhánh' },
      { label: 'Khách hàng', code: 'DM12', icon: 'Users', color: GRAY, path: '/danh-muc/khach-hang', hint: 'Khách lẻ, khách theo SĐT, hạng thành viên' },
      // [2026-11-15 10:20 AM Võ Hoàng] NGHIEM-THU — NT-BH-018: bỏ ô Khuyến mại riêng — ô lớn "Giá & chính sách" mở BH18 Chương trình khuyến mại (gộp BH12) (đóng góp)
    ],
    side: [
      { label: 'Sổ chính sách', code: 'HT15', icon: 'BookMarked', color: '#7c3aed', path: '/he-thong/chinh-sach', hint: 'Mọi bản chương trình đã phát hành, chứng từ đã áp' },
    ],
  },
  {
    node: { label: 'Bán hàng', code: 'BH10', icon: 'ShoppingCart', color: '#d93025', path: '/ban-hang/phieu-ban', kinds: ['sale'],
      auto: ['Máy bán gửi từng đơn, phần mềm tự lập chứng từ bán và ghi sổ ngay', 'Gửi lại cùng đơn không ghi trùng', 'Hàng chưa có / chưa khai thuế bị chặn ngay ở quầy'] },
    config: [
      { label: 'Mặt hàng', code: 'DM10', icon: 'Package', color: GRAY, path: '/danh-muc/mat-hang', hint: 'Mã thuế đầu ra, gửi lên thuế, ĐVT' },
      { label: 'Cài đặt bán hàng', code: 'BH17', icon: 'Settings', color: GRAY, path: '/app/pos/cai-dat', pos: true, hint: 'Máy bán, ghi sổ chứng từ bán, chênh lệch két, tài khoản' },
    ],
    side: [
      { label: 'Đơn bán máy POS', code: 'BH13', icon: 'Store', color: '#d93025', path: '/app/pos/don-ban', pos: true, todo: ['pos_qr'], hint: 'Đơn tại quầy, đối chiếu với chứng từ' },
      { label: 'Xuất điều chỉnh', code: 'BH06', icon: 'PackageMinus', color: '#b45309', path: '/ban-hang/xuat-dieu-chinh', hint: 'Dùng nội bộ, tặng, huỷ hỏng' },
    ],
  },
  {
    node: { label: 'Hoá đơn điện tử', code: 'THUE', icon: 'FileText', color: '#0f766e', path: '/thue/bang-ke-ban-ra',
      auto: ['Phát hành ngầm ngay sau bill (plugin hoá đơn của website)', 'Người mua (MST, email) lưu ở đơn', 'Quà dưới 24 tháng, hàng không gửi thuế không lên hoá đơn'] },
    config: [],
    side: [
      { label: 'Bảng kê bán ra', icon: 'ListChecks', color: '#0f766e', path: '/thue/bang-ke-ban-ra', hint: 'Đối chiếu hoá đơn với sổ' },
    ],
  },
  {
    node: { label: 'Thu tiền', code: 'BH03', icon: 'Banknote', color: '#16a34a', path: '/ban-hang/thu-tien',
      auto: ['Mỗi hình thức (tiền mặt, chuyển khoản, QR, thẻ, voucher) một phiếu thu về đúng tài khoản', 'QR: đơn chờ tiền về hoặc thu ngân xác nhận', 'Tiền thối không ghi sổ', 'Chốt ca lệch két: tự lập phiếu kế toán thiếu (1381) / thừa (3381)'] },
    config: [
      { label: 'Hình thức thanh toán', code: 'DM05', icon: 'CreditCard', color: GRAY, path: '/cau-hinh/hinh-thuc-thanh-toan', hint: 'Mỗi hình thức một tài khoản tiền' },
    ],
    side: [
      { label: 'Sổ ca bán', code: 'BH15', icon: 'Clock', color: '#16a34a', path: '/app/pos/ca-ban', pos: true, todo: ['pos_shift'], hint: 'Két phải có, đếm được, chênh lệch' },
      { label: 'Thu tiền bán hàng', code: 'BH05', icon: 'Receipt', color: '#16a34a', path: '/ban-hang/thu-tien-ban-hang', hint: 'Phiếu thu nối phiếu bán' },
    ],
  },
  {
    node: { label: 'Trả / đổi hàng', code: 'BH11', icon: 'RotateCcw', color: '#eb5757', path: '/ban-hang/tra-lai', kinds: ['sale_return'],
      auto: ['Nối đơn gốc, tiền hoàn theo tiền khách đã trả', 'Quá hạn trả / đổi sang hàng rẻ hơn cần người duyệt', 'Trả hàng chính phải trả kèm quà; hạn mức chương trình tự trả lại'] },
    config: [],
    side: [
      { label: 'Phiếu trả máy POS', code: 'BH14', icon: 'Undo2', color: '#eb5757', path: '/app/pos/tra-hang', pos: true, hint: 'Trả / đổi tại quầy' },
    ],
  },
  {
    node: { label: 'Công nợ phải thu', code: 'ACC39', icon: 'ShieldCheck', color: '#8e44ad', path: '/bao-cao/cong-no-theo-han', todo: ['receivable_overdue'],
      auto: ['Hạn thu tính theo điều khoản của khách', 'Nhắc khoản đến hạn, quá hạn'] },
    config: [
      { label: 'Hạn mức nợ khách', icon: 'Gauge', color: GRAY, hint: 'Chặn bán vượt hạn mức' },
    ],
    side: [
      { label: 'Tuổi nợ quá hạn', code: 'ACC67B', icon: 'CalendarClock', color: '#8e44ad', path: '/bao-cao/tuoi-no-qua-han' },
      { label: 'Đối chiếu công nợ', code: 'CN07', icon: 'Handshake', color: '#8e44ad', path: '/cong-no/doi-chieu', hint: 'Biên bản gửi khách' },
    ],
  },
  {
    node: { label: 'Đối chiếu & báo cáo', code: 'BH02', icon: 'GitCompareArrows', color: '#d35400', path: '/ban-hang/tong-hop',
      auto: ['Doanh số, trả lại, doanh thu thuần theo cửa hàng, mặt hàng, khách', 'Đơn máy POS khớp từng chứng từ trong sổ', 'Lãi gộp sau khi tính giá vốn cuối tháng'] },
    config: [
      { label: 'Tài khoản ngầm định', code: 'ACC41', icon: 'BookOpen', color: GRAY, path: '/cau-hinh/tai-khoan-ngam-dinh', hint: 'Doanh thu, thuế, phải thu, trả lại' },
      { label: 'Định khoản bán hàng', code: 'BH17', icon: 'Split', color: GRAY, path: '/app/pos/cai-dat', pos: true, hint: 'Tài khoản theo loại chứng từ bán, phiếu chênh lệch két' },
    ],
    side: [
      { label: 'Tổng quan bán lẻ', code: 'BH16', icon: 'LayoutDashboard', color: '#d35400', path: '/app/pos/tong-quan', pos: true },
      { label: 'Lãi gộp', code: 'BH04', icon: 'TrendingUp', color: '#d35400', path: '/ban-hang/lai-gop' },
      { label: 'Sổ nhật ký bán hàng', code: 'ACC84', icon: 'BookText', color: '#d35400', path: '/cong-no/nhat-ky-ban-hang' },
    ],
  },
];

export function QuyTrinhBanHang() {
  const core = useQuery({ queryKey: ['ban-hang', 'viec-can-lam'], queryFn: () => api.get<CoreTodo>('/api/v1/ban-hang/viec-can-lam'), refetchOnWindowFocus: true });
  // Module pos: đơn chờ tiền QR (30 ngày gần đây), ca còn mở từ hôm trước (7 ngày). Lỗi (module tắt / không có quyền) → coi như không có máy POS.
  const qr = useQuery({ queryKey: ['ban-hang', 'pos-qr'], retry: false,
    queryFn: async () => Number((await api.getPage<unknown[]>('/api/v1/m/pos/admin/orders', { status: 'awaiting_payment', from: day(-30), to: day(), pageSize: 1 })).meta?.total ?? 0) });
  const shifts = useQuery({ queryKey: ['ban-hang', 'pos-shift'], retry: false, enabled: qr.isSuccess,
    queryFn: async () => (await api.get<{ status?: string }[]>('/api/v1/m/pos/admin/shifts', { from: day(-7), to: day(-1) })).filter((s) => s.status === 'open').length });
  const posOn = qr.isSuccess;

  const items: ViecCanLam[] = [
    ...(core.data?.items ?? []),
    ...(posOn && qr.data ? [{ key: 'pos_qr', level: 'warn' as const, text: 'đơn máy POS chờ tiền QR', count: qr.data, path: '/app/pos/don-ban' }] : []),
    ...(posOn && shifts.data ? [{ key: 'pos_shift', level: 'warn' as const, text: 'ca bán còn mở từ hôm trước — chốt ca', count: shifts.data, path: '/app/pos/ca-ban' }] : []),
  ];
  const keep = (n: Node) => posOn || !n.pos;
  const stages: LuongStage[] = STAGES.map((s) => ({ node: s.node, config: s.config.filter(keep), side: s.side.filter(keep) }));
  const badge = (n: LuongNode) => {
    const k = ((n as Node).kinds ?? []).map((x) => core.data?.byKind[x] ?? { pending: 0, error: 0 });
    const error = k.reduce((t, x) => t + x.error, 0), pending = k.reduce((t, x) => t + x.pending, 0);
    return error ? <span className="mf-badge warn">{error} lỗi</span> : pending ? <span className="mf-badge info">{pending} chờ</span> : null;
  };
  const extra = (n: LuongNode) => items.filter((t) => (n as Node).todo?.includes(t.key)).map((t) => (
    <a key={t.key} href={t.path} className={`mf-alert ${t.level}`} onClick={(e) => e.stopPropagation()}><b>{t.count}</b> {t.text}</a>
  ));

  return (
    <LuongChiTiet
      title="Luồng bán hàng — từ giá & chính sách đến thu tiền, công nợ và đối chiếu"
      stages={stages}
      badge={badge}
      extra={(n) => <>{extra(n)}</>}
      todo={{ items, loading: core.isLoading, fetching: core.isFetching, error: core.isError, retry: () => void core.refetch() }}
      loop={<>Bán ra làm tồn giảm → <b>Mua hàng</b> đặt hàng lần kế; chương trình hết hạn mức → kinh doanh phân bổ lại ở <b>BH18</b> (thẻ Có hạn mức).</>}
    />
  );
}
