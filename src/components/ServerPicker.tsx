import { SERVERS, type Server } from '../api'

// Labels a server by its position for analytics (the admin pages). The on-page picker is gone now
// that VidRock is the only source; historical rows for removed servers fall back to their raw id.
export const serverLabel = (s: Server) => `Server ${SERVERS.indexOf(s) + 1}`
