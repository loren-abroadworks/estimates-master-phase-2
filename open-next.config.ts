// OpenNext adapter settings for Cloudflare Workers. The app has no ISR or
// data cache, so no R2 incremental cache is configured.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({});
