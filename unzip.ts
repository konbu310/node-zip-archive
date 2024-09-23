import fs from "node:fs/promises";
import process from "node:process";
import path from "node:path";
import esMain from "es-main";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

function findEocd(buf: Buffer): number {
  const minEOCDSize = 22;
  const startOffset = Math.max(0, buf.length - minEOCDSize);
  for (let i = startOffset; i < buf.length; i++) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      return i;
    }
  }
  throw new Error("End of Central Directory signature not found");
}

function readEocd(buf: Buffer, offset: number) {
  if (buf.readUInt32LE(offset) !== EOCD_SIGNATURE) {
    throw new Error("End of Central Directory signature not found");
  }
  return {
    diskNumber: buf.readUInt16LE(offset + 4),
    cdDiskNumber: buf.readUInt16LE(offset + 6),
    cdDiskEntries: buf.readUInt16LE(offset + 8),
    totalEntries: buf.readUInt16LE(offset + 10),
    cdSize: buf.readUInt32LE(offset + 12),
    cdOffset: buf.readUInt32LE(offset + 16),
    commentLength: buf.readUInt16LE(offset + 20),
  };
}

function readCentralDirectory(buf: Buffer, offset: number) {
  if (buf.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
    throw new Error("Central Directory signature not found");
  }
  const fileNameLength = buf.readUInt16LE(offset + 28);
  const extraFieldLength = buf.readUInt16LE(offset + 30);
  const fileCommentLength = buf.readUInt16LE(offset + 32);
  const localHeaderOffset = buf.readUInt32LE(offset + 42);
  return {
    versionMadeBy: buf.readUInt16LE(offset + 4),
    versionNeeded: buf.readUInt16LE(offset + 6),
    flags: buf.readUInt16LE(offset + 8),
    compressionMethod: buf.readUInt16LE(offset + 10),
    lastModTime: buf.readUInt16LE(offset + 12),
    lastModDate: buf.readUInt16LE(offset + 14),
    crc32: buf.readUInt32LE(offset + 16),
    compressedSize: buf.readUInt32LE(offset + 20),
    uncompressedSize: buf.readUInt32LE(offset + 24),
    fileNameLength: fileNameLength,
    extraFieldLength: extraFieldLength,
    fileCommentLength: fileCommentLength,
    diskNumberStart: buf.readUInt16LE(offset + 34),
    internalFileAttributes: buf.readUInt16LE(offset + 36),
    externalFileAttributes: buf.readUInt32LE(offset + 38),
    localHeaderOffset: localHeaderOffset,
    fileName: buf.toString("utf8", offset + 46, offset + 46 + fileNameLength),
    extraField: buf.subarray(
      offset + 46 + fileNameLength,
      offset + 46 + fileNameLength + extraFieldLength,
    ),
    fileComment: buf.toString(
      "utf8",
      offset + 46 + fileNameLength + extraFieldLength,
      offset + 46 + fileNameLength + extraFieldLength + fileCommentLength,
    ),
  };
}

function readLocalFileHeader(buf: Buffer, offset: number) {
  if (buf.readUInt32LE(offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("Local File Header signature not found");
  }
  const fileNameLength = buf.readUInt16LE(offset + 26);
  const extraFieldLength = buf.readUInt16LE(offset + 28);
  return {
    versionNeeded: buf.readUInt16LE(offset + 4),
    flags: buf.readUInt16LE(offset + 6),
    compressionMethod: buf.readUInt16LE(offset + 8),
    lastModTime: buf.readUInt16LE(offset + 10),
    lastModDate: buf.readUInt16LE(offset + 12),
    crc32: buf.readUInt32LE(offset + 14),
    compressedSize: buf.readUInt32LE(offset + 18),
    uncompressedSize: buf.readUInt32LE(offset + 22),
    fileNameLength: fileNameLength,
    extraFieldLength: extraFieldLength,
    fileName: buf.toString("utf8", offset + 30, offset + 30 + fileNameLength),
    extraField: buf.subarray(
      offset + 30 + fileNameLength,
      offset + 30 + fileNameLength + extraFieldLength,
    ),
  };
}

export async function unzip(filePath: string, outputDir: string) {
  try {
    if (!(await fs.stat(outputDir).catch(() => null))) {
      await fs.mkdir(outputDir, { recursive: true });
    }

    const buf = await fs.readFile(filePath);
    const eocd = readEocd(buf, findEocd(buf));
    const cdOffset = eocd.cdOffset;
    const cd = readCentralDirectory(buf, cdOffset);

    let localHeaderOffset = cd.localHeaderOffset;
    for (let i = 0; i < eocd.totalEntries; i++) {
      const lfh = readLocalFileHeader(buf, localHeaderOffset);
      const dataStart =
        localHeaderOffset + 30 + lfh.fileNameLength + lfh.extraFieldLength;
      const dataEnd = dataStart + lfh.compressedSize;
      const fileData = buf.subarray(dataStart, dataEnd);
      localHeaderOffset += dataEnd;

      await fs.writeFile(path.resolve(outputDir, lfh.fileName), fileData);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

if (esMain(import.meta)) {
  await unzip(path.resolve("tmp.zip"), path.resolve("dist"));
}
