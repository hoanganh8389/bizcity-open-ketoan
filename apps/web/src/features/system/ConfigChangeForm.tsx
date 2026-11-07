// [2026-11-07 02:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-40: form đổi một khoá cấu hình ở HT13 — nhập → xem tác động → lưu (D030-12 = B: một người, chỉ ghi nhật ký, không duyệt; chữ chốt: docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/24-CAU-HINH-HE-THONG.md §4.3)
/**
 * Đổi giá trị một khoá cấu hình (phạm vi đơn vị) qua PUT /api/v1/settings/values/:key. Ba bước, không có bước duyệt:
 *   1. nhập giá trị mới, ngày hiệu lực, lý do (bắt buộc, ≥ 3 ký tự), căn cứ (tuỳ chọn);
 *   2. "Xem tác động" — GET …/impact: kỳ khoá, phiên bản muộn hơn, mục chờ, thiếu căn cứ. Chỉ báo, không chặn;
 *   3. "Lưu" — chỗ chặn duy nhất là ngày hiệu lực trong kỳ đã khoá (PERIOD_LOCKED, báo nguyên văn từ máy chủ).
 * Chỉ hiện cho người có quyền của khoá; khoá bí mật không bao giờ vào form (giá trị không hiện).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorBox, Field } from '@/components/ui';
import { api, errorText } from '@/lib/api';

export interface ChangeTarget { key: string; valueType: string; current: unknown; today: string; hasRegistryBasis: boolean }
interface Impact {
  validFrom: string; today: string; retroactive: boolean; periodLocked: null | { year: number; month: number };
  laterVersions: { version: number; validFrom: string }[]; pendingIntake: number; missingBasis: boolean;
}

const fmtDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** Một ô nhập đúng kiểu giá trị của registry (boolean, integer[a..b], enum(a|b), enum[](a|b), string). */
function ValueInput({ valueType, value, onChange }: { valueType: string; value: unknown; onChange: (v: unknown) => void }) {
  const en = /^enum(\[\])?\(([^)]+)\)$/.exec(valueType);
  const int = /^integer(?:\[(-?\d+)\.\.(-?\d+)\])?$/.exec(valueType);
  if (valueType === 'boolean') {
    return <select className="input" value={String(value)} onChange={(e) => onChange(e.target.value === 'true')}><option value="true">Bật</option><option value="false">Tắt</option></select>;
  }
  if (en && !en[1]) {
    return <select className="input" value={String(value)} onChange={(e) => onChange(e.target.value)}>{en[2]!.split('|').map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  }
  if (en && en[1]) {
    const cur = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {en[2]!.split('|').map((o) => (
          <label key={o} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={cur.includes(o)} onChange={(e) => onChange(e.target.checked ? [...cur, o] : cur.filter((x) => x !== o))} />{o}
          </label>
        ))}
      </div>
    );
  }
  if (int) {
    return <input className="input" type="number" step={1} min={int[1]} max={int[2]} value={typeof value === 'number' ? value : ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
  }
  return <input className="input" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />;
}

