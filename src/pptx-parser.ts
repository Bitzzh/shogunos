/**
 * PowerPoint (.pptx) parser for ShogunOS.
 * .pptx is a ZIP archive of XML files (Office Open XML) — each slide lives at
 * ppt/slides/slideN.xml. We don't need a full OOXML/DrawingML parser for
 * this: text runs live inside <a:t>...</a:t> tags regardless of which shape
 * or placeholder they belong to, and paragraph breaks are <a:p> boundaries.
 * That's enough to pull out readable slide text without an external
 * dependency (python-pptx isn't available in Node; this avoids needing one).
 *
 * Embedded photos and videos are handled the same lightweight way: pictures
 * and video/audio media are referenced from a slide's XML via r:embed / r:link
 * attributes, which point at relationship IDs declared in that slide's
 * .rels file (ppt/slides/_rels/slideN.xml.rels). Resolving those relationship
 * IDs to targets under ppt/media/ is enough to pull out the actual media
 * bytes without understanding the full DrawingML shape model.
 */

import path from 'node:path'
import { extractZipEntries } from './zip-utils'

export interface ParsedPPTXMedia {
  fileName: string           // original media file name, e.g. "image1.png"
  ext: string                // lowercase extension including the dot, e.g. ".png"
  mimeType: string
  kind: 'image' | 'video'
  data: Buffer
}

export interface ParsedPPTXSlide {
  title: string
  content: string
  media: ParsedPPTXMedia[]
}

export interface PPTXImportResult {
  success: boolean
  slides: ParsedPPTXSlide[]
  errors: string[]
  total: number
  parsed: number
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff', '.tif'])
const VIDEO_EXT  = new Set(['.mp4', '.mov', '.wmv', '.avi', '.m4v', '.webm', '.mpg', '.mpeg'])
const MEDIA_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.bmp': 'image/bmp', '.webp': 'image/webp', '.tiff': 'image/tiff', '.tif': 'image/tiff',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.wmv': 'video/x-ms-wmv', '.avi': 'video/avi',
  '.m4v': 'video/mp4', '.webm': 'video/webm', '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg',
}

// Parses a slide (or any) .rels file into a map of relationship id -> target,
// noting which ones are external links (e.g. hyperlinks) so we can skip them —
// those don't point into the zip at all.
function parseRelsTargets(relsXml: string): Map<string, { target: string; external: boolean }> {
  const map = new Map<string, { target: string; external: boolean }>()
  const relMatches = relsXml.match(/<Relationship\b[^>]*\/?>/g) || []
  for (const rel of relMatches) {
    const idM     = rel.match(/\bId="([^"]+)"/)
    const targetM = rel.match(/\bTarget="([^"]+)"/)
    if (!idM || !targetM) continue
    const external = /TargetMode="External"/.test(rel)
    map.set(idM[1], { target: targetM[1], external })
  }
  return map
}

// Pictures and video/audio media are referenced inline in a slide's XML via
// r:embed="rIdN" (embedded media) or r:link="rIdN" (linked media, still
// resolvable through the same .rels file). Collect them in the order they
// first appear so a slide's "first image" is the one closest to how it
// visually reads.
function extractMediaRelIds(slideXml: string): string[] {
  const ids: string[] = []
  const re = /r:(?:embed|link)="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(slideXml))) {
    if (!ids.includes(m[1])) ids.push(m[1])
  }
  return ids
}

function resolveSlideMedia(
  slideXml: string,
  relsXml: string | undefined,
  entriesByName: Map<string, Buffer>
): ParsedPPTXMedia[] {
  if (!relsXml) return []
  const rels   = parseRelsTargets(relsXml)
  const relIds = extractMediaRelIds(slideXml)
  const media: ParsedPPTXMedia[] = []

  for (const rid of relIds) {
    const rel = rels.get(rid)
    if (!rel || rel.external) continue

    // Targets are relative to ppt/slides/, e.g. "../media/image1.png"
    const resolved = path.posix.normalize(path.posix.join('ppt/slides', rel.target))
    const data = entriesByName.get(resolved)
    if (!data) continue

    const ext = path.posix.extname(resolved).toLowerCase()
    const fileName = path.posix.basename(resolved)
    if (IMAGE_EXT.has(ext)) {
      media.push({ fileName, ext, mimeType: MEDIA_MIME_TYPES[ext] || 'application/octet-stream', kind: 'image', data })
    } else if (VIDEO_EXT.has(ext)) {
      media.push({ fileName, ext, mimeType: MEDIA_MIME_TYPES[ext] || 'application/octet-stream', kind: 'video', data })
    }
  }

  return media
}


