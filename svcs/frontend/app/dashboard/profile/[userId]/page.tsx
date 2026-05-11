import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Profile from "@/components/Profile";

export default async function PublicProfilePage({
  params,
}: {
  params: { userId: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const target = params.userId;

  // /dashboard/profile/<my-id> is just the editor — keep one canonical URL.
  if (target === userId) redirect("/dashboard/profile");

  return <Profile targetUserId={target} currentUserId={userId} />;
}
