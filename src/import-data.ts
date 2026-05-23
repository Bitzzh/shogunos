import fs from 'fs'
import path from 'path'
import https from 'https'

function fetchRaw(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchRaw(res.headers.location!).then(resolve).catch(reject)
        return
      }
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  // Bible is already downloaded - skip if exists
  if (fs.existsSync(path.join(dataDir, 'kjv.json'))) {
    console.log('KJV Bible already downloaded, skipping...')
  } else {
    console.log('Downloading KJV Bible...')
    try {
      const buf = await fetchRaw('https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json')
      const text = buf.toString('utf8').replace(/^\uFEFF/, '')
      const bible = JSON.parse(text)
      fs.writeFileSync(path.join(dataDir, 'kjv.json'), JSON.stringify(bible))
      console.log(`KJV Bible downloaded: ${bible.length} books`)
    } catch (e) {
      console.error('Failed to download Bible:', e)
    }
  }

  console.log('Downloading SDA Hymnal (695 hymns individually)...')
  const hymns: any[] = []
  let failed = 0

  for (let i = 1; i <= 695; i++) {
    try {
const buf = await fetchRaw(`https://raw.githubusercontent.com/joshpetit/sda-hymnal/master/data/${i}.json`)
      const text = buf.toString('utf8').replace(/^\uFEFF/, '')
      const hymn = JSON.parse(text)
      hymns.push(hymn)
      if (i % 50 === 0) console.log(`  Downloaded ${i}/695 hymns...`)
    } catch (e) {
      failed++
    }
  }

  if (hymns.length > 0) {
    fs.writeFileSync(path.join(dataDir, 'hymnal.json'), JSON.stringify(hymns))
    console.log(`Hymnal downloaded: ${hymns.length} hymns (${failed} failed)`)
  } else {
    console.log('Trying alternate hymnal source...')
    try {
      const buf = await fetchRaw('https://raw.githubusercontent.com/Kalradia/AdventistHymnal/master/Database/hymns.json')
      const text = buf.toString('utf8').replace(/^\uFEFF/, '')
      const hymnal = JSON.parse(text)
      fs.writeFileSync(path.join(dataDir, 'hymnal.json'), JSON.stringify(hymnal))
      console.log(`Hymnal downloaded from alternate source`)
    } catch (e) {
      console.error('All hymnal sources failed. Will use built-in hymns.')
    }
  }

  console.log('All done! Check the data/ folder.')
}

main()