import { NextResponse } from "next/server";

import { requireAuth } from "../../../lib/auth";
import { getGateway, jsonFromHandler } from "../../../lib/gateway";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { health } = await getGateway();
    return jsonFromHandler(await health());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", message }, { status: 503 });
  }
}
