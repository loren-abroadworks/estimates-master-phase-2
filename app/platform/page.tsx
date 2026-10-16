import { redirect } from 'next/navigation';

/** /platform opens the Admin Portal dashboard. */
export default function PlatformIndex() {
  redirect('/platform/dashboard');
}
