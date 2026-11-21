// [2026-11-21 Nguyễn Văn Thủy] ĐỐI CHIẾU HOÁ ĐƠN (MH31): phiếu nhập theo tình trạng hoá đơn + gắn nhanh hoá đơn NCC nhận sau (đóng góp)
/**
 * ĐỐI CHIẾU HOÁ ĐƠN — phiếu nhập mua chia theo tình trạng hoá đơn (theo kế hoạch hoá đơn khai ở đơn đặt):
 *   Quá hạn HĐ · Thiếu HĐ · Chờ HĐ (còn hạn) · Đã có HĐ · Không lấy HĐ, và hoá đơn NCC (MH22) chưa gắn phiếu nhập nào.
 * Phiếu chưa có hoá đơn: phần mềm gợi ý hoá đơn cùng NCC chưa gắn phiếu, tiền gần nhất (khớp tiền thì đánh dấu) — bấm Gắn.
 * Phiếu đã ghi sổ: máy chủ lập điều chỉnh, ghi hoá đơn, duyệt lại (thuế đầu vào vào đúng hoá đơn); còn cảnh báo chặn thì báo, phiếu giữ nguyên.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { invoiceDueDate, invoiceKey, invoicePlanText, invoicesOf, sameInvoice, type InvoicePlan, type PDoc } from '@bizcity/mua-hang-domain';
import { BranchPicker } from '@/components/filters';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading } from '@/components/ui';
import { PartnerPicker } from '@/components/pickers';
import { P, STATUS_LABEL, today, useMuaHang, useNames, vnd, type StoredDoc } from '../du-lieu';
import { dmy } from '../chung';
import { STATE_LABEL, invoiceApi, type InvoiceRow } from '../hoa-don/api';
import '../mua-hang.css';

type Trang = 'qua-han' | 'thieu' | 'cho' | 'lech' | 'co' | 'khong' | 'hd-le';
const TRANG: Record<Trang, [string, string, string]> = {
  'qua-han': ['Quá hạn HĐ', 'badge-bad', 'Đơn hẹn nhận hoá đơn sau, đã quá hạn mà phiếu nhập chưa có hoá đơn'],
  thieu: ['Thiếu HĐ', 'badge-warn', 'NCC giao hoá đơn kèm hàng nhưng phiếu nhập chưa ghi số hoá đơn'],
  cho: ['Chờ HĐ', 'badge-info', 'Đơn hẹn nhận hoá đơn sau, còn trong hạn'],
  lech: ['Lệch SL với HĐ', 'badge-bad', 'Phiếu nhập có hoá đơn nhưng SL thực nhận khác SL cộng dồn các hoá đơn (MH22) — thêm hoá đơn còn thiếu, sửa SL hoặc duyệt ngoại lệ'],
  co: ['Đã có HĐ', 'badge-ok', 'Phiếu nhập đã có hoá đơn (một hoặc nhiều hoá đơn)'],
  khong: ['Hàng không có HĐ', 'badge-gray', 'Đơn khai hàng không có hoá đơn'],
  'hd-le': ['HĐ chưa có phiếu nhập', 'badge-warn', 'Hoá đơn NCC đã nhập ở MH22 nhưng chưa gắn phiếu nhập nào'],
};
const THU_TU: Trang[] = ['qua-han', 'thieu', 'cho', 'lech', 'co', 'khong', 'hd-le'];
const label = (i: { series?: string; no: string }) => `${i.series ? `${i.series}-` : ''}${i.no}`;
const congNgay = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

interface Dong { doc: StoredDoc; trang: Exclude<Trang, 'hd-le'>; han: string; plan?: InvoicePlan; hds: { key: string; row?: InvoiceRow }[]; goiY: InvoiceRow[]; don?: StoredDoc; lechText?: string }

export function DoiChieuHoaDonPage() {
  const names = useNames();
  const mh = useMuaHang();
  const [from, setFrom] = useState(congNgay(today(), -90));
  const [to, setTo] = useState(today());
  const [ncc, setNcc] = useState('');
  const [cn, setCn] = useState('');
  const [sp] = useSearchParams();
  const [trang, setTrang] = useState<Trang>(() => (THU_TU.includes(sp.get('trang') as Trang) ? sp.get('trang') as Trang : 'qua-han'));
  const [busy, setBusy] = useState('');
  const [bao, setBao] = useState<{ ok: boolean; text: string } | null>(null);
  const [chon, setChon] = useState<Record<string, string>>({});
  const inv = useQuery({ queryKey: ['mua-hang', 'invoices', 'doi-chieu', ncc], queryFn: () => invoiceApi.list({ partnerCode: ncc || undefined }) });

  const { dong, hdLe } = useMemo(() => {
    const docs = mh.data?.docs ?? [];
    const byId = new Map(docs.map((d) => [d.id, d]));
    const homNay = today();
    const invs = (inv.data ?? []).filter((i) => i.state !== 'da_huy');
    const chuaGan = invs.filter((i) => !i.receipts.length);
    const out: Dong[] = [];
    for (const d of docs) {
      if (d.kind !== 'receipt' || d.status === 'cancelled' || (ncc && d.partnerCode !== ncc) || (cn && d.branchCode !== cn)) continue;
      const ngay = d.docDate; // ngày nhận hàng = ngày phiếu (receivedDate là ngày nhận hoá đơn)
      if (ngay < from || ngay > to) continue;
      // [2026-11-21 Nguyễn Văn Thủy] một phiếu nhập nhiều hoá đơn; hạn tính từ ngày đặt đơn nếu kế hoạch chọn; lệch SL ↔ hoá đơn thành ô riêng (đóng góp)
      const don = d.refIds?.[0] ? byId.get(d.refIds[0]) : undefined;
      const plan = d.invoicePlan ?? (don as PDoc | undefined)?.invoicePlan;
      const han = invoiceDueDate(plan, ngay, don?.docDate);
      const ds = invoicesOf(d);
      const lech = !d.override ? (d.checks ?? []).find((c) => c.code === 'inv_qty_diff') : undefined;
      const t: Dong['trang'] = ds.length ? (lech ? 'lech' : 'co') : plan?.mode === 'none' ? 'khong' : plan?.mode === 'later' ? (han < homNay ? 'qua-han' : 'cho') : 'thieu';
      const hds = ds.map((x) => ({ key: invoiceKey(x), row: invs.find((i) => i.partnerCode === d.partnerCode && sameInvoice(i, { no: x.no, series: x.serial })) }));
      // Gợi ý: hoá đơn cùng NCC chưa gắn phiếu, ngày hoá đơn không trước ngày nhận quá 7 ngày; tiền gần nhất lên đầu (lệch SL: gợi ý thêm hoá đơn còn thiếu).
      const goiY = t === 'co' || t === 'khong' ? [] : chuaGan.filter((i) => i.partnerCode === d.partnerCode && i.date >= congNgay(ngay, -7))
        .sort((a, b) => Math.abs(a.total - d.totals.total) - Math.abs(b.total - d.totals.total));
      out.push({ doc: d, trang: t, han, plan, hds, goiY, don, lechText: lech?.text });
    }
    const le = chuaGan.filter((i) => (!ncc || i.partnerCode === ncc) && i.date >= from && i.date <= to);
    return { dong: out, hdLe: le };
  }, [mh.data, inv.data, from, to, ncc, cn]);

  const dem = (t: Trang) => (t === 'hd-le' ? hdLe.length : dong.filter((x) => x.trang === t).length);
  const tien = (t: Trang) => (t === 'hd-le' ? hdLe.reduce((s, i) => s + i.total, 0) : dong.filter((x) => x.trang === t).reduce((s, x) => s + x.doc.totals.total, 0));
  const khop = (a: number, b: number) => Math.abs(a - b) <= Math.max(1000, Math.abs(b) * 0.005);

  const gan = async (docId: string, invId: string, docNo: string, hdLabel: string, daGhiSo: boolean) => {
    if (daGhiSo && !window.confirm(`Phiếu ${docNo} đã ghi sổ. Thêm hoá đơn ${hdLabel}: phần mềm lập điều chỉnh, thêm hoá đơn vào phiếu và duyệt lại (đảo bút toán cũ, ghi bút toán mới theo hoá đơn). Tiếp tục?`)) return;
    setBusy(docId); setBao(null);
    try {
      await api.post(`${P}/documents/${docId}/attach-invoice`, { invoiceId: invId });
      setBao({ ok: true, text: `Đã thêm hoá đơn ${hdLabel} vào phiếu ${docNo}${daGhiSo ? ' (đã ghi sổ lại)' : ''}` });
      await Promise.all([mh.refresh(), inv.refetch()]);
    } catch (e) { setBao({ ok: false, text: errorText(e) }); }
    finally { setBusy(''); }
  };

  const mo = (d: { id: string; docNo: string }) => <Link to={`/mua-hang/tong-hop?mo=${encodeURIComponent(d.id)}`} title="Mở phiếu">{d.docNo || '(nháp)'}</Link>;
  const cotPhieu: Column<Dong & { key: string }>[] = [
    { key: 'docNo', header: 'Phiếu nhập', type: 'code', width: 120, value: (r) => r.doc.docNo, render: (r) => mo(r.doc) },
    { key: 'ngay', header: 'Ngày nhận', width: 90, value: (r) => dmy(r.doc.receivedDate ?? r.doc.docDate) },
    { key: 'ncc', header: 'Nhà cung cấp', width: 230, value: (r) => `${r.doc.partnerCode} ${names.partnerName(r.doc.partnerCode)}`, render: (r) => <span title={r.doc.partnerCode}>{names.partnerName(r.doc.partnerCode)}</span> },
    { key: 'cn', header: 'Chi nhánh nhận', width: 110, title: 'Chi nhánh nhập hàng của phiếu (đơn giao nhiều chi nhánh: mỗi chi nhánh một phiếu nhập)', value: (r) => r.doc.branchCode, render: (r) => <span title={names.branchName(r.doc.branchCode)}>{r.doc.branchCode}</span> },
    { key: 'don', header: 'Theo đơn', type: 'code', width: 110, value: (r) => r.don?.docNo ?? '', render: (r) => (r.don ? mo(r.don) : <span className="muted">ngoài đơn</span>) },
    { key: 'tien', header: 'Tổng tiền', type: 'money', width: 120, value: (r) => r.doc.totals.total },
    { key: 'kh', header: 'Kế hoạch HĐ', width: 120, value: (r) => invoicePlanText(r.plan) },
    { key: 'han', header: 'Hạn HĐ', width: 90, value: (r) => (r.plan?.mode === 'none' ? '' : dmy(r.han)) },
    { key: 'trang', header: 'Tình trạng', width: 120, value: (r) => TRANG[r.trang][0], render: (r) => <span className={`badge ${TRANG[r.trang][1]}`}>{TRANG[r.trang][0]}</span> },
    { key: 'tt', header: 'Phiếu', width: 80, value: (r) => STATUS_LABEL[r.doc.status] },
    { key: 'hd', header: 'Hoá đơn', width: 360, value: (r) => (r.hds.length ? r.hds.map((h) => h.key).join(', ') : r.goiY[0] ? label(r.goiY[0]) : ''),
      render: (r) => {
        const daCo = r.hds.length ? <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>{r.hds.map((h) => <span key={h.key}>{h.key}{h.row ? <> <span className={`badge ${STATE_LABEL[h.row.state][1]}`} title={h.row.issues.join('\n') || STATE_LABEL[h.row.state][2]}>{STATE_LABEL[h.row.state][0]}</span></> : <span className="muted" title="Chưa nhập hoá đơn này ở MH22 Hoá đơn đầu vào của NCC"> (chưa có ở MH22)</span>}</span>)}
          {r.lechText && <span className="mh-bad" style={{ fontSize: 11 }} title={r.lechText}>⚠ lệch SL</span>}</span> : null;
        if (r.trang === 'co' || r.trang === 'khong') return daCo;
        if (r.trang === 'lech' && !r.goiY.length) return daCo;
        if (!r.goiY.length) return <span className="muted">NCC chưa có hoá đơn nào chưa gắn — <Link to="/mua-hang/hoa-don-ncc">nhập ở MH22</Link></span>;
        const id = chon[r.doc.id] ?? r.goiY[0]!.id!;
        const x = r.goiY.find((i) => i.id === id) ?? r.goiY[0]!;
        return <span className="row" style={{ gap: 4, alignItems: 'center', flexWrap: 'nowrap' }}>{daCo}{daCo ? ' + ' : null}
          <select className="select input" style={{ width: 200 }} value={id} onChange={(e) => setChon((c) => ({ ...c, [r.doc.id]: e.target.value }))} title="Hoá đơn NCC chưa gắn phiếu nhập — tiền gần nhất lên đầu">
            {r.goiY.map((i) => <option key={i.id} value={i.id}>{label(i)} · {dmy(i.date)} · {vnd(i.total)}{khop(i.total, r.doc.totals.total) ? ' ✓' : ''}</option>)}
          </select>
          {khop(x.total, r.doc.totals.total) ? <span className="badge badge-ok" title="Tổng tiền hoá đơn khớp phiếu nhập">khớp tiền</span> : <span className="badge badge-warn" title={`Hoá đơn ${vnd(x.total)} · phiếu ${vnd(r.doc.totals.total)}`}>lệch {vnd(Math.abs(x.total - r.doc.totals.total))}</span>}
          <button type="button" className="btn btn-xs btn-primary" disabled={busy === r.doc.id} onClick={() => void gan(r.doc.id, x.id!, r.doc.docNo, label(x), r.doc.status === 'approved')} title="Thêm hoá đơn vào phiếu (phiếu nhiều hoá đơn: SL đối soát cộng dồn các hoá đơn)">{busy === r.doc.id ? '…' : r.hds.length ? 'Thêm' : 'Gắn'}</button>
        </span>;
      } },
  ];
  const cotHd: Column<InvoiceRow & { key: string }>[] = [
    { key: 'no', header: 'Hoá đơn', type: 'code', width: 130, value: (r) => label(r), render: (r) => <Link to={`/mua-hang/hoa-don-ncc?mo=${r.id}`} title="Mở ở MH22">{label(r)}</Link> },
    { key: 'date', header: 'Ngày HĐ', width: 90, value: (r) => dmy(r.date) },
    { key: 'ncc', header: 'Nhà cung cấp', width: 240, value: (r) => names.partnerName(r.partnerCode) },
    { key: 'total', header: 'Tổng tiền', type: 'money', width: 120, value: (r) => r.total },
    { key: 'state', header: 'Tình trạng', width: 150, value: (r) => STATE_LABEL[r.state][0], render: (r) => <span className={`badge ${STATE_LABEL[r.state][1]}`}>{STATE_LABEL[r.state][0]}</span> },
    { key: 'phieu', header: 'Phiếu nhập chưa có HĐ của NCC', width: 360, value: () => '',
      render: (r) => {
        const ps = dong.filter((x) => x.doc.partnerCode === r.partnerCode && (!x.hds.length || x.trang === 'lech') && x.trang !== 'khong').sort((a, b) => Math.abs(a.doc.totals.total - r.total) - Math.abs(b.doc.totals.total - r.total));
        if (!ps.length) return <span className="muted">không có phiếu nhập chờ hoá đơn trong kỳ</span>;
        const id = chon[`hd-${r.id}`] ?? ps[0]!.doc.id;
        const p = ps.find((x) => x.doc.id === id) ?? ps[0]!;
        return <span className="row" style={{ gap: 4, alignItems: 'center', flexWrap: 'nowrap' }}>
          <select className="select input" style={{ width: 220 }} value={id} onChange={(e) => setChon((c) => ({ ...c, [`hd-${r.id}`]: e.target.value }))}>
            {ps.map((x) => <option key={x.doc.id} value={x.doc.id}>{x.doc.docNo} · {dmy(x.doc.receivedDate ?? x.doc.docDate)} · {vnd(x.doc.totals.total)}{khop(r.total, x.doc.totals.total) ? ' ✓' : ''}</option>)}
          </select>
          <button type="button" className="btn btn-xs btn-primary" disabled={busy === p.doc.id} onClick={() => void gan(p.doc.id, r.id!, p.doc.docNo, label(r), p.doc.status === 'approved')}>{busy === p.doc.id ? '…' : 'Gắn'}</button>
        </span>;
      } },
  ];

  return (
    <div className="page">
      <PageHeader title="Đối chiếu hoá đơn" code="MH31" helpKey="mua-hang-doi-chieu-hoa-don" subtitle="Phiếu nhập theo tình trạng hoá đơn — gắn hoá đơn NCC nhận sau" />
      <div className="card">
        <div className="filters">
          <span style={{ fontSize: 13 }}>Ngày nhận từ</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ fontSize: 13 }}>đến</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <PartnerPicker kind="supplier" value={ncc} onChange={setNcc} placeholder="Mọi nhà cung cấp" style={{ width: 280 }} />
          <BranchPicker value={cn} onChange={setCn} placeholder="Mọi chi nhánh nhận" style={{ width: 220 }} />
        </div>
        <div className="mh-dc-the">
          {THU_TU.map((t) => (
            <button key={t} type="button" className={`mh-dc-o ${TRANG[t][1]}${trang === t ? ' on' : ''}`} onClick={() => setTrang(t)} title={TRANG[t][2]}>
              <span>{TRANG[t][0]}</span><b>{dem(t)}</b><small>{vnd(tien(t))}</small>
            </button>
          ))}
        </div>
        {bao && <div className={`alert ${bao.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px', cursor: 'pointer' }} onClick={() => setBao(null)}>{bao.text}</div>}
        {mh.isLoading || inv.isLoading ? <Loading /> : mh.error || inv.error ? <ErrorBox error={errorText(mh.error ?? inv.error)} />
          : trang === 'hd-le'
            ? <DataGrid storageKey="mh-doi-chieu-hd-le" exportName="hoa-don-chua-co-phieu-nhap" rows={hdLe.map((r) => ({ ...r, key: r.id! }))} rowKey={(r) => r.key} columns={cotHd} emptyText="Không có hoá đơn NCC nào chưa gắn phiếu nhập" />
            : <DataGrid storageKey="mh-doi-chieu-hd" exportName="doi-chieu-hoa-don" rows={dong.filter((x) => x.trang === trang).map((x) => ({ ...x, key: x.doc.id }))} rowKey={(r) => r.key} columns={cotPhieu} emptyText="Không có phiếu nhập nào ở tình trạng này" />}
      </div>
    </div>
  );
}
