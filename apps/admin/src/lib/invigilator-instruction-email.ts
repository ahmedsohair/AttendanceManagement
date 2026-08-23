import nodemailer from "nodemailer";
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
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.EMAIL_FROM
  );
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
    throw new Error(
      "Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM."
    );
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  const subject = `ExamPulse assignment: ${input.session.name}`;

  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: input.invigilator.email,
    subject,
    text: buildInstructionText(input),
    html: buildInstructionHtml(input)
  });
}
