import { z } from "zod";

const asciiControlCharacterPattern = /[\u0000-\u001f\u007f]/;
const examDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const examStartTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isRealCalendarDate(value: string) {
  if (!examDatePattern.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  parsed.setUTCHours(0, 0, 0, 0);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function requiredText(maxLength: number, label: string) {
  return z
    .string()
    .max(maxLength, `${label} must be ${maxLength} characters or fewer.`)
    .refine((value) => !asciiControlCharacterPattern.test(value), {
      message: `${label} contains invalid control characters.`
    })
    .transform((value) => value.trim())
    .pipe(z.string().min(1, `${label} is required.`));
}

export function normalizeRoomCode(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export const uuidSchema = z.string().uuid("A valid identifier is required.");

export const emailAddressSchema = z
  .string()
  .max(254, "Email address must be 254 characters or fewer.")
  .refine((value) => !asciiControlCharacterPattern.test(value), {
    message: "Email address contains invalid control characters."
  })
  .transform((value) => value.trim())
  .pipe(z.string().email("Enter a valid email address."))
  .transform((value) => value.toLowerCase());

export const examDateSchema = z
  .string()
  .trim()
  .refine(isRealCalendarDate, {
    message: "Exam date must be a real date in YYYY-MM-DD format."
  });

export const examStartTimeSchema = z
  .string()
  .trim()
  .regex(examStartTimePattern, "Exam start time must use 24-hour HH:MM format.");

export const roomCodeSchema = requiredText(100, "Room code").transform(normalizeRoomCode);

export const sessionImportRowSchema = z
  .object({
    student_id: requiredText(64, "Student ID"),
    student_name: requiredText(200, "Student name"),
    room: roomCodeSchema,
    zone: requiredText(100, "Zone"),
    course_code: requiredText(100, "Course code").optional(),
    program: requiredText(200, "Program").optional()
  })
  .strict();

export const sessionImportPayloadSchema = z
  .object({
    name: requiredText(200, "Exam name"),
    examDate: examDateSchema,
    startTime: examStartTimeSchema,
    rows: z.array(sessionImportRowSchema).min(1).max(2500)
  })
  .strict();

export const lookupRequestSchema = z
  .object({
    examSessionId: uuidSchema,
    roomId: uuidSchema,
    studentId: requiredText(64, "Student ID")
  })
  .strict();

export const markAttendanceRequestSchema = z
  .object({
    requestId: uuidSchema.optional(),
    examSessionId: uuidSchema,
    roomId: uuidSchema,
    studentId: requiredText(64, "Student ID"),
    source: z.enum(["ocr", "manual"]),
    userId: uuidSchema,
    deviceId: requiredText(200, "Device ID"),
    action: z.enum(["mark_present", "redirect_only"]),
    overrideWrongRoom: z.boolean().optional(),
    comment: z.string().trim().max(280).optional()
  })
  .strict();
