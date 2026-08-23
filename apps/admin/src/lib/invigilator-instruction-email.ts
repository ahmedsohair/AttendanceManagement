import { Resend } from "resend";
import type { ExamSession, Room, User } from "@algo-attendance/shared";

type InstructionEmailInput = {
  accessCode: string;
  appBaseUrl: string;
  invigilator: User;
  rooms: Room[];
  session: ExamSession;
};

const scannerPath = "/scan";

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

function scannerUrl(appBaseUrl: string) {
  return `${appBaseUrl.replace(/\/$/, "")}${scannerPath}`;
}

function buildRoomList(rooms: Room[]) {
  return rooms.map((room) => `- ${room.code}${room.displayName !== room.code ? ` (${room.displayName})` : ""}`).join("\n");
}

function buildInstructionText({
  accessCode,
  appBaseUrl,
  invigilator,
  rooms,
  session
}: InstructionEmailInput) {
  return [
    `Hello ${invigilator.fullName || "Invigilator"},`,
    "",
    `You have been assigned to ${session.name}.`,
    `Date: ${session.examDate}`,
    `Time: ${session.startTime}`,
    "",
    "Assigned room(s):",
    buildRoomList(rooms),
    "",
    `Scanner link: ${scannerUrl(appBaseUrl)}`,
    `Your invigilator code: ${accessCode}`,
    "",
    "Open the scanner link, enter your code, allow camera access, and wait 20-40 seconds for OCR to load on first use.",
    "",
    "If this code does not work, contact the exam administrator."
  ].join("\n");
}

function buildInstructionHtml(input: InstructionEmailInput) {
  const text = buildInstructionText(input)
    .split("\n")
    .map((line) => line || "&nbsp;")
    .join("<br />");

  return `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">${text}</div>`;
}

export async function sendInvigilatorInstructionEmail(input: InstructionEmailInput) {
  if (!isEmailConfigured()) {
    throw new Error("Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const subject = `ExamPulse assignment: ${input.session.name}`;

  const response = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: input.invigilator.email,
    subject,
    text: buildInstructionText(input),
    html: buildInstructionHtml(input)
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}
