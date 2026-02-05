"use client";
import { useState } from "react";
export default function MessageInput({ onSend, onAttach }: { onSend: (s: string) => void; onAttach?: (f: File) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2 p-2">
      <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 p-2 rounded bg-[#071722]" placeholder="Message..." onKeyDown={(e) => { if (e.key === "Enter") { onSend(text); setText(""); } }} />
      <input type="file" id="attach" style={{ display: "none" }} onChange={(e) => { if (e.target.files && e.target.files[0] && onAttach) onAttach(e.target.files[0]); }} />
      <button onClick={() => { const el = document.getElementById("attach") as HTMLInputElement | null; el?.click(); }} className="px-3 py-2 rounded bg-gray-600">Attach</button>
      <button onClick={() => { onSend(text); setText(""); }} className="px-3 py-2 rounded bg-blue-600">Send</button>
    </div>
  );
}

