/**
 * Quelea Song Pack (.qsp) parser for ShogunOS
 * Uses ZIP central directory for reliable entry discovery.
 */

import { extractZipEntries } from './zip-utils'

export interface ParsedSong {
  title: string
  author: string
  language: string
  sections: { type: string; order: number; content: string }[]
}

export interface QSPImportResult {
  success: boolean
  songs: ParsedSong[]
  errors: string[]
  total: number
  parsed: number
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#13;/g, '')
    .replace(/<[^>]+>/g, '').trim()
}

function cleanContent(s: string): string {
  return s.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n').trim()
}

function detectType(sectionTitle: string): string {
  const t = sectionTitle.toLowerCase()
  if (t.includes('chorus') || t.includes('refrain')) return 'chorus'
  if (t.includes('bridge')) return 'bridge'
  return 'verse'
}

// ── Song XML parser ───────────────────────────────────────────────────────────

function parseSongXml(xml: string, filename: string, language: string): ParsedSong | null {
  try {
    // Title
    const titleMatch = xml.match(/<title>([\s\S]*?)<\/title>/)
    let title = titleMatch ? decodeXml(titleMatch[1]) : filename.replace(/\.[^.]+$/, '')
    const noNum = title.replace(/^\d+[NSns]?\s+/, '').trim()
    if (noNum.length > 0) title = noNum

    const authorMatch = xml.match(/<author>([\s\S]*?)<\/author>/)
    const author = authorMatch ? decodeXml(authorMatch[1]) : ''

    // Extract outer <lyrics> wrapper
    const outerMatch = xml.match(/<lyrics>([\s\S]*)<\/lyrics>/)
    if (!outerMatch) return null
    const outerLyrics = outerMatch[1]

    const sections: ParsedSong['sections'] = []
    let order = 1
    let pos = 0

    while (pos < outerLyrics.length) {
      const sStart = outerLyrics.indexOf('<section', pos)
      if (sStart === -1) break
      const sEnd = outerLyrics.indexOf('</section>', sStart)
      if (sEnd === -1) break

      const block = outerLyrics.slice(sStart, sEnd + '</section>'.length)
      pos = sEnd + '</section>'.length

      // Get title attribute for section type detection
      const titleAttrMatch = block.match(/title="([^"]*)"/)
      const sectionTitle = titleAttrMatch ? titleAttrMatch[1] : ''

      // Strip <theme> and <smalllines>
      const stripped = block
        .replace(/<theme>[\s\S]*?<\/theme>/i, '')
        .replace(/<smalllines>[\s\S]*?<\/smalllines>/i, '')

      // Get inner <lyrics> tag
      const innerMatch = stripped.match(/<lyrics>([\s\S]*?)<\/lyrics>/i)
      if (!innerMatch) continue

      const content = cleanContent(decodeXml(innerMatch[1]))
      if (!content) continue

      // Skip header-only sections (just title/number, 1 short line)
      const lines = content.split('\n')
      if (lines.length === 1 && (
        /^\d+[NSns]?\s*$/.test(content) ||
        content.toLowerCase().includes(title.toLowerCase())
      )) continue

      sections.push({ type: detectType(sectionTitle), order: order++, content })
    }

    if (sections.length === 0) return null
    return { title, author, language, sections }
  } catch {
    return null
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function parseQSP(zipBuffer: Buffer, language: string = 'en'): QSPImportResult {
  const result: QSPImportResult = { success: false, songs: [], errors: [], total: 0, parsed: 0 }

  try {
    const entries = extractZipEntries(zipBuffer)
    const songEntries = entries.filter(e => {
      const lower = e.name.toLowerCase()
      return (lower.endsWith('.xml') || lower.endsWith('.pdf')) && !e.name.includes('/')
    })

    result.total = songEntries.length

    for (const entry of songEntries) {
      try {
        const xml  = entry.data.toString('utf-8').replace(/^\uFEFF/, '')
        const song = parseSongXml(xml, entry.name, language)
        if (song) {
          result.songs.push(song)
          result.parsed++
        } else {
          result.errors.push(`Skipped: ${entry.name}`)
        }
      } catch (e: any) {
        result.errors.push(`Error: ${entry.name}: ${e.message}`)
      }
    }

    result.success = result.parsed > 0
  } catch (e: any) {
    result.errors.push(`ZIP error: ${e.message}`)
  }

  return result
}