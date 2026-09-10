import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enabled } from "@/lib/ai-evaluations/service";
export async function GET() {
  if (!enabled()) return NextResponse.json({ enabled: false });
  const user = await getSession();
  if (!user) return NextResponse.json({ enabled: false }, { status: 401 });
  const [checkIns, themes] = await Promise.all([
    prisma.aiEvaluationCheckIn.findMany({
      where: { evaluatorId: user.id },
      select: {
        status: true,
        week: true,
        cycle: { select: { startDate: true } },
      },
    }),
    prisma.aiEvaluationTheme.count({
      where: { evaluateeId: user.id, status: "RELEASED" },
    }),
  ]);
  return NextResponse.json({
    enabled: user.role === "HR" || checkIns.length > 0 || themes > 0,
    pending: checkIns.filter(
      (c) =>
        c.status !== "SUBMITTED" &&
        Date.now() < c.cycle.startDate.getTime() + c.week * 7 * 86400000,
    ).length,
  });
}
