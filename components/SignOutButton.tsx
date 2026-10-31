"use client";
import { refreshNav } from "@/lib/nav-events";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="hover:underline"
      onClick={async () => {
        await authClient.signOut();
        refreshNav();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
