-- Migration: Add products table and link to lead activities

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  pitch_points TEXT[], -- Array of pitch/selling points
  images TEXT[], -- Array of image URLs
  demo_link VARCHAR(500), -- YouTube, web link, etc.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_org_id ON products(org_id);

-- Add product_id to lead_activities table (for tracking which product was discussed)
ALTER TABLE lead_activities 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- RLS Policies for products
-- Allow users to read products from their organization
CREATE POLICY "Users can view products from their organization"
  ON products FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- Allow admins to insert products
CREATE POLICY "Admins can insert products"
  ON products FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Allow admins to update products
CREATE POLICY "Admins can update products"
  ON products FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Allow admins to delete products
CREATE POLICY "Admins can delete products"
  ON products FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

