// @bizcity-layer M data/masterdata
// [2026-11-20 Nguyễn Văn Thủy] Cột cây đơn vị của branches (0173, 0174) cho Kysely — khai ở đây qua withTables, không đụng packages/platform/src/db/types.ts (đóng góp)
import type { ColumnType } from 'kysely';

type Col<T> = ColumnType<T, T | undefined, T>;
export type UnitTables = {
  branches: {
    unit_parent_id: Col<string | null>;
    unit_path: Col<string>;
    unit_level: Col<number>;
    level_label: Col<string>;
    purchase_branch_id: Col<string | null>;
  };
};
