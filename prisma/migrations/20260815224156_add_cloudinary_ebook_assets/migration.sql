-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "ebookAssetId" TEXT,
ADD COLUMN     "ebookAssetVersion" TEXT,
ADD COLUMN     "ebookBytes" INTEGER,
ADD COLUMN     "ebookFormat" TEXT,
ADD COLUMN     "ebookOriginalName" TEXT,
ADD COLUMN     "ebookProvider" TEXT,
ADD COLUMN     "ebookUploadedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Book_ebookProvider_idx" ON "Book"("ebookProvider");
