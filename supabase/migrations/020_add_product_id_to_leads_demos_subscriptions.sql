-- Migration: Add product_id to leads, demos, and customer_subscriptions tables
-- This enables filtering by product across all these views

-- Add product_id to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Add product_id to demos table
ALTER TABLE demos 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Add product_id to customer_subscriptions table
ALTER TABLE customer_subscriptions 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Add indexes for faster filtering
CREATE INDEX IF NOT EXISTS idx_leads_product_id ON leads(product_id);
CREATE INDEX IF NOT EXISTS idx_demos_product_id ON demos(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_product_id ON customer_subscriptions(product_id);

-- Add comments
COMMENT ON COLUMN leads.product_id IS 'Product this lead is interested in';
COMMENT ON COLUMN demos.product_id IS 'Product being demonstrated in this meeting';
COMMENT ON COLUMN customer_subscriptions.product_id IS 'Product the customer subscribed to';

