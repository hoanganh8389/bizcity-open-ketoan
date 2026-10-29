/**
 * HƯỚNG DẪN API (API02): đọc tài liệu docs/api/*.md ngay trong phần mềm — quy ước chung, khuôn từng loại chứng từ,
 * hợp đồng đề xuất cho màn nhập phiếu (13-phieu-nhap-tay.md). Sửa tài liệu ở docs/api là màn cập nhật theo (lúc dựng).
 * Bấm liên kết giữa các bài (vd 02-ban-hang.md) thì chuyển bài ngay trong màn.
 */
import { useMemo, useState } from 'react';
import { marked } from 'marked';
import { PageHeader } from '@/components/PageHeader';

const files = import.meta.glob('../../../../../../docs/api/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const DOCS = Object.entries(files)
  .map(([p, md]) => ({ key: p.split('/').pop()!, md, title: (md.match(/^#\s+(.+)$/m)?.[1] ?? p).trim() }))
  .sort((a, b) => (a.key === 'README.md' ? -1 : b.key === 'README.md' ? 1 : a.key.localeCompare(b.key)));

export function HuongDanApiPage() {
  const [key, setKey] = useState(DOCS[0]?.key ?? '');
  const doc = DOCS.find((d) => d.key === key) ?? DOCS[0];
  const html = useMemo(() => (doc ? (marked.parse(doc.md, { async: false }) as string) : ''), [doc]);
  return (
    <>
      <PageHeader title="Hướng dẫn API" code="API02" helpKey="thu-api" subtitle="Quy ước chung, khuôn JSON từng loại chứng từ, hợp đồng API cho màn nhập phiếu — nguồn: docs/api" />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
        <div className="card" style={{ padding: 6 }}>
          {DOCS.map((d) => (
            <button key={d.key} type="button" onClick={() => setKey(d.key)}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, background: d.key === doc?.key ? 'var(--brand-100)' : 'transparent' }}>
              {d.title}
            </button>
          ))}
        </div>
        <div className="card card-body doc" style={{ maxHeight: '80vh', overflow: 'auto' }}
          onClick={(e) => {
            const a = (e.target as HTMLElement).closest('a');
            const href = a?.getAttribute('href') ?? '';
            const target = href.split('#')[0]?.split('/').pop() ?? '';
            if (target.endsWith('.md') && DOCS.some((d) => d.key === target)) { e.preventDefault(); setKey(target); }
          }}
          // Nội dung là tài liệu trong mã nguồn (không phải dữ liệu người dùng nhập).
          dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </>
  );
}
