/**
 * TC01 — TRA CHÍNH SÁCH THEO MÃ HÀNG. Chọn mã (và NCC, SL, ĐVT, đơn giá, chi nhánh, ngày) → mọi chính sách mua khớp mã đó:
 * đang áp / chưa đủ điều kiện / bị chương trình áp riêng chặn / không dùng, kèm vì sao và số tiền. Máy chủ tính bằng phiếu nhập
 * giả một dòng, chạy đúng bộ máy phiếu nhập thật (GET /api/v1/purchase/policy-lookup) — chỉ đọc, không lưu.
 */
import { useState, type KeyboardEvent } from 'react';
import { BranchPicker, DataGrid, ErrorBox, Field, ItemPicker, KpiCards, Loading, Money, PageHeader, errorText, useApi, useQuery, type GridColumn } from '@bizcity/ui-kit';
import { EMPTY_FORM, STATUS_TEXT, countBy, lookupQuery, priceNote, summaryText, type TraForm, type TraResult, type TraRow } from '../lib/tra-chinh-sach';

const dmy = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');

export function TraChinhSachPage() {
  const api = useApi();
  // Mở từ nơi khác (cảnh báo áp riêng ở form chính sách MH04): ?sku=<mã> tra ngay mã đó.
  const [f, setF] = useState<TraForm>(() => ({ ...EMPTY_FORM, sku: new URLSearchParams(window.location.search).get('sku') ?? '' }));
  // SL và đơn giá gõ xong (rời ô / Enter) mới tra lại — không gọi máy chủ mỗi phím.
  const [qty, setQty] = useState(EMPTY_FORM.qty);
  const [price, setPrice] = useState('');
  const set = (p: Partial<TraForm>) => setF((x) => ({ ...x, ...p }));
  const query = lookupQuery(f);
  const q = useQuery({
    queryKey: ['tra-cuu', 'chinh-sach', query], enabled: Boolean(query),
    queryFn: () => api.get<TraResult>('/api/v1/purchase/policy-lookup', query!),
  });
  const d = q.data;
  const commit = () => set({ qty, price });
  const enter = (e: KeyboardEvent) => { if (e.key === 'Enter') commit(); };

  const columns: GridColumn<TraRow>[] = [
    { key: 'status', header: 'Trạng thái', width: 150, value: (r) => STATUS_TEXT[r.status].text,
      render: (r) => <span className={`badge ${STATUS_TEXT[r.status].badge}`}>{STATUS_TEXT[r.status].text}{r.winner ? ' · thắng áp riêng' : ''}</span> },
    { key: 'code', header: 'Mã chính sách', type: 'code', width: 120, bold: true },
    { key: 'name', header: 'Tên chính sách', width: 220 },
    { key: 'kindLabel', header: 'Loại', width: 190 },
    { key: 'exclusive', header: 'Áp riêng', type: 'check', width: 70 },
    { key: 'priority', header: 'Ưu tiên', type: 'number', width: 65 },
    { key: 'amount', header: 'Đang giảm', type: 'money', width: 110, sum: true },
    { key: 'alone', header: 'Nếu chỉ mình nó', width: 140, value: (r) => r.alone.amount || r.alone.gift,
      render: (r) => (r.alone.gift ? <span>tặng {r.alone.gift}</span> : r.alone.amount ? <Money value={-r.alone.amount} /> : <span className="muted">—</span>) },
    { key: 'reason', header: 'Vì sao', width: 460 },
    { key: 'partnerCode', header: 'NCC của CS', type: 'code', width: 100, value: (r) => r.partnerCode || 'mọi NCC' },
    { key: 'valid', header: 'Hiệu lực', width: 160, value: (r) => `${dmy(r.validFrom) || '…'} → ${dmy(r.validTo) || 'không hạn'}` },
  ];
  const n = d ? countBy(d.rows) : null;

  return (
    <>
      <PageHeader title="Tra chính sách theo mã hàng" code="TC01"
        subtitle="Chọn mã hàng → chính sách mua nào đang áp, bị chương trình áp riêng chặn, chưa đủ điều kiện, và vì sao. Tính như một phiếu nhập thật, không lưu gì." />
      <div className="card" style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <Field label="Mã hàng (*)"><ItemPicker value={f.sku} onChange={(sku) => set({ sku, partnerCode: '', unit: '', price: '' })} placeholder="Gõ mã hoặc tên hàng" /></Field>
        <Field label="Nhà cung cấp" hint="NCC có chính sách hoặc giá mua của mã này">
          <select className="select input" value={f.partnerCode || d?.input.partnerCode || ''} disabled={!d?.partners.length} onChange={(e) => set({ partnerCode: e.target.value, price: '' })}>
            {!d?.partners.length && <option value="">{d ? 'Không NCC nào có chính sách / giá cho mã này' : '—'}</option>}
            {d?.partners.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
          </select>
        </Field>
        <Field label="Số lượng"><input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={commit} onKeyDown={enter} /></Field>
        <Field label="ĐVT">
          <select className="select input" value={f.unit || d?.input.unit || ''} disabled={!d?.item.units.length} onChange={(e) => set({ unit: e.target.value })}>
            {d?.item.units.map((u) => <option key={u.unit} value={u.unit}>{u.unit}{u.ratio !== 1 ? ` (= ${u.ratio})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Đơn giá" hint={d ? priceNote(d.input) : 'Trống = giá mua của NCC'}>
          <input className="input" inputMode="decimal" value={price} placeholder={d ? d.input.price.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : ''} onChange={(e) => setPrice(e.target.value)} onBlur={commit} onKeyDown={enter} />
        </Field>
        <Field label="Chi nhánh" hint="Trống: chính sách khai theo chi nhánh sẽ không khớp"><BranchPicker value={f.branchCode} onChange={(branchCode) => set({ branchCode })} placeholder="Chọn chi nhánh nhập" /></Field>
        <Field label="Ngày phiếu" hint="Trống = hôm nay"><input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
      </div>

      {!query && <div className="card muted" style={{ padding: 16, marginTop: 10 }}>Chọn một mã hàng để tra.</div>}
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {query && q.isLoading && <Loading />}
      {d && n && (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          <div className="card" style={{ padding: 12 }}>
            <div><b className="mono">{d.item.sku}</b> {d.item.name}{d.item.brandCode ? <span className="muted"> · nhãn {d.item.brandCode}</span> : null}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Phiếu nhập thử: {summaryText(d)}</div>
            {d.input.priceSource === 'khong-co' && <div style={{ fontSize: 13, marginTop: 4, color: 'var(--warn, #b26a00)' }}>{priceNote(d.input)}</div>}
          </div>
          <KpiCards items={[
            { key: 'ap', label: 'Đang áp', value: n.ap, tone: 'ok' },
            { key: 'chua-du', label: 'Chưa đủ điều kiện', value: n['chua-du'], tone: 'info' },
            { key: 'bi-chan', label: 'Bị áp riêng chặn', value: n['bi-chan'], tone: n['bi-chan'] ? 'bad' : undefined },
            { key: 'khong-dung', label: 'Không dùng', value: n['khong-dung'] },
          ]} />
          {d.exclusiveNote && <div className="card" style={{ padding: 10, borderLeft: '3px solid var(--warn, #e8a400)' }}><b>Áp riêng:</b> {d.exclusiveNote}</div>}
          <DataGrid storageKey="tra-cuu.chinh-sach" rows={d.rows} rowKey={(r) => r.code} columns={columns} footerLabel="Cộng"
            exportName={`tra-chinh-sach-${d.item.sku}`} exportTitle={`TRA CHÍNH SÁCH — MÃ ${d.item.sku}`}
            emptyText="Không có chính sách chiết khấu / khuyến mại nào khớp mã này với NCC, chi nhánh, ngày đã chọn"
            note={<span>Áp riêng: mã nhận chương trình áp riêng thì không nhận chương trình nào khác; nhiều chương trình áp riêng cùng khớp thì ưu tiên cao hơn thắng, bằng nhau lấy cái lợi hơn. Sửa chính sách ở <a href="/mua-hang/chinh-sach">MH04 Chính sách mua hàng</a>.</span>} />
          {d.other.length > 0 && (
            <div className="card" style={{ padding: 12 }}>
              <b>Chính sách khác áp cho mã / NCC này</b> <span className="muted">(không tính theo dòng lúc lập phiếu, không xét áp riêng)</span>
              <ul style={{ margin: '6px 0 0 18px' }}>{d.other.map((o) => <li key={o.code}><span className="mono">{o.code}</span> {o.name} <span className="muted">— {o.kindLabel}</span></li>)}</ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
