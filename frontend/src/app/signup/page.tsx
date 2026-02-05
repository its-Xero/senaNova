"use client";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) return setError("Email and password required");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name: displayName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.message || "Signup failed");
      setDone(true);
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((err as any).message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white p-6">
        <div className="max-w-md w-full bg-[#071226] p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-2">Check your email</h2>
          <p className="text-sm text-gray-300">A confirmation email was sent. Follow the link to activate your account and sign in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center text-white p-6">
      <div className="max-w-md w-full bg-[#071226] p-6 rounded-lg">
        <h2 className="text-2xl font-bold mb-4">Create an account</h2>
        {error && <div className="bg-red-900/30 p-2 rounded mb-2 text-red-300">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2 rounded bg-[#0a1929] text-white" />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2 rounded bg-[#0a1929] text-white" />
          <input placeholder="Display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full p-2 rounded bg-[#0a1929] text-white" />
          <button type="submit" disabled={loading} className="w-full py-2 bg-[#33A1E0] rounded text-black">{loading ? "Please wait..." : "Sign up"}</button>
        </form>
      </div>
    </div>
  );
}
