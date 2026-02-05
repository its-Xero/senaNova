"use client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { resetPassword } from "../lib/api";

export default function ResetPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) setError("Missing token");
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 chars");
    if (password !== confirm) return setError("Passwords do not match");
    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => router.push("/chat"), 1500);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((e as any).message || "Reset failed");
    } finally { setLoading(false); }
  };

  if (success) return (<div className="min-h-screen flex items-center justify-center text-white">Password reset successful — redirecting...</div>);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[#0a1929] to-[#1a2744] text-white">
      <div className="w-full max-w-md bg-[#071226] p-6 rounded-lg border border-[#234b67]">
        <h2 className="text-xl mb-4">Set a new password</h2>
        {error && <div className="bg-red-900/30 p-2 rounded mb-2 text-red-300">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2 rounded bg-[#0a1929] text-white" />
          <input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full p-2 rounded bg-[#0a1929] text-white" />
          <button type="submit" disabled={loading} className="w-full py-2 bg-[#33A1E0] rounded text-black">{loading ? "Please wait..." : "Set Password"}</button>
        </form>
      </div>
    </div>
  );
}
