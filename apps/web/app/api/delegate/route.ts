import type { TaskType } from "@uag/core";
import { NextResponse } from "next/server";

import { requireAuth } from "../../../lib/auth";
import { getGateway, jsonFromHandler, TASK_TYPES } from "../../../lib/gateway";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const payload = body as {
    prompt?: unknown;
    intent?: unknown;
    specific_model?: unknown;
    request_id?: unknown;
  };

  if (typeof payload.prompt !== "string" || !payload.prompt.trim()) {
    return NextResponse.json(
      { status: "error", message: "prompt is required." },
      { status: 400 }
    );
  }

  if (
    typeof payload.intent !== "string" ||
    !TASK_TYPES.includes(payload.intent as TaskType)
  ) {
    return NextResponse.json(
      {
        status: "error",
        message: `intent must be one of: ${TASK_TYPES.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  try {
    const { delegateTask } = await getGateway();
    const raw = await delegateTask({
      prompt: payload.prompt,
      intent: payload.intent as TaskType,
      specific_model:
        typeof payload.specific_model === "string" && payload.specific_model
          ? payload.specific_model
          : undefined,
      request_id:
        typeof payload.request_id === "string" && payload.request_id
          ? payload.request_id
          : undefined,
    });
    return jsonFromHandler(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", message }, { status: 503 });
  }
}
