export const SITE = 'https://cucuflix.online'

// React 19 hoists these tags into <head>, so each route can set its own metadata.
export default function Seo({ title, description, path, noindex }: {
  title?: string
  description?: string
  path?: string
  noindex?: boolean
}) {
  return (
    <>
      <title>{title ? `${title} · Cucuflix` : 'Cucuflix: Watch Movies & TV Shows Online'}</title>
      {description && <meta name="description" content={description} />}
      {path !== undefined && <link rel="canonical" href={`${SITE}${path}`} />}
      {noindex && <meta name="robots" content="noindex, follow" />}
    </>
  )
}
