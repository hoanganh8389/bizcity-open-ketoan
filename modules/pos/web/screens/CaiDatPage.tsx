/**
 * BH17 Cài đặt bán hàng — một màn cho bán lẻ (NT-BH-008 §7, NT-BH-014; chữ chốt nghiep-vu/20):
 *   ① Máy bán tại quầy: hạn trả, bắt buộc mở ca, ca theo chi nhánh / máy, ngưỡng chênh lệch két (khoá bizcity.pos.*).
 *   ② Ghi sổ chứng từ bán: sale / sale_return ghi ngay hay chờ duyệt — GET / PUT /api/v1/settings/posting-modes của Core
 *      (PUT thay cả bảng → gộp với chế độ hiện có của loại chứng từ khác rồi mới gửi).
 *   ③ Chênh lệch két: bật lập phiếu kế toán khi chốt ca lệch; hai lý do loại journal (Nợ / Có) — tạo / sửa qua
 *      PUT /api/v1/posting/reasons/:code của Core; module chỉ giữ mã lý do.
 *   ④ Tài khoản hạch toán bán hàng: loại nhóm "Bán hàng" của ACC41 (chỉ đọc), nút Sửa ở ACC41.
 * Khoá của module ghi qua đường chung PUT /api/v1/settings/values/:key (quyền settings:write; có phiên bản, ai đổi, lúc nào).
 */
// [2026-11-13 08:45 PM Võ Hoàng] NGHIEM-THU — NT-BH-014: BH17 gom 4 khối cài đặt bán hàng (đóng góp)
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorBox, Field, Loading, PageHeader, errorText, useApi, useCan, useMutation, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { M } from '../lib';

type Values = {
  returnDays: number; requireOpenShift: boolean; shiftScope: 'branch' | 'device'; cashDiffAlert: number;
  cashDiffJournal: boolean; cashShortReason: string; cashOverReason: string;
};
type Resp = { values: Values; keys: Record<keyof Values, string> };
type Mode = 'auto' | 'approve';
type Reason = { code: string; name: string; kind: string; debitAccount: string | null; creditAccount: string | null; isActive: boolean };
type AdType = { code: string; group: string; name: string; isActive: boolean; columns: { key: string; caption: string; default: string }[] };
type Pair = { debit: string; credit: string };

const SALE_TYPES: [string, string][] = [['sale', 'Phiếu bán hàng (đơn máy POS, BH10)'], ['sale_return', 'Phiếu trả hàng (BH11, BH14)']];
const DEF_PAIR = { short: { debit: '1381', credit: '1111' }, over: { debit: '1111', credit: '3381' } };
const REASON_NAME = { short: 'Thiếu tiền két chờ xử lý (máy bán POS)', over: 'Thừa tiền két chờ xử lý (máy bán POS)' };

function Block({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="card card-body" style={{ maxWidth: 760, display: 'grid', gap: 12 }}>
      <div><b>{title}</b><div className="muted">{hint}</div></div>
      {children}
    </section>
  );
}

