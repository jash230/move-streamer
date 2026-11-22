import * as api from '../../api/e.js'
import { netlifyFunction } from '../../api/_lib/netlify.js'

export default netlifyFunction(api)
export const config = { path: '/api/e' }
