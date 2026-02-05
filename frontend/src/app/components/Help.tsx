"use client";
export default function Help() {
  return (
    <div className="p-4 text-white">
      <h3 className="font-bold">Help</h3>
      <p className="text-sm mt-2">TalkaNova is a demo secure chat. Rooms are not E2EE by default. P2P uses NaCl box for end-to-end encryption when both peers connect directly.</p>
    </div>
  );
}

