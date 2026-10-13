/*
  CRM Part 2 (12): Export to Excel from the lead table view.

  - File: Leads_{Pipeline}_{YYYY-MM-DD}.xlsx, a real Excel workbook built with
    SheetJS (xlsx), loaded only when someone exports.
  - The table's visible columns, with its current filters and sort.
  - Header row bold; dates stored as real dates; at most 5,000 rows.
  SheetJS Community Edition does not write cell styles, so the bold header
  is added to the workbook's XML after SheetJS writes it (boldHeader).
*/
import type { Lead } from './types';

export const MAX_EXPORT_ROWS = 5000;
export const NO_LEADS = 'No leads to export';

export type ExportCell = string | number | Date;
export interface ExportColumn {
  header: string;
  value: (l: Lead) => ExportCell;
  /** Excel column width in characters. */
  width?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function exportFileName(pipeline: string, d = new Date()) {
  const name = pipeline.trim().replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'Pipeline';
  return `Leads_${name}_${isoDay(d)}.xlsx`;
}

/** Header plus up to 5,000 rows, in the order given. */
export function exportRows(leads: Lead[], columns: ExportColumn[]): { rows: ExportCell[][]; capped: boolean } {
  const body = leads.slice(0, MAX_EXPORT_ROWS).map((l) => columns.map((c) => c.value(l)));
  return { rows: [columns.map((c) => c.header), ...body], capped: leads.length > MAX_EXPORT_ROWS };
}

/** A day (yyyy-mm-dd…) as a local date, so Excel shows the same day. */
export function dateCell(iso: string): Date | string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : iso;
}

type XLSXModule = typeof import('xlsx');

/**
 * Makes row 1 bold: adds a bold font and a cell format that uses it to
 * styles.xml, and points the first row's cells at that format.
 */
export function boldHeader(X: XLSXModule, data: Uint8Array, columns: number): Uint8Array {
  const zip = X.CFB.read(data, { type: 'array' });
  const text = (path: string) => {
    const e = X.CFB.find(zip, path);
    return e?.content ? new TextDecoder().decode(e.content as Uint8Array) : undefined;
  };
  const put = (path: string, s: string) => {
    const e = X.CFB.find(zip, path);
    if (e) e.content = new TextEncoder().encode(s) as unknown as typeof e.content;
  };
  const styles = text('/xl/styles.xml');
  const sheet = text('/xl/worksheets/sheet1.xml');
  if (!styles || !sheet) return data;
  const fonts = /<fonts count="(\d+)">([\s\S]*?)<\/fonts>/.exec(styles);
  const xfs = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(styles);
  if (!fonts || !xfs) return data;
  const fontId = Number(fonts[1]);
  const xfId = Number(xfs[1]);
  const nextStyles = styles
    .replace(fonts[0], `<fonts count="${fontId + 1}">${fonts[2]}<font><b/><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts>`)
    .replace(xfs[0], `<cellXfs count="${xfId + 1}">${xfs[2]}<xf numFmtId="0" fontId="${fontId}" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`);
  const cols = new Set(Array.from({ length: columns }, (_, i) => X.utils.encode_cell({ r: 0, c: i })));
  const nextSheet = sheet.replace(/<c r="([A-Z]+1)"([^>]*?)(\/?)>/g, (m, ref: string, attrs: string, close: string) =>
    cols.has(ref) ? `<c r="${ref}"${attrs.replace(/\ss="\d+"/, '')} s="${xfId}"${close}>` : m);
  put('/xl/styles.xml', nextStyles);
  put('/xl/worksheets/sheet1.xml', nextSheet);
  return new Uint8Array(X.CFB.write(zip, { type: 'array', fileType: 'zip' }) as ArrayLike<number>);
}

/** Builds the workbook (header bold, dates as dates). */
export function buildWorkbook(X: XLSXModule, rows: ExportCell[][], widths: number[], sheetName: string): Uint8Array {
  const ws = X.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: 'yyyy-mm-dd' });
  ws['!cols'] = widths.map((wch) => ({ wch }));
  ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length - 1), c: Math.max(0, (rows[0]?.length ?? 1) - 1) } }) };
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Leads');
  // Dates go out as Excel date serials with a yyyy-mm-dd format (cellDates: false), which every Excel reads.
  const out = new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array', cellDates: false }) as ArrayBuffer);
  return boldHeader(X, out, rows[0]?.length ?? 0);
}

/** Builds and downloads the file in the browser. */
export async function downloadLeadsXlsx(fileName: string, sheetName: string, rows: ExportCell[][], widths: number[]) {
  const X = await import('xlsx');
  const bytes = buildWorkbook(X, rows, widths, sheetName);
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
