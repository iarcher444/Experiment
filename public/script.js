// script.js

$(document).ready(function () {
  const $form = $('#imageUploadForm');
  const $foodInfo = $('#foodInfo');
  const $nutritionFacts = $('#nutritionFacts');
  const $extraInfo = $('#extraInfo');
  const $spinner = $('#loadingSpinner');

  $form.on('submit', async function (e) {
    e.preventDefault();

    const formData = new FormData(this);

    $spinner.show();
    $foodInfo.text('');
    $nutritionFacts.text('');
    $extraInfo.text('');

    try {
      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error from server');
      }

      const data = await response.json();

      // Food info box: what we detected
      $foodInfo.text(`Detected food: ${data.detectedFood || 'Unknown'}`);

      // Nutrition facts box
      if (data.nutrition) {
        const n = data.nutrition;
        const lines = [];

        lines.push(`Description: ${n.description || 'N/A'}`);
        if (n.calories) {
          lines.push(`Calories: ${n.calories.amount} ${n.calories.unit}`);
        }
        if (n.protein) {
          lines.push(`Protein: ${n.protein.amount} ${n.protein.unit}`);
        }
        if (n.carbs) {
          lines.push(`Carbs: ${n.carbs.amount} ${n.carbs.unit}`);
        }
        if (n.fat) {
          lines.push(`Fat: ${n.fat.amount} ${n.fat.unit}`);
        }
        if (n.fiber) {
          lines.push(`Fiber: ${n.fiber.amount} ${n.fiber.unit}`);
        }

        $nutritionFacts.html(lines.join('<br>'));
      } else {
        $nutritionFacts.text('No nutrition data found.');
      }

      // Extra info: show all labels from Vision
      if (data.labels && data.labels.length > 0) {
        $extraInfo.html('Google Vision labels:<br>' + data.labels.join(', '));
      } else {
        $extraInfo.text('No extra label information.');
      }

    } catch (err) {
      console.error(err);
      $foodInfo.text('There was an error analyzing the image.');
    } finally {
      $spinner.hide();
    }
  });
});

