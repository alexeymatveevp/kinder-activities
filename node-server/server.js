import express from 'express';
import cors from 'cors';
import {
  getAllActivities,
  updateActivityField,
  deleteActivity,
} from './db.js';

const app = express();
const PORT = 3002;

// Mirrors the Python is_google_maps_url() in server/bot.py — keep in sync.
const GOOGLE_HOST_RE = /^(?:.+\.)?google\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/;

function isGoogleMapsUrl(input) {
  if (!input || typeof input !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(input.trim());
  } catch {
    return false;
  }
  if (!/^https?:$/.test(parsed.protocol)) return false;
  const host = (parsed.hostname || '').toLowerCase();
  const path = (parsed.pathname || '').toLowerCase();
  if (host === 'maps.app.goo.gl') return true;
  if (host === 'goo.gl' && path.startsWith('/maps')) return true;
  if (GOOGLE_HOST_RE.test(host)) {
    if (host.split('.', 1)[0] === 'maps') return true;
    if (path.startsWith('/maps')) return true;
  }
  return false;
}

app.use(cors());
app.use(express.json());

app.get('/api/activities', async (req, res) => {
  try {
    res.json(await getAllActivities());
  } catch (error) {
    console.error('Error loading activities:', error);
    res.status(500).json({ error: 'Failed to load activities' });
  }
});

app.put('/api/activities/rating', async (req, res) => {
  try {
    const { url, rating } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (rating !== null && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const activity = await updateActivityField(url, 'userRating', rating);
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error updating rating:', error);
    res.status(500).json({ error: 'Failed to update rating' });
  }
});

app.put('/api/activities/category', async (req, res) => {
  try {
    const { url, category } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!category) return res.status(400).json({ error: 'Category is required' });

    const activity = await updateActivityField(url, 'category', category);
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

app.put('/api/activities/name', async (req, res) => {
  try {
    const { url, name } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });

    const shortName = name && name.trim() ? name.trim() : 'Unnamed Activity';
    const activity = await updateActivityField(url, 'shortName', shortName);
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error updating name:', error);
    res.status(500).json({ error: 'Failed to update name' });
  }
});

app.put('/api/activities/comment', async (req, res) => {
  try {
    const { url, comment } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });

    const value = comment && comment.trim() ? comment.trim() : null;
    const activity = await updateActivityField(url, 'userComment', value);
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

app.put('/api/activities/maps-link', async (req, res) => {
  try {
    const { url, googleMapsLink } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Empty / null clears the link; otherwise validate it's a Google Maps URL.
    let value = null;
    if (googleMapsLink != null && String(googleMapsLink).trim()) {
      const trimmed = String(googleMapsLink).trim();
      if (!isGoogleMapsUrl(trimmed)) {
        return res.status(400).json({
          error: 'Not a Google Maps URL. Examples: https://www.google.com/maps/...,  https://maps.app.goo.gl/...',
        });
      }
      value = trimmed;
    }

    const activity = await updateActivityField(url, 'googleMapsLink', value);
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error updating googleMapsLink:', error);
    res.status(500).json({ error: 'Failed to update Google Maps link' });
  }
});

app.delete('/api/activities', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });

    const existed = await deleteActivity(url);
    if (!existed) return res.status(404).json({ error: 'Activity not found' });

    res.json({ success: true, message: 'Activity removed successfully' });
  } catch (error) {
    console.error('Error removing activity:', error);
    res.status(500).json({ error: 'Failed to remove activity' });
  }
});

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
