/**
 * CHỨNG TỪ MUA HÀNG (màn MH11 Tổng hợp mua hàng; trước là MH03) — một danh sách cho mọi chứng từ phía mua (bảng purchase_documents, phân biệt bằng loại).
 * Lọc theo loại, trạng thái, nhà cung cấp, khoảng ngày; cột "Cần xử lý" ghi bằng chữ việc cần xử lý của phiếu chưa duyệt
 * (kết quả kiểm tra lúc lưu, rê chuột xem đủ). Bấm đúp mở phiếu.
 * Liên kết: ?mo=<id | số phiếu> mở phiếu · ?moi=<loại> phiếu mới · ?ncc=<mã NCC> lọc + điền sẵn NCC (mở từ hồ sơ NCC) ·
 * ?nhan-tu=<id đơn đặt> lập phiếu nhập từ đơn (chép phần còn lại) · ?tu-hoa-don=<id hoá đơn NCC> lập phiếu nhập từ hoá đơn NCC (MH22) · ?nhap-excel=1 mở hộp nhập Excel.
 * Nút In (mẫu theo loại phiếu, mauIn.tsx): bảng chưa chọn được nhiều dòng nên in phiếu đang chọn.
 */
import { workBranch } from '@/lib/workBranch';
import { restoreDock } from '@/layout/WindowDock';
import { cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { invoiceLabel, orderProgress, receiptFromOrder, type PDoc } from '@ketoan/contracts/mua-hang';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading } from '@/components/ui';
import { PartnerPicker } from '@/components/pickers';
import { errorText } from '@/lib/api';
import { GOODS_KINDS, KIND_LABEL, STATUS_LABEL, lastUsed, nhapNgoaiDon, purchaseApi, today, useMuaHang, useNames, type StoredDoc } from '../du-lieu';
import { dmy } from '../chung';
import { PhieuMuaForm } from './PhieuMuaForm';
import { NhapExcel } from './NhapExcel';
import { receiptPartsFromInvoice } from '../hoa-don/api';
import { XemTheoMaHang } from './XemTheoMaHang';
import { congNo, tienPhieu } from './tienPhieu';
import { TongHopTheoNhom } from '../tong-hop/TongHopMuaPage';
import { LocKho, matchKho, useKhoOf, type KhoFilter } from '../thanh-phan/LocKho';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect } from '@/components/filters';
import { NccInfo } from '../thanh-phan/NccInfo';
import { PrintButton } from '@/components/print';
import { layPhieuIn, mauInCua } from './mauIn';

const GROUPS: [string, string, PDoc['kind'][]][] = [
  ['all', 'Tất cả', []], ['order', 'Đơn đặt hàng', ['order']], ['receipt', 'Nhập mua', ['receipt']], ['return', 'Trả / đổi hàng', ['return', 'exchange']],
  ['money', 'Ứng trước / trả tiền', ['prepayment', 'payment']], ['gift', 'Quà tặng', ['gift_in', 'gift_out']], ['adjust', 'Chi phí / thưởng', ['cost', 'rebate']],
];
/** Ngày giờ như màn chính sách: 10:44:18 24/10/2026. */
// Trong hồ sơ NCC mọi phiếu cùng một NCC → ẩn các cột thông tin NCC cho rộng chỗ.
const NCC_COLS = ['partner', 'partnerFull', 'partnerTax', 'partnerPhone', 'partnerAddress'];
const dt = (iso: string) => { const d = new Date(iso); return `${d.toLocaleTimeString('vi-VN', { hour12: false })} ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`; };
export const NEW_KINDS: PDoc['kind'][] = ['order', 'receipt', 'return', 'exchange', 'gift_in', 'gift_out', 'prepayment', 'payment', 'cost', 'rebate'];

