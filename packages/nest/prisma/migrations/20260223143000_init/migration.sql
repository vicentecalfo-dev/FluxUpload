CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "UploadStatus" AS ENUM ('initiated', 'uploading', 'completed', 'aborted', 'expired', 'error');

CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "contentType" TEXT NOT NULL,
    "lastModified" BIGINT NOT NULL,
    "chunkSize" INTEGER NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'initiated',
    "multipartUploadId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UploadPart" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" TEXT NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "etag" TEXT NOT NULL,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadPart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UploadPart_sessionId_partNumber_key" ON "UploadPart"("sessionId", "partNumber");
CREATE INDEX "UploadSession_ownerId_idx" ON "UploadSession"("ownerId");
CREATE INDEX "UploadSession_status_idx" ON "UploadSession"("status");

ALTER TABLE "UploadPart"
ADD CONSTRAINT "UploadPart_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "UploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
