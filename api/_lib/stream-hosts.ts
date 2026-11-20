// VidRock CDN domains the /api/stream proxy is allowed to fetch (host or any subdomain).
// This is the SSRF guard: the proxy refuses any URL outside this set. VidRock rotates CDNs,
// so if a server stops playing, capture its decrypted .m3u8 host and add its base domain here.
export const STREAM_ALLOW = ['vercetti.org', 'ngcloud.tech', 'hscow.com', 'rapidcloud.live', 'electricmirage.site']
