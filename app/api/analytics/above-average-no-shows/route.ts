import { NextResponse } from "next/server";
import { aboveAverageNoShows } from "@/src/services/analytics.service";
import { yearQuerySchema } from "@/src/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const yearRaw = searchParams.get("year") ?? undefined;
  const yearParse = yearQuerySchema.safeParse(yearRaw);
  if (!yearParse.success) {
    return NextResponse.json(
      { error: "Invalid `year` query param" },
      { status: 400 },
    );
  }
  const result = await aboveAverageNoShows(yearParse.data);
  return NextResponse.json(result, { status: 200 });
}
