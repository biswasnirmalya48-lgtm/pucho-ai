import { test } from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'

import { classify, extractText, isSupported } from '../server/services/extract.js'

/** Build a small but genuinely valid PDF so the extractor is exercised for real. */
function makePdf(text) {
  const content = `BT /F1 14 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

test('classify detects file kinds from name and mime', () => {
  assert.equal(classify('photo.PNG', 'image/png'), 'image')
  assert.equal(classify('paper.pdf', 'application/pdf'), 'pdf')
  assert.equal(classify('notes.docx', ''), 'docx')
  assert.equal(classify('legacy.doc', ''), 'doc')
  assert.equal(classify('main.ts', ''), 'text')
  assert.equal(classify('archive.bin', 'application/octet-stream'), 'binary')
  assert.equal(isSupported('image.png', 'image/png'), true)
  assert.equal(isSupported('thing.bin', 'application/octet-stream'), false)
})

test('extracts plain text files', async () => {
  const result = await extractText({
    buffer: Buffer.from('Hello PUCHO\nsecond line', 'utf8'),
    name: 'notes.txt',
    mime: 'text/plain',
  })
  assert.equal(result.kind, 'text')
  assert.match(result.text, /Hello PUCHO/)
  assert.equal(result.warning, null)
})

test('extracts text from a real PDF', async () => {
  const result = await extractText({
    buffer: makePdf('Quantum tunnelling explained'),
    name: 'quantum.pdf',
    mime: 'application/pdf',
  })
  assert.equal(result.kind, 'pdf')
  assert.match(result.text, /Quantum tunnelling explained/)
  assert.equal(result.pageCount, 1)
  assert.equal(result.warning, null)
})

test('warns instead of pretending for legacy .doc', async () => {
  const result = await extractText({
    buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 1, 2, 3]),
    name: 'old.doc',
    mime: 'application/msword',
  })
  assert.equal(result.kind, 'doc')
  assert.equal(result.text, '')
  assert.match(result.warning, /\.docx/)
})

test('warns for unreadable binary content rather than returning garbage', async () => {
  const result = await extractText({
    buffer: Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff, 0x00, 0x03]),
    name: 'blob.txt',
    mime: 'text/plain',
  })
  assert.equal(result.text, '')
  assert.match(result.warning, /binary|unsupported/i)
})

test('images produce no text and no fake warning', async () => {
  const result = await extractText({
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    name: 'photo.png',
    mime: 'image/png',
  })
  assert.equal(result.kind, 'image')
  assert.equal(result.text, '')
  assert.equal(result.warning, null)
})

test('empty files are reported as empty', async () => {
  const result = await extractText({ buffer: Buffer.from(''), name: 'empty.txt', mime: 'text/plain' })
  assert.match(result.warning, /empty/i)
})

test('handles deflate-compressed text without crashing', async () => {
  const gzipped = zlib.gzipSync(Buffer.from('compressed content', 'utf8'))
  const result = await extractText({ buffer: gzipped, name: 'data.txt', mime: 'text/plain' })
  assert.equal(typeof result.text, 'string')
})