// test-docx.cjs - Scratch test script in explorer folder
const fs = require('fs');

const makeCrcTable = () => {
  let c;
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
};
const crcTable = makeCrcTable();
function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function buildZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf-8');
    const dataBytes = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf-8');
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local Header (30 bytes + name)
    const lh = Buffer.alloc(30 + nameBytes.length);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4);          // version needed
    lh.writeUInt16LE(0x0800, 6);      // utf-8 flag
    lh.writeUInt16LE(0, 8);           // store (no compression)
    lh.writeUInt16LE(0, 10);          // mod time
    lh.writeUInt16LE(0, 12);          // mod date
    lh.writeUInt32LE(crc, 14);        // crc32
    lh.writeUInt32LE(size, 18);       // compressed size
    lh.writeUInt32LE(size, 22);       // uncompressed size
    lh.writeUInt16LE(nameBytes.length, 26);
    lh.writeUInt16LE(0, 28);          // extra field length
    nameBytes.copy(lh, 30);

    localHeaders.push(lh, dataBytes);

    // Central Header (46 bytes + name)
    const ch = Buffer.alloc(46 + nameBytes.length);
    ch.writeUInt32LE(0x02014b50, 0); // signature
    ch.writeUInt16LE(20, 4);          // version made by
    ch.writeUInt16LE(20, 6);          // version needed
    ch.writeUInt16LE(0x0800, 8);      // utf-8 flag
    ch.writeUInt16LE(0, 10);          // store
    ch.writeUInt16LE(0, 12);          // mod time
    ch.writeUInt16LE(0, 14);          // mod date
    ch.writeUInt32LE(crc, 16);        // crc32
    ch.writeUInt32LE(size, 20);       // compressed size
    ch.writeUInt32LE(size, 24);       // uncompressed size
    ch.writeUInt16LE(nameBytes.length, 28);
    ch.writeUInt16LE(0, 30);          // extra length
    ch.writeUInt16LE(0, 32);          // comment length
    ch.writeUInt16LE(0, 34);          // disk start
    ch.writeUInt16LE(0, 36);          // int attributes
    ch.writeUInt32LE(0, 38);          // ext attributes
    ch.writeUInt32LE(offset, 42);     // local header offset
    nameBytes.copy(ch, 46);

    centralHeaders.push(ch);
    offset += lh.length + dataBytes.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) centralDirSize += ch.length;

  // EOCD (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(files.length, 8); // total entries disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

const docxFiles = [
  {
    name: '[Content_Types].xml',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
      '  <Default Extension="xml" ContentType="application/xml"/>\n' +
      '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n' +
      '</Types>'
  },
  {
    name: '_rels/.rels',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n' +
      '</Relationships>'
  },
  {
    name: 'word/document.xml',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n' +
      '  <w:body>\n' +
      '    <w:p><w:r><w:t>Hello World from FluxKit PDF to Word!</w:t></w:r></w:p>\n' +
      '  </w:body>\n' +
      '</w:document>'
  }
];

const zipBuf = buildZip(docxFiles);
console.log('Generated DOCX buffer length:', zipBuf.length);
console.log('Magic header (PK 03 04):', zipBuf.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])));

// Let's verify we can read it back with an unzipper or inspect the entries
console.log('End of central directory marker:', zipBuf.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) !== -1);
