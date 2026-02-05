"use client";
import { clearIdentity } from "../lib/api";

export default function SettingsSidebar({ onClose }: { onClose?: () => void }) {
  return (
    <div className="p-3 bg-[#04111a] h-full w-[280px]">
      <h3 className="text-white font-bold mb-2">Settings</h3>
      <div className="mt-2">
        <button className="px-3 py-2 bg-red-600 rounded" onClick={() => { if (confirm("Reset identity?")) { clearIdentity(); location.reload(); } }}>Reset Identity</button>
      </div>
      <div className="mt-4">
        <button className="px-3 py-2 bg-gray-700 rounded" onClick={() => { if (onClose) onClose(); }}>Close</button>
      </div>
    </div>
  );
}

