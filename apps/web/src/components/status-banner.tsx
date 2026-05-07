type StatusBannerProps = {
  tone: "default" | "error" | "success";
  message: string;
};

export function StatusBanner({ tone, message }: StatusBannerProps) {
  const className =
    tone === "error"
      ? "border-rose-500/20 bg-[linear-gradient(135deg,rgba(255,146,139,0.14),rgba(255,255,255,0.02))] text-rose-100"
      : tone === "success"
        ? "border-emerald-500/20 bg-[linear-gradient(135deg,rgba(88,209,170,0.14),rgba(255,255,255,0.02))] text-emerald-100"
        : "border-white/8 bg-[linear-gradient(135deg,rgba(131,225,197,0.08),rgba(255,255,255,0.02))] text-muted";

  return (
    <div
      className={`rounded-[24px] border px-5 py-4 text-base leading-8 shadow-[0_18px_44px_rgba(1,6,14,0.18)] ${className}`}
    >
      {message}
    </div>
  );
}
