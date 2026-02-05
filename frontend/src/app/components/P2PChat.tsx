"use client";
import { useEffect, useRef, useState } from "react";
import {
  getP2PSessionStatus,
  sendP2POffer,
  sendP2PAnswer,
  sendP2PIceCandidate,
  closeP2PSession,
} from "../lib/api";
import { generateKeyPair, encrypt, decrypt } from "../lib/crypto";

type Props = { sessionId?: string };

export default function P2PChat({ sessionId }: Props) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const [messages, setMessages] = useState<{ id: string; text: string }[]>([]);
  const [text, setText] = useState("");
  const myKeys = useRef<{ publicKeyB64: string; secretKey: Uint8Array } | null>(null);
  const remotePub = useRef<string | null>(null);

  useEffect(() => {
    // generate ephemeral keypair
    myKeys.current = generateKeyPair();
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    const dc = pc.createDataChannel("chat");
    dcRef.current = dc;

    dc.onopen = () => {
      // send our public key
      if (myKeys.current) {
        dc.send(JSON.stringify({ type: "pubkey", data: myKeys.current.publicKeyB64 }));
      }
    };

    dc.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "pubkey") {
          remotePub.current = d.data;
          setMessages((m) => [...m, { id: "sys", text: "Peer public key received" }]);
        }
        if (d.type === "msg") {
          // attempt decrypt
          const fromPub = d.fromPublicKey;
          const ciphertext = d.data;
          if (myKeys.current) {
            try {
              const plain = decrypt(ciphertext, fromPub, myKeys.current.secretKey);
              setMessages((m) => [...m, { id: "peer", text: plain }]);
            } catch (e) {
              // fallback to raw
              setMessages((m) => [...m, { id: "peer", text: "[encrypted]" }]);
            }
          }
        }
      } catch (e) {}
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        // send ICE candidate to server
        sendP2PIceCandidate(sessionId, JSON.stringify(ev.candidate), ev.candidate.sdpMid ?? null, ev.candidate.sdpMLineIndex ?? null).catch(() => {});
      }
    };

    // Create offer and send to server
    (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendP2POffer(sessionId, offer.sdp || "");

        // poll for answer and ICE candidates
        const poll = setInterval(async () => {
          try {
            const status = await getP2PSessionStatus(sessionId);
            if (status.answer_sdp && pc.remoteDescription === null) {
              const ans = { type: "answer", sdp: status.answer_sdp } as RTCSdpType & { sdp?: string };
              await pc.setRemoteDescription({ type: "answer", sdp: status.answer_sdp } as RTCSessionDescriptionInit);
            }
            if (status.ice && Array.isArray(status.ice)) {
              for (const c of status.ice) {
                try {
                  await pc.addIceCandidate(c);
                } catch (e) {}
              }
            }
            if (status.state === "connected") {
              clearInterval(poll);
            }
          } catch (e) {}
        }, 2000);
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      dc.close();
      pc.close();
      pcRef.current = null;
      dcRef.current = null;
      try { closeP2PSession(sessionId); } catch {}
    };
  }, [sessionId]);

  const send = () => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open" || !myKeys.current) return;
    if (!remotePub.current) {
      alert("Remote public key not known yet");
      return;
    }
    const ciphertext = encrypt(text, remotePub.current, myKeys.current.secretKey);
    dc.send(JSON.stringify({ type: "msg", data: ciphertext, fromPublicKey: myKeys.current.publicKeyB64 }));
    setMessages((m) => [...m, { id: "me", text }]);
    setText("");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2">
        {messages.map((m, i) => (
          <div key={i} className={`p-2 my-1 ${m.id === "me" ? "text-right" : "text-left"}`}>
            <div className="inline-block bg-[#154D71] px-3 py-2 rounded">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="p-2 flex gap-2">
        <input className="flex-1 p-2 bg-[#0b1220] rounded" value={text} onChange={(e) => setText(e.target.value)} />
        <button onClick={send} className="bg-blue-600 px-3 py-2 rounded">Send</button>
      </div>
    </div>
  );
}

