import { NextResponse } from "next/server";

import { guardApi } from "../../../lib/apiGuard";
import { getGateway, jsonFromHandler } from "../../../lib/gateway";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const blocked = guardApi(request);
  if (blocked) return blocked;

  try {
    const { getSessionStats } = await getGateway();
    return jsonFromHandler(await getSessionStats());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", message }, { status: 503 });
  }
}
