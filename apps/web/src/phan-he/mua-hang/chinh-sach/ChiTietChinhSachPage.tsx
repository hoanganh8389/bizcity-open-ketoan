/**
 * BÁO CÁO CHI TIẾT CHÍNH SÁCH MUA HÀNG (MH14) — khác bảng tổng MH04 (mỗi chính sách một dòng): ở đây mỗi chính sách được TRẢI
 * RA từng dòng ưu đãi cụ thể để thống kê và xuất Excel:
 *   - chiết khấu theo mã: mỗi mã hàng (ĐVT, SL tối thiểu) một dòng · bậc số lượng / thưởng doanh số / chỉ tiêu: mỗi bậc một dòng;
 *   - thưởng theo giai đoạn: mỗi giai đoạn một dòng · hạn mức / chỉ tiêu cung ứng: tổng + mỗi chi nhánh một dòng;
 *   - khuyến mại mua X tặng Y, chiết khấu đơn, CKTT, hạn thanh toán, tồn min–max, hợp đồng… : một dòng có điều kiện + mức hưởng.
 * Cột: NCC · loại · mã chính sách · mã hàng / tên / ĐVT · chi nhánh · điều kiện · mức hưởng (số + đơn vị) · hiệu lực · trạng thái ·
 * người tạo. Lọc từng cột, xuất Excel; bấm đúp một dòng mở chính sách đó (xem / sửa).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { POLICY_LABEL, termFromRule, termText, type ItemDiscount, type Policy, type PolicyKind, giftItemsOf } from '@ketoan/contracts/mua-hang';
import { PageHeader } from '@/components/PageHeader';
import { Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { PartnerPicker } from '@/components/pickers';
import { ALL_KINDS, PolicyForm } from './PolicyForm';
import { purchaseApi, today, useMuaHang, useNames } from '../du-lieu';
import { dmy } from '../chung';
import '../mua-hang.css';

type R = Record<string, any>;
/** Một dòng ưu đãi của chính sách. */
interface Detail { sku?: string; unit?: string; branch?: string; cond: string; benefit: string; value?: number; valueUnit?: string; note?: string }
interface Row extends Detail { key: string; stt: number; line: number; lines: number; p: Policy; state: string }

const vn = (n: unknown) => Number(n ?? 0).toLocaleString('vi-VN');
const PERIOD: Record<string, string> = { month: 'tháng', quarter: 'quý', year: 'năm' };

