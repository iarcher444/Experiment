const express = require('express');
const router = express.Router();

// --- IMPORTS FOR FOOD ANALYSIS ---
const multer = require('multer');
const axios = require('axios');
const vision = require('@google-cloud/vision');
const path = require('path');
const fs = require('fs');

// Multer setup: save uploads to /uploads folder
const upload = multer({ dest: 'uploads/' });

// Google Vision client (uses GOOGLE_APPLICATION_CREDENTIALS env var)
const visionClient = new vision.ImageAnnotatorClient();

// API Ninjas key (set this in your .env)
const API_NINJAS_KEY = process.env.API_NINJAS_KEY;

// Helper: pick a reasonable food label from Vision labels
function pickFoodLabel(labels, fallback = 'food') {
  if (!labels || labels.length === 0) return fallback;

  // For now, just use the top label (e.g., "Spaghetti", "Pizza", etc.)
  const top = labels[0].description;
  return top || fallback;
}

// -------------------- FOOD ANALYSIS --------------------

// POST /api/food/analyze-image
// (because this router is mounted at /api in app.js)
router.post('/food/analyze-image', upload.single('foodImage'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image uploaded' });
  }

  const imagePath = path.join(__dirname, '..', req.file.path);

  try {
    // 1) Use Google Vision to detect labels
    const [result] = await visionClient.labelDetection(imagePath);
    const labels = result.labelAnnotations || [];

    const foodLabel = pickFoodLabel(labels);
    console.log('Detected food label:', foodLabel);

    // 2) Call API Ninjas Nutrition endpoint
    let nutritionData = null;
    try {
      const nutritionRes = await axios.get('https://api.api-ninjas.com/v1/nutrition', {
        headers: { 'X-Api-Key': API_NINJAS_KEY },
        params: { query: foodLabel }
      });
      nutritionData = nutritionRes.data && nutritionRes.data[0];
    } catch (err) {
      console.error('API Ninjas nutrition error:', err.response?.data || err.message);
    }

    // 3) Call API Ninjas Recipes endpoint
    let recipes = [];
    try {
      const recipeRes = await axios.get('https://api.api-ninjas.com/v2/recipe', {
        headers: { 'X-Api-Key': API_NINJAS_KEY },
        params: { title: foodLabel }
      });
      recipes = Array.isArray(recipeRes.data) ? recipeRes.data.slice(0, 3) : [];
    } catch (err) {
      console.error('API Ninjas recipe error:', err.response?.data || err.message);
    }

    // 4) Build a response for the frontend
    const responsePayload = {
      foodName: foodLabel,
      foodInfo: `${foodLabel} is a type of food commonly enjoyed in many places. You can customize this description later to be more detailed, like your spaghetti example.`,
      labels: labels.map(l => ({
        description: l.description,
        score: l.score
      })),
      nutrition: nutritionData
        ? {
            calories: nutritionData.calories,
            carbs_g: nutritionData.carbohydrates_total_g,
            protein_g: nutritionData.protein_g,
            fat_g: nutritionData.fat_total_g,
            fiber_g: nutritionData.fiber_g,
            sodium_mg: nutritionData.sodium_mg
          }
        : null,
      recipes: recipes.map(r => ({
        title: r.title,
        sourceName: 'API Ninjas',
        url: r.source_url || '#',
        instructions: r.instructions
      }))
    };

    res.json(responsePayload);
  } catch (err) {
    console.error('Error analyzing food image:', err);
    res.status(500).json({ message: 'Error analyzing image' });
  } finally {
    // Clean up uploaded file
    fs.unlink(imagePath, (err) => {
      if (err) console.error('Error deleting temp file:', err);
    });
  }
});

module.exports = router;