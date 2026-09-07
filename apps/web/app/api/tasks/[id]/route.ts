import { NextResponse } from "next/server";

import { guardApi } from "../../../../lib/apiGuard";
import { getGateway, jsonFromHandler } from "../../../../lib/gateway";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const blocked = guardApi(request);
  if (blocked) return blocked;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { status: "error", message: "request id is required." },
      { status: 400 }
    );
  }

  try {
    const { getTaskResult } = await getGateway();
    return jsonFromHandler(await getTaskResult(id));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", message }, { status: 503 });
  }
}
