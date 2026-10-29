/**
 * Hiển thị một tài liệu hướng dẫn (markdown) trong ngăn trượt.
 */
import { useMemo } from 'react';
import { marked } from 'marked';
import { getGuide } from '@/help/guides';
import { Drawer } from './ui';

export function HelpDrawer({ guideKey, onClose }: { guideKey: string; onClose: () => void }) {
  const html = useMemo(() => {
    const md = getGuide(guideKey) ?? `# Chưa có hướng dẫn\n\nTài liệu \`docs/huong-dan/${guideKey}.md\` chưa được viết.`;
    return marked.parse(md, { async: false }) as string;
  }, [guideKey]);
  return (
    <Drawer title="Hướng dẫn sử dụng" onClose={onClose} narrow>
      {/* Nội dung lấy từ tài liệu trong mã nguồn (không phải dữ liệu người dùng nhập). */}
      <div className="doc" dangerouslySetInnerHTML={{ __html: html }} />
    </Drawer>
  );
}
