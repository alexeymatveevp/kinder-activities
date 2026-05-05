import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'

import 'leaflet/dist/leaflet.css'

// Vite bundles Leaflet's default-marker images via these imports; without
// this fix, markers render as broken-image icons because Leaflet's CSS
// references relative paths that don't survive bundling.
import markerIconUrl from 'leaflet/dist/images/marker-icon.png'
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
})

// Distinct icon for the user's current location — a blue dot.
const userLocationIcon = L.divIcon({
  className: 'map-screen__user-marker',
  html: '<span class="map-screen__user-marker-dot"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

// Munich centre — used as a sensible fallback when no markers exist.
const MUNICH_CENTER = [48.137, 11.575]
const FALLBACK_ZOOM = 11

function FitToMarkers({ positions }) {
  const map = useMap()

  useEffect(() => {
    if (positions.length === 0) return
    if (positions.length === 1) {
      map.setView(positions[0], 13)
      return
    }
    const bounds = L.latLngBounds(positions)
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [positions, map])

  return null
}

function useCurrentLocation() {
  const [position, setPosition] = useState(null)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return
        const { latitude, longitude, accuracy } = pos.coords
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          setPosition({ lat: latitude, lng: longitude, accuracy })
        }
      },
      // Silently ignore denied / errored geolocation; just no marker.
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
    return () => { cancelled = true }
  }, [])

  return position
}

export default function MapScreen({ activities, extractCoords }) {
  const markers = useMemo(() => (
    activities
      .map((activity) => {
        const coords = extractCoords(activity.googleMapsLink)
        if (!coords) return null
        const lat = parseFloat(coords.lat)
        const lng = parseFloat(coords.lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
        return { activity, lat, lng }
      })
      .filter(Boolean)
  ), [activities, extractCoords])

  const positions = useMemo(() => markers.map(m => [m.lat, m.lng]), [markers])
  const skipped = activities.length - markers.length
  const userPosition = useCurrentLocation()

  return (
    <div className="map-screen">
      <MapContainer
        center={MUNICH_CENTER}
        zoom={FALLBACK_ZOOM}
        scrollWheelZoom
        className="map-screen__map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <FitToMarkers positions={positions} />
        {markers.map(({ activity, lat, lng }) => {
          const note = activity.userComment && activity.userComment.trim()
          return (
            <Marker key={activity.url} position={[lat, lng]}>
              <Popup>
                <div className="map-popup">
                  <div className="map-popup__name">
                    {activity.shortName || 'Unnamed Activity'}
                  </div>
                  {activity.category && (
                    <div className="map-popup__meta">{activity.category}</div>
                  )}
                  {note && (
                    <div className="map-popup__note">📝 {note}</div>
                  )}
                  <div className="map-popup__actions">
                    <a
                      className="map-popup__btn map-popup__btn--link"
                      href={activity.googleMapsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      🗺️ Open in Maps
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}
        {userPosition && (
          <Marker
            position={[userPosition.lat, userPosition.lng]}
            icon={userLocationIcon}
            zIndexOffset={1000}
          >
            <Popup>
              <div className="map-popup">
                <div className="map-popup__name">📍 You are here</div>
                {Number.isFinite(userPosition.accuracy) && (
                  <div className="map-popup__meta">
                    Accuracy: ±{Math.round(userPosition.accuracy)} m
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {markers.length === 0 ? (
        <div className="map-screen__empty">
          No activities with mappable Google Maps links match the current filters.
          {skipped > 0 && (
            <div className="map-screen__empty-hint">
              {skipped} {skipped === 1 ? 'activity has' : 'activities have'} a short
              Maps link without inline coordinates and can't be pinned.
              Open its details and update the link to a long-form URL to fix.
            </div>
          )}
        </div>
      ) : skipped > 0 ? (
        <div className="map-screen__skipped">
          {skipped} more {skipped === 1 ? 'activity is' : 'activities are'} hidden — short Maps links lack coordinates.
        </div>
      ) : null}
    </div>
  )
}
