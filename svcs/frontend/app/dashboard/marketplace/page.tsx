import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Marketplace from "@/components/Marketplace";

export default async function MarketplacePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <Marketplace userId={userId} />;
}
