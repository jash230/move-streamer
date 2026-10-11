import { useMyList } from '../library'
import Row from './Row'

// Titles saved with the + button, newest first. Hidden while the list is empty.
export default function MyListRow() {
  const saved = useMyList()
  return saved.length ? <Row title="My List" items={saved} /> : null
}
