ALTER TABLE "Order"
ADD COLUMN "receiptEmailSentAt" TIMESTAMP(3),
ADD COLUMN "receiptEmailId" TEXT,
ADD COLUMN "receiptEmailError" TEXT;
