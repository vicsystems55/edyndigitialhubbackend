import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'

const confirmationFlag = '--confirm-reset-live-data'
const confirmed = process.argv.includes(confirmationFlag)

function databaseTarget() {
  try {
    const url = new URL(env.DATABASE_URL)
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`
  } catch {
    return 'configured PostgreSQL database'
  }
}

async function recordCounts() {
  // Keep maintenance reads sequential so the command also works reliably on
  // Supabase's smaller pooled connection plans.
  const orders = await prisma.order.count()
  const paymentEvents = await prisma.paymentEvent.count()
  const downloadGrants = await prisma.downloadGrant.count()
  const pageViews = await prisma.pageView.count()

  return { orders, paymentEvents, downloadGrants, pageViews }
}

async function main() {
  const before = await recordCounts()
  console.log(`Database target: ${databaseTarget()}`)
  console.table(before)

  if (!confirmed) {
    console.log('Preview only. No records were deleted.')
    console.log(`Run again with ${confirmationFlag} only after verifying the target and counts.`)
    return
  }

  const [paymentEvents, downloadGrants, orders, pageViews] = await prisma.$transaction([
    prisma.paymentEvent.deleteMany(),
    prisma.downloadGrant.deleteMany(),
    prisma.order.deleteMany(),
    prisma.pageView.deleteMany(),
  ])

  await prisma.auditLog.create({
    data: {
      action: 'LIVE_DATA_RESET',
      resourceType: 'System',
      metadata: {
        ordersDeleted: orders.count,
        paymentEventsDeleted: paymentEvents.count,
        downloadGrantsDeleted: downloadGrants.count,
        pageViewsDeleted: pageViews.count,
      },
    },
  })

  console.log('Live-launch reset completed.')
  console.table({
    ordersDeleted: orders.count,
    paymentEventsDeleted: paymentEvents.count,
    downloadGrantsDeleted: downloadGrants.count,
    pageViewsDeleted: pageViews.count,
  })
}

main()
  .catch((error) => {
    console.error('Live-launch reset failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
