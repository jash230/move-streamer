import { cleanup } from '../../api/cron.js'

export default async function scheduledCleanup() {
  const response = await cleanup()
  if (!response.ok) {
    throw new Error(`Nightly cleanup failed (${response.status}): ${await response.text()}`)
  }
}
