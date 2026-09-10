import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSession } from "@/lib/auth";
import { enabled, PilotError } from "./service";

export async function requirePilot(admin = false) {
  if (!enabled())
    throw new PilotError("AI evaluation pilot is not enabled", 404);
  const user = await getSession();
  if (!user) throw new PilotError("Sign in to continue", 401);
  if (admin && user.role !== "HR")
    throw new PilotError("HR access required", 403);
  return user;
}
export function failure(error: unknown) {
  if (error instanceof PilotError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  return NextResponse.json(
    { error: "Unable to complete this action. Reload and retry." },
    { status: 500 },
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || new URL(request.url).host;
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new PilotError("Cross-origin request rejected", 403);
  if (origin) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new PilotError("Invalid request origin", 403);
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.host !== host)
      throw new PilotError("Cross-origin request rejected", 403);
  }
}
