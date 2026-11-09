// [2026-11-07 05:50 PM Nguyễn Văn Thủy] PHASE-026 — mã số cha – con GĐ 1: màn Thêm sản phẩm con, danh mục biến thể dùng chung (đóng góp)
/**
 * THÊM SẢN PHẨM CON: gõ tên, chọn Biến thể. Màu, size ghi vào tên. Mã tự cấp = mã cha + 2 số, đơn vị tính, nhóm, thuế lấy theo mã cha.
 * Mọi biến thể đều là sản phẩm con: Thường (màu, size), Nội bộ, Kẹp quà… Phần mềm chỉ đọc ô Biến thể, không đọc tên.
 * [2026-11-09 10:00 AM Nguyễn Văn Thủy] PHASE-026 — bỏ khoá tạm, chọn được mọi biến thể (đóng góp)
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { ErrorBox, Field, Modal } from '@/components/ui';

export interface VariantKind { code: string; name: string; legacySuffix: string; taxFlow: string; taxSku: string; isActive: boolean; note: string; products: number }

export const useVariantKinds = () => useQuery({ queryKey: ['variant-kinds'], queryFn: () => api.get<VariantKind[]>('/api/v1/items/variant-kinds'), staleTime: 60_000 });

/** Nhãn biến thể: tên kèm đuôi cũ để người quen đuôi đọc được ngay. */
export const variantLabel = (k: VariantKind | undefined, code?: string) => (k ? (k.legacySuffix ? `${k.name} (${k.legacySuffix} cũ)` : k.name) : code ?? '');

/** Nhãn biến thể ngay cạnh mã. Thường thì không hiện để danh sách đỡ rối. */
export function VariantBadge({ code, kinds, showNormal }: { code?: string; kinds?: VariantKind[]; showNormal?: boolean }) {
  if (!code || (code === 'normal' && !showNormal)) return null;
  const k = kinds?.find((x) => x.code === code);
  const tone = code === 'internal' ? 'badge-warn' : 'badge-gray';
  return <span className={`badge ${tone}`} style={{ fontSize: 11 }} title={k?.note}>{variantLabel(k, code)}</span>;
}

interface Child { sku: string; name: string; variantCode?: string; isActive: boolean }

