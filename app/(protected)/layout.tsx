"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function checkSession() {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!data.session) {
        router.replace(`/login?next=${encodeURIComponent(pathname || "/play")}`);
        return;
      }
      setLoading(false);
    }
    checkSession();
    return () => {
      mounted = false;
    };
  }, [router, pathname]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4">
        <p className="text-sm font-semibold text-ink/70">Checking session...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-24 pt-4">
      <header className="mb-4">
        <h1 className="text-2xl font-black tracking-tight text-ink">Critical Think Play</h1>
        <p className="text-sm text-ink/70">Daily reasoning practice for every age band</p>
      </header>
      <ProfileSwitcher />
      <main className="flex-1 pt-4">{children}</main>
      <BottomNav />
    </div>
  );
}
