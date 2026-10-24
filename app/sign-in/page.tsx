import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only same-site relative paths are allowed, so ?next= cannot be used as an open redirect.
  return <AuthForm mode="sign-in" next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} />;
}
