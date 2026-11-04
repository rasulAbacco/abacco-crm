// CSV / Excel import parsing and export building.
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { badRequest } from '../../utils/errors.js';

export const MAX_IMPORT_ROWS = 10000;

const clean = (h) => String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

/** Returns rows as objects keyed by normalised header ("First Name" → "firstname"). */
export async function parseUpload(file) {
  if (!file) throw badRequest('Attach a CSV or Excel (.xlsx) file.');
  const name = file.originalname.toLowerCase();
  let rows;
  if (name.endsWith('.csv') || file.mimetype === 'text/csv') {
    const records = parse(file.buffer, { bom: true, columns: (h) => h.map(clean), skip_empty_lines: true, trim: true, relax_column_count: true });
    rows = records;
  } else if (name.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw badRequest('The workbook has no sheets.');
    const headers = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col] = clean(cell.text); });
    rows = [];
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const obj = {};
      row.eachCell({ includeEmpty: false }, (cell, col) => { if (headers[col]) obj[headers[col]] = String(cell.text ?? '').trim(); });
      if (Object.keys(obj).length) rows.push(obj);
    });
  } else {
    throw badRequest('Only .csv and .xlsx files are supported.');
  }
  if (rows.length > MAX_IMPORT_ROWS) throw badRequest(`A file can have at most ${MAX_IMPORT_ROWS} rows.`);
  return rows;
}

/** Picks the first non-empty value among header aliases. */
export function pick(row, ...aliases) {
  for (const a of aliases) {
    const v = row[clean(a)];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return undefined;
}

const csvCell = (v) => {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** columns: [{ key, header, value?: (row) => any }] */
export async function sendTable(res, { format, filename, columns, rows }) {
  const value = (c, r) => (c.value ? c.value(r) : r[c.key]);
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Export');
    ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: Math.max(12, c.header.length + 4) }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(Object.fromEntries(columns.map((c) => [c.key, value(c, r) ?? ''])));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  }
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(value(c, r))).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  return res.send('﻿' + lines.join('\r\n'));
}
