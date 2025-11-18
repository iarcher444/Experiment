require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const multer = require('multer');
const fetch = require('node-fetch');
const vision = require('@google-cloud/vision');

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

const fs = require('fs');

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

  // Pull some nice fields to display
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

const movieRoutes = require('./routes/movieRoutes');
app.use('/api', movieRoutes);

// Upload + analyze food image
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    const imagePath = req.file.path;

    // 1. Google Vision: label detection
    const [result] = await visionClient.labelDetection(imagePath);
    const labels = result.labelAnnotations.map(label => label.description);

    // pick the first label as best guess
    const bestGuess = labels[0] || 'Unknown food';

    // 2. USDA: nutrition lookup
    const nutrition = await getNutritionFromUSDA(bestGuess);

    // clean up the uploaded file
    fs.unlink(imagePath, () => {});

    res.json({
      detectedFood: bestGuess,
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
