import { createWorker } from "tesseract.js";
import { NextResponse } from "next/server";

function extractStudentId(text: string) {
  const matches = text.match(/\b\d{7,10}\b/g);
  if (!matches?.length) {
    return null;
  }

  return matches.sort((a, b) => b.length - a.length)[0];
}

export async function POST(request: Request) {
  let worker;

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "file is required" }, { status: 400 });
    }

    worker = await createWorker("eng");
    const {
      data: { text }
    } = await worker.recognize(Buffer.from(await file.arrayBuffer()));

    const studentId = extractStudentId(text);
    if (!studentId) {
      return NextResponse.json(
        { message: "Could not detect a student number.", rawText: text },
        { status: 422 }
      );
    }

    return NextResponse.json({ studentId, rawText: text });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "OCR failed." },
      { status: 500 }
    );
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}
