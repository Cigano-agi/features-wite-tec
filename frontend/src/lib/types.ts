export interface BillingLink {
  id: string;
  seller_id: string;
  amount: number;
  description: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface Metrics {
  active_links: number;
  total_approved: number;
  total_pending: number;
}

export interface ChargeResponse {
  transaction_id: string;
  status: string;
  amount: number;
  billing_link_id: string;
  idempotent?: boolean;
}
