import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import './App.css'

const API_BASE = '/api'

const CATEGORY_LABELS = {
  all: 'All',
  unrated: '☆ Not starred',
  starred: '⭐ Starred',
  zoo: '🦁 Zoo',
  museum: '🏛️ Museum',
  climbing: '🧗 Climbing',
  swimming: '🏊 Swimming',
  education: '📚 Education',
  playground: '🎠 Playground',
  festival: '🎪 Festival',
  aggregator: '📑 Aggregator',
  article: '📰 Article',
  other: '✨ Other'
}

// Categories that are toggled separately (not in main filter list)
const TOGGLE_CATEGORIES = ['aggregator', 'article']

const CATEGORY_ICONS = {
  zoo: '🦁',
  museum: '🏛️',
  climbing: '🧗',
  swimming: '🏊',
  education: '📚',
  playground: '🎠',
  festival: '🎪',
  aggregator: '📑',
  other: '✨'
}

// Default categories (can be extended by user)
const DEFAULT_CATEGORIES = [
  'museum',
  'playground',
  'sports',
  'indoor',
  'outdoor',
  'zoo',
  'theater',
  'swimming',
  'climbing',
  'park',
  'cafe',
  'festival',
  'education',
  'aggregator',
  'other',
]

function StarRating({ rating, onRate }) {
  const [hovered, setHovered] = useState(0)
  
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          className={`star ${star <= (hovered || rating || 0) ? 'filled' : ''}`}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={(e) => {
            e.stopPropagation()
            // If clicking the same rating, remove it
            onRate(star === rating ? null : star)
          }}
          title={star === rating ? 'Click to remove rating' : `Rate ${star} star${star > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
      {rating && <span className="rating-text">{rating}/5</span>}
    </div>
  )
}

function CategorySelect({ category, allCategories, onChange }) {
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  
  // Merge default categories with any custom ones from data
  const categories = useMemo(() => {
    const all = new Set([...DEFAULT_CATEGORIES, ...allCategories])
    return Array.from(all).sort()
  }, [allCategories])
  
  const handleSelectChange = (e) => {
    const value = e.target.value
    if (value === '__new__') {
      setIsAddingNew(true)
    } else {
      onChange(value)
    }
  }
  
  const handleAddNew = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const trimmed = newCategory.trim().toLowerCase().replace(/\s+/g, '-')
    if (trimmed) {
      onChange(trimmed)
      setNewCategory('')
      setIsAddingNew(false)
    }
  }
  
  const handleCancel = (e) => {
    e.stopPropagation()
    setIsAddingNew(false)
    setNewCategory('')
  }
  
  if (isAddingNew) {
    return (
      <div className="category-select adding-new" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          className="new-category-input"
          placeholder="New category name..."
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddNew(e)
            if (e.key === 'Escape') handleCancel(e)
          }}
          autoFocus
        />
        <button className="add-category-btn" onClick={handleAddNew} title="Add">✓</button>
        <button className="cancel-category-btn" onClick={handleCancel} title="Cancel">✕</button>
      </div>
    )
  }
  
  return (
    <div className="category-select" onClick={(e) => e.stopPropagation()}>
      <select 
        value={category || 'other'} 
        onChange={handleSelectChange}
        className={`category-dropdown category-${category || 'other'}`}
      >
        {categories.map(cat => (
          <option key={cat} value={cat}>
            {CATEGORY_LABELS[cat] || cat}
          </option>
        ))}
        <option value="__new__">➕ Add new...</option>
      </select>
    </div>
  )
}

function ActivityMenu({ activity, onDelete, onSetCategory, onOpenNote, onRemoveNote, onOpenName }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)
  const hasNote = !!(activity.userComment && activity.userComment.trim())

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  const close = () => setIsOpen(false)

  return (
    <div className="activity-menu" ref={menuRef}>
      <button
        type="button"
        className="activity-menu__trigger"
        onClick={(e) => { e.stopPropagation(); setIsOpen((v) => !v) }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="More actions"
        title="More actions"
      >
        ⋮
      </button>
      {isOpen && (
        <div className="activity-menu__dropdown" role="menu">
          <button type="button" className="activity-menu__item" role="menuitem" onClick={() => { close(); onOpenName() }}>
            ✏️ Edit name
          </button>
          <div className="activity-menu__sep" />
          {hasNote ? (
            <>
              <button type="button" className="activity-menu__item" role="menuitem" onClick={() => { close(); onOpenNote() }}>
                ✏️ Edit note
              </button>
              <button type="button" className="activity-menu__item" role="menuitem" onClick={() => { close(); onRemoveNote() }}>
                🗒️ Remove note
              </button>
            </>
          ) : (
            <button type="button" className="activity-menu__item" role="menuitem" onClick={() => { close(); onOpenNote() }}>
              📝 Add note
            </button>
          )}
          <button
            type="button"
            className="activity-menu__item"
            role="menuitem"
            onClick={() => { close(); onSetCategory('aggregator') }}
          >
            📑 Mark as aggregator
          </button>
          <button
            type="button"
            className="activity-menu__item"
            role="menuitem"
            onClick={() => { close(); onSetCategory('article') }}
          >
            📰 Mark as article
          </button>
          <div className="activity-menu__sep" />
          <button
            type="button"
            className="activity-menu__item activity-menu__item--danger"
            role="menuitem"
            onClick={() => { close(); onDelete() }}
          >
            🗑️ Delete
          </button>
        </div>
      )}
    </div>
  )
}

function NoteModal({ activity, onSave, onClose }) {
  const [text, setText] = useState(activity?.userComment || '')

  if (!activity) return null

  const handleSave = () => {
    onSave(text)
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave()
  }

  return (
    <div className="note-modal__overlay" onClick={onClose}>
      <div className="note-modal__dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="note-modal__title">
          {activity.userComment ? 'Edit note' : 'Add note'}
        </h3>
        <div className="note-modal__activity">{activity.shortName || activity.url}</div>
        <textarea
          className="note-modal__textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a note about this activity..."
          autoFocus
          rows={5}
        />
        <div className="note-modal__actions">
          <span className="note-modal__hint">Ctrl+Enter to save, Esc to cancel</span>
          <button type="button" className="note-modal__cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="note-modal__save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

function NameModal({ activity, onSave, onClose }) {
  const [value, setValue] = useState(activity?.shortName || '')

  if (!activity) return null

  const handleSave = () => {
    onSave(value.trim())
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <div className="note-modal__overlay" onClick={onClose}>
      <div className="note-modal__dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="note-modal__title">Edit name</h3>
        <div className="note-modal__activity">{activity.url}</div>
        <input
          type="text"
          className="name-modal__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Activity name"
          autoFocus
        />
        <div className="note-modal__actions">
          <span className="note-modal__hint">Enter to save, Esc to cancel</span>
          <button type="button" className="note-modal__cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="note-modal__save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

function ActivityCard({ activity, onRatingChange, onRemove, onCategoryChange, onCommentChange, onOpenNote, onOpenName, allCategories }) {
  const handleRemove = () => {
    onRemove(activity.url)
  }

  const handleCategorySelect = (newCategory) => {
    onCategoryChange(activity.url, newCategory)
  }

  const handleRemoveNote = () => {
    onCommentChange(activity.url, '')
  }

  const hasNote = !!(activity.userComment && activity.userComment.trim())

  const handleRowClick = (e) => {
    // Ignore clicks on inner interactive controls — they have their own behavior.
    if (e.target.closest('button, input, select, textarea, a, label, [role="menu"]')) {
      return
    }
    if (!activity.url) return
    window.open(activity.url, '_blank', 'noopener,noreferrer')
  }

  const handleRowKeyDown = (e) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (activity.url) window.open(activity.url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <article
      className="activity-list-item"
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      role={activity.url ? 'link' : undefined}
      tabIndex={activity.url ? 0 : undefined}
      title={activity.url ? `Open ${activity.url} in new tab` : undefined}
    >
      <div className="activity-list-item__name">
        <span className="activity-list-item__name-text">
          {activity.shortName || 'Unnamed Activity'}
        </span>
      </div>

      <StarRating
        rating={activity.userRating}
        onRate={(rating) => onRatingChange(activity.url, rating)}
      />

      <div className="activity-list-item__category">
        <CategorySelect
          category={activity.category}
          allCategories={allCategories}
          onChange={handleCategorySelect}
        />
      </div>

      {hasNote && (
        <button
          type="button"
          className="activity-list-item__note"
          onClick={() => onOpenNote(activity)}
          title="Click to edit note"
        >
          <span className="activity-list-item__note-icon" aria-hidden="true">📝</span>
          <span className="activity-list-item__note-text">{activity.userComment}</span>
        </button>
      )}

      <ActivityMenu
        activity={activity}
        onDelete={handleRemove}
        onSetCategory={handleCategorySelect}
        onOpenNote={() => onOpenNote(activity)}
        onRemoveNote={handleRemoveNote}
        onOpenName={() => onOpenName(activity)}
      />
    </article>
  )
}

function LoadingSpinner() {
  return (
    <div className="loading-container">
      <div className="loading-spinner"></div>
      <p>Loading activities...</p>
    </div>
  )
}

function ErrorMessage({ message, onRetry }) {
  return (
    <div className="error-container">
      <div className="error-icon">⚠️</div>
      <p>{message}</p>
      {onRetry && (
        <button className="retry-btn" onClick={onRetry}>
          🔄 Retry
        </button>
      )}
    </div>
  )
}

function App() {
  const [activities, setActivities] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [noteModalUrl, setNoteModalUrl] = useState(null)
  const [nameModalUrl, setNameModalUrl] = useState(null)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [sidebarDragX, setSidebarDragX] = useState(null) // null = not dragging, number = current position
  const searchInputRef = useRef(null)
  const sidebarRef = useRef(null)
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const isDragging = useRef(false)
  const sidebarWidth = useRef(280)

  // Block body scroll when sidebar is open or being dragged
  useEffect(() => {
    const shouldBlockScroll = isMobileMenuOpen || sidebarDragX !== null
    if (shouldBlockScroll) {
      document.body.style.overflow = 'hidden'
      document.body.style.touchAction = 'none'
    } else {
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
    }
    return () => {
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
    }
  }, [isMobileMenuOpen, sidebarDragX])

  // Swipe gesture handling for mobile menu - follows finger
  useEffect(() => {
    const handleTouchStart = (e) => {
      const startX = e.touches[0].clientX
      touchStartX.current = startX
      touchStartY.current = e.touches[0].clientY
      
      // Get sidebar width
      if (sidebarRef.current) {
        sidebarWidth.current = sidebarRef.current.offsetWidth
      }
      
      // Start dragging if: from left edge (to open) or sidebar is open (to close)
      if (startX < 30 || isMobileMenuOpen) {
        isDragging.current = true
      }
    }

    const handleTouchMove = (e) => {
      if (!isDragging.current || touchStartX.current === null) return
      
      const currentX = e.touches[0].clientX
      const currentY = e.touches[0].clientY
      const deltaX = Math.abs(currentX - touchStartX.current)
      const deltaY = Math.abs(currentY - touchStartY.current)
      
      // If horizontal movement is significant, prevent vertical scroll
      if (deltaX > 10 && deltaX > deltaY) {
        e.preventDefault()
      }
      
      // Cancel if scrolling vertically more than horizontally
      if (deltaY > 50 && deltaY > deltaX) {
        isDragging.current = false
        setSidebarDragX(null)
        return
      }
      
      // Calculate sidebar position
      let position
      if (isMobileMenuOpen) {
        // Dragging to close: start from 0 (fully open)
        position = Math.min(0, currentX - touchStartX.current)
      } else {
        // Dragging to open: start from -sidebarWidth (fully closed)
        position = Math.min(0, -sidebarWidth.current + currentX)
      }
      
      setSidebarDragX(position)
    }

    const handleTouchEnd = (e) => {
      if (!isDragging.current) {
        touchStartX.current = null
        touchStartY.current = null
        return
      }
      
      const endX = e.changedTouches[0].clientX
      const deltaX = endX - touchStartX.current
      const velocity = deltaX / 10 // Simple velocity estimate
      
      // Decide whether to open or close based on position and velocity
      if (sidebarDragX !== null) {
        const threshold = -sidebarWidth.current / 2
        const shouldOpen = sidebarDragX > threshold || velocity > 5
        const shouldClose = sidebarDragX < threshold || velocity < -5
        
        if (isMobileMenuOpen) {
          setIsMobileMenuOpen(!shouldClose)
        } else {
          setIsMobileMenuOpen(shouldOpen)
        }
      }
      
      // Reset
      isDragging.current = false
      touchStartX.current = null
      touchStartY.current = null
      setSidebarDragX(null)
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isMobileMenuOpen, sidebarDragX])

  // Calculate sidebar style for dragging
  const getSidebarStyle = () => {
    if (sidebarDragX !== null && typeof window !== 'undefined' && window.innerWidth <= 768) {
      // During drag: follow finger, no transition
      return {
        transform: `translateX(${sidebarDragX}px)`,
        transition: 'none'
      }
    }
    // Not dragging: use CSS classes for animation
    return {}
  }

  // Fetch activities from API
  const fetchActivities = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${API_BASE}/activities`)
      if (!response.ok) {
        throw new Error('Failed to load activities')
      }
      const data = await response.json()
      setActivities(data)
    } catch (err) {
      console.error('Error fetching activities:', err)
      setError('Failed to load activities. Please check your connection.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load activities on mount
  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])
  
  // All unique categories from activities (for CategorySelect)
  const allCategories = useMemo(() => {
    return Array.from(new Set(activities.map(a => a.category).filter(Boolean)))
  }, [activities])
  
  // Categories for sidebar filter (includes 'all')
  const categories = useMemo(() => {
    const cats = new Set(activities.map(a => a.category || 'other'))
    // Exclude toggle categories from main filter list
    const mainCats = Array.from(cats).filter(c => !TOGGLE_CATEGORIES.includes(c)).sort()
    return ['all', 'unrated', 'starred', ...mainCats]
  }, [activities])
  
  const filteredActivities = useMemo(() => {
    let result = activities
    
    // Filter by category or special filters
    if (activeCategory === 'unrated') {
      // Not starred: exclude aggregator and article by default
      result = result.filter(a => {
        const cat = a.category || 'other'
        return !a.userRating && !TOGGLE_CATEGORIES.includes(cat)
      })
    } else if (activeCategory === 'starred') {
      // Starred: show only rated activities
      result = result.filter(a => a.userRating)
    } else if (activeCategory !== 'all') {
      result = result.filter(a => (a.category || 'other') === activeCategory)
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(a =>
        a.shortName?.toLowerCase().includes(query) ||
        a.description?.toLowerCase().includes(query) ||
        a.url?.toLowerCase().includes(query) ||
        a.address?.toLowerCase().includes(query) ||
        a.services?.some(s => s.toLowerCase().includes(query))
      )
    }

    // Sort by createdAt descending (newest first). createdAt is an ISO date
    // string (YYYY-MM-DD) so lexicographic compare matches chronological order.
    // Empty createdAt sorts last.
    return [...result].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    )
  }, [activities, activeCategory, searchQuery])
  
  const stats = useMemo(() => ({
    total: activities.length,
    categories: new Set(activities.map(a => a.category)).size,
    visible: filteredActivities.length,
    rated: activities.filter(a => a.userRating).length
  }), [activities, filteredActivities])

  const handleRatingChange = useCallback(async (url, rating) => {
    try {
      const response = await fetch(`${API_BASE}/activities/rating`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, rating })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update rating')
      }
      
      const { activity } = await response.json()
      
      // Update local state
      setActivities(prev => prev.map(a => 
        a.url === url ? { ...a, userRating: activity.userRating } : a
      ))
    } catch (error) {
      console.error('Error updating rating:', error)
      alert('Failed to update rating. Please try again.')
    }
  }, [])

  const handleRemove = useCallback(async (url) => {
    try {
      const response = await fetch(`${API_BASE}/activities`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      
      if (!response.ok) {
        throw new Error('Failed to remove activity')
      }
      
      // Update local state - remove the activity
      setActivities(prev => prev.filter(a => a.url !== url))
    } catch (error) {
      console.error('Error removing activity:', error)
      alert('Failed to remove activity. Please try again.')
    }
  }, [])

  const handleCategoryChange = useCallback(async (url, category) => {
    try {
      const response = await fetch(`${API_BASE}/activities/category`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, category })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update category')
      }
      
      const { activity } = await response.json()
      
      // Update local state
      setActivities(prev => prev.map(a => 
        a.url === url ? { ...a, category: activity.category } : a
      ))
    } catch (error) {
      console.error('Error updating category:', error)
      alert('Failed to update category. Please try again.')
    }
  }, [])

  const handleCommentChange = useCallback(async (url, comment) => {
    try {
      const response = await fetch(`${API_BASE}/activities/comment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, comment })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update comment')
      }
      
      const { activity } = await response.json()
      
      // Update local state
      setActivities(prev => prev.map(a => 
        a.url === url ? { ...a, userComment: activity.userComment } : a
      ))
    } catch (error) {
      console.error('Error updating comment:', error)
      alert('Failed to update comment. Please try again.')
    }
  }, [])

  const noteModalActivity = useMemo(
    () => (noteModalUrl ? activities.find(a => a.url === noteModalUrl) : null) || null,
    [noteModalUrl, activities]
  )

  const handleOpenNote = useCallback((activity) => {
    setNoteModalUrl(activity.url)
  }, [])

  const handleCloseNote = useCallback(() => {
    setNoteModalUrl(null)
  }, [])

  const nameModalActivity = useMemo(
    () => (nameModalUrl ? activities.find(a => a.url === nameModalUrl) : null) || null,
    [nameModalUrl, activities]
  )

  const handleOpenName = useCallback((activity) => {
    setNameModalUrl(activity.url)
  }, [])

  const handleCloseName = useCallback(() => {
    setNameModalUrl(null)
  }, [])

  const handleNameChange = useCallback(async (url, name) => {
    try {
      const response = await fetch(`${API_BASE}/activities/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update name')
      }
      
      const { activity } = await response.json()
      
      // Update local state
      setActivities(prev => prev.map(a => 
        a.url === url ? { ...a, shortName: activity.shortName } : a
      ))
    } catch (error) {
      console.error('Error updating name:', error)
    }
  }, [])

  // Handle Escape key: go back / reset filters / focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Don't trigger if user is in an input/textarea (let them handle it first)
        const activeEl = document.activeElement
        if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') {
          activeEl.blur()
          return
        }
        
        // Reset filters and focus search
        setActiveCategory('all')
        setSearchQuery('')
        searchInputRef.current?.focus()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Show loading state
  if (isLoading) {
    return (
      <div className="app-layout">
        <aside className="sidebar"></aside>
        <main className="main-content">
          <header className="header">
            <h1>🎨 Kinder Activities</h1>
            <p>Discover fun activities for kids and families</p>
          </header>
          <LoadingSpinner />
        </main>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="app-layout">
        <aside className="sidebar"></aside>
        <main className="main-content">
          <header className="header">
            <h1>🎨 Kinder Activities</h1>
            <p>Discover fun activities for kids and families</p>
          </header>
          <ErrorMessage message={error} onRetry={fetchActivities} />
        </main>
      </div>
    )
  }

  return (
    <div className="app-layout">
      {/* Mobile menu overlay */}
      <div 
        className={`sidebar-overlay ${isMobileMenuOpen ? 'visible' : ''}`}
        onClick={() => setIsMobileMenuOpen(false)}
      />
      
      {/* Swipe indicator for mobile */}
      <div className="swipe-indicator" />
      
      {/* Sidebar with search and filters */}
      <aside 
        ref={sidebarRef}
        className={`sidebar ${isMobileMenuOpen ? 'open' : ''} ${sidebarDragX !== null ? 'dragging' : ''}`}
        style={getSidebarStyle()}
      >
        <div className="search-container">
          <span className="search-icon">🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            className="search-input"
            placeholder="Search activities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              className="search-clear" 
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>
        
        <nav className="sidebar-filters">
          {categories.map(cat => (
            <button
              key={cat}
              className={`sidebar-filter-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory(cat)
                setIsMobileMenuOpen(false)
              }}
            >
              {CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </nav>
        
        <div className="sidebar-toggles">
          <div className="sidebar-toggles-label">Other categories:</div>
          <div className="sidebar-toggle-buttons">
            <button
              className={`sidebar-toggle-btn ${activeCategory === 'aggregator' ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory('aggregator')
                setIsMobileMenuOpen(false)
              }}
            >
              {CATEGORY_LABELS.aggregator}
            </button>
            <button
              className={`sidebar-toggle-btn ${activeCategory === 'article' ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory('article')
                setIsMobileMenuOpen(false)
              }}
            >
              {CATEGORY_LABELS.article}
            </button>
          </div>
        </div>
      </aside>
      
      {/* Main content */}
      <main className="main-content">
        <header className="header">
          <h1>🎨 Kinder Activities</h1>
          <p>Discover fun activities for kids and families</p>
        </header>
        
        <div className="stats">
          <div className="stat-item">
            <div className="stat-number">{stats.total}</div>
            <div className="stat-label">Activities</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">{stats.categories}</div>
            <div className="stat-label">Categories</div>
          </div>
          <div className="stat-item">
            <div className="stat-number stat-number--visible">{stats.visible}</div>
            <div className="stat-label">Visible</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">{stats.rated}</div>
            <div className="stat-label">Rated</div>
          </div>
        </div>
        
        {filteredActivities.length > 0 ? (
          <div className="activities-list">
            {filteredActivities.map((activity, index) => (
              <ActivityCard
                key={activity.url || index}
                activity={activity}
                onRatingChange={handleRatingChange}
                onRemove={handleRemove}
                onCategoryChange={handleCategoryChange}
                onCommentChange={handleCommentChange}
                onOpenNote={handleOpenNote}
                onOpenName={handleOpenName}
                allCategories={allCategories}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="icon">🔍</div>
            <p>No activities found</p>
            {searchQuery && <p>Try a different search term</p>}
          </div>
        )}
      </main>

      <NoteModal
        key={noteModalUrl || 'closed'}
        activity={noteModalActivity}
        onSave={(text) => {
          if (noteModalActivity) {
            handleCommentChange(noteModalActivity.url, text)
          }
        }}
        onClose={handleCloseNote}
      />

      <NameModal
        key={nameModalUrl ? `name:${nameModalUrl}` : 'name:closed'}
        activity={nameModalActivity}
        onSave={(name) => {
          if (nameModalActivity) {
            handleNameChange(nameModalActivity.url, name)
          }
        }}
        onClose={handleCloseName}
      />
    </div>
  )
}

export default App
