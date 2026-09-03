export type ImportValidationRow = {
  student_id: string;
  student_name: string;
  room: string;
  zone: string;
  course_code?: string;
  program?: string;
};

export interface ImportRowWithOrigin {
  row: ImportValidationRow;
  rowNumber: number;
}

export interface ImportFileWithRows {
  checksum: string;
  fileName: string;
  rows: ImportRowWithOrigin[];
}

const normalizeText = (value: string) => value.trim();

function normalizeStudentId(value: string) {
  const compact = value.trim().toUpperCase().replace(/\s+/g, "");
  const rmitMatch = compact.match(/^S(\d{4,})$/);
  return rmitMatch ? rmitMatch[1] : compact;
}

function normalizeRoomCode(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function importRowFingerprint(row: ImportValidationRow) {
  return JSON.stringify({
    studentId: normalizeStudentId(row.student_id),
    studentName: normalizeText(row.student_name),
    room: normalizeRoomCode(row.room),
    zone: normalizeText(row.zone),
    courseCode: normalizeText(row.course_code || ""),
    program: normalizeText(row.program || "")
  });
}

export function validateAndMergeImportFiles(files: ImportFileWithRows[]) {
  const checksumOrigins = new Map<string, string>();
  const studentOrigins = new Map<
    string,
    { fileName: string; fingerprint: string; rowNumber: number; room: string; zone: string }
  >();
  const mergedRows: ImportValidationRow[] = [];

  for (const file of files) {
    const matchingFile = checksumOrigins.get(file.checksum);
    if (matchingFile) {
      throw new Error(
        `${file.fileName} duplicates ${matchingFile} (identical file content). Remove one file and upload again.`
      );
    }
    checksumOrigins.set(file.checksum, file.fileName);

    for (const item of file.rows) {
      const studentId = normalizeStudentId(item.row.student_id);
      const fingerprint = importRowFingerprint(item.row);
      const previous = studentOrigins.get(studentId);
      if (previous) {
        if (previous.fingerprint === fingerprint) {
          throw new Error(
            `Duplicate student ID ${studentId} at ${file.fileName}, row ${item.rowNumber}; first appears at ${previous.fileName}, row ${previous.rowNumber}. Remove the duplicate row.`
          );
        }

        throw new Error(
          `Conflicting student ID ${studentId}: ${previous.fileName}, row ${previous.rowNumber} assigns ${previous.room} / zone ${previous.zone}; ${file.fileName}, row ${item.rowNumber} assigns ${normalizeRoomCode(item.row.room)} / zone ${normalizeText(item.row.zone)}.`
        );
      }

      studentOrigins.set(studentId, {
        fileName: file.fileName,
        fingerprint,
        rowNumber: item.rowNumber,
        room: normalizeRoomCode(item.row.room),
        zone: normalizeText(item.row.zone)
      });
      mergedRows.push(item.row);
    }
  }

  return mergedRows;
}
