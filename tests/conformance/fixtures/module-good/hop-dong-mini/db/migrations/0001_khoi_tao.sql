CREATE TABLE mod_hop_dong_mini.contracts (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    code text NOT NULL,
    total numeric(18,2) NOT NULL
);
COMMENT ON TABLE mod_hop_dong_mini.contracts IS 'Hợp đồng với khách hàng.';
COMMENT ON COLUMN mod_hop_dong_mini.contracts.code IS 'Số hợp đồng.';
COMMENT ON COLUMN mod_hop_dong_mini.contracts.total IS 'Giá trị hợp đồng (đồng).';
