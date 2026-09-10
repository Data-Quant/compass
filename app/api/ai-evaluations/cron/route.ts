import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { enabled, scheduleDue } from "@/lib/ai-evaluations/service";
import { runOneJob } from "@/lib/ai-evaluations/worker";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const expected = process.env.AI_EVALUATIONS_CRON_SECRET;
  const supplied = request.headers.get("authorization") || "";
  const valid =
    expected &&
    Buffer.byteLength(supplied) === Buffer.byteLength(`Bearer ${expected}`) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(`Bearer ${expected}`));
  if (!enabled() || !valid)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({
      scheduled: await scheduleDue(),
      worker: await runOneJob(),
    });
  } catch {
    return NextResponse.json(
      { error: "Pilot worker failed; retry on next scheduled run" },
      { status: 500 },
    );
  }
}
