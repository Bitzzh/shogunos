/**
 * PowerPoint (.pptx) parser for ShogunOS.
 * .pptx is a ZIP archive of XML files (Office Open XML) — each slide lives at
 * ppt/slides/slideN.xml. We don't need a full OOXML/DrawingML parser for
 * this: text runs live inside <a:t>...</a:t> tags regardless of which shape
 * or placeholder they belong to, and paragraph breaks are <a:p> boundaries.
 * That's enough to pull out readable slide text without an external
 * dependency (python-pptx isn't available in Node; this avoids needing one).
 */

import { extractZipEntries } from './zip-utils'

export interface ParsedPPTXSlide {
  title: string
  content: string
}

export interface PPTXImportResult {
  success: boolean
  slides: ParsedPPTXSlide[]
  errors: string[]
  total: number
  parsed: number
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

function parseSlideXml(xml: string): ParsedPPTXSlide | null {
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
        const slide = parseSlideXml(xml)
        if (slide) {
          result.slides.push(slide)
          result.parsed++
        } else {
          result.errors.push(`Slide ${i + 1}: no text content, skipped`)
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
