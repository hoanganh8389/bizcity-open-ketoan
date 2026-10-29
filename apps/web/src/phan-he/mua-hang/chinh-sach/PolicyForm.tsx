/**
 * Form một chính sách mua hàng — dùng ở bảng tổng Chính sách (MH04) và ở từng thẻ của Hồ sơ nhà cung cấp.
 * Đi từ NCC: ô Nhà cung cấp đứng đầu; mã tự đặt "<mã NCC>-<loại>" (ví dụ NC100227-HANMUC), tên tự đặt theo NCC + nội dung.
 * Mở từ hồ sơ NCC thì NCC khoá sẵn và chỉ chọn các loại thuộc thẻ đang mở.
 */
import { useEffect, useState } from 'react';
import { POLICY_LABEL, STACK_KINDS, canRepeat, giftItemsOf, isRepeat, type Policy, type PolicyKind } from '@ketoan/contracts/mua-hang';
import { Field, Modal, useViewAgain } from '@/components/ui';
import { errorText } from '@/lib/api';
import { BranchPicker } from '@/components/filters';
import { ItemPicker, PartnerPicker } from '@/components/pickers';
import { CODE_PREFIX, KIND_HINT, RuleEditor, TEMPLATES, defaultRule, ruleText } from './quyTac';
import { monthStart, purchaseApi, useBrands, useNames, useSupplierBrands } from '../du-lieu';
import { BrandInput } from '../chung';
import { LichSu } from '../thanh-phan/LichSu';

/** Loại chính sách lập được ở màn Chính sách (tồn min–max đã chuyển sang màn Tồn max MH16 — bảng stock_levels). */
export const ALL_KINDS: PolicyKind[] = Object.keys(POLICY_LABEL) as PolicyKind[];

/** Chính sách mới (điền sẵn loại, NCC, hiệu lực từ đầu tháng, nội dung theo mẫu đầu tiên). */
export const newPolicy = (kind: PolicyKind, scope: Policy['scope'] = {}): Policy => ({ id: `new-${Date.now()}`, code: '', kind, name: '', scope, isActive: true, validFrom: monthStart(), rule: TEMPLATES[kind]?.[0]?.rule ? { ...TEMPLATES[kind][0]!.rule } : defaultRule(kind) });

/**
 * Mua X tặng Y kiểu cũ (một dòng: buy / get / giftSku, mã ở phạm vi) → dạng bảng nhiều dòng: mã chuyển vào dòng, ĐVT trống
 * (= ĐVT trên phiếu, đúng như cách tính cũ). Ghi lại là thành dạng mới.
 */
function toGiftTable(v: Policy): Policy {
  if (v.kind !== 'promo_gift' || Array.isArray(v.rule.items)) return v;
  return { ...v, scope: { ...v.scope, sku: undefined }, rule: { splitIntoCost: Boolean(v.rule.splitIntoCost), items: giftItemsOf(v) } };
}

