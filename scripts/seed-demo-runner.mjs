import { loadEnv, createServer } from "vite";
import { fileURLToPath } from "node:url";

const fileEnv = loadEnv("development", process.cwd(), "");
for (const name of ["DATABASE_URL", "NODE_ENV", "ALLOW_DEMO_SEED"]) {
  if (process.env[name] === undefined && fileEnv[name] !== undefined) {
    process.env[name] = fileEnv[name];
  }
}

const vite = await createServer({
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
});
let disconnect;
try {
  const module = await vite.ssrLoadModule("/scripts/seed-demo.ts");
  disconnect = module.disconnectDemoSeed;
  await module.seedDemo(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Demo seed failed.");
  process.exitCode = 1;
} finally {
  if (disconnect) await disconnect();
  await vite.close();
}
