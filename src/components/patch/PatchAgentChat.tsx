"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChatIcon, PlusIcon, SearchIcon } from "@/components/patch/PatchPanelIcons";
import { loadSproutChatMessages, saveSproutChatMessages, SproutChatMessage } from "@/lib/sproutChatPersistence";

interface PatchAgentChatProps {
  projectId: string;
  onShowInspector: () => void;
}

export function PatchAgentChat(props: PatchAgentChatProps) {
  const [messages, setMessages] = useState<SproutChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [authNoticeVisible, setAuthNoticeVisible] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
        <p>OpenAI connection is waiting on a secure token endpoint.</p>
        <button type="button" onClick={() => setAuthNoticeVisible(true)}>
          Connect OpenAI
        </button>
        {authNoticeVisible && (
          <p className="muted">
            A browser-only OpenAI API key or durable token would be exposed to client code. Sprout needs a small
            server-side token broker before account sign-in can be safely enabled.
          </p>
        )}
      </div>

      {storageError && <p className="error">Chat storage failed: {storageError}</p>}

      <div className="patch-agent-message-list" ref={messageListRef}>
        {!loaded && <p className="muted">Loading chat...</p>}
        {loaded && messages.length === 0 && (
          <p className="muted">Start a new patch conversation once OpenAI connection is configured.</p>
        )}
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
          disabled
          rows={3}
          placeholder="Connect OpenAI to message Sprout"
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <button type="submit" disabled>
          Send
        </button>
      </form>
    </aside>
  );
}
