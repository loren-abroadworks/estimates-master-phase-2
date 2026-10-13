'use client';

/*
  Table view of the pipeline. Filters by stage and date range (the Sources
  chips above it filter by source, CRM Part 1, 4),
  sorts by clicking a column header, and pages 10 rows at a time.
  Clicking a row opens the lead. The kebab menu has Edit, Archive and Delete
  (live: features/(main)/leads/listings/templates/useColumns.tsx).
  NEW (29): the Repaint alert source badge; a lead driven by an open repaint
  follow-up has no Archive item.
  CRM Part 2 (12): Status is the lead's Sales stage (stages added in Settings
  included). Export to Excel and Print take the visible columns, the current
  filters and the sort; both are off when no leads match ("No leads to export").
*/
import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArrowDown, ArrowUp, ArrowUpDown, Edit2, FileSpreadsheet, Mail, Phone, Printer, Star, Trash2 } from 'lucide-react';
import type { Lead, PipelineStage } from '@/lib/types';
import { useCollection, useCurrentUser, useLogActivity, useLookups, useSingleton } from '@/lib/store';
import { Badge, Pagination, RefChip, usePagination } from '@/components/ui/display';
import { Input, NativeSelect } from '@/components/ui/form';
import { RowMenu } from '@/components/ui/menu';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn, fullName, money, shortDate } from '@/lib/utils';
import { NO_LEADS, dateCell, downloadLeadsXlsx, exportFileName, exportRows, type ExportColumn } from '@/lib/lead-export';
import { IS_HOSTED_DEMO, printElement } from '@/features/lib/export';
import { pipelineColumns, salesColumnFor } from '@/features/lib/rules/lead-pipeline';
import { LEAD_LIFECYCLE, canArchiveLeadStatus, formatPhone } from './leadHelpers';
import { LeadSourceChip, PossibleDuplicateChip, useFollowUpLocks } from './leadFeatures';
import { pressable } from '@/lib/a11y';

type SortKey = 'name' | 'status' | 'source' | 'service' | 'value' | 'date';

