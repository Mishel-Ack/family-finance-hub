import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

function loadServiceWorker() {
  const listeners = new Map<string, (event: never) => void>();
  const addAll = vi.fn(async () => undefined);
  const cache = { addAll };
  const context = {
    self: {
      location: { origin: "https://familybudget.test" },
      addEventListener: (type: string, listener: (event: never) => void) =>
        listeners.set(type, listener),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    },
    caches: {
      open: vi.fn(async () => cache),
      keys: vi.fn(async () => ["familybudget-shell-v1", "familybudget-shell-v2"]),
      delete: vi.fn(async () => true),
      match: vi.fn(async () => undefined),
    },
    URL,
    Response,
    Promise,
    fetch: vi.fn(async () => {
      throw new Error("offline");
    }),
  };
  runInNewContext(readFileSync(join(process.cwd(), "public/service-worker.js"), "utf8"), context);
  return { listeners, addAll, context };
}

describe("service worker cache boundaries", () => {
  it("precaches only offline shell assets", async () => {
    const { listeners, addAll } = loadServiceWorker();
    let install: Promise<unknown> | undefined;
    listeners.get("install")!({
      waitUntil: (promise: Promise<unknown>) => {
        install = promise;
      },
    } as never);
    await install;
    expect(addAll).toHaveBeenCalledWith([
      "/offline.html",
      "/manifest.webmanifest",
      "/icons/familybudget.svg",
    ]);
  });

  it.each(["/api/health", "/auth", "/auth/session"])(
    "does not intercept authenticated API/auth path %s",
    (path) => {
      const { listeners } = loadServiceWorker();
      const respondWith = vi.fn();
      listeners.get("fetch")!({
        request: {
          method: "GET",
          url: `https://familybudget.test${path}`,
          mode: "navigate",
        },
        respondWith,
      } as never);
      expect(respondWith).not.toHaveBeenCalled();
    },
  );

  it("uses the offline fallback only for same-origin navigation requests", () => {
    const { listeners } = loadServiceWorker();
    const respondWith = vi.fn();
    listeners.get("fetch")!({
      request: {
        method: "GET",
        url: "https://familybudget.test/dashboard",
        mode: "navigate",
      },
      respondWith,
    } as never);
    expect(respondWith).toHaveBeenCalledOnce();
  });
});
