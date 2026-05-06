import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  getAllActivities,
  getActivityByUrl,
  addActivity,
  updateActivityField,
  deleteActivity,
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const PYTHON_BIN = path.join(REPO_ROOT, 'server', 'venv', 'bin', 'python');
const REANALYSE_SCRIPT = path.join(REPO_ROOT, 'server', 'process-one-item.py');

const app = express();
const PORT = 3002;

// Mirrors the Python is_google_maps_url() in server/bot.py — keep in sync.
const GOOGLE_HOST_RE = /^(?:.+\.)?google\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/;

// Mirrors the Python extract_place_name_from_maps_url() in server/bot.py.
// Pulls a human name from `/maps/place/<NAME>/...` long-form URLs; returns
// null for short links and other shapes.
function extractPlaceNameFromMapsUrl(input) {
  if (!input) return null;
  let parsed;
  try { parsed = new URL(input); }
  catch { return null; }
  const m = (parsed.pathname || '').match(/^\/maps\/place\/([^/]+)/i);
  if (!m) return null;
  // Decode + replace literal '+' with space, mirroring Python's unquote_plus.
  let name;
  try { name = decodeURIComponent(m[1].replace(/\+/g, ' ')); }
  catch { return null; }
  name = name.trim();
  return name || null;
}

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

// Create a new activity. Accepts:
//   { url }                                    -> full analyser pipeline
//   { url, googleMapsLink }                    -> pipeline + attach maps link
//   { googleMapsLink }                         -> maps-only entry (no crawl)
// Rejects duplicates upfront so the user goes through Reanalyse instead.
app.post('/api/activities', async (req, res) => {
  // Pipeline runs ~30–60s for the URL paths — disable timeouts.
  req.setTimeout(0);
  res.setTimeout(0);

  try {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const rawMaps = typeof req.body?.googleMapsLink === 'string' ? req.body.googleMapsLink.trim() : '';

    if (!rawUrl && !rawMaps) {
      return res.status(400).json({ error: 'Provide an activity URL, a Google Maps link, or both.' });
    }

    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        if (!/^https?:$/.test(parsed.protocol)) throw new Error('not http(s)');
      } catch {
        return res.status(400).json({ error: 'Activity URL must be a valid http(s) URL.' });
      }
      if (isGoogleMapsUrl(rawUrl)) {
        return res.status(400).json({
          error: 'That URL looks like a Google Maps link — paste it into the Google Maps field instead.',
        });
      }
    }

    if (rawMaps && !isGoogleMapsUrl(rawMaps)) {
      return res.status(400).json({
        error: 'Google Maps field must be a Google Maps URL (e.g. https://www.google.com/maps/place/..., https://maps.app.goo.gl/...).',
      });
    }

    // === Maps-only branch — no crawl, direct insert. ===
    if (!rawUrl) {
      const existing = await getActivityByUrl(rawMaps);
      if (existing) {
        return res.status(409).json({ error: 'This Google Maps location is already saved.' });
      }
      const today = new Date().toISOString().slice(0, 10);
      const name = extractPlaceNameFromMapsUrl(rawMaps) || '📍 Map pin';
      const created = await addActivity({
        url: rawMaps,
        shortName: name,
        alive: true,
        lastUpdated: today,
        googleMapsLink: rawMaps,
      });
      return res.status(201).json({ success: true, activity: created });
    }

    // === Activity-URL branch — spawn the analyser pipeline. ===
    const existing = await getActivityByUrl(rawUrl);
    if (existing) {
      return res.status(409).json({
        error: 'That URL is already in your activities. Open the row and use Reanalyse to refresh it.',
      });
    }

    const args = [REANALYSE_SCRIPT, rawUrl];
    if (rawMaps) args.push('--maps-link', rawMaps);

    const child = spawn(PYTHON_BIN, args, { cwd: REPO_ROOT, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });

    if (exitCode !== 0) {
      console.error(`Add-activity exit ${exitCode} for ${rawUrl}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
      const detail = (stderr || stdout || `exit ${exitCode}`).trim().slice(-400);
      return res.status(500).json({ error: `Analyser failed: ${detail}` });
    }

    const created = await getActivityByUrl(rawUrl);
    if (!created) {
      // Pipeline succeeded but the row wasn't saved — likely a "site not accessible"
      // / non-website outcome. Return what the script printed so the user understands.
      const detail = (stdout || stderr || 'no row written').trim().slice(-400);
      return res.status(422).json({ error: `Activity not saved: ${detail}` });
    }
    res.status(201).json({ success: true, activity: created });
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({ error: `Failed to create activity: ${error.message || error}` });
  }
});

app.post('/api/activities/reanalyse', async (req, res) => {
  // Long-running route: disable the per-request timeout so the analyser
  // (~30–60s with crawl + LLM + distance) doesn't 504 itself.
  req.setTimeout(0);
  res.setTimeout(0);

  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (isGoogleMapsUrl(url)) {
      return res.status(400).json({
        error: "Can't reanalyse a Google Maps URL — there's nothing to crawl.",
      });
    }

    const existing = await getActivityByUrl(url);
    if (!existing) return res.status(404).json({ error: 'Activity not found' });

    const child = spawn(
      PYTHON_BIN,
      [REANALYSE_SCRIPT, url, '--preserve-name', '--preserve-category'],
      { cwd: REPO_ROOT, env: process.env },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });

    if (exitCode !== 0) {
      console.error(`Reanalyse exit ${exitCode} for ${url}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
      const detail = (stderr || stdout || `exit ${exitCode}`).trim().slice(-400);
      return res.status(500).json({
        error: `Reanalyse failed: ${detail}`,
      });
    }

    const refreshed = await getActivityByUrl(url);
    if (!refreshed) {
      return res.status(500).json({ error: 'Activity disappeared after reanalyse' });
    }
    res.json({ success: true, activity: refreshed });
  } catch (error) {
    console.error('Error during reanalyse:', error);
    res.status(500).json({ error: `Failed to reanalyse: ${error.message || error}` });
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
