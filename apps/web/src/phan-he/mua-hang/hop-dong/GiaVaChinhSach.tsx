// [2026-11-19 Nguyễn Văn Thủy] Giá mua + chính sách cạnh nhau — dùng chung cho trang hợp đồng và thẻ "Không theo hợp đồng" của hồ sơ NCC (đóng góp)
/**
 * GIÁ MUA & CHÍNH SÁCH của một hợp đồng (contractCode) hoặc phần "Không theo hợp đồng" (contractCode = '') của một NCC.
 * Trái: bảng giá mua (BangGiaMua, lọc theo hợp đồng, chỉ thêm mã thuộc nhãn của hợp đồng).
 * Phải: mọi chính sách (PolicyBlock + PolicyForm khoá NCC, khoá hợp đồng; hiệu lực mặc định theo hợp đồng).
 * Không viết lại bảng hay form: chỉ ghép các thành phần có sẵn.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Policy, PolicyKind } from '@bizcity/mua-hang-domain';
import { Loading } from '@/components/ui';
import { useMuaHang } from '../du-lieu';
import { PolicyForm, newPolicy } from '../chinh-sach/PolicyForm';
import { CONTRACT_KINDS, PolicyBlock } from '../chinh-sach/PolicyBlock';
import { BangGiaMua } from '../thanh-phan/BangGiaMua';
import { CongNoDieuKhoan, DIEU_KHOAN_TT } from './CongNoDieuKhoan';

/** Chính sách mua của hợp đồng / ngoài hợp đồng: bỏ công nợ + điều khoản thanh toán (là điều khoản, khai ở khối riêng). */
const KINDS = CONTRACT_KINDS.filter((k) => !DIEU_KHOAN_TT.includes(k));

export function GiaVaChinhSach({ partnerCode, contractCode, brands, skus, start, end, readOnly }: {
  partnerCode: string; contractCode: string; brands?: string[]; start?: string; end?: string;
  /** Hàng hoá của hợp đồng: bảng giá / chính sách chỉ chọn được các mã này. */
  skus?: string[];
  /** Hợp đồng đã thanh lý: chỉ xem. */
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const { data: mh, refresh } = useMuaHang();
  const [pol, setPol] = useState<Policy | null>(null);
  const reload = () => { void qc.invalidateQueries({ queryKey: ['mua-hang', 'contracts'] }); void qc.invalidateQueries({ queryKey: ['mua-hang', 'contract'] }); void refresh(); };
  if (!mh) return <Loading />;
  const policies = mh.policies.filter((p) => p.scope.partnerCode === partnerCode && (p.scope.contractCode ?? '') === contractCode);
  const add = (k: PolicyKind) => setPol({ ...newPolicy(k, { partnerCode, ...(contractCode ? { contractCode } : {}) }), ...(start ? { validFrom: start } : {}), ...(end ? { validTo: end } : {}) });
  return (
    <div className="hd-gia-cs">
      {/* Ngoài hợp đồng: công nợ + điều khoản thanh toán chung của NCC đứng riêng, trên giá mua (hợp đồng khai ở bước Điều khoản). */}
      {!contractCode && <div style={{ gridColumn: '1 / -1' }}><CongNoDieuKhoan partnerCode={partnerCode} contractCode="" readOnly={readOnly} /></div>}
      <section className="hd-box">
        <h4 className="mh-h4">Giá mua <span className="muted" style={{ fontWeight: 400 }}>(NCC × mã × ĐVT{contractCode ? ', thuộc hợp đồng' : ''})</span></h4>
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <BangGiaMua partnerCode={partnerCode} contractCode={contractCode} brands={brands} skus={skus} data={mh} onChanged={reload} />
        </fieldset>
      </section>
      <section className="hd-box">
        <h4 className="mh-h4">Chính sách mua <span className="muted" style={{ fontWeight: 400 }}>(chiết khấu, khuyến mại, thưởng, lô / hạn dùng — phiếu tự áp; công nợ &amp; hạn thanh toán khai riêng)</span></h4>
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <PolicyBlock policies={policies} kinds={KINDS} onAdd={(k) => add(k)} onEdit={(p) => setPol(p)} />
        </fieldset>
      </section>
      {pol && <PolicyForm value={pol} all={mh.policies} kinds={KINDS} lockPartner lockContract onClose={() => setPol(null)} onSaved={(_c, stay) => { if (!stay) setPol(null); reload(); }} />}
    </div>
  );
}