export function ConfigChangeForm({ target, onClose }: { target: ChangeTarget; onClose: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<unknown>(target.current);
  const [validFrom, setValidFrom] = useState(target.today);
  const [reason, setReason] = useState('');
  const [basisDoc, setBasisDoc] = useState('');
  const [basisArticle, setBasisArticle] = useState('');
  const [previewed, setPreviewed] = useState<string | null>(null); // khoá của lần xem trước đang hiện (ngày hiệu lực) — đổi ngày thì phải xem lại
  const preview = useQuery({
    queryKey: ['settings', 'impact', target.key, previewed], enabled: previewed !== null,
    queryFn: () => api.get<Impact>(`/api/v1/settings/values/${target.key}/impact?validFrom=${previewed}`),
  });
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/settings/values/${target.key}`, {
      value, validFrom, reason: reason.trim(),
      ...(basisDoc.trim() ? { basis: { doc: basisDoc.trim(), ...(basisArticle.trim() ? { article: basisArticle.trim() } : {}) } } : {}),
    }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['settings'] }); onClose(); },
  });
  const reasonOk = reason.trim().length >= 3;
  const valueOk = value !== '' && value !== undefined;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(validFrom);
  const im = preview.data;
  const seen = previewed === validFrom && im; // đã xem tác động đúng ngày đang nhập

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border, #e5e7eb)' }} aria-label={`Đổi ${target.key}`}>
      <strong style={{ fontSize: 13 }}>Đổi giá trị</strong>
      <p className="muted" style={{ margin: '2px 0 8px', fontSize: 12 }}>Một người đổi, không cần duyệt; ai đổi gì, vì sao đều được ghi lại và đổi lại được. Chứng từ đã lập giữ phiên bản cũ.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        <Field label="Giá trị mới"><ValueInput valueType={target.valueType} value={value} onChange={(v) => { setValue(v); }} /></Field>
        <Field label="Ngày hiệu lực" hint="Từ ngày này phép tính đọc giá trị mới. Ngày trong kỳ đã khoá sẽ bị chặn khi lưu."><input className="input" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></Field>
        <Field label="Lý do (ít nhất 3 ký tự)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
        <Field label="Căn cứ — văn bản (tuỳ chọn)" hint="Điền khi có văn bản làm căn cứ; để trống vẫn lưu được."><input className="input" value={basisDoc} onChange={(e) => setBasisDoc(e.target.value)} maxLength={500} /></Field>
        {basisDoc.trim() && <Field label="Điều / khoản (tuỳ chọn)"><input className="input" value={basisArticle} onChange={(e) => setBasisArticle(e.target.value)} maxLength={500} /></Field>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
        <button type="button" className="btn" disabled={!dateOk || preview.isFetching} onClick={() => setPreviewed(validFrom)}>Xem tác động</button>
        <button type="button" className="btn btn-primary" disabled={!reasonOk || !valueOk || !dateOk || !seen || save.isPending} title={seen ? undefined : 'Bấm "Xem tác động" trước khi lưu'} onClick={() => save.mutate()}>Lưu thay đổi</button>
        <button type="button" className="btn" onClick={onClose}>Huỷ</button>
      </div>

      {preview.error && <ErrorBox error={errorText(preview.error)} />}
      {previewed !== null && previewed !== validFrom && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Ngày hiệu lực đã đổi — bấm "Xem tác động" lại.</p>}
      {seen && im && (
        <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 13 }} aria-label="Tác động">
          {im.periodLocked
            ? <li style={{ color: 'var(--danger, #b91c1c)' }}><strong>Sẽ bị chặn:</strong> ngày {fmtDate(im.validFrom)} thuộc kỳ {String(im.periodLocked.month).padStart(2, '0')}/{im.periodLocked.year} đã khoá. Chọn ngày trong kỳ đang mở, hoặc mở khoá kỳ trước.</li>
            : <li>Kỳ chứa ngày {fmtDate(im.validFrom)} chưa khoá.</li>}
          {im.retroactive && <li>Hiệu lực lùi về trước hôm nay: chứng từ đã lập không đổi; chỉ phép tính từ nay đọc giá trị mới cho ngày ≥ {fmtDate(im.validFrom)}.</li>}
          {im.laterVersions.length > 0 && <li>Đã có {im.laterVersions.length} phiên bản hiệu lực muộn hơn ({im.laterVersions.map((v) => `V${v.version} từ ${fmtDate(v.validFrom)}`).join(', ')}): giá trị mới chỉ áp trước các ngày đó.</li>}
          <li>{im.pendingIntake > 0 ? `${im.pendingIntake} mục đang chờ ở bể chờ đầu vào; gửi lại sẽ đọc giá trị mới (bể không ghi ngày chứng từ nên không đếm theo ngày hiệu lực).` : 'Không có mục chờ ở bể chờ đầu vào.'}</li>
          {im.missingBasis && !basisDoc.trim() && <li>Khoá loại A chưa có căn cứ: nên khai căn cứ (không bắt buộc).</li>}
        </ul>
      )}
      {save.error && <ErrorBox error={errorText(save.error)} />}
    </div>
  );
}
