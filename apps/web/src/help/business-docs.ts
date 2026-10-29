/**
 * Tài liệu nghiệp vụ cho người phát triển (màn "Kiến trúc & Nghiệp vụ").
 * Nguồn là các tệp docs/nghiep-vu/*.md — sửa ở đó là giao diện cập nhật theo; thứ tự theo tên tệp.
 */
const files = import.meta.glob('../../../../docs/nghiep-vu/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface BusinessDoc {
  key: string;
  title: string;
  content: string;
}

export const businessDocs: BusinessDoc[] = Object.entries(files)
  .map(([path, content]) => {
    const key = path.split('/').pop()!.replace(/\.md$/, '');
    return { key, title: (content.match(/^#\s+(.+)$/m)?.[1] ?? key).trim(), content };
  })
  .sort((a, b) => a.key.localeCompare(b.key));
