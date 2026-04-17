"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { askQuestion, listNotes, submitFeedback } from "@/lib/api";
import type { QueryResponse } from "@/lib/types";
import { AnswerPanel } from "./answer-panel";
import { StatusBanner } from "./status-banner";

const SUGGESTIONS = [
  "What patterns keep repeating in my notes?",
  "Based on my old notes, what usually helps me recover momentum?",
  "What have I written about interview prep lately?",
];

export function AskWorkspace() {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [answer, setAnswer] = useState<QueryResponse | null>(null);
  const [noteCount, setNoteCount] = useState<number>(0);
  const [busy, setBusy] = useState<"idle" | "query" | "feedback">("idle");
  const [feedbackState, setFeedbackState] = useState<"idle" | "sending" | "saved">("idle");
  const [status, setStatus] = useState<{ tone: "default" | "error" | "success"; message: string } | null>({
    tone: "default",
    message: "Ask tightly. The answer page is for grounded responses, and the memory page is for the bigger picture.",
  });

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

  async function handleAsk() {
    const trimmedQuestion = question.trim();

    if (trimmedQuestion.length < 5) {
      setAnswer(null);
      setSubmittedQuestion("");
      setFeedbackState("idle");
      setStatus({
        tone: "error",
        message: "No grounded answer yet. Ask with a topic, phrase, or event that actually appears in your notes.",
      });
      return;
    }

    setBusy("query");
    setFeedbackState("idle");
    try {
      const nextAnswer = await askQuestion(trimmedQuestion);
      setAnswer(nextAnswer);
      setSubmittedQuestion(trimmedQuestion);
      setStatus(
        nextAnswer.insufficient_evidence || nextAnswer.citations.length === 0
          ? {
              tone: "error",
              message:
                "No notes linked strongly enough to that question yet. Try a phrase or topic that actually appears in your notes.",
            }
          : {
              tone: "success",
              message: "Answer generated from ranked note evidence.",
            },
      );
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
      await submitFeedback({ question, answer: answer.answer, useful });
      setFeedbackState("saved");
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not save feedback.",
      });
      setFeedbackState("idle");
    }
  }

  return (
    <main className="page-frame flex flex-1 flex-col gap-5">
      <section className="panel relative overflow-hidden rounded-[32px] px-6 py-6 sm:px-7 lg:px-8">
        <div className="pointer-events-none absolute -left-8 bottom-0 h-40 w-40 rounded-full bg-warm-soft blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-accent-soft blur-3xl" />

        <div className="relative grid gap-6 xl:grid-cols-[1.08fr_0.92fr] xl:items-end">
          <div className="max-w-3xl">
            <div className="kicker">Ask</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-[3.2rem]">
              Ask one sharp question and keep the answer tied to your actual notes.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted">
              This page is for grounded recall, not vague brainstorming. Pull out specific moments,
              topics, and decisions from your note base with ranked evidence and citations.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="metric-card px-4 py-4">
              <div className="kicker">Indexed notes</div>
              <div className="mt-3 text-3xl font-semibold text-foreground">{noteCount}</div>
              <p className="mt-2 text-sm leading-6 text-muted">available for retrieval right now</p>
            </div>
            <div className="metric-card px-4 py-4">
              <div className="kicker">Answer style</div>
              <div className="mt-3 text-lg font-semibold text-foreground">Grounded only</div>
              <p className="mt-2 text-sm leading-6 text-muted">weak evidence should stay weak</p>
            </div>
            <Link
              href="/memory"
              prefetch={false}
              className="panel-soft rounded-[24px] px-4 py-4 transition hover:-translate-y-0.5 hover:border-accent/30 hover:bg-white/[0.04]"
            >
              <div className="kicker">Context</div>
              <div className="mt-3 text-lg font-semibold text-foreground">Open memory view</div>
              <p className="mt-2 text-sm leading-6 text-muted">timeline, note links, and recurring themes</p>
            </Link>
          </div>
        </div>
      </section>

      {status ? <StatusBanner tone={status.tone} message={status.message} /> : null}

      <section className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="panel flex flex-col rounded-[30px] p-6">
          <div className="kicker">Query composer</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">Frame the question</h2>
          <p className="mt-3 text-sm leading-7 text-muted">
            Use one concrete topic, phrase, or event. If your notes never mention it, the answer
            should say so instead of making something up.
          </p>

          <label className="mt-6 block">
            <span className="kicker">Question</span>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={8}
              placeholder="What should I focus on this week based on my notes?"
              className="field-textarea mt-2 px-4 py-4 text-sm leading-7"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setQuestion(item)}
                className="button-ghost px-3 py-1.5 text-xs"
              >
                {item}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleAsk()}
            disabled={busy !== "idle"}
            className="button-primary mt-6 px-4 py-3 text-sm disabled:opacity-60"
          >
            {busy === "query" ? "Searching notes..." : "Ask notes"}
          </button>

          <div className="mt-4 rounded-[24px] border border-white/8 bg-black/10 px-4 py-4">
            <div className="kicker">Reminder</div>
            <p className="mt-3 text-sm leading-7 text-muted">
              If you want broader patterns instead of one answer, jump to the memory page. The ask
              page is intentionally narrow.
            </p>
          </div>
        </aside>

        <div className="flex flex-col gap-5">
          <AnswerPanel
            answer={answer}
            question={submittedQuestion}
            feedbackState={feedbackState}
            onFeedback={(useful) => void handleFeedback(useful)}
          />
        </div>
      </section>
    </main>
  );
}
