import { prisma } from '@/lib/db'
import {
  encryptSensitivePayrollProfileFields,
  isEncryptedPayrollField,
} from '@/lib/payroll/sensitive-fields'

function hasPlaintextSensitiveValue(profile: {
  cnicNumber: string | null
  bankName: string | null
  accountTitle: string | null
  accountNumber: string | null
}) {
  return [profile.cnicNumber, profile.bankName, profile.accountTitle, profile.accountNumber].some(
    (value) => Boolean(value) && !isEncryptedPayrollField(value)
  )
}

async function main() {
  const profiles = await prisma.payrollEmployeeProfile.findMany({
    select: {
      id: true,
      cnicNumber: true,
      bankName: true,
      accountTitle: true,
      accountNumber: true,
    },
  })

  let encrypted = 0
  let skipped = 0

  for (const profile of profiles) {
    if (!hasPlaintextSensitiveValue(profile)) {
      skipped += 1
      continue
    }

    const next = encryptSensitivePayrollProfileFields({
      cnicNumber: profile.cnicNumber,
      bankName: profile.bankName,
      accountTitle: profile.accountTitle,
      accountNumber: profile.accountNumber,
    })

    await prisma.payrollEmployeeProfile.update({
      where: { id: profile.id },
      data: next,
    })
    encrypted += 1
  }

  console.log(`Encrypted sensitive payroll fields for ${encrypted} profile(s). Skipped ${skipped}.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
