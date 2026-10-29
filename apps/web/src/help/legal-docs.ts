/**
 * Căn cứ pháp lý (màn TI11): văn bản pháp luật phần mềm áp dụng và căn cứ của từng chức năng.
 * Nguồn là các tệp docs/can-cu/*.md — sửa ở đó là giao diện cập nhật theo; thứ tự theo tên tệp.
 */
const files = import.meta.glob('../../../../docs/can-cu/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface LegalDoc {
  key: string;
  title: string;
  content: string;
}

export const legalDocs: LegalDoc[] = Object.entries(files)
  .map(([path, content]) => {
    const key = path.split('/').pop()!.replace(/\.md$/, '');
    return { key, title: (content.match(/^#\s+(.+)$/m)?.[1] ?? key).trim(), content };
  })
  .sort((a, b) => a.key.localeCompare(b.key));
