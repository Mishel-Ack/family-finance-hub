import { getRequestHeader } from "@tanstack/react-start/server";

export function getHeader(name: string): string | undefined {
  return getRequestHeader(name.toLowerCase() as Parameters<typeof getRequestHeader>[0]);
}
