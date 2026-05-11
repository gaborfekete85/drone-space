import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export type ShareableUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
};

function pickName(u: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (u.username) return u.username;
  return "";
}

function pickEmail(u: {
  primaryEmailAddressId?: string | null;
  emailAddresses?: { id: string; emailAddress: string }[];
}): string {
  const list = u.emailAddresses ?? [];
  const primary = list.find((e) => e.id === u.primaryEmailAddressId);
  return (primary ?? list[0])?.emailAddress ?? "";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();
  const out: ShareableUser[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const page = await client.users.getUserList({
      limit: pageSize,
      offset,
      orderBy: "-created_at",
    });
    for (const u of page.data) {
      if (u.id === userId) continue;
      const name = pickName(u);
      const email = pickEmail(u);
      if (!name && !email) continue;
      out.push({
        id: u.id,
        name: name || email,
        email,
        imageUrl: u.imageUrl ?? "",
      });
    }
    if (page.data.length < pageSize) break;
    if (offset + pageSize >= page.totalCount) break;
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ users: out });
}
