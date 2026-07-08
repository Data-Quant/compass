-- Add purchase type to EquipmentAsset (Brand New | Refurbished | Used).
-- Nullable so existing rows are unaffected; validated in application code against PURCHASE_TYPES.
ALTER TABLE "EquipmentAsset" ADD COLUMN "purchaseType" TEXT;
