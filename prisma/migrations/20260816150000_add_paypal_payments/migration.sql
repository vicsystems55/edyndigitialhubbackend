CREATE TYPE "PaymentProvider" AS ENUM ('PAYSTACK', 'PAYPAL');

ALTER TABLE "Book"
ADD COLUMN "paypalPriceMinor" INTEGER;

ALTER TABLE "Order"
ADD COLUMN "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
ADD COLUMN "providerOrderId" TEXT,
ADD COLUMN "providerTransactionId" TEXT;

CREATE INDEX "Order_paymentProvider_providerOrderId_idx"
ON "Order"("paymentProvider", "providerOrderId");
