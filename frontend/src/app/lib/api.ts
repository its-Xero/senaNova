const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

function getIdentity(): { user_id: string; user_name?: string } {
  try {
    const raw = sessionStorage.getItem("talkanova_identity");
    if (raw) return JSON.parse(raw);
  } catch {}
  // create ephemeral
  const id = cryptoRandomId();
  const obj = { user_id: id, user_name: `Guest-${id.slice(0, 4)}` };
  try { sessionStorage.setItem("talkanova_identity", JSON.stringify(obj)); } catch {}
  return obj;
}

function setUserName(name: string) {
  const id = getIdentity();
  id.user_name = name;
  try { sessionStorage.setItem("talkanova_identity", JSON.stringify(id)); } catch {}
}

function clearIdentity() {
  try { sessionStorage.removeItem("talkanova_identity"); } catch {}
}

function getLocalProfile() {
  const id = getIdentity();
  return { id: id.user_id, user_name: id.user_name || id.user_id.slice(0, 6), email: "", pfp_url: null, created_at: new Date().toISOString() };
}

function cryptoRandomId() {
  // small helper to generate short id
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) return (crypto as any).randomUUID();
  return Math.random().toString(36).slice(2, 10);
}

async function getRooms() {
  const res = await fetch(`${API_BASE}/api/v1/rooms`);
  if (!res.ok) throw new Error("Failed to list rooms");
  return res.json();
}

async function createRoom(name: string, code = "") {
  const res = await fetch(`${API_BASE}/api/v1/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, code }) });
  if (!res.ok) throw new Error("Failed to create room");
  return res.json();
}

async function joinRoom(roomId: string) {
  const res = await fetch(`${API_BASE}/api/v1/rooms/${roomId}/join`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to join room");
  return res.json();
}

function wsGeneralChatUrl(roomId: string) {
  const id = getIdentity();
  const proto = (typeof window !== "undefined" && window.location.protocol === "https:") ? "wss" : "ws";
  const host = (typeof window !== "undefined") ? window.location.host : "localhost:8000";
  const base = `${proto}://${host}/ws/general`;
  const params = new URLSearchParams({ room_id: roomId, user_id: id.user_id, name: id.user_name || "Guest" });
  return `${base}?${params.toString()}`;
}

async function getPendingP2PSessions() {
  const id = getIdentity();
  const res = await fetch(`${API_BASE}/api/v1/p2p/pending`, { headers: { "X-User-ID": id.user_id } });
  if (!res.ok) return [];
  return res.json();
}

async function requestP2PSession(targetUserId: string) {
  const id = getIdentity();
  const res = await fetch(`${API_BASE}/api/v1/p2p/request`, { method: "POST", headers: { "Content-Type": "application/json", "X-User-ID": id.user_id }, body: JSON.stringify({ target_user_id: targetUserId, user_id: id.user_id, user_name: id.user_name }) });
  if (!res.ok) throw new Error("Failed to request P2P session");
  return res.json();
}

async function acceptP2PSession(sessionId: string, tailscaleIp: string) {
  const id = getIdentity();
  const res = await fetch(`${API_BASE}/api/v1/p2p/accept`, { method: "POST", headers: { "Content-Type": "application/json", "X-User-ID": id.user_id }, body: JSON.stringify({ session_id: sessionId, tailscale_ip: tailscaleIp, user_id: id.user_id }) });
  if (!res.ok) throw new Error("Failed to accept P2P session");
  return res.json();
}

async function getP2PSessionStatus(sessionId: string) {
  const id = getIdentity();
  const res = await fetch(`${API_BASE}/api/v1/p2p/session/${sessionId}`, { headers: { "X-User-ID": id.user_id } });
  if (!res.ok) throw new Error("Failed to get session");
  return res.json();
}

async function sendP2POffer(sessionId: string, sdp: string) {
  const id = getIdentity();
  const res = await fetch(`${API_BASE}/api/v1/p2p/signal/offer`, { method: "POST", headers: { "Content-Type": "application/json", "X-User-ID": id.user_id }, body: JSON.stringify({ session_id: sessionId, sdp, type: "offer" }) });
  if (!res.ok) throw new Error("Failed to send offer");
  return res.json();
}

async function sendP2PAnswer(sessionId: string, sdp: string) {
  const id = getIdentity();
  const res = await fetch(`${API_BASE}/api/v1/p2p/signal/answer`, { method: "POST", headers: { "Content-Type": "application/json", "X-User-ID": id.user_id }, body: JSON.stringify({ session_id: sessionId, sdp, type: "answer" }) });
  if (!res.ok) throw new Error("Failed to send answer");
  return res.json();
}

async function sendP2PIceCandidate(sessionId: string, candidate: string, sdpMid: string | null, sdpMLineIndex: number | null) {
  const id = getIdentity();
  const res = await fetch(`${API_BASE}/api/v1/p2p/signal/ice`, { method: "POST", headers: { "Content-Type": "application/json", "X-User-ID": id.user_id }, body: JSON.stringify({ session_id: sessionId, candidate, sdp_mid: sdpMid, sdp_m_line_index: sdpMLineIndex }) });
  if (!res.ok) throw new Error("Failed to send ICE candidate");
  return res.json();
}

async function closeP2PSession(sessionId: string) {
  const res = await fetch(`${API_BASE}/api/v1/p2p/close/${sessionId}`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to close session");
  return res.json();
}

async function getRoomMembers(roomId: string) {
  const res = await fetch(`${API_BASE}/api/v1/rooms/${roomId}/members`);
  if (!res.ok) throw new Error("Failed to get room members");
  return res.json();
}

async function uploadFile(file: File) {
  const id = getIdentity();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}/api/v1/files`, { method: "POST", body: fd, headers: { "X-User-ID": id.user_id } });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

async function deleteFile(fileId: string) {
  const id = getIdentity();
  const res = await fetch(`${API_BASE}/api/v1/files/${fileId}`, { method: "DELETE", headers: { "X-User-ID": id.user_id } });
  if (!res.ok) throw new Error("Delete failed");
  return res.json();
}

async function deleteMessage(messageId: string) {
  const id = getIdentity();
  const res = await fetch(`${API_BASE}/api/v1/messages/${messageId}`, { method: "DELETE", headers: { "X-User-ID": id.user_id } });
  if (!res.ok) throw new Error("Delete failed");
  return res.json();
}

async function reportMessage(messageId: string, reason = "") {
  const res = await fetch(`${API_BASE}/api/v1/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message_id: messageId, reason }) });
  if (!res.ok) throw new Error("Report failed");
  return res.json();
}

