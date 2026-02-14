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

const LEGACY_TAX_SLABS: TaxSlab[] = [
  { lower: 0, upper: 600000, fixedAnnual: 0, rate: 0 },
  { lower: 600000, upper: 1200000, fixedAnnual: 0, rate: 0.01 },
  { lower: 1200000, upper: 2200000, fixedAnnual: 6000, rate: 0.11 },
  { lower: 2200000, upper: 3200000, fixedAnnual: 116000, rate: 0.23 },
  { lower: 3200000, upper: 4100000, fixedAnnual: 346000, rate: 0.30 },
  { lower: 4100000, upper: null, fixedAnnual: 616000, rate: 0.35 },
]

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
  return periodStart >= new Date(Date.UTC(2024, 6, 1)) ? UPDATED_TAX_SLABS : LEGACY_TAX_SLABS
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
