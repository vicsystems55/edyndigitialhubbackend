import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, BookStatus } from '../src/generated/prisma/client.js'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database')
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
})

async function main() {
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
}

main()
  .then(() => console.log('Database seed completed'))
  .finally(async () => prisma.$disconnect())
