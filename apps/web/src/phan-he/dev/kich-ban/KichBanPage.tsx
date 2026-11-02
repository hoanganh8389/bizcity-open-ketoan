// [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: màn Kịch bản (DEV08) — Sổ tay điều tra lỗi TH-01…TH-14 thành thẻ, mỗi thẻ mở màn với bộ lọc điền sẵn
/**
 * KỊCH BẢN (DEV08): "gặp triệu chứng X thì làm gì?". Đọc chính Sổ tay điều tra lỗi (docs/ops/SO-TAY-DIEU-TRA-LOI.md, lúc dựng) —
 * sửa Sổ tay là màn cập nhật theo. Mỗi tình huống một thẻ: tên, triệu chứng, nút mở màn của Bàn điều tra với bộ lọc điền sẵn
 * (KICH_BAN ở @ketoan/contracts — ca T019-5 kiểm mọi TH có kịch bản, mọi link đúng màn, mọi bộ lọc được màn đích đọc lại), phần
 * Bàn điều tra chưa trả lời được (số đo toàn hệ → người vận hành), và toàn văn tình huống khi mở rộng.
 * ?th=TH-xx mở sẵn một tình huống (Tra mã dẫn tới khi tóm tắt khớp tình huống — U7).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { marked } from 'marked';
import { devLink, devParams, KICH_BAN, tachSoTay } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { DevBanner, DevGuard, Src } from '../ui';

const files = import.meta.glob('../../../../../../docs/ops/SO-TAY-DIEU-TRA-LOI.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const TINH_HUONG = tachSoTay(Object.values(files)[0] ?? '');

export function KichBanPage() {
  const [params, setParams] = useSearchParams();
  const { th } = devParams('/dev/kich-ban', params);
  const [text, setText] = useState('');
  const shown = useMemo(() => {
    const t = text.trim().toLowerCase();
    return t ? TINH_HUONG.filter((x) => `${x.id} ${x.title} ${x.symptom}`.toLowerCase().includes(t)) : TINH_HUONG;
  }, [text]);
  useEffect(() => {
    if (th) document.getElementById(`th-${th}`)?.scrollIntoView({ block: 'start' });
  }, [th]);

  return (
    <DevGuard>
      <PageHeader title="Kịch bản" code="DEV08" helpKey="ban-dieu-tra" subtitle="Gặp triệu chứng X thì làm gì — Sổ tay điều tra lỗi, mỗi tình huống mở thẳng màn cần xem" />
      <DevBanner />
      <form className="dev-search" onSubmit={(e) => e.preventDefault()}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="tìm theo triệu chứng, vd chậm, kỳ đã khoá, sự kiện, 5xx…" aria-label="Tìm tình huống" />
      </form>
      {!TINH_HUONG.length && <div className="card card-body">Bản dựng không kèm Sổ tay điều tra lỗi (docs/ops/SO-TAY-DIEU-TRA-LOI.md).</div>}
      <div className="dev-kb">
        {shown.map((x) => (
          <Card key={x.id} id={x.id} title={x.title} symptom={x.symptom} body={x.body} open={th === x.id} onToggle={(o) => setParams(o ? { th: x.id } : {})} />
        ))}
      </div>
      <Src>nguồn: docs/ops/SO-TAY-DIEU-TRA-LOI.md (đọc lúc dựng) + bảng kịch bản KICH_BAN (@ketoan/contracts)</Src>
    </DevGuard>
  );
}

function Card({ id, title, symptom, body, open, onToggle }: { id: string; title: string; symptom: string; body: string; open: boolean; onToggle: (open: boolean) => void }) {
  const kb = KICH_BAN[id];
  // Nội dung là tài liệu trong mã nguồn (không phải dữ liệu người dùng nhập).
  const html = useMemo(() => (open ? (marked.parse(body, { async: false }) as string) : ''), [open, body]);
  return (
    <div className={`card dev-kb-card${open ? ' on' : ''}`} id={`th-${id}`}>
      <div className="card-body">
        <div className="dev-kb-head"><span className="dev-tag">{id}</span> <b>{title}</b></div>
        {symptom && <div className="muted dev-kb-sym">{symptom}</div>}
        <div className="dev-kb-links">
          {kb?.links.map((l) => <Link key={l.label} className="btn btn-sm" to={devLink(l.path, l.filter)}>{l.label} →</Link>)}
        </div>
        {kb?.note && <div className="dev-kb-note">{kb.note}</div>}
        <button type="button" className="btn btn-xs btn-ghost" onClick={() => onToggle(!open)} aria-expanded={open}>{open ? 'Thu gọn' : 'Xem đủ các bước trong Sổ tay'}</button>
      </div>
      {open && <div className="card-body doc dev-kb-body" dangerouslySetInnerHTML={{ __html: html }} />}
    </div>
  );
}
