import { NextResponse } from "next/server";

import { guardApi } from "../../../lib/apiGuard";
import { getGateway, TASK_TYPES } from "../../../lib/gateway";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const blocked = guardApi(request);
  if (blocked) return blocked;

  try {
    const { router, knownModels, unhealthyProviders } = await getGateway();

    const unhealthy = unhealthyProviders();
    const chains = TASK_TYPES.map((task) => ({
      task,
      plans: router.route({ task }).map((plan) => ({
        ...plan,
        deferred: unhealthy.has(plan.providerId),
      })),
    }));

    return NextResponse.json({
      status: "success",
      chains,
      models: [...knownModels].sort(),
      routable_models: router.listRoutableModels(),
      unhealthy_providers: [...unhealthy],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", message }, { status: 503 });
  }
}