/** Trải một chính sách thành các dòng ưu đãi (thêm loại chính sách: thêm một nhánh ở đây). */
export function detailsOf(p: Policy): Detail[] {
  const r = p.rule as R;
  switch (p.kind as PolicyKind) {
    case 'item_discount': return ((r.items ?? []) as ItemDiscount[]).map((i) => ({
      sku: i.sku, unit: i.unit || 'mọi ĐVT', cond: i.minQty ? `mua từ ${vn(i.minQty)}` : 'mọi số lượng',
      benefit: i.pct ? `CK ${Number(i.pct).toLocaleString('vi-VN')}%` : `giảm ${vn(i.amount)}đ / ${i.unit || 'ĐVT'}`, value: i.pct ?? i.amount, valueUnit: i.pct ? '%' : 'đ / ĐVT', note: i.note,
    }));
    case 'qty_tier': return ((r.tiers ?? []) as R[]).filter((t) => t.pct).map((t) => ({ sku: p.scope.sku, cond: `mua từ ${vn(t.from)}`, benefit: `CK ${Number(t.pct).toLocaleString('vi-VN')}% cả dòng`, value: t.pct, valueUnit: '%' }));
    case 'trade_discount': { const min = Number(r.minOrder) ? `đơn / phiếu nhập có tổng từ ${vn(r.minOrder)}đ` : ''; return [p.scope.sku
      ? { sku: p.scope.sku, cond: min ? `${min}, có mã này` : 'mọi đơn / phiếu nhập có mã này', benefit: r.pct ? `CK ${Number(r.pct).toLocaleString('vi-VN')}% trên dòng mã` : `giảm ${vn(r.amount)}đ trên dòng mã`, value: r.pct ?? r.amount, valueUnit: r.pct ? '%' : 'đ' }
      : { cond: min || 'mọi đơn / phiếu nhập', benefit: r.pct ? `CK ${Number(r.pct).toLocaleString('vi-VN')}% trên tổng đơn` : `giảm ${vn(r.amount)}đ / đơn`, value: r.pct ?? r.amount, valueUnit: r.pct ? '%' : 'đ' }]; }
    case 'payment_discount': return [{ cond: 'trả đúng hạn', benefit: `CK thanh toán ${Number(r.pct).toLocaleString('vi-VN')}%`, value: r.pct, valueUnit: '%' }];
    case 'promo_gift': return giftItemsOf(p).map((i) => ({ sku: i.sku || p.scope.sku, unit: i.buyUnit || undefined, cond: `mua ${vn(i.buyQty)} ${i.buyUnit || 'ĐVT trên phiếu'}`, benefit: `tặng ${vn(i.getQty)} ${i.getUnit || i.buyUnit || ''}${i.giftSku && i.giftSku !== i.sku ? ` × ${i.giftSku}` : ''} — ${r.splitIntoCost ? 'chia vào giá vốn' : 'quà cho người tiêu dùng'}${i.repeat === false ? ', một lần' : ', cộng dồn'}${i.apply === 'exclusive' || r.apply === 'exclusive' ? ', áp riêng' : ''}`, value: i.getQty, valueUnit: 'SL tặng', note: i.note }));
    case 'period_rebate': return ((r.tiers ?? []) as R[]).map((t) => ({ cond: `doanh số ${PERIOD[r.period] ?? 'kỳ'} từ ${vn(t.from)}đ`, benefit: `thưởng ${Number(t.pct).toLocaleString('vi-VN')}%`, value: t.pct, valueUnit: '%' }));
    case 'target_rebate': return ((r.tiers ?? []) as R[]).map((t) => ({ cond: `chỉ tiêu ${PERIOD[r.period] ?? ''} ${vn(r.target)}đ, đạt từ ${Number(t.fromPct).toLocaleString('vi-VN')}%`, benefit: `thưởng ${Number(t.pct).toLocaleString('vi-VN')}%`, value: t.pct, valueUnit: '%' }));
    case 'stage_rebate': return ((r.stages ?? []) as R[]).map((s) => ({
      cond: `ngày ${s.from}–${s.to}, doanh số từ ${vn(s.min)}đ${r.mode === 'cumulative' ? ' (cộng dồn)' : ''}`, benefit: s.amount ? `thưởng ${vn(s.amount)}đ` : `thưởng ${Number(s.pct).toLocaleString('vi-VN')}%`, value: s.amount ?? s.pct, valueUnit: s.amount ? 'đ' : '%',
    }));
    case 'credit_limit': {
      const br = Object.entries((r.branches ?? {}) as Record<string, number>);
      return [{ cond: `toàn ${p.scope.brandCode ? `nhãn ${p.scope.brandCode}` : 'NCC'}`, benefit: `hạn mức ${vn(r.limit)}đ, cảnh báo từ ${Number(r.warnPct ?? 90).toLocaleString('vi-VN')}%`, value: r.limit, valueUnit: 'đ' },
        ...br.map(([b, v]) => ({ branch: b, cond: 'phân bổ cho chi nhánh', benefit: `hạn mức ${vn(v)}đ`, value: v, valueUnit: 'đ' }))];
    }
    case 'supply_target': return Object.entries((r.branches ?? {}) as Record<string, number>).map(([b, v]) => ({ branch: b, cond: `chỉ tiêu cung ứng ${r.period ?? ''}`, benefit: `${vn(v)}đ`, value: v, valueUnit: 'đ' }));
    case 'payment_term': return [{ cond: 'hạn thanh toán', benefit: termText(termFromRule(r)), value: r.days || undefined, valueUnit: r.days ? 'ngày' : undefined }];
    case 'gift_budget': return [{ cond: `chương trình ${r.program ?? ''}`, benefit: `ngân sách quà ${vn(r.amount)}đ`, value: r.amount, valueUnit: 'đ' }];
    case 'contract': return [{ cond: `hợp đồng số ${r.no ?? ''}`, benefit: r.signedOn ? `ký ngày ${dmy(r.signedOn)}` : '', note: r.note }];
    case 'lot_tracking': return [{ cond: 'khi nhập hàng', benefit: r.required === false ? 'không bắt buộc số lô' : 'bắt buộc số lô + hạn dùng' }];
    default: return [{ cond: '', benefit: JSON.stringify(r) }];
  }
}