export function CaiDatPage() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['pos-admin', 'settings'], queryFn: () => api.get<Resp>(`${M}/admin/settings`) });
  const modesQ = useQuery({ queryKey: ['posting-modes'], queryFn: () => api.get<Record<string, Mode>>('/api/v1/settings/posting-modes') });
  const reasonsQ = useQuery({ queryKey: ['reasons'], queryFn: () => api.get<Reason[]>('/api/v1/posting/reasons') });
  const typesQ = useQuery({ queryKey: ['account-default-types'], queryFn: () => api.get<AdType[]>('/api/v1/account-default-types') });
  const [v, setV] = useState<Values | null>(null);
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [pairs, setPairs] = useState<{ short: Pair; over: Pair }>(DEF_PAIR);
  const [err, setErr] = useState<Partial<Record<keyof Values, string>>>({});
  useEffect(() => { if (q.data) setV(q.data.values); }, [q.data]);
  useEffect(() => { if (modesQ.data) setModes(modesQ.data); }, [modesQ.data]);
  const reasonOf = (code: string | undefined) => reasonsQ.data?.find((r) => r.code === code);
  /** Cặp tài khoản đang lưu ở lý do; chưa có lý do → đề xuất mặc định (1381 / 1111, 1111 / 3381). */
  const savedPairs = (x: Values) => {
    const pick = (code: string, d: Pair): Pair => { const r = reasonOf(code); return r?.kind === 'journal' ? { debit: r.debitAccount ?? '', credit: r.creditAccount ?? '' } : d; };
    return { short: pick(x.cashShortReason, DEF_PAIR.short), over: pick(x.cashOverReason, DEF_PAIR.over) };
  };
  useEffect(() => {
    if (v && reasonsQ.data) setPairs(savedPairs(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reasonsQ.data, v?.cashShortReason, v?.cashOverReason]);

  const writable = can('settings:write');
  const pairChanged = (side: 'short' | 'over') => {
    const r = reasonOf(side === 'short' ? v?.cashShortReason : v?.cashOverReason);
    return !r || r.kind !== 'journal' || (r.debitAccount ?? '') !== pairs[side].debit || (r.creditAccount ?? '') !== pairs[side].credit;
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!q.data || !v) return;
      // Lý do trước (tài khoản sai thì Core báo, chưa đổi gì của module).
      if (v.cashDiffJournal) {
        for (const side of ['short', 'over'] as const) {
          if (!pairChanged(side)) continue;
          const code = side === 'short' ? v.cashShortReason : v.cashOverReason;
          await api.put(`/api/v1/posting/reasons/${encodeURIComponent(code)}`, {
            name: reasonOf(code)?.name ?? REASON_NAME[side], kind: 'journal', debitAccount: pairs[side].debit.trim(), creditAccount: pairs[side].credit.trim(), isActive: true,
          });
        }
      }
      for (const k of Object.keys(v) as (keyof Values)[]) {
        if (v[k] !== q.data.values[k]) await api.put(`/api/v1/settings/values/${encodeURIComponent(q.data.keys[k])}`, { key: q.data.keys[k], value: v[k] });
      }
      if (modesQ.data && SALE_TYPES.some(([t]) => modes[t] !== modesQ.data![t])) await api.put('/api/v1/settings/posting-modes', { ...modesQ.data, ...modes });
    },
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['pos-admin', 'settings'] }), qc.invalidateQueries({ queryKey: ['posting-modes'] }), qc.invalidateQueries({ queryKey: ['reasons'] }),
    ]),
  });

  if (q.isLoading || !v) return q.error ? <ErrorBox error={errorText(q.error)} /> : <Loading />;
  const days = (s: string) => {
    const n = Number(s);
    setErr((e) => ({ ...e, returnDays: Number.isInteger(n) && n >= 0 && n <= 60 ? undefined : 'Từ 0 đến 60 ngày' }));
    setV({ ...v, returnDays: Number.isInteger(n) ? n : v.returnDays });
  };
  const changed = (q.data && (Object.keys(v) as (keyof Values)[]).some((k) => v[k] !== q.data!.values[k]))
    || (modesQ.data && SALE_TYPES.some(([t]) => modes[t] !== modesQ.data![t]))
    || (v.cashDiffJournal && reasonsQ.data && (pairChanged('short') || pairChanged('over')));
  const reset = () => { setV(q.data!.values); if (modesQ.data) setModes(modesQ.data); setErr({}); setPairs(savedPairs(q.data!.values)); };
  const ready = (code: string) => { const r = reasonOf(code); return r?.kind === 'journal' && r.isActive && r.debitAccount && r.creditAccount; };
  const saleTypes = (typesQ.data ?? []).filter((t) => t.group === 'Bán hàng' && t.isActive);
  const acc = (t: AdType, key: string) => t.columns.find((c) => c.key === key)?.default ?? '';
  const pairRow = (side: 'short' | 'over', label: string, code: string) => (
    <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ minWidth: 150 }}>{label} <span className="muted">({code})</span></span>
      <label className="row" style={{ gap: 4 }}>Nợ <input className="input" style={{ width: 90 }} value={pairs[side].debit} disabled={!writable || !v.cashDiffJournal} onChange={(e) => setPairs({ ...pairs, [side]: { ...pairs[side], debit: e.target.value } })} /></label>
      <label className="row" style={{ gap: 4 }}>Có <input className="input" style={{ width: 90 }} value={pairs[side].credit} disabled={!writable || !v.cashDiffJournal} onChange={(e) => setPairs({ ...pairs, [side]: { ...pairs[side], credit: e.target.value } })} /></label>
      {reasonsQ.data && (ready(code) ? <span className="badge badge-ok">Đã có lý do</span> : <span className="badge badge-warn">Chưa có lý do — bấm Ghi để tạo</span>)}
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <PageHeader title="Cài đặt bán hàng" code="BH17" subtitle="Một chỗ cho cài đặt bán lẻ: máy bán tại quầy, cách ghi sổ chứng từ bán, chênh lệch két, tài khoản hạch toán. Đổi có hiệu lực từ hôm nay, lưu lịch sử ai đổi lúc nào." />

      <Block title="① Máy bán tại quầy" hint="Áp cho mọi cửa hàng của đơn vị.">
        <Field label="Hạn trả hàng không cần duyệt (ngày, tính từ ngày bán)" hint={err.returnDays ?? 'Quá hạn: máy bán đòi người duyệt (bộ phận kinh doanh). Mặc định 3 ngày.'}>
          <input className={`input${err.returnDays ? ' input-error' : ''}`} type="number" min={0} max={60} value={v.returnDays} disabled={!writable} onChange={(e) => days(e.target.value)} />
        </Field>
        <Field label="Bắt buộc mở ca trước khi bán" hint="Chưa bật: máy bán vẫn nhận đơn khi chưa mở ca (ca theo ngày).">
          <input type="checkbox" checked={v.requireOpenShift} disabled={!writable} onChange={(e) => setV({ ...v, requireOpenShift: e.target.checked })} />
        </Field>
        <Field label="Ca bán" hint="Đợt này chỉ áp dụng một ca chung cho mỗi chi nhánh.">
          <select className="input" value={v.shiftScope} disabled={!writable} onChange={(e) => setV({ ...v, shiftScope: e.target.value as Values['shiftScope'] })}>
            <option value="branch">Một ca chung cho cả chi nhánh</option>
            <option value="device">Mỗi máy bán một ca</option>
          </select>
        </Field>
        <Field label="Ngưỡng chênh lệch két cần chú ý (đồng)" hint="Sổ ca bán tô đỏ ca có chênh lệch từ ngưỡng này trở lên; 0 = mọi chênh lệch.">
          <input className="input" type="number" min={0} value={v.cashDiffAlert} disabled={!writable} onChange={(e) => setV({ ...v, cashDiffAlert: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        </Field>
      </Block>

      <Block title="② Ghi sổ chứng từ bán" hint="Ghi ngay: chứng từ lên sổ khi máy bán gửi (bán lẻ mặc định ghi ngay, như POS cũ). Chờ duyệt: nằm ở Trạm chứng từ ACC14 chờ kế toán duyệt.">
        {modesQ.error ? <ErrorBox error={errorText(modesQ.error)} /> : SALE_TYPES.map(([t, label]) => (
          <Field key={t} label={label}>
            <select className="input" value={modes[t] ?? 'approve'} disabled={!writable || !modesQ.data} onChange={(e) => setModes({ ...modes, [t]: e.target.value as Mode })}>
              <option value="auto">Ghi ngay</option>
              <option value="approve">Chờ duyệt</option>
            </select>
          </Field>
        ))}
      </Block>

      <Block title="③ Chênh lệch két khi chốt ca" hint="Ca chốt có tiền thiếu / thừa thì lập một phiếu kế toán (tài sản thiếu / thừa chờ xử lý), đối tượng là chi nhánh. Tài khoản lấy theo lý do, đổi được ở đây.">
        <Field label="Lập phiếu kế toán khi chốt ca lệch két" hint="Tắt: chỉ lưu biên bản ca, kế toán xử lý tay. Lý do chưa có lúc chốt: ca vẫn chốt, phiếu nằm ở ACC14 thẻ Lỗi.">
          <input type="checkbox" checked={v.cashDiffJournal} disabled={!writable} onChange={(e) => setV({ ...v, cashDiffJournal: e.target.checked })} />
        </Field>
        {reasonsQ.error ? <ErrorBox error={errorText(reasonsQ.error)} /> : (
          <>
            {pairRow('short', 'Thiếu tiền', v.cashShortReason)}
            {pairRow('over', 'Thừa tiền', v.cashOverReason)}
          </>
        )}
        {modesQ.data && (
          <p className="muted" style={{ margin: 0 }}>
            Phiếu lập xong: {modesQ.data.manual_journal === 'auto' ? 'ghi sổ ngay' : 'chờ kế toán duyệt ở Trạm chứng từ ACC14'} — theo chế độ của loại "phiếu kế toán" (dùng chung cho mọi phiếu kế toán phân hệ lập, vd kiểm kê kho), đổi ở ACC14.
          </p>
        )}
      </Block>

      <Block title="④ Tài khoản hạch toán bán hàng" hint="Theo Tài khoản ngầm định (ACC41), nhóm Bán hàng. Bộ định khoản dùng các tài khoản này cho chứng từ bán, trả, giảm giá.">
        {typesQ.error ? <ErrorBox error={errorText(typesQ.error)} /> : !typesQ.data ? <Loading /> : (
          <table className="grid">
            <thead><tr><th>Loại</th><th>TK Nợ</th><th>TK Có</th></tr></thead>
            <tbody>{saleTypes.map((t) => <tr key={t.code}><td>{t.name}</td><td>{acc(t, 'debit_account')}</td><td>{acc(t, 'credit_account')}</td></tr>)}</tbody>
          </table>
        )}
        <div><a className="btn" href="/cau-hinh/tai-khoan-ngam-dinh">Sửa ở ACC41</a></div>
      </Block>

      {save.error && <ErrorBox error={errorText(save.error)} />}
      {writable ? (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary" disabled={!changed || !!err.returnDays || save.isPending} onClick={() => save.mutate()}>Ghi</button>
          <button type="button" className="btn" disabled={!changed} onClick={reset}>Bỏ sửa</button>
          {save.isSuccess && !changed && <span className="muted">Đã ghi.</span>}
        </div>
      ) : <p className="muted">Chỉ người có quyền ghi cấu hình (kế toán trưởng / quản trị) đổi được.</p>}
    </div>
  );
}
