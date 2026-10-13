/**
 * CRM Part 1 and Part 2 demo records, added after the host seed.
 *
 * - Form leads from the seeded form links (lib/data/settings-config.ts
 *   trackedLinks): two from Instagram, one each from Website, Facebook and
 *   Google (Google starts in Contacted).
 * - Two different "John Smith" records at different addresses: the second,
 *   from the Facebook link, shows on Lead Review as a Possible match. The
 *   Strong match (same phone) is Jordan Irons and Jeremy Irons from the
 *   marketing seed.
 * - Three leads on the Training pipeline (shown with dynamicPipelines on).
 *
 * Each person has a property, so their leads carry a full address. The
 * replica runs the match check over form leads on first load (lib/crm.ts reviewsFor).
 */
import type { Database, Lead } from "@/features/types";

const PEOPLE = [
  { id: "C-JSMITH-1", name: "John Smith", phone: "(469) 555-0123", email: "john.smith@example.com", address: "22 Oak Hollow Ln", city: "Dallas", zip: "75218" },
  { id: "C-JSMITH-2", name: "John Smith", phone: "(214) 555-0188", email: "jsmith.home@example.com", address: "905 Preston Rd", city: "Plano", zip: "75093" },
  { id: "C-NORA", name: "Nora Bell", phone: "(469) 555-0197", email: "nora.bell@example.com", address: "1500 Main St", city: "Frisco", zip: "75034" },
  { id: "C-LUIS", name: "Luis Ortega", phone: "(214) 555-0126", email: "luis.ortega@example.com", address: "76 Cedar Springs Rd", city: "Dallas", zip: "75204" },
  { id: "C-PRIYA", name: "Priya Nair", phone: "(972) 555-0153", email: "priya.nair@example.com", address: "640 Greenway Blvd", city: "Richardson", zip: "75080" },
  { id: "C-GRACE", name: "Grace Park", phone: "(972) 555-0168", email: "grace.park@example.com", address: "12 Elm St", city: "Lakewood", zip: "75214" },
];

export function crmSeed(db: Database, nowIso: string) {
  const base = new Date(nowIso).getTime();
  const d = (days: number) => new Date(base + days * 86_400_000).toISOString();
  for (const p of PEOPLE) {
    db.customers.push({ id: p.id, name: p.name, phone: p.phone, email: p.email, contactVerified: false, preferredChannel: "phone", consentSigned: false, authorisedSigners: [] });
    db.properties.push({
      id: `PROP-${p.id}`, address: p.address, city: p.city, state: "TX", zip: p.zip, type: "single_family", optOut: false,
      ownership: [{ id: `OWN-${p.id}`, customerId: p.id, start: d(-90) }],
    });
  }

  const next = () => `LEAD-2026-${++db.counters.lead}`;
  const person = (id: string) => PEOPLE.find((p) => p.id === id)!;
  const form = (customerId: string, created: number, link: string, sourceLabel: string, x: Partial<Lead>): Lead => {
    const p = person(customerId);
    const ref = `WEB-seed-${customerId.toLowerCase()}`;
    return {
      id: next(), customerId, propertyId: `PROP-${customerId}`, source: "website", sourceLabel, stage: "new_lead", createdAt: d(created), lastActivityAt: d(created),
      name: p.name, phone: p.phone, email: p.email, eventRef: ref, trackedLinkId: link, events: [{ ref, at: d(created), message: x.message ?? "" }], ...x,
    };
  };

  const jeremy = db.leads.find((l) => l.id === "LEAD-2026-3");
  if (jeremy) jeremy.pipelineStages = { pl_training: "ps_tr_done" };

  const smith = person("C-JSMITH-1");
  db.leads.push(
    {
      id: next(), customerId: smith.id, propertyId: `PROP-${smith.id}`, source: "referral", stage: "contacted", createdAt: d(-60), lastActivityAt: d(-20),
      name: smith.name, phone: smith.phone, email: smith.email, note: "Referred by Korah Singer. Exterior trim and front door.",
    },
    form("C-GRACE", -5, "tl_website", "Website", { paintType: "Interior", message: "Living room and stairwell." }),
    form("C-PRIYA", -4, "tl_google", "Google", { stage: "contacted", paintType: "Exterior", message: "Found you on Google. Exterior repaint, two storeys." }),
    form("C-LUIS", -6, "tl_instagram", "Instagram", { stage: "contacted", paintType: "Cabinets", message: "Loved the cabinet reel. Kitchen cabinets, white.", pipelineStages: { pl_training: "ps_tr_demo" } }),
    form("C-NORA", -1, "tl_instagram", "Instagram", { paintType: "Interior", message: "Nursery and hallway, low-VOC please.", pipelineStages: { pl_training: "ps_tr_intro" } }),
    form("C-JSMITH-2", -2, "tl_facebook", "Facebook", { paintType: "Both", message: "Whole house, inside and out." }),
  );
}
