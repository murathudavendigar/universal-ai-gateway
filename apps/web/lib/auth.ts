import { config } from "dotenv";
import path from "node:path";
import { NextResponse } from "next/server";

let envLoaded = false;

function ensureEnvLoaded(): void {
  if (envLoaded) return;
  envLoaded = true;
  for (const filePath of [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "../../.env"),
  ]) {
    config({ path: filePath, quiet: true } as Parameters<typeof config>[0]);
  }
}

/**
 * If `UAG_WEB_TOKEN` is set, require `Authorization: Bearer <token>`.
 * If unset, APIs are open (local personal use).
 */
export function requireAuth(request: Request): NextResponse | null {
  ensureEnvLoaded();
  const expected = process.env.UAG_WEB_TOKEN;
  if (!expected) return null;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return NextResponse.json(
      { status: "error", message: "Missing or invalid Authorization header." },
      { status: 401 }
    );
  }

  const token = header.slice("Bearer ".length).trim();
  if (token !== expected) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized." },
      { status: 401 }
    );
  }

  return null;
}
