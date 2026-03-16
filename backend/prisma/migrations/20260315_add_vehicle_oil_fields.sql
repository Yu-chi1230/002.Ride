-- Add oil maintenance related fields to public.vehicles
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS last_oil_change_date DATE,
  ADD COLUMN IF NOT EXISTS monthly_avg_mileage INTEGER;
