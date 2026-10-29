// SC-DATA-7: types.ts khai thứ migration không tạo (cột extra_col, bảng ghost_table); schema_migrations do runner tạo — không tính.
export interface BranchesTable {
  id: string;
  tenant_id: string;
  code: string;
  amount: number;
  extra_col: string;
}
export interface GhostTable {
  id: string;
}
export interface SchemaMigrationsTable {
  name: string;
}
export interface Database {
  branches: BranchesTable;
  ghost_table: GhostTable;
  schema_migrations: SchemaMigrationsTable;
}
