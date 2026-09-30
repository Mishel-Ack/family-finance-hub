export function getHeader(name: string): string | undefined {
  try {
    // Dynamically resolve in vinxi runtime environment
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vinxiHttp = require("vinxi/http");
    return vinxiHttp.getHeader(name);
  } catch {
    return undefined;
  }
}

export function setHeader(name: string, value: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vinxiHttp = require("vinxi/http");
    vinxiHttp.setHeader(name, value);
  } catch {
    // Non-vinxi environment
  }
}
