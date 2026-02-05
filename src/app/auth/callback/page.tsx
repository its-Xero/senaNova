"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OAuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access = params.get("access_token");
    const refresh = params.get("refresh_token");
    if (access) localStorage.setItem("talkanova_access_token", access);
    if (refresh) localStorage.setItem("talkanova_refresh_token", refresh);

    (async () => {
      try {
        const api = await import("../../lib/api");
        if (api && api.authMe) {
          try {
            const me = await api.authMe();
            try {
              sessionStorage.setItem("talkanova_identity", JSON.stringify({ user_id: me.id, user_name: me.display_name || me.email.split("@")[0] }));
            } catch {}
          } catch {}
        }
      } catch {}
      router.replace("/");
    })();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="p-6 bg-[#071226] text-white rounded">Signing in... Redirecting...</div>
    </div>
  );
}
