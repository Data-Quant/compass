export const percent = (value: number | null | undefined): string => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`)
export const dollars = (value: number | null | undefined): string => (value === null || value === undefined ? '—' : `$${value.toFixed(value < 1 ? 4 : 2)}`)
