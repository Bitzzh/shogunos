/**
 * Minimal ZIP reader shared by qsp-parser and pptx-parser.
 * Both .qsp (Quelea song packs) and .pptx (PowerPoint) files are just ZIP
 * archives under the hood, so one hand-rolled reader (using the ZIP central
 * directory + Node's built-in zlib for DEFLATE) covers both without pulling
 * in an external dependency.
 */

export interface ZipEntry { name: string; data: Buffer }

export function extractZipEntries(buf: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = []

  // Find End of Central Directory record (PK\x05\x06)
  let eocdOffset = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65536); i--) {
    if (buf[i] === 0x50 && buf[i+1] === 0x4B && buf[i+2] === 0x05 && buf[i+3] === 0x06) {
      eocdOffset = i; break
    }
  }
  if (eocdOffset === -1) throw new Error('Not a valid ZIP file — EOCD not found')

  const totalEntries = buf.readUInt16LE(eocdOffset + 10)
  const cdOffset     = buf.readUInt32LE(eocdOffset + 16)

  let pos = cdOffset
  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > buf.length) break
    if (buf[pos] !== 0x50 || buf[pos+1] !== 0x4B || buf[pos+2] !== 0x01 || buf[pos+3] !== 0x02) break

    const compression       = buf.readUInt16LE(pos + 10)
    const compressedSize    = buf.readUInt32LE(pos + 20)
    const fileNameLen       = buf.readUInt16LE(pos + 28)
    const extraLen          = buf.readUInt16LE(pos + 30)
    const commentLen        = buf.readUInt16LE(pos + 32)
    const localHeaderOffset = buf.readUInt32LE(pos + 42)
    const fileName          = buf.slice(pos + 46, pos + 46 + fileNameLen).toString('utf-8')

    pos += 46 + fileNameLen + extraLen + commentLen

    if (fileName.endsWith('/') || compressedSize === 0) continue

    try {
      const lhFileNameLen = buf.readUInt16LE(localHeaderOffset + 26)
      const lhExtraLen    = buf.readUInt16LE(localHeaderOffset + 28)
      const dataStart     = localHeaderOffset + 30 + lhFileNameLen + lhExtraLen
      const compressedData = buf.slice(dataStart, dataStart + compressedSize)

      let data: Buffer
      if (compression === 0) {
        data = compressedData
      } else if (compression === 8) {
        const zlib = require('zlib')
        data = zlib.inflateRawSync(compressedData)
      } else {
        continue
      }

      entries.push({ name: fileName, data })
    } catch { /* skip bad entries */ }
  }

  return entries
}