/** Tên ngắn của từng loại kiểm tra (cột "Cần xử lý" — thay ký hiệu ⛔ / ⚠ bằng chữ). */
const CHECK_SHORT: Record<string, string> = {
  credit_exceeded: 'vượt hạn mức', credit_near: 'sắp hết hạn mức', price_fixed: 'lệch giá cố định', price_last: 'giá khác lần nhập trước',
  gift_qty: 'thiếu / thừa quà', lot_missing: 'thiếu số lô, hạn dùng', expired: 'hàng đã hết hạn', near_expiry: 'hàng cận date',
  invoice_dup: 'trùng số hoá đơn', invoice_total: 'lệch tổng hoá đơn', inv_diff: 'lệch hoá đơn NCC (MH22)', po_mismatch: 'lệch đơn đặt', po_over: 'nhận nhiều hơn đơn', po_price: 'lệch giá so với đơn',
  code_swap: 'đổi mã so với đơn', discount_over: 'chiết khấu lớn hơn tiền hàng', cktt_invalid: 'chiết khấu thanh toán sai', amount_missing: 'chưa nhập số tiền',
  cost_unassigned: 'chưa gắn phiếu nhập', rebate_unassigned: 'chưa gắn phiếu nhập',
  credit_overdue: 'NCC đang có nợ quá hạn', gift_over: 'xuất quà vượt tồn', gift_program: 'quà chưa gắn chương trình', gift_value: 'chưa có giá trị quà', return_over: 'trả nhiều hơn đã nhập',
  po_none_reason: 'nhập ngoài đơn — chưa ghi lý do', po_none: 'nhập ngoài đơn', po_not_approved: 'đơn đặt chưa duyệt', po_partial: 'giao thiếu so với đơn',
  price_missing: 'chưa có đơn giá', no_invoice: 'chưa có hoá đơn', no_buy_line: 'chưa có dòng hàng', new_item: 'mã hàng mới', new_item_unlinked: 'mã hàng mới chưa gắn NCC', prepayment: 'có tiền ứng trước', qty_zero: 'số lượng bằng 0', unit_unknown: 'ĐVT chưa khai', sku_unknown: 'mã chưa có trong danh mục', paid_already: 'phiếu nhập đã trả hết',
};
/** Loại kiểm tra chưa có tên ngắn: lấy vế đầu của câu (trước dấu — / :), không cắt giữa chừng. */
const shortOf = (c: { code: string; text: string }) => CHECK_SHORT[c.code] ?? c.text.split(/ — |: /)[0]!;
/**
 * Cột "Cần xử lý": phiếu chưa duyệt → việc cần xử lý đầu tiên bằng chữ ("Chặn duyệt: vượt hạn mức", "Lưu ý: lệch giá cố định
 * +1 việc khác"), rê chuột xem đủ; ổn thì "Ổn". Phiếu đã duyệt / đã huỷ không còn việc gì (duyệt ngoại lệ thì ghi rõ).
 */
/** Cảnh báo lệch đơn đặt lưu trên phiếu lúc duyệt: giao thiếu, giao thừa / mã ngoài đơn, lệch giá, đổi mã — giữ dấu sau khi duyệt để theo vết. */
const LECH_DON: Record<string, string> = { po_partial: 'giao thiếu', po_over: 'thừa / mã ngoài đơn', po_price: 'lệch giá', code_swap: 'đổi mã' };
const lechDon = (r: StoredDoc) => (r.kind === 'receipt' ? (r.checks ?? []).filter((c) => LECH_DON[c.code]) : []);

function canXuLy(r: StoredDoc): { text: string; cls: string; all: string } {
  if (r.status === 'cancelled') return { text: '', cls: '', all: '' };
  if (r.status === 'approved' && r.outsideOrder?.by && !r.outsideOrder.reviewedBy) return { text: 'Nhập ngoài đơn — chờ rà soát', cls: 'badge-warn', all: `Lý do: ${r.outsideOrder.reason} · duyệt: ${r.outsideOrder.by}${r.override ? ` · duyệt ngoại lệ bởi ${r.override.by}: ${r.override.reason}` : ''}` };
  if (r.status === 'approved' && lechDon(r).length) { const l = lechDon(r); return { text: `Lệch đơn: ${[...new Set(l.map((c) => LECH_DON[c.code]))].join(', ')}`, cls: 'badge-info', all: [...l.map((c) => `• ${c.text}`), ...(r.override ? [`Duyệt ngoại lệ bởi ${r.override.by}: ${r.override.reason}`] : [])].join('\n') }; }
  if (r.status === 'approved') return r.override ? { text: 'Duyệt ngoại lệ', cls: 'badge-warn', all: `Duyệt ngoại lệ bởi ${r.override.by}: ${r.override.reason}` } : { text: '', cls: '', all: '' };
  const list = (r.checks ?? []).filter((c) => c.level === 'error' || c.level === 'warn').sort((a, b) => Number(b.level === 'error') - Number(a.level === 'error'));
  if (!list.length) return { text: 'Ổn', cls: 'badge-ok', all: 'Không có cảnh báo — duyệt được' };
  const f = list[0]!;
  const block = list.some((c) => (c as { blocking?: boolean }).blocking);
  const more = list.length > 1 ? ` +${list.length - 1} việc khác` : '';
  return { text: `${block ? 'Chặn duyệt' : 'Lưu ý'}: ${shortOf(f)}${more}`, cls: block ? 'badge-bad' : 'badge-warn', all: list.map((c) => `• ${c.text}`).join('\n') };
}

/**
 * Nhúng trong hồ sơ NCC (thẻ Chứng từ): cùng màn này, khoá NCC (embedPartner), không tiêu đề trang; lệnh "lập mới / mở / lập phiếu
 * nhập từ đơn" truyền qua command (thay cho tham số trên địa chỉ) — người dùng vẫn ở hồ sơ NCC.
 */
