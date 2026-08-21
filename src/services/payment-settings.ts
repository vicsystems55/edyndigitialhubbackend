import { prisma } from '../config/prisma.js'

export const INTERNATIONAL_PAYMENTS_SETTING_KEY = 'international_payments_enabled'

export async function internationalPaymentsEnabled() {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: INTERNATIONAL_PAYMENTS_SETTING_KEY },
    select: { value: true },
  })

  return setting?.value === true
}
