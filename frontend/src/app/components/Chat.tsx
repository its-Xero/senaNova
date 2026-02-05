"use client";
import { useState, useEffect, useRef, useCallback } from "react";

/*
 * Simplified TalkaNova Chat component (rooms + P2P)
 */

import {
  getRooms,
  createRoom as apiCreateRoom,
  joinRoom as apiJoinRoom,
  wsGeneralChatUrl,
  getPendingP2PSessions,
  acceptP2PSession,
  getIdentity,
  setUserName,
  getLocalProfile,
  type Profile as ApiProfile,
  type Room as ApiRoom,
  type P2PSession,
  requestP2PSession,
  getRoomMembers,
  uploadFile,
} from "../lib/api";
import { roomOpaqueEncode, roomOpaqueDecode } from "../lib/crypto";
import P2PChat from "./P2PChat";
import AuthModal from "./AuthModal";
import SettingsSidebar from "./SettingsSidebar";

function useIsPc() {
  const [isPc, setIsPc] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const checkMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent);
      setIsPc(!checkMobile);
    }
  }, []);
  return isPc;
}

type ChatMessage = {
  id: string;
  message: string;
  user_name?: string;
  avatar?: string;
  timestamp: string;
};

type Profile = ApiProfile & { id: string };
type ActiveChat = { id: string; type: "room" | "dm" | "p2p"; name?: string; roomId?: string; conversationId?: string; otherUserId?: string; p2pSessionId?: string };
type Room = ApiRoom;

