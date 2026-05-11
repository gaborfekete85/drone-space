import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import TestM3u8Client from "./TestM3u8Client";

export default async function TestM3u8Page() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  // userId not forwarded — the test asset lives under a fixed user prefix
  // (see TEST_M3U8_USER in the backend); this is a CDN playback demo, not
  // per-user content.
  return <TestM3u8Client />;
}
