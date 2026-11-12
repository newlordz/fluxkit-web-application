// test-pdf-extract.cjs - PDF text extraction test
const { PDFDocument, StandardFonts } = require('pdf-lib');

async function extractTextFromPDF(pdfBytes) {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = doc.getPageCount();
  const pagesData = [];

  for (let i = 0; i < totalPages; i++) {
    const page = doc.getPage(i);
    const contents = page.node.Contents();
    if (!contents) {
      pagesData.push({ pageNumber: i + 1, text: '', lines: [] });
      continue;
    }

    const streamArray = contents.asArray ? contents.asArray() : [contents];
    let fullStream = '';

    for (const item of streamArray) {
      const stream = page.node.context.lookup(item);
      if (!stream || !stream.asUint8Array) continue;
      const raw = stream.asUint8Array();

      let textBytes;
      try {
        const ds = new DecompressionStream('deflate');
        const writer = ds.writable.getWriter();
        writer.write(raw);
        writer.close();
        const reader = ds.readable.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        textBytes = Buffer.concat(chunks).toString('latin1');
      } catch (e) {
        textBytes = Buffer.from(raw).toString('latin1');
      }
      fullStream += textBytes + '\n';
    }

    const lines = [];
    let currentLine = '';

    const opRegex = /(?:<([0-9a-fA-F]+)>|\(([^)]*)\))\s*(Tj|'|")|\[(.*?)\]\s*TJ|(T\*|Tm|Td|TD)/g;
    let m;
    while ((m = opRegex.exec(fullStream)) !== null) {
      if (m[1]) {
        const hex = m[1];
        let bytes = [];
        for (let j = 0; j < hex.length; j += 2) bytes.push(parseInt(hex.substr(j, 2), 16));
        const decoded = Buffer.from(bytes).toString('utf-8');
        currentLine += decoded;
        if (m[3] === "'" || m[3] === '"') {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = '';
        }
      } else if (m[2] !== undefined) {
        const str = m[2].replace(/\\\\/g, '\\').replace(/\\([()])/g, '$1');
        currentLine += str;
        if (m[3] === "'" || m[3] === '"') {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = '';
        }
      } else if (m[4]) {
        const innerRegex = /(?:<([0-9a-fA-F]+)>|\(([^)]*)\))/g;
        let im;
        while ((im = innerRegex.exec(m[4])) !== null) {
          if (im[1]) {
            const hex = im[1];
            let bytes = [];
            for (let j = 0; j < hex.length; j += 2) bytes.push(parseInt(hex.substr(j, 2), 16));
            currentLine += Buffer.from(bytes).toString('utf-8');
          } else if (im[2] !== undefined) {
            currentLine += im[2].replace(/\\\\/g, '\\').replace(/\\([()])/g, '$1');
          }
        }
      } else if (m[5]) {
        if (currentLine.trim()) {
          lines.push(currentLine.trim());
          currentLine = '';
        }
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    pagesData.push({
      pageNumber: i + 1,
      text: lines.join('\n'),
      lines
    });
  }

  return pagesData;
}

(async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage();
  p1.drawText('Invoice #10042', { x: 50, y: 750, size: 20, font });
  p1.drawText('Item, Quantity, Price', { x: 50, y: 700, size: 12, font });
  p1.drawText('Widget A, 5, 25.00', { x: 50, y: 680, size: 12, font });
  p1.drawText('Widget B, 2, 80.00', { x: 50, y: 660, size: 12, font });

  const p2 = doc.addPage();
  p2.drawText('Terms & Conditions', { x: 50, y: 750, size: 18, font });
  p2.drawText('Payment due within 30 days of receipt.', { x: 50, y: 710, size: 12, font });

  const bytes = await doc.save();
  const extracted = await extractTextFromPDF(bytes);
  console.log('Total pages extracted:', extracted.length);
  console.log('Page 1 lines:', extracted[0].lines);
  console.log('Page 2 lines:', extracted[1].lines);
})();
