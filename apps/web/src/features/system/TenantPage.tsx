/**
 * Thông tin đơn vị (HT03): tên công ty, mã số thuế, địa chỉ, điện thoại.
 * Tên và logo hiện ở đầu trang, trên phiếu in. Chủ sở hữu, kế toán trưởng sửa được.
 * Logo: chọn ảnh PNG / JPEG / WebP; giao diện thu nhỏ về tối đa 400 điểm ảnh rồi mới gửi.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading } from '@/components/ui';

interface Tenant { code: string; name: string; taxCode: string; address: string; phone: string; logo: string | null }

/** Hook dùng chung: thông tin đơn vị (tên, logo…) cho đầu trang, phiếu in. */
export const useTenant = () => useQuery({ queryKey: ['tenant'], queryFn: () => api.get<Tenant>('/api/v1/tenant'), staleTime: 300_000 });

/** Thu nhỏ ảnh về cạnh dài tối đa `max` điểm ảnh, trả về data URL (PNG nếu ảnh gốc PNG để giữ nền trong suốt). */
export function shrinkImage(file: File, max = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9));
    };
    img.onerror = () => reject(new Error('Không đọc được ảnh'));
    img.src = URL.createObjectURL(file);
  });
}

export function TenantPage() {
  const { can, reload } = useAuth();
  const qc = useQueryClient();
  const q = useTenant();
  const [logoError, setLogoError] = useState<string | null>(null);
  const [v, setV] = useState<Tenant | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (q.data) setV(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put<Tenant>('/api/v1/tenant', { name: v!.name, taxCode: v!.taxCode, address: v!.address, phone: v!.phone, logo: v!.logo }),
    onSuccess: async () => { setSaved(true); void qc.invalidateQueries({ queryKey: ['tenant'] }); await reload(); },
  });
  const set = (p: Partial<Tenant>) => { setSaved(false); setV((x) => (x ? { ...x, ...p } : x)); };
  const editable = can('settings:write');
  return (
    <>
      <PageHeader title="Thông tin đơn vị" code="HT03" subtitle="Tên công ty, mã số thuế, địa chỉ: hiện ở đầu trang, trên phiếu in và báo cáo" />
      <div className="card" style={{ padding: 16 }}>
        <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : null} />
        {!v ? <Loading /> : (
          <div className="form-grid">
            <Field label="Mã đơn vị" hint="Dùng khi đăng nhập; không đổi được"><input className="input mono" value={v.code} disabled /></Field>
            <Field label="Tên đơn vị" full><input className="input" value={v.name} disabled={!editable} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Mã số thuế"><input className="input mono" value={v.taxCode} disabled={!editable} onChange={(e) => set({ taxCode: e.target.value.trim() })} /></Field>
            <Field label="Điện thoại"><input className="input" value={v.phone} disabled={!editable} onChange={(e) => set({ phone: e.target.value })} /></Field>
            <Field label="Địa chỉ" full><input className="input" value={v.address} disabled={!editable} onChange={(e) => set({ address: e.target.value })} /></Field>
            <Field label="Logo" full hint="Ảnh PNG, JPEG hoặc WebP; nên dùng ảnh nền trong suốt. Hiện ở đầu trang và trên phiếu in">
              <div className="row" style={{ gap: 14, alignItems: 'center' }}>
                <div style={{ width: 160, height: 64, border: '1px dashed var(--line)', borderRadius: 6, display: 'grid', placeItems: 'center', background: '#fff' }}>
                  {v.logo ? <img src={v.logo} alt="Logo" style={{ maxWidth: 150, maxHeight: 56 }} /> : <span className="muted">Chưa có logo</span>}
                </div>
                {editable && (
                  <>
                    <label className="btn">
                      Chọn ảnh…
                      <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setLogoError(null); try { set({ logo: await shrinkImage(f) }); } catch (err) { setLogoError((err as Error).message); } }} />
                    </label>
                    {v.logo && <button className="btn" onClick={() => set({ logo: null })}>Bỏ logo</button>}
                  </>
                )}
              </div>
              {logoError && <span className="text-bad">{logoError}</span>}
            </Field>
            {editable && (
              <div className="full row" style={{ gap: 10 }}>
                <button className="btn btn-primary" disabled={save.isPending || !v.name.trim()} onClick={() => save.mutate()}>Ghi</button>
                {saved && <span className="muted">Đã ghi.</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
