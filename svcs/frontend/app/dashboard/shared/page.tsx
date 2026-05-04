import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import SharedWithMe from "@/components/SharedWithMe";

export default async function SharedPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <SharedWithMe userId={userId} />;
}
