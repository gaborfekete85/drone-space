import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import MyVideos from "@/components/MyVideos";

export default async function MyVideosPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="mx-auto max-w-7xl">
      <MyVideos userId={userId} />
    </div>
  );
}
