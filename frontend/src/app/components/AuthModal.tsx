"use client";
import { useState } from "react";
import { setUserName, getIdentity, getLocalProfile } from "../lib/api";

export default function AuthModal({ onClose }: { onClose?: () => void }) {
  const [name, setName] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    setUserName(name.trim());
    try { sessionStorage.setItem("talkanova_identity", JSON.stringify({ user_id: getIdentity().user_id, user_name: name.trim() })); } catch {}
    if (onClose) onClose();
    window.location.reload();
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
      <div className="bg-[#04111a] p-4 rounded w-[320px]">
        <h3 className="text-white font-bold mb-2">Set Display Name</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 rounded bg-[#071722]" placeholder="Display name" />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => { if (onClose) onClose(); }} className="px-3 py-2 rounded bg-gray-600">Cancel</button>
          <button onClick={submit} className="px-3 py-2 rounded bg-blue-600">Save</button>
        </div>
      </div>
    </div>
  );
}

