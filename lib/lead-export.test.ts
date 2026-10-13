import { describe, expect, it } from 'vitest';
import * as X from 'xlsx';
import type { Lead } from './types';
import { MAX_EXPORT_ROWS, buildWorkbook, dateCell, exportFileName, exportRows } from './lead-export';

const lead = (i: number, x: Partial<Lead> = {}): Lead => ({
  id: `L${i}`, leadNumber: `LEAD-2026-${i}`, firstName: 'Ann', lastName: `Lee ${i}`, phone: '', email: '', street: '', city: 'Dallas', state: 'TX', zip: '',
  leadSource: 'Instagram', serviceType: 'Interior', status: 'New', estimatedValue: 100, date: '2026-10-01T15:00:00.000Z', createdAt: '2026-10-01T15:00:00.000Z', updatedAt: '', contactType: 'LEAD', ...x,
});

describe('lead export', () => {
  it('names the file Leads_{Pipeline}_{YYYY-MM-DD}.xlsx', () => {
    expect(exportFileName('Sales', new Date(2026, 9, 14))).toBe('Leads_Sales_2026-10-14.xlsx');
    expect(exportFileName('Colour / Trim', new Date(2026, 0, 2))).toBe('Leads_Colour_Trim_2026-01-02.xlsx');
  });

  it('keeps the given order and stops at 5,000 rows', () => {
    const leads = Array.from({ length: MAX_EXPORT_ROWS + 3 }, (_, i) => lead(i));
    const { rows, capped } = exportRows(leads, [{ header: 'Lead #', value: (l) => l.leadNumber }]);
    expect(rows).toHaveLength(MAX_EXPORT_ROWS + 1);
    expect(rows[1]).toEqual(['LEAD-2026-0']);
    expect(capped).toBe(true);
  });

  it('writes a real workbook: bold header, dates as dates, numbers as numbers', () => {
    const { rows } = exportRows([lead(1), lead(2, { estimatedValue: 2500 })], [
      { header: 'Lead #', value: (l) => l.leadNumber },
      { header: 'Value', value: (l) => l.estimatedValue },
      { header: 'Created', value: (l) => dateCell(l.date) },
    ]);
    const bytes = buildWorkbook(X, rows, [12, 10, 12], 'Sales');
    const zip = X.CFB.read(bytes, { type: 'array' });
    const xml = (p: string) => new TextDecoder().decode(X.CFB.find(zip, p)!.content as Uint8Array);
    expect(xml('/xl/styles.xml')).toMatch(/<font><b\/>/);
    const sheet = xml('/xl/worksheets/sheet1.xml');
    const boldXf = /<cellXfs count="(\d+)">/.exec(xml('/xl/styles.xml'))![1]!;
    expect(sheet).toMatch(new RegExp(`<c r="A1" t="(s|str)" s="${Number(boldXf) - 1}"`));
    // A date is an Excel serial number with a date format, not text.
    expect(sheet).toMatch(/<c r="C2" s="\d+"><v>\d+(\.\d+)?<\/v>/);
    const wb = X.read(bytes, { type: 'array', cellDates: true });
    const ws = wb.Sheets.Sales!;
    expect(ws.A1!.v).toBe('Lead #');
    expect(ws.B3!.v).toBe(2500);
    expect(ws.C2!.t).toBe('d');
    expect((ws.C2!.v as Date).getDate()).toBe(1);
  });
});
