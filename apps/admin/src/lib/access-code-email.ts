export function buildAccessCodeMailto(email: string, accessCode: string) {
  const subject = "ExamPulse access code";
  const body = [
    "Hello,",
    "",
    "Your ExamPulse invigilator access code is:",
    "",
    accessCode,
    "",
    "Use this code in the mobile app to access your assigned exam rooms.",
    "",
    "If this code does not work, contact the exam administrator for a new code."
  ].join("\n");

  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}
