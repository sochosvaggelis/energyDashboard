import { useEffect } from 'react'
import './EditPanel.css'

export default function EditPanel({ isOpen, onClose, title, children, footer, width = '480px' }) {
  useEffect(() => {
    if (!isOpen) return
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // Lock body scroll while panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  return (
    <>
      <aside
        className={`edit-panel${isOpen ? ' open' : ''}`}
        style={{ '--panel-width': width }}
      >
        <div className="edit-panel-header">
          <h2 className="edit-panel-title">{title}</h2>
          <button className="edit-panel-close" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div className="edit-panel-body">
          {children}
        </div>
        {footer && (
          <div className="edit-panel-footer">
            {footer}
          </div>
        )}
      </aside>
    </>
  )
}
