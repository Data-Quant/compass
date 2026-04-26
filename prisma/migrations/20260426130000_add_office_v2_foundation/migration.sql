ALTER TABLE "User" ADD COLUMN "avatarSchemaVersion" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "User" ADD COLUMN "avatarBodyFrame" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarOutfitType" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarOutfitColor" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarOutfitAccentColor" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarHairCategory" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarHeadCoveringType" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarHeadCoveringColor" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarAccessories" JSONB;

CREATE TABLE "OfficeUserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredStatusText" TEXT,
    "audioSettings" JSONB,
    "panelLayout" JSONB,
    "dismissedHints" JSONB,
    "selectedDecor" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeUserPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficeCubicleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cubicleId" TEXT NOT NULL,
    "decorJson" JSONB,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeCubicleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficeLeadershipOfficeAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "isLockedByDefault" BOOLEAN NOT NULL DEFAULT false,
    "decorJson" JSONB,
    "eligibilityOverride" BOOLEAN,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeLeadershipOfficeAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficeRoomMetadata" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "capacity" INTEGER,
    "ownerId" TEXT,
    "privacyDefault" TEXT NOT NULL DEFAULT 'OPEN',
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeRoomMetadata_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficeCatalogItem" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeCatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfficeUserPreference_userId_key" ON "OfficeUserPreference"("userId");
CREATE UNIQUE INDEX "OfficeCubicleAssignment_userId_key" ON "OfficeCubicleAssignment"("userId");
CREATE INDEX "OfficeCubicleAssignment_cubicleId_idx" ON "OfficeCubicleAssignment"("cubicleId");
CREATE UNIQUE INDEX "OfficeLeadershipOfficeAssignment_userId_key" ON "OfficeLeadershipOfficeAssignment"("userId");
CREATE INDEX "OfficeLeadershipOfficeAssignment_officeId_idx" ON "OfficeLeadershipOfficeAssignment"("officeId");
CREATE UNIQUE INDEX "OfficeRoomMetadata_roomId_key" ON "OfficeRoomMetadata"("roomId");
CREATE INDEX "OfficeRoomMetadata_roomType_idx" ON "OfficeRoomMetadata"("roomType");
CREATE INDEX "OfficeRoomMetadata_ownerId_idx" ON "OfficeRoomMetadata"("ownerId");
CREATE UNIQUE INDEX "OfficeCatalogItem_kind_key_key" ON "OfficeCatalogItem"("kind", "key");
CREATE INDEX "OfficeCatalogItem_kind_isActive_idx" ON "OfficeCatalogItem"("kind", "isActive");

ALTER TABLE "OfficeUserPreference" ADD CONSTRAINT "OfficeUserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeCubicleAssignment" ADD CONSTRAINT "OfficeCubicleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeLeadershipOfficeAssignment" ADD CONSTRAINT "OfficeLeadershipOfficeAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeRoomMetadata" ADD CONSTRAINT "OfficeRoomMetadata_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