export function PolicyForm({ value, all, kinds = ALL_KINDS, lockPartner, onClose, onSaved }: { value: Policy; all: Policy[]; kinds?: PolicyKind[]; lockPartner?: boolean; onClose: () => void; onSaved: (code: string, stay?: boolean) => void }) {
  const isNew = value.id.startsWith('new-');
  const names = useNames();
  const brands = useBrands(all);
  const scopeTag = (x: Policy) => [x.scope.brandCode && `nhãn ${x.scope.brandCode}`, x.scope.sku && `mã ${x.scope.sku}`, x.scope.branchCode && names.branchName(x.scope.branchCode)].filter(Boolean).join(', ');
  const autoCode = (x: Policy) => {
    const head = x.scope.partnerCode ? `${x.scope.partnerCode}-${CODE_PREFIX[x.kind]}` : `${CODE_PREFIX[x.kind]}-${(x.scope.brandCode || x.scope.sku || 'CHUNG').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-10)}`;
    const base = x.scope.partnerCode && (x.scope.sku || x.scope.branchCode) ? `${head}-${(x.scope.sku ?? x.scope.branchCode ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-10)}` : head;
    const used = new Set(all.filter((o) => o.id !== x.id).map((o) => o.code));
    let c = base; for (let n = 2; used.has(c); n++) c = `${base}-${n}`;
    return c;
  };
  const autoName = (x: Policy) => `${x.scope.partnerCode ? `${names.partnerName(x.scope.partnerCode)}: ` : ''}${ruleText(x)}${scopeTag(x) ? ` (${scopeTag(x)})` : ''}`;
  // Chính sách mới: mã và tên tự đặt theo NCC + loại + nội dung, cho tới khi người dùng tự gõ.
  const [p, setP] = useState(() => { const v0 = toGiftTable(value); return isNew ? { ...v0, code: autoCode(v0), name: autoName(v0) } : v0; });
  const nccBrands = useSupplierBrands(p.scope.partnerCode);
  const [touched, setTouched] = useState({ code: !isNew, name: !isNew });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!touched.name) setP((x) => ({ ...x, name: autoName(x) })); }, [names.partnerName(p.scope.partnerCode ?? '')]); // eslint-disable-line react-hooks/exhaustive-deps
  const upd = (next: Policy) => setP({ ...next, code: touched.code ? next.code : autoCode(next), name: touched.name ? next.name : autoName(next) });
  const viewAgain = useViewAgain();
  // Sửa chính sách đã có rồi Ghi: ở lại hộp thoại, quay về chế độ xem (stay = bên gọi chỉ nạp lại, không đóng).
  const save = async () => {
    const x = { ...p, code: p.code || autoCode(p), name: p.name || autoName(p) };
    setBusy(true); setErr('');
    try { await purchaseApi.savePolicy({ ...x, validFrom: x.validFrom || undefined, validTo: x.validTo || undefined }); onSaved(x.code, !isNew); if (!isNew) viewAgain[1](); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const setScope = (k: keyof Policy['scope'], v: string) => upd({ ...p, scope: { ...p.scope, [k]: v || undefined } });
  const templates = TEMPLATES[p.kind] ?? [];
  const remove = async () => {
    if (!window.confirm(`Xoá chính sách ${p.code}? (Đã áp vào phiếu thì không xoá được — chỉ tắt.)`)) return;
    setBusy(true); setErr('');
    try { await purchaseApi.deletePolicy(p.id); onSaved(p.code); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal viewAgain={viewAgain} viewFirst={!isNew} wide={p.kind === 'item_discount' || p.kind === 'promo_gift'} title={`${POLICY_LABEL[p.kind]} ${isNew ? '(mới)' : p.code}`} onClose={onClose}
      footer={<>{!isNew && <button data-view-ok className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={busy} onClick={() => void remove()} title="Chỉ xoá được chính sách chưa áp vào phiếu nào — đã áp thì bấm Sửa, bỏ tích Áp dụng">Xoá</button>}<button className="btn btn-primary" disabled={busy} onClick={() => void save()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <Field label="Nhà cung cấp (trống = áp cho mọi NCC)" full>
        {lockPartner ? <div className="input" style={{ background: 'var(--surface-2, #f4f6f9)' }}><b className="mono">{p.scope.partnerCode}</b> {names.partnerName(p.scope.partnerCode ?? '')}</div> : <PartnerPicker value={p.scope.partnerCode ?? ''} onChange={(c) => setScope('partnerCode', c)} />}
      </Field>
      <Field label="Loại chính sách" full>
        <select className="select input" value={p.kind} onChange={(e) => { const k = e.target.value as PolicyKind; upd({ ...p, kind: k, rule: TEMPLATES[k]?.[0]?.rule ? { ...TEMPLATES[k][0]!.rule } : defaultRule(k) }); }}>{kinds.map((k) => <option key={k} value={k}>{POLICY_LABEL[k]}</option>)}</select>
        <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{KIND_HINT[p.kind]}</div>
      </Field>
      {p.kind !== 'item_discount' && p.kind !== 'promo_gift' && <Field label="Mã hàng (trống = mọi mã)"><ItemPicker value={p.scope.sku ?? ''} onChange={(c) => setScope('sku', c)} /></Field>}
      <Field label="Chi nhánh (trống = mọi chi nhánh)"><BranchPicker value={p.scope.branchCode ?? ''} onChange={(c) => setScope('branchCode', c)} activeOnly /></Field>
      {<Field label="Nhãn hàng (trống = mọi nhãn của NCC)">
        <BrandInput value={p.scope.brandCode ?? ''} brands={brands} prefer={nccBrands} onChange={(b) => setScope('brandCode', b)} />
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>Áp cho các dòng hàng có nhãn này (nhãn theo danh mục mặt hàng){p.scope.partnerCode && nccBrands.length ? ` · NCC đang bán: ${nccBrands.slice(0, 4).map((b) => b.name).join(', ')}` : ''}</div>
      </Field>}
      <div className="full" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        <b style={{ fontSize: 13 }}>Nội dung</b>
        {templates.length > 0 && <div className="mh-templates"><span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>Mẫu nhanh:</span>{templates.map((t) => <button key={t.label} type="button" onClick={() => upd({ ...p, rule: { ...t.rule, ...(p.rule.apply ? { apply: p.rule.apply } : {}) } })}>{t.label}</button>)}</div>}
        <div style={{ marginTop: 6 }}><RuleEditor kind={p.kind} rule={p.rule as Record<string, any>} onChange={(rule) => upd({ ...p, rule })} /></div>
        <div className="alert alert-ok" style={{ fontSize: 12.5, marginTop: 6 }}>Phần mềm sẽ hiểu là: <b>{ruleText(p)}</b> — áp cho {p.scope.partnerCode ? names.partnerName(p.scope.partnerCode) : 'mọi nhà cung cấp'}{scopeTag(p) ? `, ${scopeTag(p)}` : ''}.</div>
      </div>
      {STACK_KINDS.includes(p.kind) && p.kind !== 'promo_gift' && <CachAp p={p} onChange={(rule) => upd({ ...p, rule })} />}
      <Field label="Mã (tự đặt, sửa được)"><input className="input mono" value={p.code} onChange={(e) => { setTouched({ ...touched, code: true }); setP({ ...p, code: e.target.value.trim() }); }} /></Field>
      <Field label="Tên (tự đặt, sửa được)"><input className="input" value={p.name} onChange={(e) => { setTouched({ ...touched, name: true }); setP({ ...p, name: e.target.value }); }} /></Field>
      <Field label="Hiệu lực từ"><input className="input" type="date" value={p.validFrom ?? ''} onChange={(e) => setP({ ...p, validFrom: e.target.value || undefined })} /></Field>
      <Field label="Đến (trống = không thời hạn)"><input className="input" type="date" value={p.validTo ?? ''} onChange={(e) => setP({ ...p, validTo: e.target.value || undefined })} /></Field>
      <Field label="Ưu tiên (2 chính sách cùng phạm vi, hoặc 2 chương trình áp riêng: số lớn thắng)"><input className="input num" value={p.priority ?? 0} onChange={(e) => setP({ ...p, priority: Number(e.target.value) || 0 })} /></Field>
      <Field label="Trạng thái"><select className="select input" value={p.isActive ? '1' : '0'} onChange={(e) => setP({ ...p, isActive: e.target.value === '1' })}><option value="1">Đang áp</option><option value="0">Tắt</option></select></Field>
      {!isNew && <div className="full" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}><LichSu docNo={value.code} title="Lịch sử thay đổi của chính sách (ai, lúc nào, đổi gì)" empty="Chưa có lần sửa nào được ghi (chính sách nạp từ dữ liệu cũ)." /></div>}
      {!isNew && <div className="muted full" style={{ fontSize: 12 }}>Tạo bởi {p.createdBy || '—'} lúc {p.createdAt ? new Date(p.createdAt).toLocaleString('vi-VN') : '—'} · Sửa gần nhất {p.updatedBy || '—'} lúc {p.updatedAt ? new Date(p.updatedAt).toLocaleString('vi-VN') : '—'}</div>}
      {err && <div className="alert alert-bad full">{err}</div>}
    </Modal>
  );
}

/**
 * Hai ô tích cách áp của chương trình chiết khấu / khuyến mại — mỗi ô một câu nghĩa + ví dụ để người khai hiểu ngay:
 *   Áp riêng (rule.apply = 'exclusive'), Cộng dồn (rule.repeat — chỉ mua X tặng Y và CK số tiền có mức tổng đơn).
 */
function CachAp({ p, onChange }: { p: Policy; onChange: (rule: Policy['rule']) => void }) {
  const r = p.rule;
  const repeatable = canRepeat(p);
  const why = p.kind === 'trade_discount' && Number(r.pct) ? 'CK theo % vốn tính theo tiền hàng — đơn lớn thì tự giảm nhiều hơn, không cần cộng dồn'
    : p.kind === 'trade_discount' ? 'Cần khai "Áp khi tổng đơn từ" thì mới cộng dồn được (mỗi đủ mức đó giảm một lần)'
    : p.kind === 'qty_tier' ? 'Bậc số lượng: SL lên bậc nào lấy % bậc đó cho cả dòng — không cộng dồn'
    : 'CK theo mã tính theo từng ĐVT — mua nhiều thì tự giảm nhiều, không cần cộng dồn';
  return (
    <div className="full mh-cach-ap">
      <b style={{ fontSize: 13 }}>Cách áp</b>
      <label className="mh-tick">
        <input type="checkbox" checked={r.apply === 'exclusive'} onChange={(e) => onChange({ ...r, apply: e.target.checked ? 'exclusive' : undefined })} />
        <span><b>Áp riêng</b> — mã hàng nhận chương trình này thì <u>không nhận</u> chương trình chiết khấu / khuyến mại nào khác (mã khác vẫn áp bình thường).
          <span className="muted"> Bỏ tích = áp đồng thời, cộng với các chương trình khác. Ví dụ: CK 7% riêng mã A tích "Áp riêng" + CK 2% chung → mã A chỉ 7%, mã B được 2%. Hai chương trình áp riêng cùng khớp một mã: lấy ưu tiên cao hơn, bằng nhau lấy cái lợi hơn.</span></span>
      </label>
      <label className={`mh-tick ${repeatable ? '' : 'muted'}`} title={repeatable ? '' : why}>
        <input type="checkbox" disabled={!repeatable} checked={repeatable && isRepeat(p)} onChange={(e) => onChange({ ...r, repeat: e.target.checked })} />
        <span><b>Cộng dồn</b> — đủ điều kiện mấy lần thì hưởng mấy lần.
          <span className="muted"> {p.kind === 'promo_gift' ? `Ví dụ mua ${Number(r.buy) || 2} tặng ${Number(r.get) || 1}: tích → mua ${(Number(r.buy) || 2) * 2} được tặng ${(Number(r.get) || 1) * 2}; bỏ tích → mua bao nhiêu cũng chỉ tặng ${Number(r.get) || 1} lần.`
            : repeatable ? `Ví dụ giảm ${Number(r.amount || 0).toLocaleString('vi-VN')}đ khi đơn từ ${Number(r.minOrder || 0).toLocaleString('vi-VN')}đ: tích → đơn ${(Number(r.minOrder || 0) * 2).toLocaleString('vi-VN')}đ giảm ${(Number(r.amount || 0) * 2).toLocaleString('vi-VN')}đ; bỏ tích → chỉ giảm một lần.`
            : `Không áp dụng: ${why}.`}</span></span>
      </label>
    </div>
  );
}
