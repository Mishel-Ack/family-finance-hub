import { defineConfig } from "@prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: {
    kind: "single",
    filePath: "prisma/schema.prisma",
  },
  migrate: {
    datasource: {
      provider: "sqlite",
      url: "file:./dev.db",
    },
  },
});
