import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import './App.css'

// API base URL - uses relative path for Netlify, works with both local dev and production
const API_BASE = '/.netlify/functions'

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

function EditableName({ name, url, onSave }) {
  const [value, setValue] = useState(name || 'Unnamed Activity')
  const debounceRef = useRef(null)
  
  // Sync value when name prop changes (switching between items)
  useEffect(() => {
    setValue(name || 'Unnamed Activity')
  }, [name, url])
  
  const handleChange = (e) => {
    const newValue = e.target.value
    setValue(newValue)
    
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    // Debounce save
    debounceRef.current = setTimeout(() => {
      onSave(newValue)
    }, 200)
  }
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur()
      // Save immediately on Enter
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      onSave(value)
    }
  }
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])
  
  return (
    <input
      type="text"
      className="editable-name"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

function UserComment({ comment, onSave }) {
  const [isEditing, setIsEditing] = useState(false)
  const [text, setText] = useState(comment || '')
  
  // Sync text state when comment prop changes (switching between items)
  useEffect(() => {
    setText(comment || '')
    setIsEditing(false)
  }, [comment])
  
  const handleSave = () => {
    onSave(text)
    setIsEditing(false)
  }
  
  const handleCancel = () => {
    setText(comment || '')
    setIsEditing(false)
  }
  
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') handleCancel()
    if (e.key === 'Enter' && e.ctrlKey) handleSave()
  }
  
  if (isEditing) {
    return (
      <div className="user-comment editing" onClick={(e) => e.stopPropagation()}>
        <textarea
          className="comment-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a note about this activity..."
          autoFocus
          rows={3}
        />
        <div className="comment-actions">
          <button className="comment-save-btn" onClick={handleSave}>💾 Save</button>
          <button className="comment-cancel-btn" onClick={handleCancel}>Cancel</button>
          <span className="comment-hint">Ctrl+Enter to save, Esc to cancel</span>
        </div>
      </div>
    )
  }
  
  return (
    <div 
      className={`user-comment ${comment ? 'has-comment' : 'empty'}`} 
      onClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
    >
      {comment ? (
        <>
          <span className="comment-icon">📝</span>
          <span className="comment-text">{comment}</span>
          <button className="comment-edit-btn" title="Edit note">✏️</button>
        </>
      ) : (
        <button className="add-comment-btn">📝 Add note...</button>
      )}
    </div>
  )
}

