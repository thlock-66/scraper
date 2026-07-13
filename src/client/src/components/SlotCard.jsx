export default function SlotCard({ sport, date, slots }) {
  const dateObj = new Date(date + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)

  const formatted = dateObj.toLocaleDateString('en-SG', { weekday: 'long', month: 'short', day: 'numeric' })
  let prefix = ''
  if (dateObj.getTime() === today.getTime()) prefix = 'Today — '
  else if (dateObj.getTime() === tomorrow.getTime()) prefix = 'Tomorrow — '

  const dayType = slots[0]?.day_type
  const isWeekendDay = dayType === 'weekend'

  return (
    <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontSize: 15 }}>{prefix}{formatted}</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: isWeekendDay ? '#e8f5e9' : '#e3f2fd',
            color: isWeekendDay ? '#2e7d32' : '#1565c0',
          }}>
            {isWeekendDay ? 'Weekend' : 'Weekday'}
          </span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: '#f5f5f5', color: '#555', textTransform: 'capitalize',
          }}>
            {sport}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {slots.map((slot, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, fontSize: 14 }}>
            <span style={{ color: '#444', minWidth: 130, fontVariantNumeric: 'tabular-nums' }}>
              {slot.start_time} – {slot.end_time}
            </span>
            <span style={{ color: '#222' }}>{slot.venue}</span>
            <span style={{ color: '#888' }}>{slot.court}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