export function LeadsTable({
  leads, onEdit, onArchive, onDelete, pipelineName = 'Sales', outerFilters = [],
}: {
  leads: Lead[];
  /** For the export file name and the print header. */
  pipelineName?: string;
  /** Filters set above the table (Sources, search), for the print header. */
  outerFilters?: string[];
  onEdit: (lead: Lead) => void;
  onArchive: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
}) {
  const router = useRouter();
  const lookups = useLookups();
  const lockOf = useFollowUpLocks();
  const [stage, setStage] = useState('');
  const { items: stageItems } = useCollection('pipelineStages');
  const columns = useMemo(() => pipelineColumns(stageItems, 'sales'), [stageItems]);
  const stageOf = (l: Lead) => salesColumnFor(l, columns);
  const [bp] = useSingleton('businessProfile');
  const me = fullName(useCurrentUser());
  const log = useLogActivity();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });

  const rows = useMemo(() => {
    const filtered = leads.filter((l) => {
      const day = l.date.slice(0, 10);
      if (stage && stageOf(l)?.id !== stage) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
    const val = (l: Lead): string | number => {
      switch (sort.key) {
        case 'name': return `${l.firstName} ${l.lastName}`.toLowerCase();
        case 'status': return stageOf(l)?.sortOrder ?? 99;
        case 'source': return l.leadSource.toLowerCase();
        case 'service': return l.serviceType.toLowerCase();
        case 'value': return l.estimatedValue;
        default: return new Date(l.date).getTime();
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === 'asc' ? c : -c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, stage, from, to, sort, columns]);

  const pg = usePagination(rows, 10);
  const hasFilters = !!(stage || from || to);

  /* ---------- Export to Excel and Print (CRM Part 2, 12): the visible columns ---------- */
  const exportCols: ExportColumn[] = [
    { header: 'Lead #', value: (l) => l.leadNumber, width: 14 },
    { header: 'Lead Name', value: (l) => fullName(l), width: 22 },
    { header: 'Status', value: (l) => stageOf(l)?.displayName ?? l.status, width: 18 },
    { header: 'Estimate', value: (l) => lookups.estimate(l.estimateId)?.estimateNumber ?? '', width: 14 },
    { header: 'Phone', value: (l) => formatPhone(l.phone), width: 16 },
    { header: 'Email', value: (l) => l.email, width: 28 },
    { header: 'Location', value: (l) => [l.city, l.state].filter(Boolean).join(', '), width: 18 },
    { header: 'Source', value: (l) => l.leadSource, width: 14 },
    { header: 'Service Type', value: (l) => l.serviceType, width: 14 },
    { header: 'Value', value: (l) => l.estimatedValue, width: 12 },
    { header: 'Created', value: (l) => dateCell(l.date), width: 12 },
  ];
  const filterText = [
    ...outerFilters,
    ...(stage ? [`Stage: ${columns.find((c) => c.id === stage)?.displayName ?? stage}`] : []),
    ...(from || to ? [`Created: ${from || 'any date'} to ${to || 'any date'}`] : []),
  ];
  const SORT_LABEL: Record<SortKey, string> = { name: 'Lead Name', status: 'Status', source: 'Source', service: 'Service Type', value: 'Value', date: 'Created' };
  const sortText = `Sorted by ${SORT_LABEL[sort.key]}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}`;
  const none = rows.length === 0;
  const exportExcel = async () => {
    if (IS_HOSTED_DEMO) return toast('Excel download is not available in the hosted preview. Run the prototype locally to use it.', 'info');
    const { rows: data, capped } = exportRows(rows, exportCols);
    try {
      await downloadLeadsXlsx(exportFileName(pipelineName), pipelineName, data, exportCols.map((c) => c.width ?? 14));
      log(`${me} exported ${data.length - 1} leads from ${pipelineName} to Excel.`);
      toast(capped ? `Exported the first ${data.length - 1} leads (the limit).` : `Exported ${data.length - 1} leads to Excel`);
    } catch {
      toast('Could not build the Excel file. Please try again.', 'error');
    }
  };
  const print = () => printElement(printRef.current, `Leads ${pipelineName}`);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' || key === 'value' ? 'desc' : 'asc' }));

  const Th = ({ label, k, className }: { label: string; k?: SortKey; className?: string }) => (
    <th className={cn('whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500', className)}>
      {k ? (
        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase hover:text-gray-800">
          {label}
          {sort.key === k ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-gray-300" />}
        </button>
      ) : label}
    </th>
  );

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <NativeSelect value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filter by stage">
            <option value="">All Stages</option>
            {columns.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
          </NativeSelect>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="w-40" />
          <span className="text-xs text-gray-500">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="w-40" />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setStage(''); setFrom(''); setTo(''); }}>
            Clear filters
          </Button>
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <span title={none ? NO_LEADS : undefined}>
            <Button variant="secondary" size="sm" onClick={() => void exportExcel()} disabled={none} icon={<FileSpreadsheet className="h-4 w-4" />}>Export to Excel</Button>
          </span>
          <span title={none ? NO_LEADS : undefined}>
            <Button variant="secondary" size="sm" onClick={print} disabled={none} icon={<Printer className="h-4 w-4" />}>Print</Button>
          </span>
        </div>
      </div>

      {/* Print view: no menus, black text, a header with the business, pipeline, filters and today's date. */}
      <div className="hidden">
        <div ref={printRef} style={{ color: '#000', background: '#fff', fontFamily: 'Arial, sans-serif' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{bp.companyName || 'Leads'}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>Leads · {pipelineName} · {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p style={{ margin: '2px 0 12px', fontSize: 12 }}>Filters: {filterText.length ? filterText.join('; ') : 'None'} · {sortText} · {rows.length} {rows.length === 1 ? 'lead' : 'leads'}</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>{exportCols.map((c) => <th key={c.header} style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '4px 6px', fontWeight: 700 }}>{c.header}</th>)}</tr>
            </thead>
            <tbody>
              {exportRows(rows, exportCols).rows.slice(1).map((r, i) => (
                <tr key={i}>{r.map((v, j) => (
                  <td key={j} style={{ borderBottom: '1px solid #ccc', padding: '4px 6px' }}>
                    {v instanceof Date ? v.toLocaleDateString('en-US') : exportCols[j]!.header === 'Value' ? money(Number(v)) : String(v)}
                  </td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="rtable overflow-x-auto">
          {rows.length === 0 ? (
            <div className="py-12 text-center italic text-gray-500">No leads found.</div>
          ) : (
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <Th label="Lead #" />
                  <Th label="Lead Name" k="name" />
                  <Th label="Status" k="status" />
                  <Th label="Estimate" />
                  <Th label="Contact" />
                  <Th label="Location" />
                  <Th label="Source" k="source" />
                  <Th label="Service Type" k="service" />
                  <Th label="Value" k="value" />
                  <Th label="Created" k="date" />
                  <Th label="Action" className="text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pg.pageItems.map((l, i) => {
                  const est = lookups.estimate(l.estimateId);
                  const lc = LEAD_LIFECYCLE[l.status];
                  return (
                    <tr {...pressable(true, { row: true })}
                      key={l.id}
                      onClick={() => router.push(`/leads/${l.id}`)}
                      className={cn('cursor-pointer transition-colors hover:bg-gray-50', i % 2 ? 'bg-gray-50/50' : 'bg-white')}
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-xs font-medium text-gray-500">{l.leadNumber}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="whitespace-nowrap font-bold text-gray-900">{l.firstName} {l.lastName}</span>
                          {(l.qualityRating ?? 0) > 0 && (
                            <span className="flex items-center text-amber-400">
                              <span className="mr-0.5 text-xs font-bold text-amber-700">{l.qualityRating}</span>
                              <Star className="h-3 w-3 fill-current" />
                            </span>
                          )}
                        </div>
                        <span className={cn('mt-1 inline-flex rounded-full px-2 py-0.5 text-xxs font-bold uppercase tracking-wide', lc.color)}>{lc.label}</span>
                      </td>
                      <td className="px-5 py-4"><StageBadge stage={stageOf(l)} fallback={l.status} /></td>
                      <td className="px-5 py-4">
                        {est ? <RefChip href={`/estimates/${est.id}`}>{est.estimateNumber}</RefChip> : <span className="text-xs text-gray-500">-</span>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-0.5 text-xs text-gray-500">
                          <span className="flex items-center gap-1.5 whitespace-nowrap"><Phone className="h-3 w-3" />{formatPhone(l.phone) || '-'}</span>
                          <span className="flex items-center gap-1.5 whitespace-nowrap"><Mail className="h-3 w-3" />{l.email}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-gray-600">{l.city}, {l.state}</td>
                      <td className="px-5 py-4">
                        <LeadSourceChip lead={l} fallback={<span className="whitespace-nowrap rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-xxs font-medium text-gray-600">{l.leadSource}</span>} />
                        <PossibleDuplicateChip lead={l} className="mt-1" />
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-gray-600">{l.serviceType || '-'}</td>
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-gray-900">{money(l.estimatedValue)}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-500">{shortDate(l.date)}</td>
                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          items={[
                            { label: 'Edit', icon: <Edit2 />, onClick: () => onEdit(l) },
                            ...(canArchiveLeadStatus(l.status) && !lockOf(l.id) ? [{ label: 'Archive', icon: <Archive />, onClick: () => onArchive(l) }] : []),
                            { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => onDelete(l) },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t border-gray-200 px-4 pb-4">
          <Pagination
            page={pg.page} totalPages={pg.totalPages} onPage={pg.setPage}
            pageSize={pg.pageSize} onPageSize={pg.setPageSize}
            shown={pg.pageItems.length} total={pg.total}
          />
        </div>
      </div>
    </div>
  );
}

/** The lead's Sales stage, in the stage colour (CRM Part 2). */
function StageBadge({ stage, fallback }: { stage?: PipelineStage; fallback: string }) {
  if (!stage) return <Badge>{fallback}</Badge>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-bold text-gray-700">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
      {stage.displayName}
    </span>
  );
}
