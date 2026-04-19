import express from 'express';
import cors from 'cors';
import {
  getAllActivities,
  getActivityByUrl,
  updateActivityField,
  deleteActivity,
} from './db.js';

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

app.get('/api/activities', (req, res) => {
  try {
    res.json(getAllActivities());
  } catch (error) {
    console.error('Error loading activities:', error);
    res.status(500).json({ error: 'Failed to load activities' });
  }
});

app.put('/api/activities/rating', (req, res) => {
  try {
    const { url, rating } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (rating !== null && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const activity = updateActivityField(url, 'userRating', rating);
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error updating rating:', error);
    res.status(500).json({ error: 'Failed to update rating' });
  }
});

app.put('/api/activities/category', (req, res) => {
  try {
    const { url, category } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!category) return res.status(400).json({ error: 'Category is required' });

    const activity = updateActivityField(url, 'category', category);
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

app.put('/api/activities/name', (req, res) => {
  try {
    const { url, name } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });

    const shortName = name && name.trim() ? name.trim() : 'Unnamed Activity';
    const activity = updateActivityField(url, 'shortName', shortName);
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error updating name:', error);
    res.status(500).json({ error: 'Failed to update name' });
  }
});

app.put('/api/activities/comment', (req, res) => {
  try {
    const { url, comment } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });

    const value = comment && comment.trim() ? comment.trim() : null;
    const activity = updateActivityField(url, 'userComment', value);
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

app.delete('/api/activities', (req, res) => {
  try {
    const { url } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });

    const existed = deleteActivity(url);
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
