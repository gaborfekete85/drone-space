import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import DronersAround from "@/components/DronersAround";

export default async function DronersPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <DronersAround userId={userId} />;
}
