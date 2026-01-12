import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'data.json');
const ALL_URLS_FILE = path.join(__dirname, '..', 'data', 'all-urls.json');

const app = express();
const PORT = 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Helper: Load data
async function loadData() {
  const content = await fs.readFile(DATA_FILE, 'utf-8');
  return JSON.parse(content);
}

// Helper: Save data
async function saveData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Helper: Load all-urls data
async function loadAllUrls() {
  const content = await fs.readFile(ALL_URLS_FILE, 'utf-8');
  return JSON.parse(content);
}

// Helper: Save all-urls data
async function saveAllUrls(data) {
  await fs.writeFile(ALL_URLS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// GET /api/activities - Get all activities
app.get('/api/activities', async (req, res) => {
  try {
    const data = await loadData();
    res.json(data);
  } catch (error) {
    console.error('Error loading data:', error);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

// PUT /api/activities/rating - Update rating for an activity
app.put('/api/activities/rating', async (req, res) => {
  try {
    const { url, rating } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    if (rating !== null && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    const data = await loadData();
    const activityIndex = data.findIndex(a => a.url === url);
    
    if (activityIndex === -1) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    // Update or remove rating
    if (rating === null) {
      delete data[activityIndex].userRating;
    } else {
      data[activityIndex].userRating = rating;
    }
    
    await saveData(data);
    
    res.json({ 
      success: true, 
      activity: data[activityIndex] 
    });
  } catch (error) {
    console.error('Error updating rating:', error);
    res.status(500).json({ error: 'Failed to update rating' });
  }
});

// DELETE /api/activities - Remove an activity
app.delete('/api/activities', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Remove from data.json
    const data = await loadData();
    const activityIndex = data.findIndex(a => a.url === url);
    
    if (activityIndex === -1) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    data.splice(activityIndex, 1);
    await saveData(data);
    
    // Mark as userRemoved in all-urls.json
    const allUrls = await loadAllUrls();
    const urlIndex = allUrls.findIndex(a => a.url === url);
    
    if (urlIndex !== -1) {
      allUrls[urlIndex].userRemoved = true;
      await saveAllUrls(allUrls);
    }
    
    res.json({ 
      success: true, 
      message: 'Activity removed successfully' 
    });
  } catch (error) {
    console.error('Error removing activity:', error);
    res.status(500).json({ error: 'Failed to remove activity' });
  }
});

// PUT /api/activities/category - Update category for an activity
app.put('/api/activities/category', async (req, res) => {
  try {
    const { url, category } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }
    
    const data = await loadData();
    const activityIndex = data.findIndex(a => a.url === url);
    
    if (activityIndex === -1) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    data[activityIndex].category = category;
    await saveData(data);
    
    res.json({ 
      success: true, 
      activity: data[activityIndex] 
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// PUT /api/activities/name - Update name for an activity
app.put('/api/activities/name', async (req, res) => {
  try {
    const { url, name } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const data = await loadData();
    const activityIndex = data.findIndex(a => a.url === url);
    
    if (activityIndex === -1) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    // Update name (shortName)
    if (name && name.trim()) {
      data[activityIndex].shortName = name.trim();
    } else {
      data[activityIndex].shortName = 'Unnamed Activity';
    }
    
    await saveData(data);
    
    res.json({ 
      success: true, 
      activity: data[activityIndex] 
    });
  } catch (error) {
    console.error('Error updating name:', error);
    res.status(500).json({ error: 'Failed to update name' });
  }
});

// PUT /api/activities/comment - Update comment for an activity
app.put('/api/activities/comment', async (req, res) => {
  try {
    const { url, comment } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const data = await loadData();
    const activityIndex = data.findIndex(a => a.url === url);
    
    if (activityIndex === -1) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    // Update or remove comment
    if (comment && comment.trim()) {
      data[activityIndex].userComment = comment.trim();
    } else {
      delete data[activityIndex].userComment;
    }
    
    await saveData(data);
    
    res.json({ 
      success: true, 
      activity: data[activityIndex] 
    });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Server running at http://localhost:${PORT}`);
  console.log(`📁 Data file: ${DATA_FILE}`);
});

