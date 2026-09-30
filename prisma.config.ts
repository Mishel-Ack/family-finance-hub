import { defineConfig } from "@prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: {
    kind: "single",
    filePath: "prisma/schema.prisma",
  },
  migrate: {
    datasource: {
      provider: "postgresql",
      url:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5432/family_budget?schema=public",
    },
  },
});
