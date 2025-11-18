require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const multer = require('multer');
const fetch = require('node-fetch');
const vision = require('@google-cloud/vision');
const fs = require('fs');

let visionClient;

if (process.env.GOOGLE_VISION_KEY) {
  // Render / env-based credentials
  try {
    const creds = JSON.parse(process.env.GOOGLE_VISION_KEY);
    visionClient = new vision.ImageAnnotatorClient({
      credentials: creds
    });
    console.log('Vision client initialized from GOOGLE_VISION_KEY');
  } catch (err) {
    console.error('Failed to parse GOOGLE_VISION_KEY:', err);
  }
} else {
  // Local dev: use GOOGLE_APPLICATION_CREDENTIALS file
  visionClient = new vision.ImageAnnotatorClient();
  console.log('Vision client initialized using default credentials');
}

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// ---------------- USDA NUTRITION ----------------

async function getNutritionFromUSDA(foodName) {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.error('USDA_API_KEY is not set');
    return null;
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    query: foodName,
    pageSize: 1,
    dataType: 'Survey (FNDDS)' // good general database
  });

  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    console.error('USDA API error:', response.statusText);
    return null;
  }

  const data = await response.json();
  if (!data.foods || data.foods.length === 0) {
    return null;
  }

  const food = data.foods[0];

  // fields to display
  const nutrients = {};
  if (food.foodNutrients) {
    for (const n of food.foodNutrients) {
      nutrients[n.nutrientName] = {
        amount: n.value,
        unit: n.unitName
      };
    }
  }

  return {
    description: food.description,
    brand: food.brandName || null,
    calories: nutrients['Energy'] || null,
    protein: nutrients['Protein'] || null,
    fat: nutrients['Total lipid (fat)'] || null,
    carbs: nutrients['Carbohydrate, by difference'] || null,
    fiber: nutrients['Fiber, total dietary'] || null
  };
}

// Removes labels like "Food", "Ingredient" to avoid generic results for USDA searches
const GENERIC_LABELS = new Set([
  'Food',
  'Ingredient',
  'Cuisine',
  'Dish',
  'Fast food',
  'Recipe',
  'Junk food',
  'Comfort food',
  'Snack',
  'Baked goods',
  'Staple food'
]);

async function getBestNutritionForLabels(labels) {
  if (!labels || labels.length === 0) {
    return { labelUsed: null, nutrition: null };
  }

  // Tries each label and skips the generic ones
  for (const label of labels) {
    if (GENERIC_LABELS.has(label)) continue;

    const nutrition = await getNutritionFromUSDA(label);
    if (nutrition) {
      return { labelUsed: label, nutrition };
    }
  }

  // If all failed, falls back to first label
  const fallbackLabel = labels[0];
  const fallbackNutrition = await getNutritionFromUSDA(fallbackLabel);
  return { labelUsed: fallbackLabel, nutrition: fallbackNutrition };
}

// ---------------- ROUTES ----------------

const movieRoutes = require('./routes/movieRoutes');
app.use('/api', movieRoutes);

// Upload + analyze food image
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    const imagePath = req.file.path;

    // Google Vision: label detection
    const [result] = await visionClient.labelDetection(imagePath);
    const labels = result.labelAnnotations.map(label => label.description);

    // Uses ALL labels to find the best one for USDA
    let detectedFood = 'Unknown food';
    let nutrition = null;

    if (labels.length > 0) {
      const { labelUsed, nutrition: bestNutrition } = await getBestNutritionForLabels(labels);
      detectedFood = labelUsed || labels[0] || 'Unknown food';
      nutrition = bestNutrition;
    }

    // clean up the uploaded file
    fs.unlink(imagePath, () => {});

    res.json({
      detectedFood,
      labels,
      nutrition
    });
  } catch (err) {
    console.error('Error analyzing image:', err);
    res.status(500).json({ message: 'Error analyzing image' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'josh.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

