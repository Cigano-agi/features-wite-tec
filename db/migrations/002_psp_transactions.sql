-- WIA-272: PSP transactions table — owned by .NET EF Core

CREATE TABLE psp_transactions (
  transaction_id  UUID         PRIMARY KEY,
  billing_link_id UUID         NOT NULL,
  amount          INTEGER      NOT NULL,
  payer_name      VARCHAR(256) NOT NULL,
  payer_cpf       VARCHAR(14)  NOT NULL,
  payer_email     VARCHAR(320) NOT NULL,
  payer_phone     VARCHAR(20)  NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'Pending'
                  CHECK (status IN ('Pending', 'Approved', 'Failed')),
  metadata        JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL,
  updated_at      TIMESTAMPTZ  NOT NULL
);

CREATE INDEX idx_psp_transactions_billing_link_id ON psp_transactions(billing_link_id);