export function ChiTietChinhSachPage() {
  const { data, isLoading, refresh } = useMuaHang();
  const names = useNames();
  const [kind, setKind] = useState<PolicyKind | ''>('');
  const [partner, setPartner] = useState('');
  const [state, setState] = useState('Đang áp');
  const [editing, setEditing] = useState<Policy | null>(null);
  const now = today();
  const stateOf = (p: Policy) => (!p.isActive ? 'Tắt' : p.validTo && p.validTo < now ? 'Hết hiệu lực' : p.validFrom && p.validFrom > now ? 'Chưa tới hiệu lực' : 'Đang áp');
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    let stt = 0;
    const list = (data?.policies ?? []).filter((p) => (!kind || p.kind === kind) && (!partner || p.scope.partnerCode === partner) && (!state || stateOf(p) === state))
      .sort((a, b) => Number(!a.scope.partnerCode) - Number(!b.scope.partnerCode) || (a.scope.partnerCode ?? '').localeCompare(b.scope.partnerCode ?? '') || ALL_KINDS.indexOf(a.kind) - ALL_KINDS.indexOf(b.kind) || a.code.localeCompare(b.code));
    for (const p of list) {
      const ds = detailsOf(p);
      ds.forEach((d, i) => out.push({ ...d, sku: d.sku ?? p.scope.sku, branch: d.branch ?? p.scope.branchCode, key: `${p.id}-${i}`, stt: ++stt, line: i + 1, lines: ds.length, p, state: stateOf(p) }));
    }
    return out;
  }, [data, kind, partner, state]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tên hàng của các mã trong bảng (tra theo lô 500 mã).
  const skus = useMemo(() => [...new Set(rows.map((r) => r.sku).filter(Boolean) as string[])], [rows]);
  const prods = useQuery({ queryKey: ['mua-hang', 'ct-cs-names', skus.join(',')], enabled: skus.length > 0, staleTime: 60_000, queryFn: async () => {
    const m = new Map<string, string>();
    for (let i = 0; i < skus.length; i += 500) for (const p of await purchaseApi.lookupProducts(skus.slice(i, i + 500))) m.set(p.sku, p.name);
    return m;
  } });

  const columns: Column<Row>[] = [
    { key: 'stt', header: 'STT', type: 'number', width: 55 },
    { key: 'partnerCode', header: 'Mã NCC', type: 'code', width: 100, value: (r) => r.p.scope.partnerCode ?? '', render: (r) => r.p.scope.partnerCode ? <Link to={`/mua-hang/nha-cung-cap/${encodeURIComponent(r.p.scope.partnerCode)}`}>{r.p.scope.partnerCode}</Link> : <span className="muted">Mọi NCC</span> },
    { key: 'partnerName', header: 'Tên NCC', width: 170, value: (r) => (r.p.scope.partnerCode ? names.partnerName(r.p.scope.partnerCode) : ''), render: (r) => (r.p.scope.partnerCode ? <span title={names.partnerName(r.p.scope.partnerCode)}>{names.partnerName(r.p.scope.partnerCode)}</span> : null) },
    { key: 'partnerTax', header: 'MST NCC', type: 'code', width: 110, value: (r) => (r.p.scope.partnerCode ? names.partner(r.p.scope.partnerCode)?.taxCode ?? '' : '') },
    { key: 'partnerPhone', header: 'SĐT NCC', type: 'code', width: 110, value: (r) => (r.p.scope.partnerCode ? names.partner(r.p.scope.partnerCode)?.phone ?? '' : '') },
    { key: 'partnerAddress', header: 'Địa chỉ NCC', width: 220, value: (r) => (r.p.scope.partnerCode ? names.partner(r.p.scope.partnerCode)?.address ?? '' : ''), render: (r) => <span title={r.p.scope.partnerCode ? names.partner(r.p.scope.partnerCode)?.address ?? '' : ''}>{r.p.scope.partnerCode ? names.partner(r.p.scope.partnerCode)?.address : ''}</span> },
    { key: 'kind', header: 'Loại chính sách', width: 170, value: (r) => POLICY_LABEL[r.p.kind] },
    { key: 'cond', header: 'Điều kiện', width: 220 },
    { key: 'benefit', header: 'Được hưởng', width: 240 },
    { key: 'value', header: 'Mức', type: 'number', width: 90, value: (r) => r.value ?? '' },
    { key: 'valueUnit', header: 'Đơn vị mức', width: 70, value: (r) => r.valueUnit ?? '' },
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 100, value: (r) => r.sku ?? '' },
    { key: 'skuName', header: 'Tên hàng', width: 180, value: (r) => (r.sku ? prods.data?.get(r.sku) ?? '' : '') },
    { key: 'unit', header: 'ĐVT', width: 70, value: (r) => r.unit ?? '' },
    { key: 'branch', header: 'Chi nhánh', width: 110, value: (r) => (r.branch ? names.branchName(r.branch) : '') },
    { key: 'code', header: 'Mã chính sách', type: 'code', width: 150, value: (r) => r.p.code },
    { key: 'line', header: 'Dòng', width: 70, value: (r) => (r.lines > 1 ? `${r.line}/${r.lines}` : '') },
    { key: 'brand', header: 'Nhãn', width: 90, value: (r) => r.p.scope.brandCode ?? '' },
    { key: 'note', header: 'Ghi chú', width: 160, value: (r) => r.note ?? '' },
    { key: 'validFrom', header: 'Hiệu lực từ', width: 90, value: (r) => dmy(r.p.validFrom) },
    { key: 'validTo', header: 'Đến', width: 90, value: (r) => dmy(r.p.validTo) },
    { key: 'state', header: 'Trạng thái', width: 110, render: (r) => <span className={`badge ${r.state === 'Đang áp' ? 'badge-ok' : r.state === 'Hết hiệu lực' ? 'badge-warn' : 'badge-gray'}`}>{r.state}</span>, value: (r) => r.state },
    { key: 'createdBy', header: 'Người tạo', width: 110, value: (r) => r.p.createdBy ?? '' },
    { key: 'createdAt', header: 'Ngày giờ tạo', width: 140, value: (r) => (r.p.createdAt ? new Date(r.p.createdAt).toLocaleString('vi-VN', { hour12: false }) : '') },
  ];
  const policies = new Set(rows.map((r) => r.p.id)).size;

  return (
    <>
      <PageHeader title="Báo cáo chi tiết chính sách mua hàng" code="MH14" helpKey="mua-hang-chi-tiet-chinh-sach"
        subtitle="Mỗi chính sách trải ra từng dòng ưu đãi: từng mã hàng, từng bậc, từng chi nhánh — lọc, xuất Excel; bấm đúp một dòng để mở chính sách" />
      <div className="card">
        <div className="row" style={{ gap: 8, padding: '8px 12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ width: 260 }}><PartnerPicker value={partner} onChange={setPartner} placeholder="Lọc theo nhà cung cấp" /></div>
          <select className="select input" style={{ width: 230 }} value={kind} onChange={(e) => setKind(e.target.value as PolicyKind | '')}><option value="">Mọi loại chính sách</option>{ALL_KINDS.map((k) => <option key={k} value={k}>{POLICY_LABEL[k]}</option>)}</select>
          <select className="select input" style={{ width: 170 }} value={state} onChange={(e) => setState(e.target.value)}><option value="">Mọi trạng thái</option><option>Đang áp</option><option>Hết hiệu lực</option><option>Chưa tới hiệu lực</option><option>Tắt</option></select>
          <span className="muted" style={{ fontSize: 12 }}>{rows.length.toLocaleString('vi-VN')} dòng ưu đãi của {policies} chính sách · bấm đúp một dòng để mở chính sách · khai báo / sửa ở <Link to="/mua-hang/chinh-sach">Chính sách mua hàng (MH04)</Link></span>
        </div>
        {isLoading || !data ? <Loading /> : (
          <DataGrid storageKey="mh-chi-tiet-chinh-sach-v2" exportName="bao-cao-chi-tiet-chinh-sach-mua-hang" exportTitle="BÁO CÁO CHI TIẾT CHÍNH SÁCH MUA HÀNG"
            rows={rows} rowKey={(r) => r.key} columns={columns} onRowDoubleClick={(r) => setEditing(r.p)} groupable
            rowClassName={(r) => (r.state === 'Đang áp' ? '' : 'muted')} footerLabel={false} emptyText="Chưa có chính sách khớp bộ lọc" />
        )}
      </div>
      {editing && <PolicyForm value={editing} all={data?.policies ?? []} onClose={() => setEditing(null)} onSaved={(_code, stay) => { if (!stay) setEditing(null); void refresh(); }} />}
    </>
  );
}
