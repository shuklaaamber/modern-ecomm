import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-up" next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} />;
}
