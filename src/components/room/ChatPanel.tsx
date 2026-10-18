"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useT } from "@/i18n";
import type { ChatMessage } from "@/lib/firebase/types";
import { MESSAGE_MAX } from "@/lib/sanitize";
import { IconSend } from "../ui/icons";
import { SidePanel } from "./SidePanel";

export function ChatPanel({
  open,
  onClose,
  messages,
  me,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  me: string;
  onSend: (text: string) => Promise<void>;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={t("chat.title")}
      footer={
        <form onSubmit={submit} className="flex gap-2">
          <label className="sr-only" htmlFor="chat-input">
            {t("chat.placeholder")}
          </label>
          <input
            id="chat-input"
            value={text}
            maxLength={MESSAGE_MAX}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("chat.placeholder")}
            autoComplete="off"
            enterKeyHint="send"
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-white px-4"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            aria-label={t("chat.send")}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-50"
          >
            <IconSend />
          </button>
        </form>
      }
    >
      {messages.length === 0 ? (
        <p className="p-6 text-center text-ink-mute">{t("chat.empty")}</p>
      ) : (
        <ol ref={list} aria-live="polite" className="flex max-h-full flex-col gap-2 overflow-y-auto p-4">
          {messages.map((m) => {
            const mine = m.u === me;
            return (
              <li key={m.id} className={`flex max-w-[85%] flex-col ${mine ? "self-end items-end" : "self-start"}`}>
                {!mine && (
                  <span className="mb-0.5 px-1 text-xs font-bold" style={{ color: m.c }}>
                    {m.n}
                  </span>
                )}
                <span
                  className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                    mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-paper-2"
                  }`}
                >
                  {m.t}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </SidePanel>
  );
}
