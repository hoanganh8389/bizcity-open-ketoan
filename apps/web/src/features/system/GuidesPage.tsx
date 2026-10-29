/**
 * Mục lục hướng dẫn sử dụng — đọc toàn bộ tài liệu ngay trong giao diện.
 */
import { useMemo, useState } from 'react';
import { marked } from 'marked';
import { getGuide, listGuides } from '@/help/guides';
import { PageHeader } from '@/components/PageHeader';

export function GuidesPage() {
  const guides = listGuides();
  const [key, setKey] = useState(guides[0]?.key ?? '');
  const html = useMemo(() => (key ? (marked.parse(getGuide(key) ?? '', { async: false }) as string) : ''), [key]);
  return (
    <>
      <PageHeader title="Hướng dẫn sử dụng" code="TI09" subtitle="Tài liệu cho từng chức năng" />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ width: 280, flexShrink: 0 }}>
          {guides.map((g) => (
            <button key={g.key} className={`tab ${g.key === key ? 'active' : ''}`} style={{ display: 'block', width: '100%', textAlign: 'left', borderBottom: '1px solid var(--line-soft)' }} onClick={() => setKey(g.key)}>
              {g.title}
            </button>
          ))}
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div className="card-body doc" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </>
  );
}
