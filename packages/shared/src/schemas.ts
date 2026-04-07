import { z } from "zod";

export const sessionImportRowSchema = z.object({
  student_id: z.string().min(1),
  student_name: z.string().min(1),
  room: z.string().min(1),
  zone: z.string().min(1),
  course_code: z.string().optional(),
  program: z.string().optional()
});

export const sessionImportPayloadSchema = z.object({
  name: z.string().min(1),
  examDate: z.string().min(1),
  startTime: z.string().min(1),
  rows: z.array(sessionImportRowSchema).min(1)
});

export const lookupRequestSchema = z.object({
  examSessionId: z.string().min(1),
  roomId: z.string().min(1),
  studentId: z.string().min(1)
});

export const markAttendanceRequestSchema = z.object({
  examSessionId: z.string().min(1),
  roomId: z.string().min(1),
  studentId: z.string().min(1),
  source: z.enum(["ocr", "manual"]),
  userId: z.string().min(1),
  deviceId: z.string().min(1),
  action: z.enum(["mark_present", "redirect_only"]),
  overrideWrongRoom: z.boolean().optional(),
  comment: z.string().trim().max(280).optional()
});
