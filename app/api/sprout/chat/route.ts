import { NextResponse } from "next/server";
import { createOpenAiResponsesPayload, extractOpenAiResponseText, isSproutChatRequest } from "@/lib/sproutOpenAi";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.2";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL
  });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Sprout is not configured. Set OPENAI_API_KEY in the server environment." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!isSproutChatRequest(body) || body.messages.length === 0) {
    return NextResponse.json({ error: "Invalid Sprout chat request." }, { status: 400 });
  }

  const openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(createOpenAiResponsesPayload(body.messages, process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL))
  });

  const responseBody = await openAiResponse.json().catch(() => null);
  if (!openAiResponse.ok) {
    const message =
      typeof responseBody === "object" &&
      responseBody !== null &&
      typeof (responseBody as { error?: { message?: unknown } }).error?.message === "string"
        ? (responseBody as { error: { message: string } }).error.message
        : "OpenAI request failed.";
    return NextResponse.json({ error: message }, { status: openAiResponse.status });
  }

  const content = extractOpenAiResponseText(responseBody);
  if (!content) {
    return NextResponse.json({ error: "OpenAI returned an empty response." }, { status: 502 });
  }

  return NextResponse.json({ content });
}
