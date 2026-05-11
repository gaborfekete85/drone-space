import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import MyDrones from "@/components/MyDrones";

export default async function DronesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <MyDrones userId={userId} />;
}
