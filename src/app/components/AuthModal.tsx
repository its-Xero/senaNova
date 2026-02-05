"use client";
import { useState } from "react";
import { signup, login, authMe } from "../lib/api";

type Props = {
  visible: boolean;
  onClose: () => void;
  onAuthSuccess: (profile: { id: string; email: string; display_name?: string }) => void;
};

export default function AuthModal({ visible, onClose, onAuthSuccess }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!visible) return null;

  const handleAuth = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        await signup(email, password, displayName || undefined);
        // Show message to check email
        setError("");
        alert("Confirmation email sent. Check your inbox to activate your account.");
        onClose();
      } else {
        const tokens = await login(email, password);
        // store tokens
        localStorage.setItem("talkanova_access_token", tokens.access_token);
        localStorage.setItem("talkanova_refresh_token", tokens.refresh_token);

        // fetch profile
        const me = await authMe();

        // set session identity so websocket uses server id/name
        try {
          sessionStorage.setItem("talkanova_identity", JSON.stringify({ user_id: me.id, user_name: me.display_name || me.email.split("@")[0] }));
        } catch { }

        onAuthSuccess(me);
        onClose();
      }
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((e as any).message || "Auth failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-full max-w-md bg-[#071226] p-6 rounded-lg border border-[#234b67]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg text-white">{mode === "login" ? "Login" : "Sign Up"}</h3>
          <button onClick={onClose} className="text-white">✕</button>
        </div>

        {error && <div className="bg-red-900/30 p-2 rounded mb-2 text-red-300">{error}</div>}

        <div className="space-y-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full p-2 rounded bg-[#0a1929] text-white" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" className="w-full p-2 rounded bg-[#0a1929] text-white" />
          {mode === "signup" && <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" className="w-full p-2 rounded bg-[#0a1929] text-white" />}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={handleAuth} disabled={loading} className="flex-1 bg-[#33A1E0] p-2 rounded text-black font-bold">{loading ? "Please wait..." : mode === "login" ? "Login" : "Sign Up"}</button>
          <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="px-3 py-2 border border-[#33A1E040] rounded text-white">{mode === "login" ? "Switch to Sign Up" : "Switch to Login"}</button>
        </div>

        <div className="mt-3 text-sm text-gray-400">
          <button onClick={async () => { const e = prompt("Enter your email for password reset:"); if (!e) return; setLoading(true); try { await (await import("../lib/api")).forgotPassword(e); alert("If that email exists, a reset link was sent."); } catch { alert("Failed to send"); } finally { setLoading(false); } }} className="underline">Forgot password?</button>
        </div>
        <div className="mt-4">
          <div className="text-center text-sm text-gray-400 mb-2">or</div>
          <button onClick={() => { window.location.href = '/api/v1/auth/google/start'; }} className="w-full flex items-center justify-center gap-2 bg-white text-black p-2 rounded">
            <img src="/google_logo.png" alt="Google" className="w-5 h-5" />
            <span>Sign in with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
}
