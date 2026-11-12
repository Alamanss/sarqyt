"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { loading, profile } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!profile) router.replace("/login");
    else if (profile.role === "responsible") router.replace("/entry");
    else if (profile.role === "reviewer") router.replace("/reports");
    else if (profile.role === "admin") router.replace("/admin");
    else router.replace("/dashboard");
  }, [loading, profile, router]);
  return <div className="grid min-h-dvh place-items-center text-mute">…</div>;
}
