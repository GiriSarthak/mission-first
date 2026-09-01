-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "forecastFinishDate" DATETIME NOT NULL,
    "delayDays" INTEGER NOT NULL,
    "ldExposure" REAL NOT NULL,
    "agencyAttributablePct" REAL NOT NULL,
    CONSTRAINT "ScheduleSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "dueDate" DATETIME,
    "ownerRole" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceDocumentId" TEXT,
    "sourcePage" INTEGER,
    "sourceClause" TEXT,
    "requiresAgencyApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" DATETIME,
    "approvedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChecklistItem_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ChecklistPhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChecklistItem_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ChecklistItem" ("createdAt", "description", "dueDate", "id", "ownerRole", "phaseId", "sourceClause", "sourceDocumentId", "sourcePage", "sourceType", "status", "title", "updatedAt") SELECT "createdAt", "description", "dueDate", "id", "ownerRole", "phaseId", "sourceClause", "sourceDocumentId", "sourcePage", "sourceType", "status", "title", "updatedAt" FROM "ChecklistItem";
DROP TABLE "ChecklistItem";
ALTER TABLE "new_ChecklistItem" RENAME TO "ChecklistItem";
CREATE TABLE "new_Obligation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owedBy" TEXT NOT NULL DEFAULT 'AGENCY',
    "contractClause" TEXT,
    "sourceDocumentId" TEXT,
    "sourcePage" INTEGER,
    "stipulatedDays" INTEGER,
    "requestedOn" DATETIME,
    "dueOn" DATETIME,
    "receivedOn" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "blockingActivityId" TEXT,
    "agencyResponseNote" TEXT,
    "agencyRespondedAt" DATETIME,
    CONSTRAINT "Obligation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Obligation_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Obligation_blockingActivityId_fkey" FOREIGN KEY ("blockingActivityId") REFERENCES "Activity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Obligation" ("contractClause", "description", "dueOn", "escalationLevel", "id", "owedBy", "projectId", "receivedOn", "requestedOn", "sourceDocumentId", "sourcePage", "status", "stipulatedDays", "title") SELECT "contractClause", "description", "dueOn", "escalationLevel", "id", "owedBy", "projectId", "receivedOn", "requestedOn", "sourceDocumentId", "sourcePage", "status", "stipulatedDays", "title" FROM "Obligation";
DROP TABLE "Obligation";
ALTER TABLE "new_Obligation" RENAME TO "Obligation";
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tenderRef" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL,
    "contractValue" REAL,
    "contractStart" DATETIME,
    "contractDurationDays" INTEGER,
    "ldWeeklyRatePct" REAL NOT NULL DEFAULT 0.5,
    "ldCapPct" REAL NOT NULL DEFAULT 10,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendorOrgId" TEXT,
    "agencyOrgId" TEXT,
    CONSTRAINT "Project_vendorOrgId_fkey" FOREIGN KEY ("vendorOrgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_agencyOrgId_fkey" FOREIGN KEY ("agencyOrgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("agencyName", "contractDurationDays", "contractStart", "contractValue", "createdAt", "id", "name", "tenderRef") SELECT "agencyName", "contractDurationDays", "contractStart", "contractValue", "createdAt", "id", "name", "tenderRef" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ScheduleSnapshot_projectId_capturedAt_idx" ON "ScheduleSnapshot"("projectId", "capturedAt");
