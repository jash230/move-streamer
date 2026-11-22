import * as api from '../../api/stream.js'
import { netlifyFunction } from '../../api/_lib/netlify.js'

export default netlifyFunction(api)
export const config = { path: '/api/stream' }
