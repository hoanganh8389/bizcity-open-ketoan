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

/** Trang bài học lỗi đầu vào (docs/huong-dan/loi-dau-vao/<mã>.md — PHASE-021, SC-INTAKE-1 giữ đủ trang cho mọi mã IN-*). */
const lessons = import.meta.glob('../../../../docs/huong-dan/loi-dau-vao/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function getLesson(code: string): string | undefined {
  return Object.entries(lessons).find(([p]) => p.endsWith(`/${code}.md`))?.[1];
}

export function listGuides():{ key: string; title: string }[] {
  return Object.entries(guides)
    .map(([key, md]) => ({ key, title: (md.match(/^#\s+(.+)$/m)?.[1] ?? key).trim() }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
