import type { TaskType } from "@uag/core";
import { NextResponse } from "next/server";

import { guardApi } from "../../../lib/apiGuard";
import { getGateway, jsonFromHandler, TASK_TYPES } from "../../../lib/gateway";

export const runtime = "nodejs";
export const maxDuration = 300;

type ChatMessageIn = {
  role?: unknown;
  content?: unknown;
};

export async function POST(request: Request) {
  const blocked = guardApi(request);
  if (blocked) return blocked;

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
    messages?: unknown;
  };

  const messages = Array.isArray(payload.messages)
    ? (payload.messages as ChatMessageIn[])
        .filter(
          (message) =>
            (message.role === "system" ||
              message.role === "user" ||
              message.role === "assistant") &&
            typeof message.content === "string"
        )
        .map((message) => ({
          role: message.role as "system" | "user" | "assistant",
          content: message.content as string,
        }))
    : undefined;

  const prompt =
    typeof payload.prompt === "string"
      ? payload.prompt
      : messages?.filter((m) => m.role === "user").at(-1)?.content ?? "";

  if (!prompt.trim() && (!messages || messages.length === 0)) {
    return NextResponse.json(
      { status: "error", message: "prompt or messages are required." },
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
      prompt: prompt.trim() || "(multi-turn)",
      intent: payload.intent as TaskType,
      specific_model:
        typeof payload.specific_model === "string" && payload.specific_model
          ? payload.specific_model
          : undefined,
      request_id:
        typeof payload.request_id === "string" && payload.request_id
          ? payload.request_id
          : undefined,
      messages,
    });
    return jsonFromHandler(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", message }, { status: 503 });
  }
}
