import * as api from '../../api/cron.js'
import { netlifyFunction } from '../../api/_lib/netlify.js'

export default netlifyFunction(api)
export const config = { path: '/api/cron' }
