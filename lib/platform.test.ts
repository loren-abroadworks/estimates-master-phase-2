import { describe, expect, it } from 'vitest';
import { createInitialDatabase } from './sampleData';
import {
  calendarItems, commissions, layoutFor, messageAge, monthlyRevenue, moneyAbbrev, pendingOrTrial, pipelineTiles, platformRecords, reorder,
  subscriberTable, tierOfPlan, upcomingPresentations, yearlySales,
} from './platform';
import type { Database } from './types';

const NOW = new Date('2026-10-16T12:00:00');
const MONTH = { preset: 'this_month' } as const;
const tiles = (db: Database) => Object.fromEntries(pipelineTiles(db, MONTH, NOW).map((t) => [t.label, t.value]));

describe('Admin Portal dashboard', () => {
  it('counts the sample like the live portal on 16 Oct 2026', () => {
    const db = createInitialDatabase();
    expect(tiles(db)).toEqual({ Leads: 2, Presentations: 1, Pending: 1, Growth: 2, Enterprise: 2, 'Trial Run': 1, 'Growth (Month to Month)': 1 });
    const table = subscriberTable(db, NOW);
    expect(table.map((r) => [r.period, r.added, r.active, r.actual])).toEqual([['Day', 0, 6, 7], ['Week', 0, 6, 7], ['Month', 0, 6, 7], ['Year', 9, 6, 7]]);
    expect(pendingOrTrial(db, NOW).map((x) => [x.subscriber.company, x.days])).toEqual([['advance paints', 29]]);
    expect(messageAge(db.collections.platformMessages[0]!.at, NOW)).toBe('29d');
  });

  it('works out revenue, change on last month, goal and commission', () => {
    const db = createInitialDatabase();
    // October: Estimate Master Demo 499 + Coastal 79 + Master's Touch setup 499. September adds Technologia's 129 renewal.
    expect(monthlyRevenue(db, NOW)).toMatchObject({ revenue: 1077, previous: 707, change: 52.3, target: 0 });
    const y = yearlySales(db, NOW);
    expect(y.goal).toBe(67000);
    expect(y.pct).toBe(Math.round((y.sales / 67000) * 100));
    // Only Sales Rep (10%) has a subscriber paying in October: Coastal, $79.
    expect(commissions(db, MONTH, NOW).total).toBe(7.9);
  });

  it('follows the organization’s own Settings › Subscription', () => {
    const db = createInitialDatabase();
    db.singletons.subscription.planName = 'PLATINUM-DONE FOR YOU';
    expect(tiles(db)).toMatchObject({ Enterprise: 3, 'Growth (Month to Month)': 0 });
    db.singletons.subscription.status = 'Cancelled';
    expect(subscriberTable(db, NOW)[0]).toMatchObject({ active: 5, actual: 6 });
    db.singletons.businessProfile.companyName = 'Renamed Co';
    expect(platformRecords(db).subscribers.find((s) => s.linked)?.company).toBe('Renamed Co');
    // A new paid charge this month counts at once.
    db.singletons.subscription.billingHistory.unshift({ id: 'x', date: '2026-10-15', description: 'Upgrade', amount: 100, status: 'Paid', type: 'charge' });
    expect(monthlyRevenue(db, NOW).revenue).toBe(1177);
  });

  it('updates when admin records change', () => {
    const db = createInitialDatabase();
    db.collections.platformLeads.push({ id: 'n', company: 'New Co', contactName: '', email: '', stage: 'Presentation', createdAt: '2026-10-16', presentationAt: '2026-10-16T15:00:00', repId: 'ps_abhay' });
    expect(tiles(db)).toMatchObject({ Leads: 3, Presentations: 2 });
    expect(upcomingPresentations(db, NOW).map((l) => l.company)).toEqual(['New Co', 'Lone Star Coatings']);
    expect(calendarItems(db, 'day', 'ps_abhay', NOW).map((i) => i.title)).toEqual(['Presentation: New Co']);
  });

  it('filters the calendar by salesman and view', () => {
    const db = createInitialDatabase();
    expect(calendarItems(db, 'day', 'all', NOW).map((i) => i.id)).toEqual(['pe_1']);
    expect(calendarItems(db, 'week', 'all', NOW).map((i) => i.id)).toEqual(['pe_1', 'pe_2']);
    expect(calendarItems(db, 'week', 'ps_abhay', NOW)).toEqual([]);
    expect(calendarItems(db, 'month', 'ps_abhay', NOW).map((i) => i.id)).toEqual(['pe_3']);
  });
});

describe('helpers', () => {
  it('maps plan names to tiers', () => {
    expect(['Growth', 'INSTANT GROWTH', 'PLATINUM-DONE FOR YOU', 'Founder Membership'].map(tierOfPlan)).toEqual(['Growth', 'Growth', 'Enterprise', 'Starter']);
  });
  it('abbreviates money', () => {
    expect([1076, 67000, 999, 1_250_000].map(moneyAbbrev)).toEqual(['$1k', '$67k', '$999', '$1.3M']);
  });
  it('reorders and repairs layouts', () => {
    expect(reorder(['presentations', 'actions', 'messages'], 'presentations', 'messages')).toEqual(['actions', 'messages', 'presentations']);
    expect(reorder(['presentations', 'actions', 'messages'], 'messages', 'presentations')).toEqual(['messages', 'presentations', 'actions']);
    expect(layoutFor({ order: ['commission'], wide: [] }).order[0]).toBe('commission');
    expect(layoutFor({ order: ['commission'], wide: [] }).order).toHaveLength(9);
  });
});