export function ThemSanPhamCon({ parentSku, parentName, parentNoSale, onClose }: { parentSku: string; parentName: string; parentNoSale: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const kinds = useVariantKinds().data ?? [];
  const kids = useQuery({ queryKey: ['products', 'children', parentSku], queryFn: () => api.get<Child[]>('/api/v1/products', { parent: parentSku, pageSize: 200 }) });
  const list = kids.data ?? [];
  const [name, setName] = useState(`${parentName} `);
  const [variantCode, setVariantCode] = useState('normal');
  const [barcode, setBarcode] = useState('');
  const [note, setNote] = useState('');
  const [noSaleParent, setNoSaleParent] = useState(false);
  const [done, setDone] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  // Con trỏ sau tên cha để gõ tiếp màu, size.
  useEffect(() => { const el = nameRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, [done]);

  const trimmed = name.replace(/\s+/g, ' ').trim();
  const dup = list.find((k) => k.isActive && k.name.replace(/\s+/g, ' ').trim().toLowerCase() === trimmed.toLowerCase());
  const sameAsParent = trimmed.toLowerCase() === parentName.replace(/\s+/g, ' ').trim().toLowerCase();
  const can = Boolean(trimmed) && !dup && !sameAsParent;

  const save = useMutation({
    mutationFn: () => api.post<{ sku: string; name: string }>('/api/v1/items/add-child', { parentSku, name: trimmed, variantCode, barcode: barcode.trim() || undefined, note: note.trim() || undefined, noSaleParent: noSaleParent || undefined }),
    onSuccess: (p) => {
      setDone(`Đã tạo ${p.sku}: ${p.name}`);
      setName(`${parentName} `); setBarcode(''); setNote(''); setNoSaleParent(false);
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['catalog-product'] });
      void qc.invalidateQueries({ queryKey: ['variant-kinds'] });
    },
  });

  return (
    <Modal wide title={`Thêm sản phẩm con của ${parentSku}`} onClose={onClose}
      footer={<>
        <span className="muted" style={{ marginRight: 'auto', fontSize: 12 }} title="Mã được cấp khi lưu, không sửa tay">Mã tự cấp: <span className="mono">{parentSku}</span> + số thứ tự</span>
        <button className="btn btn-primary" disabled={!can || save.isPending} onClick={() => { setDone(''); save.mutate(); }}>{save.isPending ? 'Đang tạo…' : 'Tạo và thêm tiếp'}</button>
        <button className="btn" onClick={onClose}>Đóng</button>
      </>}>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
      {done && <div className="alert alert-ok full" style={{ marginBottom: 8 }}>{done}</div>}
      <Field label="Tên sản phẩm con (*)" full hint="Đặt tuỳ ý, ví dụ: Bình sữa xanh L, Sữa A hàng tặng">
        <input ref={nameRef} className="input" value={name} maxLength={255} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && can && !save.isPending) { setDone(''); save.mutate(); } }} />
      </Field>
      {dup && <div className="alert alert-bad full">Đã có <b className="mono">{dup.sku}</b> cùng tên này.</div>}
      {sameAsParent && trimmed && <div className="muted full" style={{ fontSize: 12 }}>Gõ thêm màu, size để phân biệt với mã cha.</div>}
      <Field label="Biến thể" hint="Phần mềm xử lý theo ô này">
        <select className="select input" value={variantCode} onChange={(e) => setVariantCode(e.target.value)}>
          {kinds.filter((k) => k.isActive && k.code !== 'legacy').map((k) => (
            <option key={k.code} value={k.code} title={k.note}>{variantLabel(k)}</option>
          ))}
        </select>
      </Field>
      <Field label="Barcode"><input className="input mono" value={barcode} onChange={(e) => setBarcode(e.target.value)} title="Mã vạch riêng của sản phẩm con, để quầy quét ra đúng hàng" /></Field>
      <Field label="Ghi chú" full><input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Vì sao tạo mã, thuộc chương trình nào" title="Chỉ để người đọc, phần mềm không xử lý theo ghi chú" /></Field>
      {!parentNoSale && (
        <label className="checkbox full" style={{ display: 'flex', gap: 8, padding: '6px 0' }} title="Bật khi sản phẩm không có bản chung, chỉ bán theo màu, size. Hàng thông thường không cần bật.">
          <input type="checkbox" checked={noSaleParent} onChange={(e) => setNoSaleParent(e.target.checked)} />
          <span>Mã cha <span className="mono">{parentSku}</span> chỉ để gom, không bán trực tiếp</span>
        </label>
      )}
      <div className="full muted" style={{ fontSize: 12, marginTop: 4 }}>Đơn vị tính, nhóm hàng, thuế và dấu dưới 24 tháng lấy theo mã cha. Giá bán khai sau ở thẻ Giá bán.</div>
      {list.length > 0 && (
        <div className="full" style={{ marginTop: 8 }}>
          <b style={{ fontSize: 13 }}>Đã có {list.length} mã con</b>
          <div className="table-wrap" style={{ maxHeight: 180, overflow: 'auto', marginTop: 4 }}><table className="grid">
            <thead><tr><th title="Mã hàng">Mã</th><th title="Tên mặt hàng">Tên</th><th title="Biến thể quyết định cách xử lý">Biến thể</th></tr></thead>
            <tbody>{list.map((k) => <tr key={k.sku} className={k.isActive ? '' : 'muted'}><td className="mono">{k.sku}</td><td>{k.name}</td><td><VariantBadge code={k.variantCode} kinds={kinds} showNormal /></td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </Modal>
  );
}
