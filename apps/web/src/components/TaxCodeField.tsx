// [2026-11-11 10:48 AM kiennt] HT03 — tách từ features/catalog/PartnersPage.tsx để Thông tin đơn vị (HT03) dùng chung tra cứu mã số thuế với form đối tượng
/**
 * Ô MÃ SỐ THUẾ có tra cứu (GET /api/v1/partners/tax-lookup/:mst — doanhnghiep.vn / VietQR, dữ liệu Cục Thuế). Dùng ở form đối tượng (khách hàng,
 * nhà cung cấp) và Thông tin đơn vị (HT03).
 */
import { useRef, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { Field } from '@/components/ui';

interface TaxCompany { taxCode: string; name: string; internationalName: string; shortName: string; address: string; representative: string; status: string; active: boolean | null; industry: string; registeredAt: string; source: string }
interface TaxLookup { found: boolean; company: TaxCompany | null; existing: { code: string; name: string }[]; cached: boolean }
export type TaxFill = { taxCode: string; name: string; shortName: string; address: string; representative: string };

/**
 * Ô MÃ SỐ THUẾ có tra cứu: gõ MST rồi bấm "Lấy thông tin" (hoặc Enter) → máy chủ tra doanh nghiệp (doanhnghiep.vn / VietQR,
 * dữ liệu Cục Thuế) → điền tên trên hoá đơn, địa chỉ đăng ký, tên viết tắt, người đại diện. Bấm nút = ghi đè các ô đó theo kết quả;
 * tự tra khi rời ô (thêm mới, chưa có tên) = chỉ điền ô đang trống. Báo trạng thái ngừng hoạt động và MST đã có ở đối tượng khác.
 */
export function TaxCodeField({ value, onChange, onFill, autoWhenEmpty, onBlurCheck, excludeCode, label = 'Mã số thuế — nhập rồi bấm Lấy thông tin', full = true, disabled = false, showExisting = true }: {
  value: string; onChange: (v: string) => void; onFill: (f: TaxFill, overwrite: boolean) => void; autoWhenEmpty: boolean; onBlurCheck?: (v: string) => void; excludeCode?: string;
  /** Nhãn ô; mặc định như form đối tượng. */ label?: string; full?: boolean;
  /** Chỉ xem: không gõ, không tra. */ disabled?: boolean;
  /** Báo "MST đã có ở đối tượng khác" (form đối tượng: có; Thông tin đơn vị: không — MST của chính công ty có thể trùng một đối tượng). */ showExisting?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<TaxLookup | null>(null);
  const [err, setErr] = useState('');
  const last = useRef('');
  /** Lượt tra đang chạy theo MST: rời ô tự tra rồi bấm Lấy thông tin ngay → chờ lượt đó (không gửi thêm — VietQR giới hạn lượt tra), xong thì điền đè. */
  const inflight = useRef<{ mst: string; p: Promise<TaxLookup> } | null>(null);
  const seq = useRef(0);
  const run = async (overwrite: boolean) => {
    const mst = value.trim();
    if (!mst) { setErr('Nhập mã số thuế trước'); return; }
    const my = ++seq.current;
    setBusy(true); setErr(''); last.current = mst;
    try {
      if (inflight.current?.mst !== mst) inflight.current = { mst, p: api.get<TaxLookup>(`/api/v1/partners/tax-lookup/${encodeURIComponent(mst)}`) };
      const r = await inflight.current.p;
      if (my !== seq.current) return;
      setRes(r);
      if (r.company) onFill({ taxCode: r.company.taxCode, name: r.company.name, shortName: r.company.shortName, address: r.company.address, representative: r.company.representative }, overwrite);
    } catch (e) { if (my === seq.current) { setRes(null); setErr(errorText(e)); } } finally {
      if (inflight.current?.mst === mst) inflight.current = null;
      if (my === seq.current) setBusy(false);
    }
  };
  const dup = showExisting ? (res?.existing ?? []).filter((p) => p.code !== excludeCode) : [];
  const c = res?.company;
  return (
    <Field label={label} full={full}>
      <div className="row" style={{ gap: 6 }}>
        <input className="input mono" style={{ flex: 1 }} value={value} disabled={disabled} placeholder="vd 0104076740 — tự điền tên, địa chỉ theo Cục Thuế"
          onChange={(e) => { onChange(e.target.value); setRes(null); setErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(true); } }}
          onBlur={(e) => {
            const val = e.target.value.trim();
            onBlurCheck?.(val);
            if (!disabled && autoWhenEmpty && val && val !== last.current && /^[\d\s.-]{10,16}$/.test(val)) void run(false);
          }} />
        <button type="button" className="btn btn-sm btn-primary" disabled={disabled || !value.trim()} onClick={() => void run(true)} title="Tra cứu doanh nghiệp theo mã số thuế và điền tên, địa chỉ, tên viết tắt, người đại diện">
          {busy ? 'Đang tra…' : 'Lấy thông tin'}
        </button>
      </div>
      {err && <span style={{ fontSize: 12, color: 'var(--bad, #dc2626)' }}>{err}</span>}
      {res && !c && <span className="muted" style={{ fontSize: 12 }}>Không tìm thấy doanh nghiệp có mã số thuế này — kiểm tra lại MST hoặc nhập tay.</span>}
      {c && (
        <span style={{ fontSize: 12, color: c.active === false ? 'var(--bad, #dc2626)' : 'var(--ok, #15803d)' }}>
          {c.active === false ? '⚠ ' : '✓ '}{c.name}{c.status ? ` — ${c.status}` : ''}{c.active === false ? ' (kiểm tra trước khi giao dịch)' : ''}
          {c.industry ? ` · ngành: ${c.industry}` : ''}{c.registeredAt ? ` · thành lập ${c.registeredAt.split('-').reverse().join('/')}` : ''}
        </span>
      )}
      {dup.length > 0 && <span style={{ fontSize: 12, color: 'var(--bad, #dc2626)' }}>Mã số thuế này đã có ở: {dup.map((p) => `${p.code} - ${p.name}`).join('; ')} — mỗi MST chỉ dùng cho một đối tượng.</span>}
    </Field>
  );
}
