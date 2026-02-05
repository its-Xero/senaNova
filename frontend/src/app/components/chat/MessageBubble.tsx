"use client";
export default function MessageBubble({ text, isMe }: { text: string; isMe?: boolean }) {
  return (
    <div className={`py-1 ${isMe ? "text-right" : "text-left"}`}>
      <div className={`inline-block px-3 py-2 rounded ${isMe ? "bg-blue-600" : "bg-[#154D71]"}`}>{text}</div>
    </div>
  );
}

