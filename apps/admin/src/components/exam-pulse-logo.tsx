type ExamPulseLogoProps = {
  className?: string;
};

export function ExamPulseLogo({ className = "" }: ExamPulseLogoProps) {
  return (
    <div className={`exam-pulse-logo ${className}`.trim()} aria-label="ExamPulse">
      <span className="exam-pulse-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64" focusable="false">
          <rect x="0" y="0" width="64" height="64" rx="16" />
          <polyline points="6,32 18,32 26,12 36,52 44,22 52,32 58,32" />
        </svg>
      </span>
      <span className="exam-pulse-word">
        Exam<span>Pulse</span>
      </span>
    </div>
  );
}
