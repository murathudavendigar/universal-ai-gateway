import { NextResponse } from "next/server";

import { requireAuth } from "../../../lib/auth";
import { getGateway, TASK_TYPES } from "../../../lib/gateway";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { router, knownModels } = await getGateway();

    const chains = TASK_TYPES.map((task) => ({
      task,
      plans: router.route({ task }),
    }));

    return NextResponse.json({
      status: "success",
      chains,
      models: [...knownModels].sort(),
      routable_models: router.listRoutableModels(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", message }, { status: 503 });
  }
}
