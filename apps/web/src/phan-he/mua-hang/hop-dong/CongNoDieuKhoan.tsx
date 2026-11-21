// [2026-11-21 Nguyễn Văn Thủy] Công nợ & điều khoản thanh toán = ĐIỀU KHOẢN hợp đồng (hoặc của NCC ngoài hợp đồng), tách khỏi chính sách (docs/nghiep-vu/28) (đóng góp)
/**
 * CÔNG NỢ & ĐIỀU KHOẢN THANH TOÁN của một hợp đồng (contractCode) hoặc phần ngoài hợp đồng (contractCode = '') của một NCC.
 * Hai dòng cố định: Điều khoản thanh toán · Hạn mức công nợ — khai / sửa bằng form chính sách có sẵn (loại payment_term, credit_limit,
 * khoá NCC + hợp đồng). Hạn mức hiện luôn đang dùng / còn lại. Hợp đồng chưa khai thì phiếu của hợp đồng dùng bản chung của NCC.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { POLICY_LABEL, termFromRule, termText, type CreditStatus, type Policy, type PolicyKind } from '@bizcity/mua-hang-domain';
import { api } from '@/lib/api';
import { Loading } from '@/components/ui';
import { P, today, useMuaHang, vnd } from '../du-lieu';
import { PolicyForm, newPolicy } from '../chinh-sach/PolicyForm';
import { ruleText } from '../chinh-sach/quyTac';
import { UsageBar, dmy } from '../chung';

export const DIEU_KHOAN_TT: PolicyKind[] = ['payment_term', 'credit_limit'];

export function CongNoDieuKhoan({ partnerCode, contractCode, start, end, readOnly }: {
  partnerCode: string; contractCode: string; start?: string; end?: string; readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const { data: mh, refresh } = useMuaHang();
  const [pol, setPol] = useState<Policy | null>(null);
  const credit = useQuery({ queryKey: ['mua-hang', 'credit', today()], queryFn: () => api.get<{ partners: (CreditStatus & { partnerCode: string; contractCode?: string })[] }>(`${P}/credit`, { asOf: today() }) });
  if (!mh) return <Loading />;
  const now = today();
  const dangAp = (p: Policy) => p.isActive && (!p.validFrom || p.validFrom <= now) && (!p.validTo || p.validTo >= now);
  const cua = (k: PolicyKind, cc: string) => mh.policies.filter((p) => p.kind === k && p.scope.partnerCode === partnerCode && (p.scope.contractCode ?? '') === cc)
    .sort((a, b) => Number(dangAp(b)) - Number(dangAp(a)) || (b.validFrom ?? '').localeCompare(a.validFrom ?? ''));
  const reload = () => { void qc.invalidateQueries({ queryKey: ['mua-hang'] }); void refresh(); };
  const them = (k: PolicyKind) => setPol({ ...newPolicy(k, { partnerCode, ...(contractCode ? { contractCode } : {}) }), ...(start ? { validFrom: start } : {}), ...(end ? { validTo: end } : {}) });
  const dong = (k: PolicyKind) => {
    const ds = cua(k, contractCode);
    const chung = contractCode ? cua(k, '').find(dangAp) : undefined;
    const dung = credit.data?.partners.find((x) => x.partnerCode === partnerCode && (x.contractCode ?? '') === contractCode);
    return (
      <tr key={k}>
        <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{POLICY_LABEL[k]}</td>
        <td>
          {ds.length ? ds.map((p) => (
            <div key={p.id} className={dangAp(p) ? '' : 'muted'} style={{ fontSize: 12.5 }}>
              {k === 'payment_term' ? termText(termFromRule(p.rule)) : ruleText(p)}
              <span className="muted" style={{ fontSize: 11 }}> · {dmy(p.validFrom) || '—'} → {dmy(p.validTo) || '…'}{dangAp(p) ? '' : ' · không áp'}</span>
              {!readOnly && <button type="button" className="btn btn-xs" style={{ marginLeft: 6 }} onClick={() => setPol(p)}>Sửa</button>}
            </div>
          )) : <span className="muted" style={{ fontSize: 12.5 }}>Chưa khai{chung ? <> — phiếu {contractCode ? 'của hợp đồng' : ''} dùng bản chung của NCC: <b>{k === 'payment_term' ? termText(termFromRule(chung.rule)) : ruleText(chung)}</b></> : k === 'credit_limit' ? ' — không giới hạn' : ' — hạn theo danh mục đối tượng (nếu có)'}</span>}
          {k === 'credit_limit' && dung && <div style={{ maxWidth: 520, marginTop: 4 }}><UsageBar s={{ ...dung, scope: `Đang dùng ${vnd(dung.current + dung.openOrders)} · còn ${vnd(dung.remaining)}` }} /></div>}
        </td>
        <td style={{ width: 90, textAlign: 'right' }}>{!readOnly && !ds.some(dangAp) && <button type="button" className="btn btn-xs btn-primary" onClick={() => them(k)}>+ Khai</button>}</td>
      </tr>
    );
  };
  return (
    <section className="hd-box" style={{ marginBottom: 10 }}>
      <h4 className="mh-h4" title={contractCode ? 'Điều khoản thanh toán và hạn mức công nợ của hợp đồng: phiếu thuộc hợp đồng tự áp; hạn mức tính trên các phiếu thuộc hợp đồng' : 'Điều khoản thanh toán và hạn mức công nợ chung của NCC: áp cho phiếu ngoài hợp đồng (và hợp đồng chưa khai riêng); hạn mức chung tính trên toàn bộ nợ của NCC'}>
        Công nợ &amp; điều khoản thanh toán <span className="muted" style={{ fontWeight: 400 }}>{contractCode ? '(của hợp đồng — phiếu thuộc hợp đồng tự áp)' : '(ngoài hợp đồng — hạn mức chung của NCC)'}</span>
      </h4>
      <table className="mh-mini" style={{ width: '100%' }}><tbody>{DIEU_KHOAN_TT.map(dong)}</tbody></table>
      {pol && <PolicyForm value={pol} all={mh.policies} kinds={DIEU_KHOAN_TT} lockPartner lockContract onClose={() => setPol(null)} onSaved={(_c, stay) => { if (!stay) setPol(null); reload(); }} />}
    </section>
  );
}
