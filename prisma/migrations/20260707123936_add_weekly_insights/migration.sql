-- CreateTable
CREATE TABLE "weekly_insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "week_start" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "highlights" JSONB DEFAULT '[]',
    "suggestion" TEXT,
    "provider" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_insights_user_id_week_start_key" ON "weekly_insights"("user_id", "week_start");

-- AddForeignKey
ALTER TABLE "weekly_insights" ADD CONSTRAINT "weekly_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
