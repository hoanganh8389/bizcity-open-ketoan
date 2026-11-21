/**
 * BH17 — khối ⑤ Giao hàng đơn đặt hàng (phiếu NT-BH-032): ba khoá của module phieu-ban, ghi qua đường cấu hình chung
 * PUT /api/v1/settings/values/:key (quyền settings:write, có lịch sử ai đổi lúc nào):
 *   - bizcity.phieu_ban.ship_warehouses: kho loại KHG "Kho hàng gửi bán" của từng cửa hàng (hàng Đang giao nằm ở đây — tài khoản theo loại kho);
 *   - bizcity.phieu_ban.ship_fee_sku: mã dịch vụ của dòng "Phí ship thu khách" trên phiếu bán của chuyến giao;
 *   - bizcity.phieu_ban.cod_methods: hãng → hình thức thanh toán "COD — <hãng>" (phải thu hãng; tài khoản + đối tượng khai ở hình thức).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: BH17 khai kho KHG, mã phí ship, COD theo hãng cho giao hàng đơn đặt hàng (đóng góp)
import { useEffect, useMemo, useState } from 'react';
import { ErrorBox, Field, ItemPicker, Loading, errorText, useApi, useCan, useMutation, useQuery, useQueryClient } from '@bizcity/ui-kit';

const K = { wh: 'bizcity.phieu_ban.ship_warehouses', fee: 'bizcity.phieu_ban.ship_fee_sku', cod: 'bizcity.phieu_ban.cod_methods' } as const;
type Wh = { code: string; name: string; branchCode: string; branchName: string; isActive: boolean; typeCode: string };
type Method = { code: string; name: string; isActive?: boolean };
const toMap = (v: unknown) => Object.fromEntries((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && x.includes('='))
  .map((x) => [x.slice(0, x.indexOf('=')).trim(), x.slice(x.indexOf('=') + 1).trim()]));
const fromMap = (m: Record<string, string>) => Object.entries(m).filter(([k, v]) => k.trim() && v.trim()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k.trim()}=${v.trim()}`);

export function GiaoHangCaiDat() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const get = (key: string) => api.get<{ value: unknown }>(`/api/v1/settings/values/${key}`).then((r) => r.value).catch(() => null);
  const cur = useQuery({ queryKey: ['setting', 'phieu-ban-ship'], queryFn: async () => ({ wh: toMap(await get(K.wh)), fee: String((await get(K.fee)) ?? ''), cod: toMap(await get(K.cod)) }) });
  const whs = useQuery({ queryKey: ['warehouses'], queryFn: () => api.get<Wh[]>('/api/v1/warehouses') });
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: () => api.get<Method[]>('/api/v1/posting/payment-methods') });
  // [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035 §3.3: nhắc khi mã phí ship đã ghi chưa là mặt hàng dịch vụ (module phieu-ban kiểm) (đóng góp)
  const shipCheck = useQuery({
    queryKey: ['setting', 'phieu-ban-ship', 'check'],
    queryFn: () => api.get<{ ship?: { shipFeeWarning?: string | null } }>('/api/v1/m/phieu-ban/order-settings').then((r) => r.ship?.shipFeeWarning ?? null).catch(() => null),
  });
  const [wh, setWh] = useState<Record<string, string>>({});
  const [fee, setFee] = useState('');
  const [cod, setCod] = useState<[string, string][]>([]);
  useEffect(() => { if (cur.data) { setWh(cur.data.wh); setFee(cur.data.fee); setCod(Object.entries(cur.data.cod)); } }, [cur.data]);
  const branches = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of whs.data ?? []) m.set(w.branchCode, w.branchName);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [whs.data]);
  const writable = can('settings:write');
  const save = useMutation({
    mutationFn: async () => {
      if (!cur.data) return;
      const put = (key: string, value: unknown) => api.put(`/api/v1/settings/values/${key}`, { key, value });
      if (JSON.stringify(fromMap(wh)) !== JSON.stringify(fromMap(cur.data.wh))) await put(K.wh, fromMap(wh));
      if (fee.trim() !== cur.data.fee) await put(K.fee, fee.trim());
      const c = fromMap(Object.fromEntries(cod.map(([k, v]) => [k.toUpperCase(), v])));
      if (JSON.stringify(c) !== JSON.stringify(fromMap(cur.data.cod))) await put(K.cod, c);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setting', 'phieu-ban-ship'] }),
  });
  if (cur.isLoading || whs.isLoading) return <Loading />;
  if (cur.error || whs.error) return <ErrorBox error={errorText(cur.error ?? whs.error)} />;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Field label="Kho hàng đang giao (KHG) của cửa hàng" hint={'Chuyến giao "Đang giao": chuyển kho KCB → KHG "Kho hàng gửi bán" (chưa ghi doanh thu); "Đã giao": phiếu bán xuất từ KHG; "Hoàn": KHG → KCB. Chưa có kho KHG: khai ở Danh mục kho (DM18) và tick KHG vào nghiệp vụ "Xuất bán".'}>
        <table className="grid">
          <thead><tr><th>Cửa hàng</th><th>Kho KHG</th></tr></thead>
          <tbody>{branches.map(([code, name]) => {
            const opts = (whs.data ?? []).filter((w) => w.branchCode === code && w.isActive && (w.typeCode === 'KHG' || w.code === wh[code]));
            return (
              <tr key={code}><td>{code} — {name}</td><td>
                <select className="input" value={wh[code] ?? ''} disabled={!writable} title={writable ? '' : 'Cần quyền settings:write'} onChange={(e) => setWh({ ...wh, [code]: e.target.value })}>
                  <option value="">{opts.length ? '— chưa chọn —' : '— cửa hàng chưa có kho loại KHG —'}</option>
                  {opts.map((w) => <option key={w.code} value={w.code}>{w.code} — {w.name}{w.typeCode !== 'KHG' ? ` (loại ${w.typeCode})` : ''}</option>)}
                </select>
              </td></tr>
            );
          })}</tbody>
        </table>
      </Field>
      <Field label="Mã dịch vụ phí ship thu khách" hint="Mặt hàng dịch vụ (danh mục mặt hàng) thành dòng phí ship trên phiếu bán của chuyến giao. Chưa khai mà chuyến có phí ship thì không ghi Đã giao được.">
        <ItemPicker value={fee} onChange={setFee} disabled={!writable} />
        {shipCheck.data && fee.trim() === cur.data?.fee && <div className="alert alert-warn" role="alert">{shipCheck.data}</div>}
      </Field>
      <Field label='Hình thức thanh toán "COD — hãng"' hint="Tiền COD của chuyến thành dòng thanh toán theo hình thức của hãng (phải thu hãng — tài khoản, đối tượng khai ở hình thức thanh toán). Hãng tự giao: SELF.">
        <table className="grid">
          <thead><tr><th>Mã hãng</th><th>Hình thức thanh toán</th><th /></tr></thead>
          <tbody>{cod.map(([k, v], i) => (
            <tr key={i}>
              <td><input className="input" style={{ width: 120 }} value={k} disabled={!writable} onChange={(e) => setCod(cod.map((x, j) => (j === i ? [e.target.value.toUpperCase(), x[1]] : x)))} /></td>
              <td><select className="input" value={v} disabled={!writable} onChange={(e) => setCod(cod.map((x, j) => (j === i ? [x[0], e.target.value] : x)))}>
                <option value="">— chọn —</option>
                {(methods.data ?? []).filter((m) => m.isActive !== false || m.code === v).map((m) => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
              </select></td>
              <td><button className="btn btn-xs" disabled={!writable} onClick={() => setCod(cod.filter((_, j) => j !== i))}>Bỏ</button></td>
            </tr>
          ))}</tbody>
        </table>
        <div><button className="btn btn-xs" disabled={!writable} onClick={() => setCod([...cod, ['', '']])}>+ Thêm hãng</button></div>
      </Field>
      {save.error && <ErrorBox error={errorText(save.error)} />}
      {writable && <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Ghi cài đặt giao hàng</button>
        {save.isSuccess && <span className="muted">Đã ghi.</span>}
      </div>}
    </div>
  );
}
