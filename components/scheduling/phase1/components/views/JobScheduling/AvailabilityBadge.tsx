import React from 'react';
import { formatAvailWindow, type DayAvailability } from '../../../services/crewAvailability';

interface AvailabilityBadgeProps {
  avail: DayAvailability;
  /** Positioning (and anything else) from the caller: the board pins it to a cell
   *  corner, the hours grid lets it sit in the cell's top row. */
  className?: string;
}

/** One member-day's availability, as a pill: their reason (or "Off") on a day off, their
 *  working window otherwise.
 *
 *  Shared by the Board and the Hours grid so the same fact reads the same way in both.
 *  The tone marks a STATUS, not a problem — a booking that fights this availability is
 *  the amber conflict flag on the chip itself, which is a different statement. */
export const AvailabilityBadge = ({ avail, className = '' }: AvailabilityBadgeProps) => (
  <div
    title={avail.off ? avail.reason || undefined : undefined}
    className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded w-max tabular-nums ${
      avail.off
        ? 'text-red-500 bg-red-50 dark:bg-red-900/30'
        : 'text-gray-400 bg-gray-50 dark:bg-gray-900/40'
    } ${className}`}
  >
    {formatAvailWindow(avail)}
  </div>
);
