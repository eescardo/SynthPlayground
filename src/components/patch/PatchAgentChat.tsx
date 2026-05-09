"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChatIcon, PlusIcon, SearchIcon } from "@/components/patch/PatchPanelIcons";
import { loadSproutChatMessages, saveSproutChatMessages, SproutChatMessage } from "@/lib/sproutChatPersistence";

interface PatchAgentChatProps {
  projectId: string;
  onShowInspector: () => void;
}

type SproutConnectionState = "checking" | "configured" | "missing";

const createMessageId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sprout_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

export function PatchAgentChat(props: PatchAgentChatProps) {
  const [messages, setMessages] = useState<SproutChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [connectionState, setConnectionState] = useState<SproutConnectionState>("checking");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [authNoticeVisible, setAuthNoticeVisible] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const chatReady = loaded && connectionState === "configured" && !sending;

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setStorageError(null);
    void loadSproutChatMessages(props.projectId)
      .then((nextMessages) => {
        if (!cancelled) {
          setMessages(nextMessages);
          setLoaded(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStorageError((error as Error).message);
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [props.projectId]);

  useEffect(() => {
    let cancelled = false;
    setConnectionState("checking");
    void fetch("/api/sprout/chat")
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { configured?: unknown } | null;
        if (!cancelled) {
          setConnectionState(response.ok && payload?.configured === true ? "configured" : "missing");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConnectionState("missing");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    void saveSproutChatMessages(props.projectId, messages).catch((error) => {
      setStorageError((error as Error).message);
    });
  }, [loaded, messages, props.projectId]);

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight });
  }, [messages.length]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !chatReady) {
      return;
    }

    const userMessage: SproutChatMessage = {
      id: createMessageId(),
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setSending(true);
    setChatError(null);

    try {
      const response = await fetch("/api/sprout/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ messages: nextMessages })
      });
      const payload = (await response.json().catch(() => null)) as { content?: unknown; error?: unknown } | null;
      if (!response.ok || typeof payload?.content !== "string") {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Sprout did not return a response.");
      }
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content: payload.content as string,
          createdAt: new Date().toISOString()
        }
      ]);
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setDraft("");
    setAuthNoticeVisible(false);
  };

  return (
    <aside className="patch-inspector patch-agent-chat" aria-label="Sprout chat">
      <div className="patch-panel-titlebar">
        <span className="patch-panel-mode-icon active" title="Sprout" aria-label="Sprout chat active">
          <ChatIcon />
        </span>
        <h3>Sprout</h3>
        <div className="patch-panel-title-actions">
          <button
            type="button"
            className="patch-panel-icon-button"
            title="New chat"
            aria-label="New chat"
            onClick={startNewChat}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="patch-panel-icon-button"
            title="Show inspector"
            aria-label="Show inspector"
            onClick={props.onShowInspector}
          >
            <SearchIcon />
          </button>
        </div>
      </div>

      <div className="patch-agent-auth-card">
        {connectionState === "configured" ? (
          <p>OpenAI is connected through the local server environment.</p>
        ) : (
          <>
            <p>OpenAI connection is waiting on a server-side API key.</p>
            <button type="button" onClick={() => setAuthNoticeVisible(true)}>
              Configure OpenAI
            </button>
          </>
        )}
        {authNoticeVisible && connectionState !== "configured" && (
          <p className="muted">
            Add <code>OPENAI_API_KEY</code> to <code>.env.local</code> and restart the dev server. The key stays on the
            server route and is never saved to IndexedDB or project JSON.
          </p>
        )}
      </div>

      {storageError && <p className="error">Chat storage failed: {storageError}</p>}
      {chatError && <p className="error">Sprout failed: {chatError}</p>}

      <div className="patch-agent-message-list" ref={messageListRef}>
        {!loaded && <p className="muted">Loading chat...</p>}
        {loaded && messages.length === 0 && <p className="muted">Start a new patch conversation with Sprout.</p>}
        {messages.map((message) => (
          <div key={message.id} className={`patch-agent-message-row ${message.role}`}>
            <div className="patch-agent-message-bubble">
              <p>{message.content}</p>
            </div>
          </div>
        ))}
      </div>

      <form className="patch-agent-composer" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          disabled={!chatReady}
          rows={3}
          placeholder={connectionState === "configured" ? "Message Sprout" : "Set OPENAI_API_KEY to message Sprout"}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <button type="submit" disabled={!chatReady || draft.trim().length === 0}>
          {sending ? "Sending" : "Send"}
        </button>
      </form>
    </aside>
  );
}
