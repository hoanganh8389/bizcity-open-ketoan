/**
 * Hướng dẫn sử dụng hiển thị ngay trong giao diện (nút "Hướng dẫn" ở mỗi màn).
 * Nguồn là các tệp docs/huong-dan/<khoá>.md — sửa tài liệu ở đó là giao diện cập nhật theo.
 */
const files = import.meta.glob('../../../../docs/huong-dan/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const guides: Record<string, string> = {};
for (const [path, content] of Object.entries(files)) {
  const key = path.split('/').pop()!.replace(/\.md$/, '');
  guides[key] = content;
}

export function getGuide(key: string): string | undefined {
  return guides[key];
}

export function listGuides(): { key: string; title: string }[] {
  return Object.entries(guides)
    .map(([key, md]) => ({ key, title: (md.match(/^#\s+(.+)$/m)?.[1] ?? key).trim() }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
