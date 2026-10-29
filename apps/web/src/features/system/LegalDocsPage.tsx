/**
 * Căn cứ pháp lý — văn bản pháp luật phần mềm áp dụng và căn cứ của từng chức năng,
 * để kế toán, kiểm toán tra cứu ngay trong phần mềm.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { marked } from 'marked';
import { legalDocs } from '@/help/legal-docs';
import { PageHeader } from '@/components/PageHeader';

export function LegalDocsPage() {
  const [params, setParams] = useSearchParams();
  const key = params.get('doc') ?? legalDocs[0]?.key ?? '';
  const doc = legalDocs.find((d) => d.key === key) ?? legalDocs[0];
  const html = useMemo(() => (doc ? (marked.parse(doc.content, { async: false }) as string).replace(/<a href="http/g, '<a target="_blank" rel="noopener noreferrer" href="http') : ''), [doc]);
  return (
    <>
      <PageHeader title="Căn cứ pháp lý" code="TI11" subtitle="Văn bản pháp luật phần mềm áp dụng và căn cứ của từng chức năng" />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ width: 300, flexShrink: 0 }}>
          {legalDocs.map((d) => (
            <button key={d.key} className={`tab ${d.key === doc?.key ? 'active' : ''}`} style={{ display: 'block', width: '100%', textAlign: 'left', borderBottom: '1px solid var(--line-soft)' }} onClick={() => setParams({ doc: d.key })}>
              {d.title}
            </button>
          ))}
        </div>
        <div className="card" style={{ flex: 1, minWidth: 0 }}>
          <div className="card-body doc" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </>
  );
}
