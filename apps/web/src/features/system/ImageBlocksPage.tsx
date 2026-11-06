// [2026-11-06 02:40 AM Nguyễn Văn Thủy] MENU — màn Khối ảnh HT11: thay ảnh máy tính, điện thoại cho từng khối (đóng góp)
/**
 * KHỐI ẢNH (HT11): mỗi khối hai ảnh, máy tính và điện thoại. Chọn ảnh là lưu ngay; "Dùng mặc định" bỏ ảnh đã cài.
 * Ảnh được thu nhỏ ở trình duyệt rồi mới gửi. Danh sách khối ở image-blocks.tsx.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Monitor, RotateCcw, Smartphone } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox } from '@/components/ui';
import { IMAGE_BLOCKS, IMAGE_BLOCKS_KEY, IMAGE_BLOCKS_URL, useImageBlocks, type ImageBlockDef } from './image-blocks';

type Slot = 'desktop' | 'mobile';
const MAX_SIDE: Record<Slot, number> = { desktop: 1600, mobile: 1000 };
/** Khớp giới hạn máy chủ (ký tự data URL). */
const MAX_CHARS = 900_000;

/** Thu nhỏ về cạnh dài tối đa, xuất JPEG; ảnh vẫn quá nặng thì hạ chất lượng thêm một bậc. */
function shrink(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      const hi = c.toDataURL('image/jpeg', 0.85);
      resolve(hi.length <= MAX_CHARS ? hi : c.toDataURL('image/jpeg', 0.65));
    };
    img.onerror = () => reject(new Error('Không đọc được ảnh'));
    img.src = URL.createObjectURL(file);
  });
}

function SlotBox({ def, slot, src, canEdit, busy, onPick, onReset }: { def: ImageBlockDef; slot: Slot; src?: string; canEdit: boolean; busy: boolean; onPick: (f: File) => void; onReset: () => void }) {
  const desktop = slot === 'desktop';
  const Icon = desktop ? Monitor : Smartphone;
  const hint = desktop ? def.desktopHint : def.mobileHint;
  const fallback = desktop ? 'Ảnh mặc định' : 'Dùng theo ảnh máy tính';
  return (
    <div className="ka-slot">
      <div className="ka-slot-head"><Icon size={16} /><b>{desktop ? 'Máy tính' : 'Điện thoại'}</b><span className={`ka-tag${src ? ' on' : ''}`}>{src ? 'Đã cài' : fallback}</span></div>
      <div className={`ka-preview${desktop ? '' : ' mobile'}`}>
        {src || desktop ? <img src={src ?? def.defaultSrc} alt={`${def.label}, ${desktop ? 'máy tính' : 'điện thoại'}`} /> : <span className="muted">{fallback}</span>}
      </div>
      {canEdit && (
        <div className="ka-actions">
          <label className={`btn btn-sm${busy ? ' disabled' : ''}`} title={hint}>
            <ImageUp size={14} /> Chọn ảnh
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
          </label>
          {src && <button type="button" className="btn btn-sm" disabled={busy} title="Bỏ ảnh đã cài" onClick={onReset}><RotateCcw size={14} /> Dùng mặc định</button>}
        </div>
      )}
    </div>
  );
}

export function ImageBlocksPage() {
  const { can } = useAuth();
  const canEdit = can('settings:write');
  const qc = useQueryClient();
  const q = useImageBlocks();
  const [pickError, setPickError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: ({ key, slot, value }: { key: string; slot: Slot; value: string | null }) => api.put(`${IMAGE_BLOCKS_URL}/${key}`, { [slot]: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: IMAGE_BLOCKS_KEY }),
  });
  const pick = async (key: string, slot: Slot, f: File) => {
    setPickError(null);
    try {
      const value = await shrink(f, MAX_SIDE[slot]);
      if (value.length > MAX_CHARS) { setPickError('Ảnh quá nặng, hãy chọn ảnh nhỏ hơn'); return; }
      save.mutate({ key, slot, value });
    } catch (e) { setPickError((e as Error).message); }
  };
  return (
    <>
      <PageHeader title="Khối ảnh" code="HT11" helpKey="khoi-anh" subtitle="Thay ảnh trên giao diện theo từng khối, có ảnh riêng cho máy tính và điện thoại" />
      <ErrorBox error={pickError ?? (save.error ? errorText(save.error) : q.error ? errorText(q.error) : null)} />
      <div className="ka-list">
        {IMAGE_BLOCKS.map((def) => {
          const set = q.data?.[def.key];
          return (
            <section key={def.key} className="card ka-card">
              <div className="ka-head"><h3>{def.label}</h3><span className="muted">{def.where}</span></div>
              <div className="ka-slots">
                {(['desktop', 'mobile'] as const).map((slot) => (
                  <SlotBox key={slot} def={def} slot={slot} src={set?.[slot]} canEdit={canEdit} busy={save.isPending} onPick={(f) => void pick(def.key, slot, f)} onReset={() => save.mutate({ key: def.key, slot, value: null })} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
