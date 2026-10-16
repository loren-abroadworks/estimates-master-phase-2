import { describe, expect, it } from "vitest";
import { baselineSnapshots, jobCrewIds, latestForJob, removedFromShifts, scheduleUpdateMessage, type NotifyJob } from "./schedule-notify";

/* Oct 14 call: Job Scheduler email triggers. */

const AT = "2026-10-14T10:00:00Z";
const shift = (id: string, memberIds: string[]) => ({ id, name: id, startDate: "2026-10-20", endDate: "2026-10-21", startTime: "08:00", endTime: "16:00", memberIds });
const job = (shifts: ReturnType<typeof shift>[], extra: Partial<NotifyJob> = {}): NotifyJob => ({
  id: "J1", jobNumber: "JOB-1", title: "Smith", status: "Scheduled", startDate: "2026-10-20", endDate: "2026-10-21", startTime: "08:00", endTime: "16:00",
  crew: [], shifts, ...extra,
});

describe("Job Scheduler email triggers", () => {
  it("someone taken off a shift that stays is an auto-send; a deleted shift is not", () => {
    const before = job([shift("A", ["ana", "ben"]), shift("B", ["cy"])]);
    expect(removedFromShifts(before, job([shift("A", ["ana"]), shift("B", ["cy"])]))).toEqual(["ben"]);
    expect(removedFromShifts(before, job([shift("A", ["ana", "ben"])]))).toEqual([]);
    expect(removedFromShifts(before, job([shift("A", ["ana", "ben", "dee"]), shift("B", ["cy"])]))).toEqual([]);
  });

  it("the job's assigned crew comes from its crew and its shifts", () => {
    expect(jobCrewIds(job([shift("A", ["ana"])], { crew: [{ memberId: "ben", hours: 8 }] })).sort()).toEqual(["ana", "ben"]);
  });

  it("Send Emails sends the latest schedule: the waiting change, or the job as it stands", () => {
    const j = job([shift("A", ["ana"])]);
    const told = baselineSnapshots([j], AT);
    const current = latestForJob("ana", j, told);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ kind: "current", jobId: "J1" });
    const moved = { ...j, shifts: [{ ...shift("A", ["ana"]), startDate: "2026-10-22", endDate: "2026-10-23" }] };
    expect(latestForJob("ana", moved, told)[0]).toMatchObject({ kind: "changed" });
    expect(latestForJob("zed", j, told)).toEqual([]);
  });

  it("the email lists an unchanged job under Your current schedule", () => {
    const j = job([shift("A", ["ana"])]);
    const msg = scheduleUpdateMessage("Ana", latestForJob("ana", j, baselineSnapshots([j], AT)), { company: "Acme" });
    expect(msg.sections.map((x) => x.title)).toEqual(["Your current schedule"]);
  });
});