function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

// Pulls plain text out of a single slide's XML, grouped by paragraph so line
// breaks in the original slide are preserved. Table cells and text boxes are
// all just <a:p> paragraphs containing <a:t> runs, so this picks up
// everything without needing to understand PPTX's shape/placeholder model.
function extractSlideParagraphs(xml: string): string[] {
  const paragraphs: string[] = []
  const paraMatches = xml.match(/<a:p>[\s\S]*?<\/a:p>/g) || []
  for (const para of paraMatches) {
    const runs = para.match(/<a:t>([\s\S]*?)<\/a:t>/g) || []
    const text = runs
      .map(r => decodeXmlEntities(r.replace(/<a:t>/, '').replace(/<\/a:t>/, '')))
      .join('')
      .trim()
    if (text.length > 0) paragraphs.push(text)
  }
  return paragraphs
}

function parseSlideText(xml: string): { title: string; content: string } | null {
  const paragraphs = extractSlideParagraphs(xml)
  if (paragraphs.length === 0) return null

  // Heuristic: the first paragraph on the slide reads as the title (this is
  // true for the vast majority of real decks, where the title placeholder's
  // text comes first in the XML), everything else is body content.
  const [title, ...rest] = paragraphs
  return { title, content: rest.join('\n') }
}

export function parsePPTX(zipBuffer: Buffer): PPTXImportResult {
  const result: PPTXImportResult = { success: false, slides: [], errors: [], total: 0, parsed: 0 }

  try {
    const entries = extractZipEntries(zipBuffer)
    const entriesByName = new Map(entries.map(e => [e.name, e.data]))

    // ppt/slides/slideN.xml — sort numerically by N. This matches visual
    // slide order for the overwhelming majority of decks (PowerPoint numbers
    // slide files in creation order, which normally matches display order).
    // A fully correct implementation would follow ppt/presentation.xml's
    // <p:sldIdLst> through the relationship file, but that's a lot of extra
    // parsing for very little practical benefit on real-world decks.
    const slideEntries = entries
      .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.name))
      .sort((a, b) => {
        const na = parseInt(a.name.match(/slide(\d+)\.xml$/)![1], 10)
        const nb = parseInt(b.name.match(/slide(\d+)\.xml$/)![1], 10)
        return na - nb
      })

    result.total = slideEntries.length
    if (slideEntries.length === 0) {
      result.errors.push('No slides found — is this a valid .pptx file?')
      return result
    }

    slideEntries.forEach((entry, i) => {
      try {
        const xml = entry.data.toString('utf-8').replace(/^\uFEFF/, '')
        const slideText = parseSlideText(xml)

        const slideNum  = entry.name.match(/slide(\d+)\.xml$/)![1]
        const relsData  = entriesByName.get(`ppt/slides/_rels/slide${slideNum}.xml.rels`)
        const relsXml   = relsData ? relsData.toString('utf-8') : undefined
        const media     = resolveSlideMedia(xml, relsXml, entriesByName)

        // A slide with a photo/video but no text is still worth importing —
        // only skip a slide that has neither.
        if (slideText || media.length > 0) {
          result.slides.push({
            title: slideText?.title || `Slide ${i + 1}`,
            content: slideText?.content || '',
            media,
          })
          result.parsed++
        } else {
          result.errors.push(`Slide ${i + 1}: no text or media content, skipped`)
        }
      } catch (e: any) {
        result.errors.push(`Slide ${i + 1}: ${e.message}`)
      }
    })

    result.success = result.parsed > 0
  } catch (e: any) {
    result.errors.push(`File error: ${e.message}`)
  }

  return result
}