/** formsOnly: chỉ chạy lệnh + hộp phiếu / nhập Excel, không vẽ danh sách (hồ sơ NCC lập / mở phiếu tại chỗ; xem danh sách thì mở MH11 / MH23). */
export interface ChungTuEmbed { embedPartner?: string; embedGroup?: string; command?: { q: string; n: number }; report?: Report; formsOnly?: boolean }
/**
 * Hai màn dùng thân màn này (bộ lọc trái, tab loại chứng từ phải — theo thói quen màn cũ):
 *   tong-hop  MH11 Tổng hợp mua hàng — MÀN LÀM VIỆC CHÍNH (thay MH03 cũ, /mua-hang/chung-tu chuyển về đây): danh sách PHIẾU
 *             (mỗi phiếu một dòng: tiền trước CK, CK, thuế, tổng, công nợ), lập / sửa / duyệt / in / nhập Excel phiếu,
 *             + kiểu "Gom theo NCC / chi nhánh / mã / nhóm / ngành / nhãn" (TongHopTheoNhom). Mặc định kỳ = đầu tháng → hôm nay
 *             (trừ khi mở bằng liên kết có lọc sẵn), mọi trạng thái, thẻ Tất cả.
 *   bao-cao   MH23 Báo cáo mua hàng — CHI TIẾT DÒNG HÀNG (mỗi dòng hàng một dòng) + kiểu cộng dồn theo mã hàng; chỉ xem
 *             (lập phiếu ở MH11), mặc định kỳ = đầu tháng → hôm nay, trạng thái Đã duyệt, thẻ Nhập mua.
 */
type Report = 'tong-hop' | 'bao-cao';
type View = 'phieu' | 'dong' | 'ma' | 'nhom';
const VIEWS: Record<'' | Report, [View, string][]> = {
  '': [['phieu', 'Theo phiếu'], ['dong', 'Chi tiết dòng hàng'], ['ma', 'Tổng hợp theo mã hàng']],
  'tong-hop': [['phieu', 'Danh sách phiếu'], ['nhom', 'Gom theo NCC / chi nhánh / mã / nhóm…']],
  'bao-cao': [['dong', 'Chi tiết dòng hàng'], ['ma', 'Cộng dồn theo mã hàng']],
};

