import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Profile from "@/components/Profile";

export default async function MyProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <Profile targetUserId={userId} currentUserId={userId} />;
}