function ActivityCard({ activity, onRatingChange, onRemove, onCategoryChange, onCommentChange, onNameChange, allCategories }) {
  const googleMapsUrl = activity.address 
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.address)}`
    : null

  const handleRemove = () => {
    onRemove(activity.url)
  }

  const handleCategorySelect = (newCategory) => {
    onCategoryChange(activity.url, newCategory)
  }

  const handleNameChange = (newName) => {
    onNameChange(activity.url, newName)
  }

  return (
    <article className="activity-card">
      <div className="card-header">
        <h3 className="card-title">
          <EditableName 
            name={activity.shortName} 
            url={activity.url}
            onSave={handleNameChange}
          />
        </h3>
        <div className="card-header-actions">
          <CategorySelect
            category={activity.category}
            allCategories={allCategories}
            onChange={handleCategorySelect}
          />
          <button className="remove-btn" onClick={handleRemove} title="Remove activity">
            🗑️
          </button>
        </div>
      </div>
      
      <StarRating 
        rating={activity.userRating} 
        onRate={(rating) => onRatingChange(activity.url, rating)} 
      />
      
      {activity.url && (
        <div className="info-row url-row">
          <a href={activity.url} target="_blank" rel="noopener noreferrer" className="card-url">
            {activity.url}
          </a>
        </div>
      )}
      
      <UserComment 
        comment={activity.userComment}
        onSave={(comment) => onCommentChange(activity.url, comment)}
      />
      
      {activity.description && (
        <p className="card-description">{activity.description}</p>
      )}
      
      {activity.openHours && (
        <div className="info-row">
          <span className="icon">🕐</span>
          <span>{activity.openHours}</span>
        </div>
      )}
      
      {activity.ageRange && (
        <div className="info-row">
          <span className="icon">👶</span>
          <span className="age-range">{activity.ageRange}</span>
        </div>
      )}
      
      {activity.address && (
        <div className="info-row">
          <span className="icon">📍</span>
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
            {activity.address}
          </a>
        </div>
      )}
      
      {(activity.drivingMinutes || activity.transitMinutes) && (
        <div className="info-row travel-time-row">
          <div className="travel-times">
            {activity.drivingMinutes && (
              <span className="travel-time">
                🚗 {activity.drivingMinutes < 60 
                  ? `${activity.drivingMinutes} min` 
                  : `${Math.floor(activity.drivingMinutes / 60)}h ${activity.drivingMinutes % 60}min`}
              </span>
            )}
            {activity.transitMinutes && (
              <span className="travel-time">
                🚌 ~{activity.transitMinutes < 60 
                  ? `${activity.transitMinutes} min` 
                  : `${Math.floor(activity.transitMinutes / 60)}h ${activity.transitMinutes % 60}min`}
              </span>
            )}
            {activity.distanceKm && (
              <span className="travel-distance">{activity.distanceKm} km</span>
            )}
          </div>
        </div>
      )}
      
      {activity.services && activity.services.length > 0 && (
        <div className="info-row">
          <span className="icon">🎯</span>
          <div className="services-list">
            {activity.services.slice(0, 5).map((service, idx) => (
              <span key={idx} className="service-tag">{service}</span>
            ))}
            {activity.services.length > 5 && (
              <span className="service-tag">+{activity.services.length - 5} more</span>
            )}
          </div>
        </div>
      )}
      
      {activity.prices && activity.prices.length > 0 && (
        <div className="info-row">
          <span className="icon">💰</span>
          <div className="prices-list">
            {activity.prices.slice(0, 3).map((price, idx) => (
              <div key={idx} className="price-item">
                <span className="price-service">{price.service}</span>
                <span className="price-value">{price.price}</span>
              </div>
            ))}
            {activity.prices.length > 3 && (
              <div className="price-item">
                <span className="price-service">+ {activity.prices.length - 3} more prices</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="card-footer">
        <div className="status-alive">
          <span className={`status-dot ${activity.alive ? '' : 'offline'}`}></span>
          <span>{activity.alive ? 'Active' : 'Offline'}</span>
        </div>
        <span>Updated: {activity.lastUpdated}</span>
      </div>
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
  const [activeCategory, setActiveCategory] = useState('unrated')
  const [searchQuery, setSearchQuery] = useState('')
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
    
    return result
  }, [activities, activeCategory, searchQuery])
  
  const stats = useMemo(() => ({
    total: activities.length,
    categories: new Set(activities.map(a => a.category)).size,
    visible: filteredActivities.length,
    rated: activities.filter(a => a.userRating).length
  }), [activities, filteredActivities])

  const handleRatingChange = useCallback(async (url, rating) => {
    try {
      const response = await fetch(`${API_BASE}/update-rating`, {
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
      const response = await fetch(`${API_BASE}/delete-activity`, {
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
      const response = await fetch(`${API_BASE}/update-category`, {
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
      const response = await fetch(`${API_BASE}/update-comment`, {
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

  const handleNameChange = useCallback(async (url, name) => {
    try {
      const response = await fetch(`${API_BASE}/update-name`, {
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
        setActiveCategory('unrated')
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
          <div className="activities-grid">
            {filteredActivities.map((activity, index) => (
              <ActivityCard 
                key={activity.url || index} 
                activity={activity} 
                onRatingChange={handleRatingChange}
                onRemove={handleRemove}
                onCategoryChange={handleCategoryChange}
                onCommentChange={handleCommentChange}
                onNameChange={handleNameChange}
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
    </div>
  )
}

export default App
