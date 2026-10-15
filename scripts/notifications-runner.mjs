import { createServer, loadEnv } from "vite";
import { fileURLToPath } from "node:url";

if (process.env["NODE_ENV"] !== "production") {
  const fileEnv = loadEnv("development", process.cwd(), "");
  if (process.env["DATABASE_URL"] === undefined && fileEnv["DATABASE_URL"] !== undefined) {
    process.env["DATABASE_URL"] = fileEnv["DATABASE_URL"];
  }
}

const vite = await createServer({
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
});
let prisma;
try {
  const module = await vite.ssrLoadModule("/src/services/notification-jobs.ts");
  const prismaModule = await vite.ssrLoadModule("/src/lib/prisma.ts");
  prisma = prismaModule.prisma;
  const result = await module.runNotificationJobs();
  console.info(
    `Processed notifications for ${result.familiesProcessed} families (${result.notificationGroupsProcessed} notification groups).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Notification jobs failed.");
  process.exitCode = 1;
} finally {
  if (prisma) await prisma.$disconnect();
  await vite.close();
}
