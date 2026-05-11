import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import TestM3u8FreeClient from "./TestM3u8FreeClient";

export default async function TestM3u8FreePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <TestM3u8FreeClient />;
}