export function ChungTuPage({ embedPartner, embedGroup, command, report, formsOnly }: ChungTuEmbed = {}) {
  const { data, isLoading, error, refresh } = useMuaHang();
  const names = useNames();
  const [urlParams] = useSearchParams();
  const embedded = Boolean(embedPartner);
  // Nhúng: tham số lấy từ command (lệnh của hồ sơ NCC); màn riêng: từ địa chỉ.
  const params = useMemo(() => (embedded ? new URLSearchParams(command?.q ?? '') : urlParams), [embedded, command, urlParams]);
  const opened = useRef<string | null>(null);
  // Phiếu mở bằng liên kết từ màn khác (?mo / ?moi / ?nhan-tu, vd Tổng quan MH00): Thoát thì quay lại màn đó, không ở lại MH11.
  const navigate = useNavigate();
  const location = useLocation();
  const backOnClose = useRef(false);
  const fromLink = () => { backOnClose.current = !embedded && location.key !== 'default'; };
  // Khoá lệnh theo từng lần (màn riêng: mỗi lần chuyển trang; nhúng: mỗi lần hồ sơ NCC gửi lệnh).
  const navKey = embedded ? `cmd-${command?.n ?? 0}` : location.key;
  const closeForm = (id: string) => {
    setForms((fs) => fs.filter((f) => f.id !== id));
    if (backOnClose.current) { backOnClose.current = false; navigate(-1); }
  };
  // Mở từ sơ đồ Quy trình: ?loai=<nhóm | loại phiếu> · ?trang-thai=draft|pending_approval · ?loi=1 · ?moi=<loại phiếu>
  const kindParam = embedGroup ?? params.get('loai') ?? '';
  const [group, setGroup] = useState(GROUPS.find((g) => g[0] === kindParam || g[2].includes(kindParam as PDoc['kind']))?.[0] ?? (report === 'bao-cao' ? 'receipt' : 'all'));
  // Nhúng: hồ sơ NCC đổi nhóm (menu "Xem danh sách …") → đổi thẻ loại phiếu; lệnh nhập Excel → mở hộp nhập.
  useEffect(() => { if (embedded && embedGroup) setGroup(GROUPS.find((g) => g[0] === embedGroup || g[2].includes(embedGroup as PDoc['kind']))?.[0] ?? 'all'); }, [embedded, embedGroup]);
  useEffect(() => { if (embedded && params.get('nhap-excel') === '1') setExcel(true); }, [embedded, params, navKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [status, setStatus] = useState(params.get('trang-thai') ?? (report === 'bao-cao' ? 'approved' : ''));
  const [onlyErr, setOnlyErr] = useState(params.get('loi') === '1');
  // Lọc phiếu nhập ngoài đơn: '' = không lọc, 'all' = mọi phiếu ngoài đơn, 'cho' = đã duyệt, chờ rà soát (?ngoai-don=cho).
  const [outside, setOutside] = useState(params.get('ngoai-don') ?? '');
  const [partner, setPartner] = useState(embedPartner ?? params.get('ncc') ?? '');
  const [excel, setExcel] = useState(params.get('nhap-excel') === '1');
  const [notice, setNotice] = useState('');
  // Mở bằng liên kết có lọc / mở phiếu sẵn (sơ đồ quy trình, việc cần làm, màn khác) → không giới hạn kỳ để không lọt phiếu cũ.
  const linked = ['loai', 'trang-thai', 'loi', 'ngoai-don', 'ncc', 'mo', 'moi', 'nhan-tu', 'tu-hoa-don'].some((k) => params.has(k));
  const [from, setFrom] = useState(report && !linked ? `${today().slice(0, 7)}-01` : '');
  const [to, setTo] = useState(report && !linked ? today() : '');
  const [search, setSearch] = useState('');
  // Màn riêng: lọc chi nhánh → mã kho ở bảng lọc bên trái (giống ACC82 / ACC83), áp dụng khi bấm Tìm kiếm.
  // Kiểu xem: theo phiếu · chi tiết theo dòng hàng (như BH01) · tổng hợp theo mã hàng (như BH02) — cùng bộ lọc, cùng thẻ loại phiếu.
  const [view, setView] = useState<View>(VIEWS[report ?? ''][0]![0]);
  const [branchCodes, setBranchCodes] = useState('');
  const [whCodes, setWhCodes] = useState('');
  const khoFilter: KhoFilter = { branches: branchCodes ? branchCodes.split(',').filter(Boolean) : [], warehouses: whCodes ? whCodes.split(',').filter(Boolean) : [] };
  const { khoOf } = useKhoOf();
  const [sel, setSel] = useState<StoredDoc | null>(null);
  // Nhiều phiếu mở cùng lúc (thu nhỏ xuống thanh dưới để làm việc khác rồi mở lại). Mở lại phiếu đang mở thì đưa nó lên, không mở trùng.
  const [forms, setForms] = useState<PDoc[]>([]);
  const setEditing = (d: PDoc | null) => {
    if (!d) return;
    if (forms.some((f) => f.id === d.id)) { restoreDock(`mh:${d.id}`); return; }
    setForms((fs) => [...fs, d]);
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const kinds = GROUPS.find((g) => g[0] === group)?.[2] ?? [];
    const s = search.trim().toLowerCase();
    return data.docs.filter((d) => (!kinds.length || kinds.includes(d.kind)) && (!status || d.status === status) && (!partner || d.partnerCode === partner)
      && (!outside || (outside === 'lech' ? lechDon(d).length > 0 : nhapNgoaiDon(d) && (outside !== 'cho' || (d.status === 'approved' && !d.outsideOrder?.reviewedBy))))
      && (!onlyErr || ((d.status === 'draft' || d.status === 'pending_approval') && (d.checks ?? []).some((c) => c.level === 'error')))
      && (!from || d.docDate >= from) && (!to || d.docDate <= to)
      && matchKho(khoFilter, d.branchCode, khoOf(d.branchCode, d.kind === 'order' ? d.deliveryWarehouse : d.warehouseCode))
      && (!s || [d.docNo, d.note, d.invoice?.no, d.partnerCode, names.partnerName(d.partnerCode), names.partner(d.partnerCode)?.taxCode, names.partner(d.partnerCode)?.phone, names.partner(d.partnerCode)?.address].some((x) => x?.toLowerCase().includes(s))));
  }, [data, group, status, onlyErr, outside, partner, from, to, search, names, khoOf, branchCodes, whCodes]);

  useEffect(() => {
    // Khoá theo từng lần chuyển trang (location.key): thẻ MH11 đang mở sẵn, bấm lại liên kết vẫn mở phiếu (không bị bỏ qua).
    const id = params.get('mo');
    if (!id || !data || opened.current === `mo-${id}-${navKey}`) return;
    opened.current = `mo-${id}-${navKey}`;
    const d = data.docs.find((x) => x.id === id || x.docNo === id); // ?mo=<id hoặc số phiếu>
    if (d) { fromLink(); setEditing(d); }
  }, [params, data, navKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Lập phiếu nhập từ đơn đặt: chép phần còn lại của đơn (giao nhiều lần không lập trùng).
    const id = params.get('nhan-tu');
    if (!id || !data || opened.current === `nhan-${id}-${navKey}`) return;
    opened.current = `nhan-${id}-${navKey}`;
    const o = data.docs.find((x) => x.id === id && x.kind === 'order');
    if (o) { fromLink(); setEditing(receiptFromOrder(o, data.docs, today(), data.units)); }
  }, [params, data, navKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Lập phiếu nhập từ hoá đơn NCC (MH22): dòng hàng đã nhận diện mã, giá chưa thuế, thuế suất + số / ngày hoá đơn theo hoá đơn.
    const id = params.get('tu-hoa-don');
    if (!id || opened.current === `hd-${id}-${navKey}`) return;
    opened.current = `hd-${id}-${navKey}`;
    void (async () => {
      try {
        const { inv, unmatched, invoice, lines } = await receiptPartsFromInvoice(id);
        fromLink();
        setPartner(inv.partnerCode);
        setEditing({ ...newDoc('receipt', inv.partnerCode), priceIncludesVat: false, invoice, lines });
        if (unmatched) setNotice(`Hoá đơn ${invoiceLabel(inv)} còn dòng chưa nhận diện mã — phiếu chỉ lấy các dòng đã có mã. Mở hoá đơn ở MH22 để chọn mã còn thiếu.`);
      } catch (e) { setNotice(errorText(e)); }
    })();
  }, [params, navKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = params.get('moi') as PDoc['kind'] | null;
    if (!k || opened.current === `moi-${k}-${navKey}`) return;
    opened.current = `moi-${k}-${navKey}`;
    fromLink();
    // NCC theo liên kết vừa bấm (?ncc=) — thẻ đang mở sẵn thì ô lọc NCC cũng đổi theo.
    const ncc = params.get('ncc');
    if (ncc) setPartner(ncc);
    setEditing(newDoc(k, ncc ?? undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, navKey]);

  /** Phiếu mới điền sẵn: hôm nay, CHI NHÁNH ĐANG LÀM VIỆC (thanh trên cùng) — chưa chọn thì chi nhánh dòng đang chọn / lần gần nhất; NCC đang chọn hoặc lần gần nhất, loại đơn giá lần gần nhất. */
  const newDoc = (kind: PDoc['kind'], nccOverride?: string): PDoc => {
    const last = lastUsed.get();
    const pc = nccOverride || partner || sel?.partnerCode || last.partnerCode || '';
    return {
      id: `new-${Date.now()}`, kind, status: 'draft', docNo: '', docDate: today(), branchCode: workBranch.get() || sel?.branchCode || last.branchCode || (names.branches.length === 1 ? names.branches[0]!.code : ''),
      // Mặc định giá đã gồm thuế GTGT (thói quen nhập theo giá thanh toán); lần sau theo lựa chọn lần trước.
      partnerCode: pc, priceIncludesVat: last.priceIncludesVat ?? true,
      // Không tạo sẵn dòng trống: thêm hàng bằng ô gõ / quét mã hoặc bộ chọn mặt hàng (tên, ĐVT, thuế theo danh mục).
      lines: [],
      method: kind === 'payment' || kind === 'prepayment' ? 'bank' : undefined,
      gift: kind === 'gift_in' ? { source: 'ncc_extra', hasVat: false } : undefined,
    };
  };

  const asOf = today();
  const columns: Column<StoredDoc>[] = [
    { key: 'docDate', header: 'Ngày', width: 90, value: (r) => dmy(r.docDate) },
    { key: 'docNo', header: 'Số phiếu', type: 'code', width: 110 },
    { key: 'kind', header: 'Loại', width: 130, value: (r) => KIND_LABEL[r.kind] },
    { key: 'partner', header: 'Mã NCC', type: 'code', width: 120, value: (r) => r.partnerCode, render: (r) => <span className="row" style={{ gap: 4, alignItems: 'center' }}>{r.partnerCode}<NccInfo code={r.partnerCode} showName={false} /></span> },
    { key: 'partnerFull', header: 'Tên NCC', width: 240, value: (r) => names.partnerName(r.partnerCode), render: (r) => <span title={names.partnerName(r.partnerCode)}>{names.partnerName(r.partnerCode)}</span> },
    { key: 'partnerTax', header: 'MST NCC', type: 'code', width: 110, value: (r) => names.partner(r.partnerCode)?.taxCode ?? '' },
    { key: 'partnerPhone', header: 'SĐT NCC', type: 'code', width: 110, value: (r) => names.partner(r.partnerCode)?.phone ?? '' },
    { key: 'partnerAddress', header: 'Địa chỉ NCC', width: 260, value: (r) => names.partner(r.partnerCode)?.address ?? '', render: (r) => <span title={names.partner(r.partnerCode)?.address ?? ''}>{names.partner(r.partnerCode)?.address}</span> },
    { key: 'branch', header: 'Chi nhánh', width: 170, title: 'Mã · tên chi nhánh (có chi nhánh trùng tên, vd chi nhánh mẫu CN-PT và chi nhánh thật 08000 cùng tên CN Phú Thọ)', value: (r) => `${r.branchCode} · ${names.branchName(r.branchCode)}` },
    { key: 'kho', header: 'Phân kho', width: 130, title: 'Mã phân kho của phiếu hàng (chưa ghi kho = kho mặc định của chi nhánh; "mặc định" = chi nhánh chưa khai kho); đơn đặt: kho giao', value: (r) => { const k = r.kind === 'order' ? khoOf(r.branchCode, r.deliveryWarehouse) : GOODS_KINDS.includes(r.kind) ? khoOf(r.branchCode, r.warehouseCode) : ''; return k || (GOODS_KINDS.includes(r.kind) ? 'mặc định' : ''); } },
    { key: 'ref', header: 'Theo đơn / phiếu', width: 120, title: 'Chứng từ gốc (đơn đặt của phiếu nhập…); phiếu nhập không theo đơn ghi "Nhập ngoài đơn"', value: (r) => (nhapNgoaiDon(r) ? 'Nhập ngoài đơn' : (r.refIds ?? []).map((x) => data?.docs.find((d) => d.id === x)?.docNo ?? '').filter(Boolean).join(', ')),
      render: (r) => (nhapNgoaiDon(r) ? <span className="badge badge-warn" title={r.outsideOrder?.reason ? `Lý do: ${r.outsideOrder.reason}${r.outsideOrder.by ? `
Duyệt: ${r.outsideOrder.by}` : ''}${r.outsideOrder.reviewedBy ? `
Rà soát: ${r.outsideOrder.reviewedBy}` : ''}` : 'Chưa ghi lý do nhập ngoài đơn'}>Ngoài đơn{r.outsideOrder?.reviewedBy ? ' ✓' : ''}</span> : (r.refIds ?? []).map((x) => data?.docs.find((d) => d.id === x)?.docNo ?? '').filter(Boolean).join(', ')) },
    { key: 'invoiceSerial', header: 'Ký hiệu HĐ', type: 'code', width: 90, value: (r) => r.invoice?.serial ?? '' },
    { key: 'invoice', header: 'Số HĐ', type: 'code', width: 80, value: (r) => r.invoice?.no ?? '' },
    { key: 'invoiceDate', header: 'Ngày HĐ', width: 90, value: (r) => (r.invoice ? dmy(r.invoice.date) : '') },
    { key: 'grossEx', header: 'Tiền hàng trước CK (chưa thuế)', type: 'money', width: 150, sum: true, title: 'Σ SL × đơn giá dòng hàng mua, chưa trừ chiết khấu, chưa thuế (phiếu giá gồm thuế đã quy về chưa thuế). Chỉ đơn đặt / nhập mua / trả NCC', value: (r) => tienPhieu(r)?.grossEx ?? null },
    { key: 'disc', header: 'Chiết khấu (chưa thuế)', type: 'money', width: 120, sum: true, title: 'CK dòng + CK trên đơn = trước CK − sau CK', value: (r) => tienPhieu(r)?.disc ?? null },
    { key: 'beforeTax', header: 'Tiền hàng sau CK (chưa thuế)', type: 'money', width: 150, sum: true, title: 'Tiền hàng ghi sổ của phiếu (sau mọi chiết khấu, chưa thuế)', value: (r) => r.totals.beforeTax },
    { key: 'tax', header: 'Tiền thuế GTGT', type: 'money', width: 110, sum: true, value: (r) => r.totals.tax },
    { key: 'total', header: 'Tổng thanh toán (gồm thuế)', type: 'money', width: 140, bold: true, sum: true, title: '= Tiền hàng sau CK + thuế — số phải trả NCC của phiếu (phiếu tiền: số tiền)', value: (r) => r.totals.total },
    { key: 'due', header: 'Hạn TT', width: 90, value: (r) => dmy(r.dueDate) },
    { key: 'debtAmt', header: 'Công nợ phát sinh', type: 'money', width: 120, sum: true, title: 'Số ghi vào công nợ NCC (TK 331) khi duyệt: phải trả NCC, hoặc NCC nợ lại mình (ứng trước, trả hàng, thưởng)', value: (r) => congNo(r, asOf)?.amount ?? null },
    { key: 'debtPaid', header: 'Đã trả / đã đối trừ', type: 'money', width: 120, sum: true, title: 'Phiếu trả tiền, ứng trước, trả hàng… đã đối trừ vào phiếu này', value: (r) => congNo(r, asOf)?.paid ?? null },
    { key: 'debtLeft', header: 'Còn lại', type: 'money', width: 110, sum: true, bold: true, value: (r) => congNo(r, asOf)?.left ?? null },
    { key: 'debtState', header: 'Tình trạng công nợ', width: 160, title: 'Phiếu chưa duyệt chưa ghi sổ nên chưa có công nợ', value: (r) => congNo(r, asOf)?.text ?? '', render: (r) => { const c = congNo(r, asOf); return c ? (c.cls ? <span className={`badge ${c.cls}`}>{c.text}</span> : <span className="muted">{c.text}</span>) : null; } },
    { key: 'status', header: 'Trạng thái', width: 90, value: (r) => STATUS_LABEL[r.status] },
    { key: 'progress', header: 'Đơn: đã nhận', width: 110, value: (r) => { if (r.kind !== 'order' || !data) return ''; const p = orderProgress(r, data.docs, undefined, data.units); const one = p.lines.length === 1 ? p.lines[0]! : null; return p.done ? 'Đủ' : p.buyDone ? 'Thiếu quà' : one ? `${one.received}/${one.ordered} ${one.unit}` : `${p.received}/${p.ordered} (ĐVT nhỏ nhất)`; } },
    { key: 'ledger', header: 'Chứng từ kế toán', width: 140, value: (r) => r.links.map((l) => l.docNo).join(', ') },
    { key: 'checks', header: 'Cần xử lý', width: 230, value: (r) => canXuLy(r).text, render: (r) => { const x = canXuLy(r); return x.text ? <span className={`badge ${x.cls}`} title={x.all}>{x.text}</span> : null; } },
    { key: 'note', header: 'Ghi chú', width: 320 },
    // Ai tạo, ai duyệt, lúc nào — "email đăng nhập (Họ tên)".
    { key: 'createdByLabel', header: 'Người tạo', width: 200, value: (r) => r.createdByLabel ?? r.createdByName ?? '' },
    { key: 'createdAt', header: 'Ngày giờ tạo', width: 140, value: (r) => (r.createdAt ? dt(r.createdAt) : '') },
    { key: 'approvedByLabel', header: 'Người duyệt', width: 200, value: (r) => r.approvedByLabel ?? '' },
    { key: 'approvedAt', header: 'Ngày giờ duyệt', width: 140, value: (r) => (r.approvedAt ? dt(r.approvedAt) : '') },
    { key: 'updatedAt', header: 'Sửa lần cuối', width: 140, hidden: true, value: (r) => (r.updatedAt ? dt(r.updatedAt) : '') },
  ];

  return (
    <>
      {!formsOnly && <>
      {report === 'tong-hop' ? <PageHeader title="Tổng hợp mua hàng" code="MH11" helpKey="mua-hang-chung-tu"
        subtitle="Đơn đặt → phiếu nhập kho → trả tiền: lập, sửa, duyệt phiếu; mỗi phiếu một dòng với tiền trước / sau chiết khấu, thuế, đã trả / còn nợ; gom theo NCC, chi nhánh, mã hàng…" />
        : report === 'bao-cao' ? <PageHeader title="Báo cáo mua hàng" code="MH23" helpKey="mua-hang-bao-cao"
          subtitle="Chi tiết từng dòng hàng của các phiếu mua hàng theo kỳ: SL, đơn giá, tiền hàng trước / sau chiết khấu, thuế, tổng thanh toán, ký hiệu / số hoá đơn" />
        : !embedded && <PageHeader title="Chứng từ mua hàng" code="MH03" helpKey="mua-hang-chung-tu"
        subtitle="Đơn đặt → phiếu nhập kho → trả tiền, theo từng nhà cung cấp — phiếu tự áp chính sách của NCC, tự cảnh báo; duyệt là ghi sổ" />}
      {(() => {
        const statusSel = <select className="select input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Mọi trạng thái</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
        const outsideSel = <select className="select input" value={outside} onChange={(e) => setOutside(e.target.value)} title="Phiếu nhập không theo đơn đặt nào (ngoại lệ) — rà soát riêng"><option value="">Theo đơn / ngoài đơn: tất cả</option><option value="all">Chỉ phiếu nhập ngoài đơn</option><option value="cho">Ngoài đơn — chờ rà soát</option><option value="lech">Phiếu nhập lệch đơn đặt (thiếu, thừa, mã ngoài đơn, lệch giá, đổi mã)</option></select>;
        const searchBox = <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm: số phiếu, NCC, MST, SĐT, địa chỉ, số HĐ, ghi chú" />;
        const body = (
          <div className={embedded ? '' : 'card'}>
        {view !== 'nhom' && <div className="tabs" style={{ marginBottom: 0 }}>{GROUPS.map(([k, l]) => <button key={k} className={`tab ${group === k ? 'active' : ''}`} onClick={() => setGroup(k)}>{l}</button>)}</div>}
            {/* Nhúng trong hồ sơ NCC (chỗ hẹp): bộ lọc gọn trên một hàng thay cho bảng lọc bên trái. */}
            {embedded && <div className="filters" style={{ paddingBottom: 0 }}>
              <input className="input" type="date" style={{ width: 140 }} value={from} onChange={(e) => setFrom(e.target.value)} title="Từ ngày" />
              <input className="input" type="date" style={{ width: 140 }} value={to} onChange={(e) => setTo(e.target.value)} title="Đến ngày" />
              <LocKho value={khoFilter} onChange={(v) => { setBranchCodes(v.branches.join(',')); setWhCodes(v.warehouses.join(',')); }} />
              {cloneElement(statusSel, { style: { width: 150 } })}
              {cloneElement(outsideSel, { style: { width: 210 } })}
              {cloneElement(searchBox, { style: { flex: 1, minWidth: 220 } })}
            </div>}
            {((!embedded && partner) || onlyErr || (!embedded && outside)) && <div className="filters" style={{ paddingBottom: 0 }}>
              {!embedded && partner && <Link className="btn btn-sm" to={`/mua-hang/nha-cung-cap/${encodeURIComponent(partner)}`}>Hồ sơ NCC {partner} →</Link>}
              {!embedded && outside && <button className="btn btn-sm" onClick={() => setOutside('')} title="Bỏ lọc">{outside === 'cho' ? 'Nhập ngoài đơn — chờ rà soát' : outside === 'lech' ? 'Phiếu nhập lệch đơn đặt' : 'Chỉ phiếu nhập ngoài đơn'} ✕</button>}
              {onlyErr && <button className="btn btn-sm" onClick={() => setOnlyErr(false)} title="Bỏ lọc">Chỉ phiếu còn lỗi ✕</button>}
            </div>}
        <div className="row" style={{ gap: 6, padding: '6px 12px', flexWrap: 'wrap' }}>
          {report !== 'bao-cao' && <select className="select input" style={{ width: 180, height: 28 }} value="" onChange={(e) => e.target.value && setEditing(newDoc(e.target.value as PDoc['kind']))}>
            <option value="">+ Thêm chứng từ…</option>{NEW_KINDS.map((k) => <option key={k} value={k}>{k === 'rebate' ? 'Chiết khấu / giảm giá sau mua' : KIND_LABEL[k]}</option>)}
          </select>}
          <button className="btn btn-sm" disabled={!sel} onClick={() => sel && setEditing(sel)}>{sel?.status === 'approved' ? 'Xem' : 'Mở / sửa'}</button>
          {/* In phiếu đang chọn; mẫu theo loại phiếu (đơn đặt, nhập kho, trả hàng, phiếu chi…), số liệu nạp lại từ máy chủ. */}
          <PrintButton small screen="MH03" memoryKey={`MH03:${sel?.kind ?? ''}`} templates={mauInCua(sel ?? { kind: 'receipt' })} disabled={!sel} title={sel ? `In ${KIND_LABEL[sel.kind].toLowerCase()} ${sel.docNo}` : 'Chọn một chứng từ để in'}
            getDocs={async () => (sel ? [await layPhieuIn(sel.id, { names, docs: data?.docs ?? [] })] : [])} />
          {report !== 'bao-cao' && <button className="btn btn-sm" onClick={() => setExcel(true)}>Nhập từ Excel</button>}
          {report === 'bao-cao' && <Link className="btn btn-sm" to="/mua-hang/tong-hop" title="Lập / sửa / duyệt phiếu ở Tổng hợp mua hàng (MH11)">Lập phiếu ở MH11 →</Link>}
          <button className="btn btn-sm" onClick={() => void refresh()}>Nạp</button>
          <span className="row" style={{ gap: 0, marginLeft: 8 }} title="Xem cùng các phiếu đang lọc theo phiếu, theo từng dòng hàng (như BH01 Báo cáo bán hàng) hoặc cộng dồn theo mã hàng (như BH02 Tổng hợp bán hàng)">
            {VIEWS[report ?? ''].map(([k, l]) => <button key={k} type="button" className={`btn btn-sm ${view === k ? 'btn-primary' : ''}`} onClick={() => setView(k)}>{l}</button>)}
          </span>
          {view !== 'nhom' && <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>{rows.length} chứng từ · dòng mờ = chưa duyệt</span>}
        </div>
        {notice && <div className="alert alert-ok" style={{ margin: '0 12px 6px' }}>{notice}</div>}
        <ErrorBox error={error ? errorText(error) : null} />
        {view === 'nhom' ? <TongHopTheoNhom from={from} to={to} />
        : !isLoading && data && view !== 'phieu' ? (
          <XemTheoMaHang docs={rows} data={data} mode={view} partnerName={names.partnerName} onOpen={(d) => setEditing(d)}
            khoText={(d) => { const k = d.kind === 'order' ? khoOf(d.branchCode, d.deliveryWarehouse) : khoOf(d.branchCode, d.warehouseCode); return k; }} />
        ) : isLoading || !data ? <Loading /> : (
          <DataGrid storageKey={embedded ? "mh-chung-tu-ncc" : report === 'bao-cao' ? 'mh-bao-cao-phieu' : "mh-chung-tu-v2"} exportName="chung-tu-mua-hang" rows={rows} rowKey={(r) => r.id} onSelect={setSel} onRowDoubleClick={(r) => setEditing(r)}
            rowClassName={(r) => (r.status === 'approved' ? '' : 'muted')} columns={embedded ? columns.filter((c) => !NCC_COLS.includes(c.key)) : columns} footerLabel="Cộng" emptyText="Chưa có chứng từ — chọn “+ Thêm chứng từ…”" />
        )}
          </div>
        );
        if (embedded) return body;
        return (
          <FilterLayout filters={<>
            {!embedded && <div className="field"><label>Nhà cung cấp</label><PartnerPicker value={partner} onChange={setPartner} placeholder="Mọi nhà cung cấp" /></div>}
            <div className="field"><label>Từ ngày</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="field"><label>Đến ngày</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <BranchSelect value={branchCodes} onChange={setBranchCodes} warehouses={{ value: whCodes, onChange: setWhCodes }} />
            <div className="field"><label>Trạng thái</label>{statusSel}</div>
          </>}>{body}</FilterLayout>
        );
      })()}
      </>}
      {data && forms.map((f) => <PhieuMuaForm key={f.id} value={f} data={data} onClose={() => closeForm(f.id)} onSaved={() => void refresh()} onOpen={(d) => setEditing(d)} />)}
      {excel && data && <NhapExcel data={data} partnerCode={partner} onClose={() => setExcel(false)} onDone={(n) => { setExcel(false); if (formsOnly) { navigate(`/mua-hang/tong-hop?ncc=${encodeURIComponent(partner)}&trang-thai=draft`); return; } setStatus('draft'); setNotice(`Đã tạo ${n} phiếu nháp từ Excel — kiểm lại từng phiếu rồi gửi duyệt / duyệt.`); void refresh(); }} />}
    </>
  );
}
