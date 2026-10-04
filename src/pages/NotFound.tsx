import { Link } from 'react-router-dom'
import Seo from '../components/Seo'

export default function NotFound() {
  return (
    <div className="page empty">
      <Seo title="Page not found" noindex />
      <h1 className="page-title">Page not found</h1>
      <p>This page doesn't exist. Head back home to keep browsing.</p>
      <Link to="/" className="btn btn-primary">Go to Cucuflix home</Link>
    </div>
  )
}
