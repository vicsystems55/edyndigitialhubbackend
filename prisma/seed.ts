import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { createClient } from '@supabase/supabase-js'
import { PrismaClient, BookStatus } from '../src/generated/prisma/client.js'

const connectionString = process.env.DATABASE_URL
const supabaseUrl = process.env.SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY
const seedAdminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@ednascorner.com'
const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD || 'Edyn@2026'

if (!connectionString || !supabaseUrl || !supabaseSecretKey) {
  throw new Error('DATABASE_URL, SUPABASE_URL and SUPABASE_SECRET_KEY are required to seed the database')
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
})
const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function seedDefaultAdmin() {
  const { data: listedUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (listError) throw new Error(`Unable to read Supabase Auth users: ${listError.message}`)

  let authUser = listedUsers.users.find(
    (user) => user.email?.toLowerCase() === seedAdminEmail.toLowerCase(),
  )

  if (!authUser) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: seedAdminEmail,
      password: seedAdminPassword,
      email_confirm: true,
      user_metadata: { display_name: 'Edyn Administrator' },
    })

    if (error || !data.user) {
      throw new Error(`Unable to create the default Supabase Auth user: ${error?.message || 'Unknown error'}`)
    }
    authUser = data.user
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      email: seedAdminEmail,
      password: seedAdminPassword,
      email_confirm: true,
      user_metadata: { display_name: 'Edyn Administrator' },
    })

    if (error || !data.user) {
      throw new Error(`Unable to synchronize the default Supabase Auth user: ${error?.message || 'Unknown error'}`)
    }
    authUser = data.user
  }

  await prisma.adminProfile.upsert({
    where: { authUserId: authUser.id },
    update: {
      email: seedAdminEmail.toLowerCase(),
      displayName: 'Edyn Administrator',
      role: 'SUPER_ADMIN',
      active: true,
    },
    create: {
      authUserId: authUser.id,
      email: seedAdminEmail.toLowerCase(),
      displayName: 'Edyn Administrator',
      role: 'SUPER_ADMIN',
      active: true,
    },
  })

  console.log(`Default administrator ready: ${seedAdminEmail}`)
}

async function main() {
  await seedDefaultAdmin()

  await prisma.book.upsert({
    where: { slug: 'the-healthy-you' },
    update: {},
    create: {
      slug: 'the-healthy-you',
      title: 'The Healthy You',
      subtitle: 'Transform Your Health, Build Confidence, and Lose Weight Naturally',
      author: 'Princess Oluwatoyin Emmanuel',
      shortDescription: 'The latest featured title in the Edyn Library.',
      coverUrl: '/assets/images/the-healthy-your-cover.jpg',
      currency: 'NGN',
      status: BookStatus.PUBLISHED,
      featured: true,
      purchasesEnabled: false,
      downloadsEnabled: false,
    },
  })

  for (const book of [
    { slug: 'the-confident-you', title: 'The Confident You' },
    { slug: 'the-wealthy-you', title: 'The Wealthy You' },
  ]) {
    await prisma.book.upsert({
      where: { slug: book.slug },
      update: {},
      create: {
        ...book,
        author: 'Princess Oluwatoyin Emmanuel',
        currency: 'NGN',
        status: BookStatus.COMING_SOON,
      },
    })
  }

  await prisma.siteSetting.upsert({
    where: { key: 'book_sales_enabled' },
    update: {},
    create: {
      key: 'book_sales_enabled',
      value: false,
      description: 'Globally enables or disables book purchasing.',
    },
  })

  await prisma.siteSetting.upsert({
    where: { key: 'international_payments_enabled' },
    update: {},
    create: {
      key: 'international_payments_enabled',
      value: false,
      description: 'Shows and authorizes PayPal checkout for international customers.',
    },
  })
}

main()
  .then(() => console.log('Database seed completed'))
  .finally(async () => prisma.$disconnect())
