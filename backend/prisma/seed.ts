import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const demoMerchantId = process.env.DEMO_MERCHANT_ID || 'mch_0182ab91-ca91-42ab-8901-cauri0000001';
  const demoApiKey = process.env.DEMO_API_KEY || 'sk_test_demo123';
  const demoWebhookSecret = process.env.DEMO_WEBHOOK_SECRET || 'whsec_cauri_secret_demo456';

  console.log('🌱 Seeding demo merchant...');

  const merchant = await prisma.merchant.upsert({
    where: { apiKey: demoApiKey },
    update: {
      name: 'Demo Merchant Store',
      webhookSecret: demoWebhookSecret,
      webhookUrl: 'https://webhook.site/cauri-demo-receiver',
    },
    create: {
      id: demoMerchantId,
      name: 'Demo Merchant Store',
      apiKey: demoApiKey,
      webhookSecret: demoWebhookSecret,
      webhookUrl: 'https://webhook.site/cauri-demo-receiver',
    },
  });

  console.log(`✅ Seeded merchant: ${merchant.name} (API Key: ${merchant.apiKey})`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
