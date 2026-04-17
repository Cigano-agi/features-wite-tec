-- CreateTable
CREATE TABLE "billing_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seller_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_billing_links_seller_id" ON "billing_links"("seller_id");

-- CreateIndex
CREATE INDEX "idx_billing_links_status" ON "billing_links"("status");
