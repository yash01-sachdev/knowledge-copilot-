"use client";

import { useEffect, useRef, useState } from "react";

import { askQuestion, listNotes, submitFeedback } from "@/lib/api";
import type { QueryMode, QueryResponse } from "@/lib/types";
import { AnswerPanel } from "./answer-panel";

const SUGGESTIONS = [
  "What should I focus on this week?",
  "What are my recurring productivity patterns?",
  "How has my thinking on interview prep changed?",
  "What usually helps me recover momentum?",
];

type StatusState = {
  tone: "error" | "success";
  message: string;
} | null;

function getStatusClassName(tone: "error" | "success") {
  return tone === "error" ? "text-rose-300" : "text-emerald-300";
}

export function AskWorkspace() {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<QueryMode>("fast");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [answer, setAnswer] = useState<QueryResponse | null>(null);
  const [noteCount, setNoteCount] = useState<number>(0);
  const [busy, setBusy] = useState<"idle" | "query" | "feedback">("idle");
  const [feedbackState, setFeedbackState] = useState<"idle" | "sending" | "saved">("idle");
  const [status, setStatus] = useState<StatusState>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const notes = await listNotes();
        setNoteCount(notes.length);
      } catch {
        setStatus({
          tone: "error",
          message: "Could not reach the notes API. Start the backend first.",
        });
      }
    })();
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(148, textarea.scrollHeight)}px`;
  }, [question]);

  async function handleAsk() {
    const trimmedQuestion = question.trim();

    if (trimmedQuestion.length < 5) {
      setAnswer(null);
      setSubmittedQuestion("");
      setFeedbackState("idle");
      setStatus({
        tone: "error",
        message: "Ask with a topic, phrase, or event that actually appears in your notes.",
      });
      return;
    }

    setBusy("query");
    setFeedbackState("idle");
    setStatus(null);

    try {
      const nextAnswer = await askQuestion(trimmedQuestion, mode);
      setAnswer(nextAnswer);
      setSubmittedQuestion(trimmedQuestion);

      if (nextAnswer.insufficient_evidence || nextAnswer.citations.length === 0) {
        setStatus({
          tone: "error",
          message: "No notes linked strongly enough to that question yet.",
        });
      }
    } catch (error) {
      setAnswer(null);
      setSubmittedQuestion("");
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not run the query.",
      });
    } finally {
      setBusy("idle");
    }
  }

  async function handleFeedback(useful: boolean) {
    if (!answer) {
      return;
    }

    setFeedbackState("sending");

    try {
      await submitFeedback({ question: submittedQuestion, answer: answer.answer, useful });
      setFeedbackState("saved");
      setStatus({
        tone: "success",
        message: "Feedback saved for future tuning.",
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not save feedback.",
      });
      setFeedbackState("idle");
    }
  }

  return (
    <main className="page-frame flex flex-1 justify-center px-4 pb-20 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <div className="w-full max-w-[860px]">
        <section className="text-center">
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-[3.2rem]">
            Knowledge Copilot
          </h1>
          <p className="mt-3 text-lg leading-8 text-muted sm:text-xl">
            Ask questions grounded in your personal notes
          </p>
        </section>

        <section className="mt-14">
          <div className="kicker">Ask your notes</div>

          <div className="mt-4 overflow-hidden rounded-[28px] border border-white/8 bg-[rgba(10,18,17,0.64)] shadow-[0_22px_60px_rgba(1,6,14,0.24)]">
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              placeholder="What should I focus on this week?"
              className="field-textarea min-h-[148px] resize-none rounded-none border-0 bg-transparent px-6 py-5 text-[1.15rem] leading-9 text-foreground shadow-none placeholder:text-[rgba(150,168,188,0.36)] focus:bg-transparent focus:shadow-none"
            />
          </div>

          <div className="mt-4 overflow-x-auto pb-2">
            <div className="mb-4 flex gap-2">
              {(["fast", "quality"] as const).map((item) => {
                const active = mode === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMode(item)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-[rgba(65,214,147,0.14)] text-foreground shadow-[inset_0_0_0_1px_rgba(65,214,147,0.24)]"
                        : "border border-white/8 bg-white/[0.02] text-muted hover:text-foreground"
                    }`}
                  >
                    {item === "fast" ? "Fast mode" : "Quality mode"}
                  </button>
                );
              })}
            </div>

            <div className="flex min-w-max gap-3">
              {SUGGESTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setQuestion(item)}
                  className="button-ghost whitespace-nowrap px-5 py-3 text-[1.05rem] leading-7 text-foreground/85"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            aria-label="Ask notes"
            onClick={() => void handleAsk()}
            disabled={busy !== "idle"}
            className="button-primary mt-5 flex w-full items-center justify-center gap-3 rounded-[22px] px-6 py-4 text-[1.2rem] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>{busy === "query" ? "Searching notes..." : "Ask my notes"}</span>
            <span aria-hidden="true" className="text-[1.5rem] leading-none">
              →
            </span>
          </button>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm leading-7 text-muted">
            <div>
              <span className="text-foreground/85">Indexed notes</span>: {noteCount}
            </div>
            <div>
              {mode === "fast"
                ? "Fast mode keeps the local heuristic writer for speed."
                : "Quality mode uses Ollama answer writing and deeper reranking."}
            </div>
          </div>

          {status ? (
            <p className={`mt-4 text-sm leading-7 ${getStatusClassName(status.tone)}`}>{status.message}</p>
          ) : null}
        </section>

        <div className="mt-16">
          <AnswerPanel
            answer={answer}
            question={submittedQuestion}
            feedbackState={feedbackState}
            onFeedback={(useful) => void handleFeedback(useful)}
          />
        </div>
      </div>
    </main>
  );
}