export default function Chat() {
  const isPc = useIsPc();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [pendingP2P, setPendingP2P] = useState<P2PSession[]>([]);
  const [usersOnline, setUsersOnline] = useState<{user_id:string; user_name?:string}[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  const loadInitialData = useCallback(() => {
    getRooms().then(async (rs) => {
      let general = rs.find(r => r.name === "General");
      if (!general) {
        try {
          general = await apiCreateRoom("General", "public");
          rs.push(general);
        } catch { }
      }
      setRooms(rs);

      if (!activeChat && general) {
        await apiJoinRoom(general.id);
        setActiveChat({ id: general.id, type: "room", name: general.name, roomId: general.id });
      } else if (rs.length > 0 && !activeChat) {
        setActiveChat({ id: rs[0].id, type: "room", name: rs[0].name, roomId: rs[0].id });
      }
    }).catch(() => { });
    getPendingP2PSessions().then(setPendingP2P).catch(() => { });
  }, [activeChat]);

  useEffect(() => {
    (async () => {
      try {
        // try fetch authenticated profile
        // skip detailed auth here for simplicity
        setProfile(getLocalProfile());
      } catch {
        setProfile(getLocalProfile());
      }
      loadInitialData();
    })();
  }, [loadInitialData]);

  useEffect(() => {
    if (!profile) return;
    const interval = setInterval(() => {
      getPendingP2PSessions().then(setPendingP2P).catch(() => { });
    }, 5000);
    return () => clearInterval(interval);
  }, [profile]);

  useEffect(() => {
    if (!profile || !activeChat) {
      setUsersOnline([]);
      setMessages([]);
      return;
    }

    if (activeChat.type === "p2p") return;

    if (activeChat.type === "dm") return;

    if (activeChat.type === "room" && activeChat.roomId) {
      setMessages([]);
      if (wsRef.current) wsRef.current.close();

      try {
        const url = wsGeneralChatUrl(activeChat.roomId);
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "message") {
              setMessages((prev) => [
                ...prev,
                {
                  id: data.sender_id,
                  message: data.content ? roomOpaqueDecode(data.content) : (data.message ? roomOpaqueDecode(data.message) : ""),
                  user_name: data.user_name || "Guest",
                  avatar: data.avatar,
                  timestamp: data.timestamp || new Date().toISOString(),
                },
              ]);
            }
            if (data.type === "room_users" && data.users) {
              setUsersOnline(data.users.map((u: { user_id: string; user_name?: string }) => ({ user_id: u.user_id, user_name: u.user_name })));
            }
            if (data.type === "presence" && data.event === "join") {
              setUsersOnline((prev) => (prev.some(p => p.user_id === data.user_id) ? prev : [...prev, { user_id: data.user_id, user_name: data.user_name }]));
            }
            if (data.type === "presence" && data.event === "leave") {
              setUsersOnline((prev) => prev.filter((p) => p.user_id !== data.user_id));
            }
          } catch { }
        };
        ws.onclose = () => setUsersOnline([]);
      } catch (e) {
        console.error("WS Connect error", e);
      }
      return () => {
        wsRef.current?.close();
        wsRef.current = null;
      };
    }
  }, [activeChat, profile]);

  const sendMessage = async () => {
    if (newMessage.trim() === "" || !profile) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "chat", content: roomOpaqueEncode(newMessage) })
      );
      setNewMessage("");
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const res = await uploadFile(file);
        const content = `[FILE]:${res.id}:${res.filename}:${res.content_type}`;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({ type: "chat", content: roomOpaqueEncode(content) })
          );
        }
      } catch (err) {
        alert("Upload failed");
      }
    }
  };

  const renderMessageContent = (msg: string) => {
    if (msg.startsWith("[FILE]:")) {
      const parts = msg.split(":");
      const id = parts[1];
      const name = parts[2];
      const type = parts[3];
      const url = `/api/v1/files/${id}`;
      if (type.startsWith("image/")) {
        return <div className="flex flex-col"><img src={url} alt={name} className="rounded mb-1" style={{ width: 200 }} /><a href={url} download={name} className="text-xs underline text-white">Download {name}</a></div>;
      }
      return <a href={url} download={name} target="_blank" className="text-blue-300 underline flex items-center gap-2">📄 {name}</a>;
    }
    return msg;
  };

  const ShowThem = () => {
    (async () => {
      const newVal = !showMembers;
      if (newVal && activeChat?.roomId) {
        try {
          const members = await getRoomMembers(activeChat.roomId);
          setUsersOnline(members.map((m: any) => ({ user_id: m.user_id, user_name: m.user_name })));
        } catch { /* ignore */ }
      }
      setShowMembers(newVal);
    })();
  };

  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomCode, setNewRoomCode] = useState("");

  const createRoom = async () => {
    if (!newRoomName.trim() || !newRoomCode.trim()) return;
    try {
      const room = await apiCreateRoom(newRoomName.trim(), newRoomCode.trim());
      await apiJoinRoom(room.id);
      setRooms((prev) => [...prev, room]);
      setNewRoomName("");
      setNewRoomCode("");
    } catch { }
  };

  const handleAcceptP2P = async (sessionId: string) => {
    const ip = prompt("Enter your Tailscale IP (e.g. 100.x.x.x):");
    if (!ip) return;
    try {
      await acceptP2PSession(sessionId, ip);
      setActiveChat({ id: sessionId, type: "p2p", name: "P2P Chat", p2pSessionId: sessionId });
      setPendingP2P(prev => prev.filter(p => p.session_id !== sessionId));
    } catch (e: unknown) {
      alert((e as any).message || "Error accepting P2P");
    }
  };

  const SidebarContent = () => (
    <div className="all_chats relative flex-1 overflow-y-auto">
      {pendingP2P.length > 0 && (
        <>
          <p className="text-green-400 text-xs font-bold p-1 ml-2">P2P Requests</p>
          {pendingP2P.map((s) => (
            <div key={s.session_id} className="room w-full py-2 border-b border-[#33A1E040] flex items-center justify-between px-2">
              <span className="text-white text-sm">Session {s.session_id.slice(-4)}</span>
              <button onClick={() => handleAcceptP2P(s.session_id)} className="bg-green-600 text-xs px-2 py-1 rounded">Accept</button>
            </div>
          ))}
        </>
      )}

      <p className="text-[#33A1E0] text-xs font-bold p-1 ml-2">Rooms</p>
      {rooms
        .filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .map((room: Room) => (
          <div
            key={room.id}
            className={`room w-full py-2 border-b border-[#33A1E040] cursor-pointer flex items-center
              ${activeChat?.roomId === room.id ? "bg-[#154D7120]" : ""}`}
            onClick={() => {
              apiJoinRoom(room.id).then(() => {
                setActiveChat({ id: room.id, type: "room", name: room.name, roomId: room.id });
              });
            }}
          >
            <p className="text-[#33A1E0] text-sm sm:text-lg lg:text-xl font-bold p-1 ml-2"># {room.name}</p>
          </div>
        ))}

      <p className="text-[#33A1E0] text-xs font-bold p-1 ml-2">Online Users ({usersOnline.length})</p>
      {usersOnline
        .filter(u => u.user_id !== profile?.id && ((u.user_name || u.user_id).toLowerCase().includes(searchQuery.toLowerCase())))
        .map(u => (
          <div key={u.user_id} className="room w-full py-2 border-b border-[#33A1E040] flex items-center justify-between px-2">
            <p className="text-white text-sm truncate w-[60%]">{u.user_name || u.user_id.slice(0, 8)}</p>
            <button
              onClick={async () => {
                try {
                  await requestP2PSession(u.user_id);
                  alert("P2P Request Sent!");
                } catch (e) { alert("Failed to send request"); }
              }}
              className="bg-blue-600 text-white text-xs px-2 py-1 rounded hover:bg-blue-500"
            >
              Connect
            </button>
          </div>
        ))}
      <p className="text-[#33A1E0] text-xs font-bold p-1 ml-2 mt-2">P2P Requests</p>
      {pendingP2P.map((p) => (
        <div
          key={p.session_id}
          className="room w-full py-2 border-b border-[#33A1E040] flex items-center justify-between pr-2"
        >
          <p className="text-[#33A1E0] text-sm p-1 ml-2">{p.initiator_name || "Unknown"}</p>
          <button
            onClick={() => handleAcceptP2P(p.session_id)}
            className="bg-green-600 text-white text-xs px-2 py-1 rounded hover:bg-green-500"
          >
            Accept
          </button>
        </div>
      ))}
    </div>
  );

  if (!isPc) {
    return (
      <div className="flex flex-col h-dvh">
        {activeChat === null && (
          <div className="contact w-full h-full flex flex-col">
            <div className="bar h-[7%] w-full z-10 bg-transparent flex flex-row items-center justify-between">
              <h1 className="h-full flex flex-end justify-center items-center text-4xl font-sans text-[#33A1E0] [text-shadow:_0_2px_4px_#33A1E0] [--tw-text-stroke:1px_#154D71] [text-stroke:var(--tw-text-stroke)] ml-2">
                TalkaNova
              </h1>
              <button
                className="profile w-[12%] h-[75%] bg-no-repeat bg-[url('/TN.svg')] bg-center bg-contain flex justify-end items-center mr-2"
                onClick={() => {
                  if (confirm("Reset Identity? This will clear your guest session.")) {
                    localStorage.clear();
                    location.reload();
                  }
                }}
              />
            </div>

            <SidebarContent />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-dvh">
      <div className="w-[320px] border-r border-[#113045] flex flex-col">
        <div className="p-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl text-[#33A1E0] font-bold">TalkaNova</h1>
            <div className="text-xs text-gray-400">{profile?.user_name || "Guest"}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAuthModal(true)} className="px-2 py-1 rounded bg-gray-700">Set Name</button>
            <button onClick={() => setShowSettings(true)} className="px-2 py-1 rounded bg-gray-700">Settings</button>
          </div>
        </div>
        <div className="p-2">
          <input placeholder="Search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full p-2 rounded bg-[#071722]" />
        </div>
        <SidebarContent />
        <div className="p-3 border-t border-[#113045]">
          <input placeholder="New room name" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} className="w-full p-2 rounded bg-[#071722] mb-2" />
          <input placeholder="Room code (public/private)" value={newRoomCode} onChange={(e) => setNewRoomCode(e.target.value)} className="w-full p-2 rounded bg-[#071722] mb-2" />
          <button onClick={createRoom} className="w-full px-3 py-2 rounded bg-blue-600">Create Room</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="bar h-[8%] p-3 flex items-center justify-between border-b border-[#113045]">
          <div>
            <h2 className="text-lg text-white">{activeChat?.name || "Chat"}</h2>
            <div className="text-xs text-gray-400">{activeChat?.type === "p2p" ? "Peer-to-peer session" : activeChat?.type === "room" ? "Room" : ""}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => ShowThem()} className="px-2 py-1 rounded bg-gray-700">Members</button>
            <label className="px-2 py-1 rounded bg-gray-700 cursor-pointer">
              <input type="file" onChange={handleFileSelect} style={{ display: "none" }} />Upload
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-[#04111a]">
          {activeChat?.type === "p2p" && activeChat.p2pSessionId ? (
            <div className="h-full">
              <P2PChat sessionId={activeChat.p2pSessionId} />
            </div>
          ) : (
            <div>
              {messages.map((m, i) => (
                <div key={i} className="mb-2">
                  <div className="text-xs text-gray-400">{m.user_name} • {new Date(m.timestamp).toLocaleTimeString()}</div>
                  <div className="mt-1 text-white">{renderMessageContent(m.message)}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {activeChat?.type !== "p2p" && (
          <div className="p-3 border-t border-[#113045]">
            <div className="flex gap-2">
              <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} className="flex-1 p-2 rounded bg-[#071722]" placeholder="Message" onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }} />
              <button onClick={sendMessage} className="px-3 py-2 rounded bg-blue-600">Send</button>
            </div>
          </div>
        )}
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showSettings && <div className="fixed right-0 top-0 h-full"><SettingsSidebar onClose={() => setShowSettings(false)} /></div>}
    </div>
  );
}

export default function Chat() {
  const isPc = useIsPc();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [pendingP2P, setPendingP2P] = useState<P2PSession[]>([]);
  const [usersOnline, setUsersOnline] = useState<{user_id:string; user_name?:string}[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  /**
   * SESSION MANAGEMENT
   * Automatically handles Guest Login and Identity Persistence.
   */


  // LoginModal import moved to top

  // ... inside Chat component ...


  // ... inside Chat component ...

  // const [showNamePrompt, setShowNamePrompt] = useState(false); // Removed
  // const [nameInput, setNameInput] = useState(""); // Removed

  const loadInitialData = useCallback(() => {
    getRooms().then(async (rs) => {
      let general = rs.find(r => r.name === "General");
      if (!general) {
        // Create General room if it doesn't exist
        try {
          general = await apiCreateRoom("General", "public");
          rs.push(general);
        } catch { }
      }
      setRooms(rs);

      if (!activeChat && general) {
        await apiJoinRoom(general.id);
        setActiveChat({ id: general.id, type: "room", name: general.name, roomId: general.id });
      } else if (rs.length > 0 && !activeChat) {
        setActiveChat({ id: rs[0].id, type: "room", name: rs[0].name, roomId: rs[0].id });
      }
    }).catch(() => { });
    // No user list in no-auth mode
    getPendingP2PSessions().then(setPendingP2P).catch(() => { });
  }, [activeChat]);

  useEffect(() => {
    // Try authenticated profile first
    (async () => {
      try {
        const me = await authMe();
        // set session identity
        try { sessionStorage.setItem("talkanova_identity", JSON.stringify({ user_id: me.id, user_name: me.display_name || me.email.split("@")[0] })); } catch {}
        setProfile({ id: me.id, user_name: me.display_name || me.email.split("@")[0], email: me.email, pfp_url: null, created_at: new Date().toISOString() });
      } catch {
        // Fallback to ephemeral identity
        const identity = getIdentity();
        if (!identity.user_name) {
          const defaultName = `Guest-${identity.user_id.slice(0, 4)}`;
          setUserName(defaultName);
        }
        setProfile(getLocalProfile());
      }
      loadInitialData();
    })();
  }, [loadInitialData]);

  // handleNameSubmit removed


  // But handleNameSubmit needs it.
  // We add dependency below.

  useEffect(() => {
    if (!profile) return;
    const interval = setInterval(() => {
      getPendingP2PSessions().then(setPendingP2P).catch(() => { });
    }, 5000);
    return () => clearInterval(interval);
  }, [profile]);

  useEffect(() => {
    if (!profile || !activeChat) {
      setUsersOnline([]);
      setMessages([]);
      return;
    }

    // P2P Chat is handled by separate component
    if (activeChat.type === "p2p") return;

    // DM not supported in no-auth mode, only rooms and P2P
    if (activeChat.type === "dm") {
      return;
    }
    if (activeChat.type === "room" && activeChat.roomId) {
      setMessages([]);
      if (wsRef.current) wsRef.current.close();

      try {
        const url = wsGeneralChatUrl(activeChat.roomId);
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "message") {
              setMessages((prev) => [
                ...prev,
                {
                  id: data.sender_id,
                  message: data.content ? roomOpaqueDecode(data.content) : (data.message ? roomOpaqueDecode(data.message) : ""),
                  user_name: data.user_name || "Guest",
                  avatar: data.avatar,
                  timestamp: data.timestamp || new Date().toISOString(),
                },
              ]);
            }
            if (data.type === "room_users" && data.users) {
              // Initial user list for presence (array of {user_id, user_name})
              setUsersOnline(data.users.map((u: { user_id: string; user_name?: string }) => ({ user_id: u.user_id, user_name: u.user_name })));
            }
            if (data.type === "presence" && data.event === "join") {
              setUsersOnline((prev) => (prev.some(p => p.user_id === data.user_id) ? prev : [...prev, { user_id: data.user_id, user_name: data.user_name }]));
            }
            if (data.type === "presence" && data.event === "leave") {
              setUsersOnline((prev) => prev.filter((p) => p.user_id !== data.user_id));
            }
          } catch { }
        };
        ws.onclose = () => setUsersOnline([]);
      } catch (e) {
        console.error("WS Connect error", e);
      }
      return () => {
        wsRef.current?.close();
        wsRef.current = null;
      };
    }
  }, [activeChat, profile]);

  const sendMessage = async () => {
    if (newMessage.trim() === "" || !profile) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "chat", content: roomOpaqueEncode(newMessage) })
      );
      setNewMessage("");
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const res = await uploadFile(file);
        // Send as special formatted message
        const content = `[FILE]:${res.id}:${res.filename}:${res.content_type}`;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({ type: "chat", content: roomOpaqueEncode(content) })
          );
        }
      } catch (err) {
        alert("Upload failed");
      }
    }
  };

  const renderMessageContent = (msg: string) => {
    if (msg.startsWith("[FILE]:")) {
      const parts = msg.split(":");
      const id = parts[1];
      const name = parts[2];
      const type = parts[3];
      const url = `/api/v1/files/${id}`;
      if (type.startsWith("image/")) {
        return <div className="flex flex-col"><Image src={url} alt={name} width={200} height={200} className="rounded mb-1" /><a href={url} download={name} className="text-xs underline text-white">Download {name}</a></div>;
      }
      return <a href={url} download={name} target="_blank" className="text-blue-300 underline flex items-center gap-2">📄 {name}</a>;
    }
    return msg;
  };

  const ShowThem = () => {
    (async () => {
      const newVal = !showMembers;
      if (newVal && activeChat?.roomId) {
        try {
          const members = await getRoomMembers(activeChat.roomId);
          setUsersOnline(members.map((m: any) => ({ user_id: m.user_id, user_name: m.user_name })));
        } catch { /* ignore */ }
      }
      setShowMembers(newVal);
    })();
  };

  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomCode, setNewRoomCode] = useState("");

  const createRoom = async () => {
    if (!newRoomName.trim() || !newRoomCode.trim()) return;
    try {
      const room = await apiCreateRoom(newRoomName.trim(), newRoomCode.trim());
      await apiJoinRoom(room.id);
      setRooms((prev) => [...prev, room]);
      setNewRoomName("");
      setNewRoomCode("");
    } catch { }
  };



  // openDm removed - DMs not supported in no-auth mode

  // startP2P removed as it was unused and implemented in sidebar


  const handleAcceptP2P = async (sessionId: string) => {
    const ip = prompt("Enter your Tailscale IP (e.g. 100.x.x.x):");
    if (!ip) return;
    try {
      await acceptP2PSession(sessionId, ip);
      setActiveChat({ id: sessionId, type: "p2p", name: "P2P Chat", p2pSessionId: sessionId });
      setPendingP2P(prev => prev.filter(p => p.session_id !== sessionId));
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      alert((e as any).message || "Error accepting P2P");
    }
  };

  // Render Sidebar Content (Shared)
  const SidebarContent = () => (
    <div className="all_chats relative flex-1 overflow-y-auto">
      {/* P2P Requests */}
      {pendingP2P.length > 0 && (
        <>
          <p className="text-green-400 text-xs font-bold p-1 ml-2">P2P Requests</p>
          {pendingP2P.map((s) => (
            <div key={s.session_id} className="room w-full py-2 border-b border-[#33A1E040] flex items-center justify-between px-2">
              <span className="text-white text-sm">Session {s.session_id.slice(-4)}</span>
              <button onClick={() => handleAcceptP2P(s.session_id)} className="bg-green-600 text-xs px-2 py-1 rounded">Accept</button>
            </div>
          ))}
        </>
      )}

      <p className="text-[#33A1E0] text-xs font-bold p-1 ml-2">Rooms</p>
      {rooms
        .filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .map((room: Room) => (
          <div
            key={room.id}
            className={`room w-full py-2 border-b border-[#33A1E040] cursor-pointer flex items-center
              ${activeChat?.roomId === room.id ? "bg-[#154D7120]" : ""}`}
            onClick={() => {
              apiJoinRoom(room.id).then(() => {
                setActiveChat({ id: room.id, type: "room", name: room.name, roomId: room.id });
              });
            }}
          >
            <p className="text-[#33A1E0] text-sm sm:text-lg lg:text-xl font-bold p-1 ml-2"># {room.name}</p>
          </div>
        ))}

      {/* Online Users Section */}
      <p className="text-[#33A1E0] text-xs font-bold p-1 ml-2">Online Users ({usersOnline.length})</p>
      {usersOnline
        .filter(u => u.user_id !== profile?.id && ((u.user_name || u.user_id).toLowerCase().includes(searchQuery.toLowerCase())))
        .map(u => (
          <div key={u.user_id} className="room w-full py-2 border-b border-[#33A1E040] flex items-center justify-between px-2">
            <p className="text-white text-sm truncate w-[60%]">{u.user_name || u.user_id.slice(0, 8)}</p>
            <button
              onClick={async () => {
                try {
                  await requestP2PSession(u.user_id);
                  alert("P2P Request Sent!");
                } catch (e) { alert("Failed to send request"); }
              }}
              className="bg-blue-600 text-white text-xs px-2 py-1 rounded hover:bg-blue-500"
            >
              Connect
            </button>
          </div>
        ))}
      {/* P2P Pending Section */}
      <p className="text-[#33A1E0] text-xs font-bold p-1 ml-2 mt-2">P2P Requests</p>
      {pendingP2P.map((p) => (
        <div
          key={p.session_id}
          className="room w-full py-2 border-b border-[#33A1E040] flex items-center justify-between pr-2"
        >
          <p className="text-[#33A1E0] text-sm p-1 ml-2">{p.initiator_name || "Unknown"}</p>
          <button
            onClick={() => handleAcceptP2P(p.session_id)}
            className="bg-green-600 text-white text-xs px-2 py-1 rounded hover:bg-green-500"
          >
            Accept
          </button>
        </div>
      ))}
    </div>
  );


  if (!isPc) {
    return (
      <div className="flex flex-col h-dvh">
        {activeChat === null && (
          <div className="contact w-full h-full flex flex-col">
            <div className="bar h-[7%] w-full z-10 bg-transparent flex flex-row items-center justify-between">
              <h1 className="h-full flex flex-end justify-center items-center text-4xl font-sans text-[#33A1E0] [text-shadow:_0_2px_4px_#33A1E0] [--tw-text-stroke:1px_#154D71] [text-stroke:var(--tw-text-stroke)] ml-2">
                TalkaNova
              </h1>
              <button
                className="profile w-[12%] h-[75%] bg-no-repeat bg-[url('/TN.svg')] bg-center bg-contain flex justify-end items-center mr-2"
                onClick={() => {
                  if (confirm("Reset Identity? This will clear your guest session.")) {
                    localStorage.clear();
                    location.reload();
                  }
                }}
              />
            </div>

            <SidebarContent />

