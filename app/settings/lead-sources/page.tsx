'use client';

/*
  Settings > Lead Sources (Oct 14 call: source creation moved from CRM Part 2
  into Part 1). Sources aren't tied to form links: add any source, for example
  Home Show for paper sign-ups at events. New sources appear in the form-link
  and Lead Pipeline Sources dropdowns. The list itself: LeadSourcesPanel.
*/
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { LeadSourcesPanel } from '@/components/settings/config/LeadSourcesPanel';

export default function Page() {
  return (
    <SettingsPage title="Lead Sources" subtitle="Where your leads come from. New sources appear in the form-link and Lead Pipeline source dropdowns.">
      <LeadSourcesPanel />
    </SettingsPage>
  );
}
