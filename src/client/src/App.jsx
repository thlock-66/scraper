import { useState, useEffect, useCallback } from 'react'
import StatusHeader from './components/StatusHeader.jsx'
import SportTabs from './components/SportTabs.jsx'
import SlotCard from './components/SlotCard.jsx'

export default function App() {
  const [slots, setSlots] = useState({})
  const [status, setStatus] = useState({ lastScrapedAt: null, success: false })
  const [activeSport, setActiveSport] = useState('all')
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    const [slotsRes, statusRes] = await Promise.all([
      fetch('/api/slots'),
      fetch('/api/status'),
    ])
    setSlots(await slotsRes.json())
    setStatus(await statusRes.json())
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchData])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await fetch('/api/scrape', { method: 'POST' })
      await fetchData()
    } finally {
      setRefreshing(false)
    }
  }

  const availableSports = Object.keys(slots)
  const sportsToShow = activeSport === 'all' ? availableSports : [activeSport]

  const entries = sportsToShow.flatMap(sport =>
    Object.entries(slots[sport] || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dateSlots]) => ({ sport, date, slots: dateSlots }))
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <StatusHeader status={status} onRefresh={handleRefresh} refreshing={refreshing} />
      <SportTabs active={activeSport} onChange={setActiveSport} availableSports={availableSports} />
      {entries.length === 0 ? (
        <p style={{ color: '#999', marginTop: 32 }}>No available slots found.</p>
      ) : (
        entries.map(({ sport, date, slots: dateSlots }) => (
          <SlotCard key={`${sport}-${date}`} sport={sport} date={date} slots={dateSlots} />
        ))
      )}
    </div>
  )
}
