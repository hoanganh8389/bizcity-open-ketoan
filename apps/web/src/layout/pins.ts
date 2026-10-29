/**
 * Chức năng ghim lên thanh trên cùng (màn hay dùng như Sổ nhật ký chung, Sổ cái…).
 * Lưu theo người dùng trên máy này (localStorage); menu trái và thanh trên dùng chung một danh sách.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

const EVENT = 'ketoan-pins';
const keyOf = (userId: string | undefined) => `ketoan.pins.${userId ?? 'guest'}`;

const read = (key: string): string[] => {
  try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
};

export function usePins() {
  const { user } = useAuth();
  const key = keyOf(user?.id);
  const [pins, setPins] = useState<string[]>(() => read(key));

  useEffect(() => {
    setPins(read(key));
    const sync = () => setPins(read(key));
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, [key]);

  const save = useCallback((next: string[]) => {
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* chế độ riêng tư */ }
    setPins(next);
    window.dispatchEvent(new Event(EVENT));
  }, [key]);

  // Luôn đọc danh sách mới nhất trong máy (ghim liên tiếp nhiều mục, hoặc ghim ở thẻ trình duyệt khác).
  const toggle = useCallback((menuKey: string) => {
    const cur = read(key);
    save(cur.includes(menuKey) ? cur.filter((k) => k !== menuKey) : [...cur, menuKey]);
  }, [key, save]);

  return { pins, toggle, isPinned: (k: string) => pins.includes(k) };
}
