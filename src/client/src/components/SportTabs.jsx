const SPORT_ORDER = ['badminton', 'pickleball']

export default function SportTabs({ active, onChange, availableSports }) {
  const tabs = ['all', ...SPORT_ORDER.filter(s => availableSports.includes(s))]

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
      {tabs.map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          style={{
            padding: '6px 14px',
            borderRadius: 4,
            border: '1px solid #ccc',
            background: active === tab ? '#222' : '#fff',
            color: active === tab ? '#fff' : '#333',
            cursor: 'pointer',
            textTransform: 'capitalize',
          }}
        >
          {tab === 'all' ? 'All Sports' : tab}
        </button>
      ))}
    </div>
  )
}
