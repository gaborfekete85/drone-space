import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export default async function VideoTestingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
        Video testing
      </h1>
      <p className="text-slate-600 dark:text-slate-400">
        Testing mp4 vs m3u8 file streaming strategies
      </p>
    </div>
  );
}
