"use client";
import SettingsSidebar from "../../components/SettingsSidebar";
export default function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl text-white mb-4">Settings</h1>
      <div className="bg-[#04111a] p-4 rounded"><SettingsSidebar /></div>
    </div>
  );
}

