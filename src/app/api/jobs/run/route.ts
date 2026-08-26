import { NextResponse } from "next/server";
import { runNextJob } from "@/lib/jobs/runner";

export const maxDuration = 300;

export async function POST() {
  const result = await runNextJob();
  return NextResponse.json(result);
}
