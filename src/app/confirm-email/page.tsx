"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { confirmEmail } from "../lib/api";

export default function ConfirmEmailPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      if (!token) {
        setError("Missing token");
        setLoading(false);
        return;
      }
      try {
        const tokens = await confirmEmail(token);
        localStorage.setItem("talkanova_access_token", tokens.access_token);
        localStorage.setItem("talkanova_refresh_token", tokens.refresh_token);
        // redirect to chat
        router.push("/chat");
      } catch (e: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setError((e as any).message || "Confirmation failed");
      } finally { setLoading(false); }
    })();
  }, [token, router]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-white">Confirming…</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-white">Error: {error}</div>;
  return null;
}
