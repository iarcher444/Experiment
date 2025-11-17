// script.js

$(document).ready(function () {
    const $form = $('#imageUploadForm');
    const $imageInput = $('#imageInput');
    const $loading = $('#loadingSpinner');
    const $errorText = $('#error-text');
    const $foodInfo = $('#food-info');
    const $nutritionList = $('#nutrition-list');
    const $recipesList = $('#recipes-list');

    $form.on('submit', function (e) {
        e.preventDefault();

        const file = $imageInput[0].files[0];

        // Clear previous results + errors
        $errorText.text('');
        $foodInfo.text('Analyzing image...');
        $nutritionList.empty();
        $recipesList.empty();

        if (!file) {
            $errorText.text('Please choose an image first.');
            $foodInfo.text('Upload a food image to see details about it.');
            $nutritionList.html('<li>Nutrition details will appear here.</li>');
            $recipesList.html('<li>Recipe suggestions will appear here.</li>');
            return;
        }

        const formData = new FormData();
        // IMPORTANT: this name must match "foodImage" in your Express route
        formData.append('foodImage', file);

        $loading.show();

        $.ajax({
            url: '/api/food/analyze-image',
            method: 'POST',
            data: formData,
            processData: false,       // don't let jQuery process the data
            contentType: false,       // let browser set multipart/form-data
            success: function (data) {
                // Food info
                const name = data.foodName || 'Unknown food';
                const desc = data.foodInfo || 'No description available.';
                $foodInfo.text(`${name}: ${desc}`);

                // Nutrition
                $nutritionList.empty();
                if (data.nutrition) {
                    const n = data.nutrition;
                    const items = [
                        `Calories: ~${n.calories}`,
                        `Carbs: ~${n.carbs_g} g`,
                        `Protein: ~${n.protein_g} g`,
                        `Fat: ~${n.fat_g} g`,
                        `Fiber: ~${n.fiber_g} g`,
                        `Sodium: ~${n.sodium_mg} mg`
                    ];

                    items.forEach(text => {
                        $('<li>').text(text + ' (approx)').appendTo($nutritionList);
                    });
                } else {
                    $('<li>')
                        .text('Nutrition data unavailable for this item.')
                        .appendTo($nutritionList);
                }

                // Recipes
                $recipesList.empty();
                if (Array.isArray(data.recipes) && data.recipes.length > 0) {
                    data.recipes.forEach(r => {
                        const title = r.title || 'Recipe';
                        const source = r.sourceName || 'Source';
                        const url = r.url && r.url !== '#' ? r.url : null;

                        const $li = $('<li>');
                        if (url) {
                            const $a = $('<a>')
                                .attr('href', url)
                                .attr('target', '_blank')
                                .attr('rel', 'noopener noreferrer')
                                .text(`${title} — ${source}`);
                            $li.append($a);
                        } else {
                            $li.text(`${title} — ${source}`);
                        }
                        $recipesList.append($li);
                    });
                } else {
                    $('<li>')
                        .text('No recipes found for this food.')
                        .appendTo($recipesList);
                }
            },
            error: function (xhr) {
                console.error(xhr);
                $errorText.text(
                    xhr.responseJSON?.message || 'Something went wrong analyzing your image.'
                );
                $foodInfo.text('Upload a food image to see details about it.');
                $nutritionList.html('<li>Nutrition details will appear here.</li>');
                $recipesList.html('<li>Recipe suggestions will appear here.</li>');
            },
            complete: function () {
                $loading.hide();
            }
        });
    });
});
