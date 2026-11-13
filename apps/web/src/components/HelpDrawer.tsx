// [2026-11-12 Nguyễn Văn Thủy] hướng dẫn sử dụng theo thẻ trong hệ thống: mỗi màn / hộp thoại một định danh, gắn thẻ linh hoạt (0113) (đóng góp)
/**
 * Ngăn "Hướng dẫn sử dụng" của một màn / hộp thoại (định danh = guideKey).
 *   - Hiện thẻ đang gắn ở định danh này. Chưa gắn mà có tài liệu sẵn (docs/huong-dan/<khoá>.md) → tự chép thành thẻ rồi gắn.
 *   - Đổi thẻ: chọn thẻ khác trong danh sách. Thẻ mới: tạo thẻ trống gắn vào đây và mở trang soạn.
 *   - Sửa thẻ: mở trang Thẻ hướng dẫn (HT17) ở thẻ trình duyệt mới; quay lại tự tải nội dung mới.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { marked } from 'marked';
import { getGuide } from '@/help/guides';
import { api, errorText } from '@/lib/api';
import { Drawer } from './ui';
import '@/features/help/huong-dan.css';

export interface HelpCard { id: string; title: string; format: 'md' | 'html'; body?: string; sourceKey: string; updatedBy: string; updatedAt: string; places?: { key: string; label: string }[] }
export const HELP_PAGE = '/he-thong/huong-dan';
export const helpHtml = (c: { format: 'md' | 'html'; body?: string }) => (c.format === 'md' ? (marked.parse(c.body ?? '', { async: false }) as string) : c.body ?? '');
const creating = new Set<string>(); // chống tạo trùng khi hiệu ứng chạy hai lần
const titleOfMd = (md: string, key: string) => (md.match(/^#\s+(.+)$/m)?.[1] ?? key).trim();

export function HelpDrawer({ guideKey, label, onClose }: { guideKey: string; label?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const place = useQuery({ queryKey: ['help', 'place', guideKey], queryFn: () => api.get<{ key: string; label: string; card: HelpCard | null }>('/api/v1/help/place', { key: guideKey }), refetchOnWindowFocus: true });
  const cards = useQuery({ queryKey: ['help', 'cards'], queryFn: () => api.get<HelpCard[]>('/api/v1/help/cards'), staleTime: 30_000 });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const card = place.data?.card ?? null;

  // Lần đầu: chưa gắn thẻ mà có tài liệu sẵn → chép thành thẻ, gắn vào đây.
  useEffect(() => {
    if (!place.data || place.data.card || busy) return;
    const md = getGuide(guideKey);
    if (!md || creating.has(guideKey)) return;
    creating.add(guideKey);
    setBusy(true);
    void api.post('/api/v1/help/cards', { title: titleOfMd(md, guideKey), body: md, format: 'md', sourceKey: guideKey, placeKey: guideKey, placeLabel: label ?? titleOfMd(md, guideKey) })
      .then(() => { void place.refetch(); void qc.invalidateQueries({ queryKey: ['help', 'cards'] }); })
      .catch((e) => setErr(errorText(e))).finally(() => setBusy(false));
  }, [place.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const html = useMemo(() => (card ? helpHtml(card) : ''), [card]);
  const bindTo = async (cardId: string | null) => {
    setErr('');
    try { await api.put('/api/v1/help/place', { key: guideKey, label: label ?? place.data?.label ?? '', cardId }); await place.refetch(); void qc.invalidateQueries({ queryKey: ['help', 'cards'] }); }
    catch (e) { setErr(errorText(e)); }
  };
  const newCard = async () => {
    setErr('');
    try {
      const c = await api.post<HelpCard>('/api/v1/help/cards', { title: label || 'Thẻ hướng dẫn mới', body: '', format: 'html', placeKey: guideKey, placeLabel: label ?? '' });
      await place.refetch(); void qc.invalidateQueries({ queryKey: ['help', 'cards'] });
      window.open(`${HELP_PAGE}?the=${c.id}`, '_blank');
    } catch (e) { setErr(errorText(e)); }
  };

  return (
    <Drawer title="Hướng dẫn sử dụng" onClose={onClose} narrow>
      <div className="help-bar">
        <select className="select input" value={card?.id ?? ''} onChange={(e) => void bindTo(e.target.value || null)} title="Chọn thẻ hướng dẫn hiện ở màn này">
          <option value="">(chưa gắn thẻ)</option>
          {(cards.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title || `Thẻ #${c.id}`}</option>)}
        </select>
        <button type="button" className="btn btn-sm" onClick={() => void newCard()} title="Tạo thẻ trống gắn vào màn này rồi mở trang soạn">+ Thẻ mới</button>
        {card && <a className="btn btn-sm btn-primary" href={`${HELP_PAGE}?the=${card.id}`} target="_blank" rel="noreferrer" title="Mở trang soạn thẻ ở thẻ trình duyệt mới">Sửa thẻ</a>}
        <a className="btn btn-sm" href={HELP_PAGE} target="_blank" rel="noreferrer" title="Mở trang Thẻ hướng dẫn">Tất cả thẻ</a>
      </div>
      {err && <div className="alert alert-bad">{err}</div>}
      {place.isLoading || busy ? <div className="muted">Đang tải…</div>
        : card ? <div className="doc help-doc" dangerouslySetInnerHTML={{ __html: html || '<p class="muted">Thẻ chưa có nội dung. Bấm Sửa thẻ để soạn.</p>' }} />
        : <div className="muted" style={{ padding: 8 }}>Màn này chưa có hướng dẫn. Chọn một thẻ có sẵn ở trên hoặc bấm <b>+ Thẻ mới</b>.</div>}
      <div className="muted" style={{ fontSize: 11, marginTop: 12 }} title={guideKey}>Định danh: <span className="mono">{guideKey}</span></div>
    </Drawer>
  );
}
