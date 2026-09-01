import { NextResponse } from "next/server";
import { runNextJob } from "@/lib/jobs/runner";
import { currentUser, visibleProjects } from "@/lib/auth/authorize";

export const maxDuration = 300;

export async function POST() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  // Only ever drains jobs belonging to projects this user can see.
  const projects = await visibleProjects(user);
  const result = await runNextJob(projects.map((p) => p.id));
  return NextResponse.json(result);
}
