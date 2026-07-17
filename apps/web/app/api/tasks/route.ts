import { NextResponse } from "next/server";

import { requireAuth } from "../../../lib/auth";
import { getGateway } from "../../../lib/gateway";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { taskRegistry } = await getGateway();
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;

    const tasks = taskRegistry.list(
      limit != null && Number.isFinite(limit) ? limit : undefined
    );

    return NextResponse.json({ status: "success", tasks });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", message }, { status: 503 });
  }
}
