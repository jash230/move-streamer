import * as api from '../../api/tmdb.js'
import { netlifyFunction } from '../../api/_lib/netlify.js'

export default netlifyFunction(api)
export const config = { path: '/api/tmdb' }
