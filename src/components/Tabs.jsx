import './Tabs.css'

export default function Tabs({ tabs, active, onChange }) {
  return (
    <nav className="tabs">
      {tabs.map(tab => (
        <button
          key={tab}
          className={`tab-btn${active === tab ? ' active' : ''}`}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </nav>
  )
}
