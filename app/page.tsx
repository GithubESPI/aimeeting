import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignInPage from "./(auth)/signin/page";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");
  return <SignInPage />;
}
