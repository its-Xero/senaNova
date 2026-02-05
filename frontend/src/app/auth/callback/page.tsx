"use client";
import { useEffect } from "react";
export default function AuthCallback() {
  useEffect(() => {
    // Placeholder for OAuth callback handling
    setTimeout(() => { window.location.href = "/"; }, 500);
  }, []);
  return (<div className="p-6 text-white">Signing in...</div>);
}

