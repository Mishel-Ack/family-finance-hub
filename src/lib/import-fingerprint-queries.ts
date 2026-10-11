import type { Prisma, PrismaClient } from "@prisma/client";

type FingerprintReader =
  Pick<PrismaClient, "importFingerprint"> | Pick<Prisma.TransactionClient, "importFingerprint">;

export async function listKnownImportFingerprints(
  db: FingerprintReader,
  familyId: string,
  hashes: string[],
) {
  if (!hashes.length) return [];
  return db.importFingerprint.findMany({
    where: { familyId, hash: { in: hashes } },
    select: { hash: true },
  });
}

export async function claimImportFingerprint(
  db: FingerprintReader,
  familyId: string,
  hash: string,
) {
  const inserted = await db.importFingerprint.createMany({
    data: [{ familyId, hash } satisfies Prisma.ImportFingerprintCreateManyInput],
    skipDuplicates: true,
  });
  return inserted.count === 1;
}
