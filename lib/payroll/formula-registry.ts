import { periodKeyToDate } from '@/lib/payroll/normalizers'

export const FORMULA_VERSION = 'payroll-v1'

export const FIX_IDS = {
  TRAVEL_SUMIF_RANGE: 'FIX_TRAVEL_SUMIF_RANGE_V1',
  GROSS_MEDICAL_ALIGNMENT: 'FIX_GROSS_MEDICAL_COLUMN_ALIGNMENT_V1',
  TAX_SLAB_REF_BOUNDS: 'FIX_TAX_SLAB_REF_BOUNDS_V1',
  PAID_BALANCE_ROLLING: 'FIX_PAID_BALANCE_ROLLING_V1',
} as const

interface TaxSlab {
  lower: number
  upper: number | null
  fixedAnnual: number
  rate: number
}

// Pre-2023 slabs (Tax Year 2021-2022) -- "Tax Slabs old" workbook sheet
const PRE_2023_TAX_SLABS: TaxSlab[] = [
  { lower: 0, upper: 600000, fixedAnnual: 0, rate: 0 },
  { lower: 600000, upper: 1200000, fixedAnnual: 0, rate: 0.05 },
  { lower: 1200000, upper: 1800000, fixedAnnual: 30000, rate: 0.10 },
  { lower: 1800000, upper: 2500000, fixedAnnual: 90000, rate: 0.15 },
  { lower: 2500000, upper: 3500000, fixedAnnual: 195000, rate: 0.175 },
  { lower: 3500000, upper: 5000000, fixedAnnual: 370000, rate: 0.20 },
  { lower: 5000000, upper: 8000000, fixedAnnual: 670000, rate: 0.225 },
  { lower: 8000000, upper: null, fixedAnnual: 1345000, rate: 0.25 },
]

// 2023 slabs (Tax Year 2023-2024, Jul 2023 - Jun 2024) -- "2023 Tax slabs" workbook sheet
const TAX_SLABS_2023: TaxSlab[] = [
  { lower: 0, upper: 600000, fixedAnnual: 0, rate: 0 },
  { lower: 600000, upper: 1200000, fixedAnnual: 0, rate: 0.025 },
  { lower: 1200000, upper: 2400000, fixedAnnual: 15000, rate: 0.125 },
  { lower: 2400000, upper: 3600000, fixedAnnual: 165000, rate: 0.225 },
  { lower: 3600000, upper: 6000000, fixedAnnual: 435000, rate: 0.275 },
  { lower: 6000000, upper: 12000000, fixedAnnual: 1095000, rate: 0.35 },
  { lower: 12000000, upper: null, fixedAnnual: 3195000, rate: 0.35 },
]

// Legacy slabs (Tax Year 2024, Jan-Jun 2024) -- "Tax Slab" workbook sheet
const LEGACY_TAX_SLABS: TaxSlab[] = [
  { lower: 0, upper: 600000, fixedAnnual: 0, rate: 0 },
  { lower: 600000, upper: 1200000, fixedAnnual: 0, rate: 0.01 },
  { lower: 1200000, upper: 2200000, fixedAnnual: 6000, rate: 0.11 },
  { lower: 2200000, upper: 3200000, fixedAnnual: 116000, rate: 0.23 },
  { lower: 3200000, upper: 4100000, fixedAnnual: 346000, rate: 0.30 },
  { lower: 4100000, upper: null, fixedAnnual: 616000, rate: 0.35 },
]

// Updated slabs (Tax Year 2025-2026, Jul 2024+) -- "Updated Tax Slabs" workbook sheet
const UPDATED_TAX_SLABS: TaxSlab[] = [
  { lower: 0, upper: 600000, fixedAnnual: 0, rate: 0 },
  { lower: 600000, upper: 1200000, fixedAnnual: 0, rate: 0.025 },
  { lower: 1200000, upper: 2400000, fixedAnnual: 15000, rate: 0.125 },
  { lower: 2400000, upper: 3600000, fixedAnnual: 165000, rate: 0.20 },
  { lower: 3600000, upper: 6000000, fixedAnnual: 405000, rate: 0.25 },
  { lower: 6000000, upper: 12000000, fixedAnnual: 1005000, rate: 0.325 },
  { lower: 12000000, upper: null, fixedAnnual: 2955000, rate: 0.35 },
]

function slabSetForPeriod(periodKey: string): TaxSlab[] {
  const periodStart = periodKeyToDate(periodKey)
  if (!periodStart) return UPDATED_TAX_SLABS

  // Jul 2024+  → Updated slabs
  if (periodStart >= new Date(Date.UTC(2024, 6, 1))) return UPDATED_TAX_SLABS
  // Jan 2024 - Jun 2024 → Legacy slabs ("Tax Slab" sheet)
  if (periodStart >= new Date(Date.UTC(2024, 0, 1))) return LEGACY_TAX_SLABS
  // Jul 2023 - Dec 2023 → 2023 slabs
  if (periodStart >= new Date(Date.UTC(2023, 6, 1))) return TAX_SLABS_2023
  // Before Jul 2023 → Pre-2023 slabs
  return PRE_2023_TAX_SLABS
}

function findSlab(slabs: TaxSlab[], annualTaxable: number): TaxSlab {
  for (const slab of slabs) {
    const inLowerBound = annualTaxable >= slab.lower
    const inUpperBound = slab.upper === null || annualTaxable < slab.upper
    if (inLowerBound && inUpperBound) {
      return slab
    }
  }
  return slabs[slabs.length - 1]
}

export function estimateIncomeTaxFromSlabs(periodKey: string, totalTaxableMonthly: number): number {
  const annualTaxable = Math.max(0, totalTaxableMonthly) * 12
  const slabs = slabSetForPeriod(periodKey)
  const slab = findSlab(slabs, annualTaxable)
  const annualTax = slab.fixedAnnual + Math.max(0, annualTaxable - slab.lower) * slab.rate
  return annualTax / 12
}