async function authMe() {
  const token = localStorage.getItem("talkanova_access_token");
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${API_BASE}/api/v1/auth/me`, { headers: { "Authorization": `Bearer ${token}` } });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

async function signup(email: string, password: string, display_name?: string) {
  const res = await fetch(`${API_BASE}/api/v1/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, display_name }) });
  if (!res.ok) throw new Error("Signup failed");
  return res.json();
}

async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error("Login failed");
  return res.json();
}

async function forgotPassword(email: string) {
  const res = await fetch(`${API_BASE}/api/v1/auth/forgot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function resetPassword(token: string, newPassword: string) {
  const res = await fetch(`${API_BASE}/api/v1/auth/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, new_password: newPassword }) });
  if (!res.ok) throw new Error("Reset failed");
  return res.json();
}

async function confirmEmail(token: string) {
  const res = await fetch(`${API_BASE}/api/v1/auth/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
  if (!res.ok) throw new Error("Confirm failed");
  return res.json();
}

export {
  getIdentity,
  setUserName,
  clearIdentity,
  getLocalProfile,
  getRooms,
  createRoom,
  joinRoom,
  wsGeneralChatUrl,
  getPendingP2PSessions,
  requestP2PSession,
  acceptP2PSession,
  getP2PSessionStatus,
  sendP2POffer,
  sendP2PAnswer,
  sendP2PIceCandidate,
  closeP2PSession,
  getRoomMembers,
  uploadFile,
  deleteFile,
  deleteMessage,
  reportMessage,
  authMe,
  signup,
  login,
  forgotPassword,
  resetPassword,
  confirmEmail,
};
