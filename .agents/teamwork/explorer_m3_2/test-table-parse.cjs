// test-table-parse.cjs - Test table parsing heuristics
function parseTableFromLines(lines) {
  // Determine delimiter: commas, tabs, pipes, or 2+ spaces
  const commaCount = lines.reduce((acc, l) => acc + (l.match(/,/g) || []).length, 0);
  const tabCount = lines.reduce((acc, l) => acc + (l.match(/\t/g) || []).length, 0);
  const pipeCount = lines.reduce((acc, l) => acc + (l.match(/\|/g) || []).length, 0);

  let delimiter;
  if (tabCount > lines.length * 0.5) delimiter = '\t';
  else if (commaCount > lines.length * 0.5) delimiter = ',';
  else if (pipeCount > lines.length * 0.5) delimiter = '|';
  else delimiter = /\s{2,}/; // multi-space delimiter

  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let cells;
    if (typeof delimiter === 'string') {
      cells = line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    } else {
      cells = line.split(delimiter).map(c => c.trim());
    }
    // If pipe delimiter, filter out empty edge cells
    if (delimiter === '|' && cells.length > 2 && cells[0] === '' && cells[cells.length - 1] === '') {
      cells = cells.slice(1, -1);
    }
    rows.push(cells);
  }
  return rows;
}

const sampleLines = [
  'Item, Quantity, Price, Total',
  'Widget Alpha, 5, 25.00, 125.00',
  'Widget Beta, 2, 80.00, 160.00',
  'Widget Gamma, 10, 12.50, 125.00'
];

const rows = parseTableFromLines(sampleLines);
console.log('Parsed rows:', rows);
