-- WIA-272: Billing Links schema

CREATE TABLE billing_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   UUID NOT NULL,
  amount      INTEGER NOT NULL,
  description VARCHAR(255) NOT NULL,
  status      VARCHAR(10) NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_billing_links_seller_id ON billing_links(seller_id);
CREATE INDEX idx_billing_links_status    ON billing_links(status);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER billing_links_updated_at
  BEFORE UPDATE ON billing_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
