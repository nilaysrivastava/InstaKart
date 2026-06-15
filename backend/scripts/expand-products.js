const fs = require("fs");
const path = require("path");

const productsPath = path.join(__dirname, "..", "data", "products.seed.json");

if (!fs.existsSync(productsPath)) {
  throw new Error(
    "data/products.seed.json not found. Generate it first from src/nowInventory.js."
  );
}

const existingProducts = JSON.parse(fs.readFileSync(productsPath, "utf8"));

function p(
  id,
  name,
  category,
  aisle,
  price,
  etaMinutes,
  tags,
  imageHint,
  meta = {}
) {
  return {
    id,
    entityType: "PRODUCT",
    name,
    category,
    aisle,
    price,
    etaMinutes,
    available: true,
    tags,
    imageHint,
    ...meta,
  };
}

const extraProducts = [
  // Fresh, fruits, vegetables
  p(
    "prod_apple_001",
    "Apple Royal Gala 4 pcs",
    "Fruits",
    "Fresh",
    120,
    13,
    ["fruit", "healthy", "breakfast", "snack", "kids"],
    "apples"
  ),
  p(
    "prod_orange_001",
    "Fresh Oranges 4 pcs",
    "Fruits",
    "Fresh",
    110,
    14,
    ["fruit", "vitamin", "healthy", "breakfast"],
    "oranges"
  ),
  p(
    "prod_grapes_001",
    "Seedless Grapes 500g",
    "Fruits",
    "Fresh",
    130,
    16,
    ["fruit", "healthy", "guests", "snack"],
    "grapes"
  ),
  p(
    "prod_cucumber_001",
    "Fresh Cucumber 500g",
    "Vegetables",
    "Fresh",
    45,
    12,
    ["salad", "fresh", "healthy", "dinner"],
    "cucumber"
  ),
  p(
    "prod_tomato_001",
    "Fresh Tomatoes 500g",
    "Vegetables",
    "Fresh",
    40,
    11,
    ["vegetable", "cooking", "salad", "dinner"],
    "tomatoes"
  ),
  p(
    "prod_onion_001",
    "Onions 1kg",
    "Vegetables",
    "Fresh",
    55,
    12,
    ["vegetable", "cooking", "kitchen", "daily essential"],
    "onions"
  ),
  p(
    "prod_potato_001",
    "Potatoes 1kg",
    "Vegetables",
    "Fresh",
    50,
    13,
    ["vegetable", "cooking", "kitchen", "daily essential"],
    "potatoes"
  ),
  p(
    "prod_lemon_001",
    "Fresh Lemons 4 pcs",
    "Fresh",
    "Fresh",
    35,
    10,
    ["lemon", "drink", "cleaning", "cooking", "sore throat"],
    "lemons"
  ),

  // More beverages
  p(
    "prod_soda_001",
    "Club Soda 750ml",
    "Beverages",
    "Beverages",
    40,
    10,
    ["soda", "guests", "party", "drinks"],
    "soda bottle"
  ),
  p(
    "prod_coconut_water_001",
    "Coconut Water 1L",
    "Beverages",
    "Beverages",
    130,
    15,
    ["hydration", "healthy", "summer", "wellness"],
    "coconut water"
  ),
  p(
    "prod_lassi_001",
    "Sweet Lassi 500ml",
    "Beverages",
    "Beverages",
    70,
    13,
    ["drink", "breakfast", "summer", "dairy"],
    "lassi bottle"
  ),
  p(
    "prod_iced_tea_001",
    "Lemon Iced Tea 500ml",
    "Beverages",
    "Beverages",
    65,
    12,
    ["drink", "guests", "refreshing", "party"],
    "iced tea"
  ),
  p(
    "prod_green_tea_001",
    "Green Tea Bags",
    "Beverages",
    "Breakfast & Dairy",
    180,
    17,
    ["tea", "wellness", "healthy", "morning"],
    "green tea"
  ),
  p(
    "prod_hot_chocolate_001",
    "Hot Chocolate Mix",
    "Beverages",
    "Breakfast & Dairy",
    190,
    18,
    ["sweet", "kids", "breakfast", "comfort"],
    "hot chocolate"
  ),

  // More snacks and sweets
  p(
    "prod_trail_mix_001",
    "Nutty Trail Mix",
    "Snacks",
    "Snacks & Party",
    180,
    16,
    ["snack", "healthy", "travel", "study"],
    "trail mix"
  ),
  p(
    "prod_peanuts_001",
    "Roasted Peanuts Pack",
    "Snacks",
    "Snacks & Party",
    70,
    10,
    ["snack", "party", "guests", "protein"],
    "peanuts"
  ),
  p(
    "prod_makhana_001",
    "Roasted Makhana Pack",
    "Snacks",
    "Snacks & Party",
    145,
    15,
    ["snack", "healthy", "guests", "movie"],
    "makhana"
  ),
  p(
    "prod_cookies_001",
    "Chocolate Chip Cookies",
    "Snacks",
    "Snacks & Party",
    90,
    12,
    ["cookies", "snack", "kids", "guests"],
    "cookies"
  ),
  p(
    "prod_cake_slice_001",
    "Chocolate Cake Slice",
    "Bakery",
    "Snacks & Party",
    120,
    17,
    ["cake", "birthday", "dessert", "sweet", "surprise"],
    "cake slice"
  ),
  p(
    "prod_ice_cream_cups_001",
    "Vanilla Ice Cream Cups Pack",
    "Frozen",
    "Snacks & Party",
    180,
    20,
    ["dessert", "guests", "sweet", "party"],
    "ice cream cups"
  ),
  p(
    "prod_gulab_jamun_001",
    "Ready-to-Eat Gulab Jamun",
    "Sweets",
    "Snacks & Party",
    160,
    18,
    ["sweet", "dessert", "guests", "festival"],
    "gulab jamun"
  ),
  p(
    "prod_candy_001",
    "Assorted Candy Pack",
    "Sweets",
    "Snacks & Party",
    75,
    11,
    ["kids", "sweet", "party", "birthday"],
    "candy"
  ),

  // More breakfast and quick meals
  p(
    "prod_oats_001",
    "Instant Oats Pack",
    "Breakfast",
    "Breakfast & Dairy",
    160,
    16,
    ["breakfast", "healthy", "quick meal", "morning"],
    "oats"
  ),
  p(
    "prod_jam_001",
    "Mixed Fruit Jam",
    "Breakfast",
    "Breakfast & Dairy",
    95,
    13,
    ["breakfast", "bread", "kids", "sweet"],
    "jam jar"
  ),
  p(
    "prod_peanut_butter_001",
    "Crunchy Peanut Butter",
    "Breakfast",
    "Breakfast & Dairy",
    240,
    18,
    ["breakfast", "protein", "bread", "healthy"],
    "peanut butter"
  ),
  p(
    "prod_paneer_001",
    "Fresh Paneer 200g",
    "Dairy",
    "Breakfast & Dairy",
    110,
    14,
    ["dinner", "protein", "cooking", "vegetarian"],
    "paneer"
  ),
  p(
    "prod_yogurt_001",
    "Plain Yogurt Cup",
    "Dairy",
    "Breakfast & Dairy",
    55,
    10,
    ["breakfast", "dairy", "healthy", "curd"],
    "yogurt"
  ),
  p(
    "prod_ready_poha_001",
    "Ready Poha Mix",
    "Quick Meals",
    "Kitchen & Quick Meals",
    75,
    11,
    ["breakfast", "quick meal", "student", "morning"],
    "poha mix"
  ),
  p(
    "prod_ready_upma_001",
    "Ready Upma Mix",
    "Quick Meals",
    "Kitchen & Quick Meals",
    80,
    12,
    ["breakfast", "quick meal", "student", "morning"],
    "upma mix"
  ),
  p(
    "prod_soup_001",
    "Instant Tomato Soup",
    "Quick Meals",
    "Kitchen & Quick Meals",
    65,
    10,
    ["quick meal", "cold", "comfort", "night"],
    "soup sachet"
  ),
  p(
    "prod_ready_dal_001",
    "Ready-to-Eat Dal Pack",
    "Quick Meals",
    "Kitchen & Quick Meals",
    110,
    15,
    ["dinner", "quick meal", "student", "home"],
    "ready dal"
  ),
  p(
    "prod_ready_rice_001",
    "Ready-to-Eat Rice Bowl",
    "Quick Meals",
    "Kitchen & Quick Meals",
    120,
    16,
    ["dinner", "quick meal", "student", "travel"],
    "rice bowl"
  ),

  // Kitchen staples
  p(
    "prod_rice_001",
    "Basmati Rice 1kg",
    "Kitchen",
    "Kitchen & Quick Meals",
    160,
    18,
    ["rice", "cooking", "daily essential", "dinner"],
    "rice bag"
  ),
  p(
    "prod_wheat_flour_001",
    "Wheat Flour 1kg",
    "Kitchen",
    "Kitchen & Quick Meals",
    70,
    15,
    ["flour", "cooking", "daily essential"],
    "flour bag"
  ),
  p(
    "prod_sugar_001",
    "Sugar 1kg",
    "Kitchen",
    "Kitchen & Quick Meals",
    55,
    12,
    ["sugar", "tea", "kitchen", "daily essential"],
    "sugar packet"
  ),
  p(
    "prod_salt_001",
    "Iodized Salt 1kg",
    "Kitchen",
    "Kitchen & Quick Meals",
    28,
    9,
    ["salt", "cooking", "daily essential", "kitchen"],
    "salt packet"
  ),
  p(
    "prod_cooking_oil_001",
    "Sunflower Oil 1L",
    "Kitchen",
    "Kitchen & Quick Meals",
    160,
    16,
    ["oil", "cooking", "kitchen", "daily essential"],
    "oil bottle"
  ),
  p(
    "prod_masala_001",
    "Mixed Masala Box",
    "Kitchen",
    "Kitchen & Quick Meals",
    120,
    15,
    ["cooking", "spices", "dinner", "kitchen"],
    "masala box"
  ),

  // More cleaning and home care
  p(
    "prod_dishwash_liquid_001",
    "Dishwash Liquid",
    "Cleaning",
    "Cleaning & Home",
    120,
    14,
    ["kitchen", "cleaning", "dishes", "home"],
    "dishwash liquid"
  ),
  p(
    "prod_scrub_pads_001",
    "Dish Scrub Pads Pack",
    "Cleaning",
    "Cleaning & Home",
    60,
    10,
    ["kitchen", "cleaning", "dishes", "scrub"],
    "scrub pads"
  ),
  p(
    "prod_disinfectant_001",
    "Disinfectant Floor Cleaner",
    "Cleaning",
    "Cleaning & Home",
    185,
    17,
    ["floor", "cleaning", "disinfect", "pet mess", "home"],
    "floor disinfectant"
  ),
  p(
    "prod_toilet_cleaner_001",
    "Toilet Cleaner",
    "Cleaning",
    "Cleaning & Home",
    130,
    15,
    ["bathroom", "cleaning", "hygiene", "home"],
    "toilet cleaner"
  ),
  p(
    "prod_broom_001",
    "Floor Broom",
    "Cleaning",
    "Cleaning & Home",
    140,
    18,
    ["floor", "cleaning", "home", "dust"],
    "broom"
  ),
  p(
    "prod_dustpan_001",
    "Dustpan",
    "Cleaning",
    "Cleaning & Home",
    80,
    15,
    ["floor", "cleaning", "home", "dust"],
    "dustpan"
  ),
  p(
    "prod_gloves_001",
    "Cleaning Gloves Pair",
    "Cleaning",
    "Cleaning & Home",
    90,
    12,
    ["cleaning", "hygiene", "pet mess", "bathroom"],
    "cleaning gloves"
  ),
  p(
    "prod_paper_towels_001",
    "Kitchen Paper Towels",
    "Cleaning",
    "Cleaning & Home",
    110,
    11,
    ["spill", "kitchen", "cleaning", "towels"],
    "paper towels"
  ),
  p(
    "prod_lint_roller_001",
    "Lint Roller",
    "Home Care",
    "Cleaning & Home",
    130,
    15,
    ["pet", "clothes", "hair", "cleaning"],
    "lint roller"
  ),
  p(
    "prod_storage_bags_001",
    "Ziplock Storage Bags",
    "Home Essentials",
    "Cleaning & Home",
    95,
    12,
    ["storage", "packing", "food", "travel"],
    "ziplock bags"
  ),

  // Health and first aid
  p(
    "prod_first_aid_kit_001",
    "Compact First Aid Kit",
    "First Aid",
    "Health & Wellness",
    299,
    20,
    ["first aid", "emergency", "injury", "travel"],
    "first aid kit"
  ),
  p(
    "prod_cotton_001",
    "Cotton Roll",
    "First Aid",
    "Health & Wellness",
    55,
    10,
    ["first aid", "wound", "hygiene", "health"],
    "cotton roll"
  ),
  p(
    "prod_antiseptic_001",
    "Antiseptic Liquid",
    "First Aid",
    "Health & Wellness",
    85,
    12,
    ["first aid", "wound", "hygiene", "cleaning"],
    "antiseptic liquid"
  ),
  p(
    "prod_vapor_rub_001",
    "Vapor Rub",
    "Wellness",
    "Health & Wellness",
    95,
    14,
    ["cold", "comfort", "wellness", "night"],
    "vapor rub"
  ),
  p(
    "prod_steam_inhaler_001",
    "Steam Inhaler",
    "Health Devices",
    "Health & Wellness",
    450,
    24,
    ["cold", "steam", "wellness", "comfort"],
    "steam inhaler"
  ),
  p(
    "prod_hot_water_bag_001",
    "Hot Water Bag",
    "Wellness",
    "Health & Wellness",
    250,
    20,
    ["pain relief", "comfort", "period", "wellness"],
    "hot water bag"
  ),
  p(
    "prod_electrolyte_drink_001",
    "Electrolyte Drink Bottle",
    "Wellness",
    "Health & Wellness",
    80,
    11,
    ["hydration", "sports", "heat", "wellness"],
    "electrolyte drink"
  ),
  p(
    "prod_mask_001",
    "Disposable Face Masks Pack",
    "Hygiene",
    "Health & Wellness",
    80,
    10,
    ["mask", "hygiene", "travel", "health"],
    "face masks"
  ),

  // Personal care and grooming
  p(
    "prod_shampoo_001",
    "Daily Shampoo Sachet Pack",
    "Personal Care",
    "Personal Care",
    90,
    12,
    ["hair", "bath", "personal care", "travel"],
    "shampoo sachets"
  ),
  p(
    "prod_soap_001",
    "Bath Soap Pack of 3",
    "Personal Care",
    "Personal Care",
    105,
    11,
    ["bath", "hygiene", "personal care", "daily essential"],
    "soap pack"
  ),
  p(
    "prod_body_wash_001",
    "Refreshing Body Wash",
    "Personal Care",
    "Personal Care",
    220,
    17,
    ["bath", "grooming", "personal care"],
    "body wash"
  ),
  p(
    "prod_hair_gel_001",
    "Hair Styling Gel",
    "Personal Care",
    "Personal Care",
    170,
    16,
    ["interview", "grooming", "meeting", "hair"],
    "hair gel"
  ),
  p(
    "prod_comb_001",
    "Pocket Comb",
    "Personal Care",
    "Personal Care",
    35,
    8,
    ["interview", "grooming", "travel", "hair"],
    "comb"
  ),
  p(
    "prod_razor_001",
    "Disposable Razor Pack",
    "Personal Care",
    "Personal Care",
    95,
    13,
    ["grooming", "interview", "travel", "personal care"],
    "razor"
  ),
  p(
    "prod_lip_balm_001",
    "Lip Balm",
    "Personal Care",
    "Personal Care",
    75,
    10,
    ["personal care", "winter", "travel", "comfort"],
    "lip balm"
  ),
  p(
    "prod_moisturizer_001",
    "Mini Moisturizer",
    "Personal Care",
    "Personal Care",
    130,
    13,
    ["skin", "personal care", "travel", "winter"],
    "moisturizer"
  ),

  // Baby care additions
  p(
    "prod_baby_powder_001",
    "Baby Powder",
    "Baby Care",
    "Baby Care",
    130,
    15,
    ["baby", "powder", "care", "skin"],
    "baby powder"
  ),
  p(
    "prod_baby_shampoo_001",
    "Baby Shampoo",
    "Baby Care",
    "Baby Care",
    180,
    18,
    ["baby", "shampoo", "bath", "care"],
    "baby shampoo"
  ),
  p(
    "prod_baby_food_001",
    "Baby Food Cereal",
    "Baby Care",
    "Baby Care",
    250,
    19,
    ["baby", "food", "cereal", "kids"],
    "baby food"
  ),
  p(
    "prod_baby_bottle_001",
    "Baby Feeding Bottle",
    "Baby Care",
    "Baby Care",
    220,
    20,
    ["baby", "bottle", "feeding", "urgent"],
    "baby bottle"
  ),

  // Work, study, exam, office
  p(
    "prod_marker_001",
    "Whiteboard Marker",
    "Office",
    "Work & Electronics",
    45,
    9,
    ["office", "meeting", "presentation", "study"],
    "marker"
  ),
  p(
    "prod_highlighter_001",
    "Highlighter Pens Pack",
    "Office",
    "Work & Electronics",
    85,
    11,
    ["study", "exam", "notes", "office"],
    "highlighters"
  ),
  p(
    "prod_file_folder_001",
    "Document File Folder",
    "Office",
    "Work & Electronics",
    65,
    10,
    ["office", "interview", "documents", "meeting"],
    "file folder"
  ),
  p(
    "prod_clipboard_001",
    "Writing Clipboard",
    "Office",
    "Work & Electronics",
    120,
    14,
    ["office", "exam", "writing", "field work"],
    "clipboard"
  ),
  p(
    "prod_envelope_001",
    "Brown Envelopes Pack",
    "Office",
    "Work & Electronics",
    55,
    10,
    ["documents", "office", "interview", "mail"],
    "envelopes"
  ),
  p(
    "prod_calculator_001",
    "Basic Calculator",
    "Office",
    "Work & Electronics",
    220,
    18,
    ["exam", "study", "office", "math"],
    "calculator"
  ),
  p(
    "prod_mouse_001",
    "Wireless Mouse",
    "Electronics Accessories",
    "Work & Electronics",
    599,
    24,
    ["work", "laptop", "meeting", "electronics"],
    "wireless mouse"
  ),
  p(
    "prod_earphones_001",
    "Wired Earphones",
    "Electronics Accessories",
    "Work & Electronics",
    299,
    19,
    ["meeting", "online class", "work", "travel"],
    "earphones"
  ),
  p(
    "prod_laptop_cleaner_001",
    "Laptop Screen Cleaner Kit",
    "Electronics Accessories",
    "Work & Electronics",
    199,
    17,
    ["laptop", "cleaning", "desk", "work"],
    "screen cleaner"
  ),

  // Emergency and weather additions
  p(
    "prod_candle_001",
    "Emergency Candles Pack",
    "Emergency",
    "Emergency & Weather",
    70,
    10,
    ["power cut", "light", "emergency", "night"],
    "candles"
  ),
  p(
    "prod_matchbox_001",
    "Matchbox Pack",
    "Emergency",
    "Emergency & Weather",
    20,
    8,
    ["power cut", "candle", "emergency", "kitchen"],
    "matchbox"
  ),
  p(
    "prod_extension_cord_001",
    "Extension Cord",
    "Electronics Accessories",
    "Emergency & Weather",
    399,
    22,
    ["power", "charging", "work", "emergency"],
    "extension cord"
  ),
  p(
    "prod_plastic_sheet_001",
    "Plastic Sheet Cover",
    "Emergency",
    "Emergency & Weather",
    120,
    15,
    ["rain", "leak", "cover", "temporary repair"],
    "plastic sheet"
  ),
  p(
    "prod_rope_001",
    "Nylon Rope",
    "Emergency",
    "Emergency & Weather",
    90,
    13,
    ["packing", "repair", "travel", "emergency"],
    "nylon rope"
  ),
  p(
    "prod_super_glue_001",
    "Instant Super Glue",
    "Emergency",
    "Emergency & Weather",
    60,
    10,
    ["repair", "fix", "broken", "emergency"],
    "super glue"
  ),
  p(
    "prod_sealing_tape_001",
    "Heavy Duty Sealing Tape",
    "Emergency",
    "Emergency & Weather",
    110,
    12,
    ["repair", "packing", "leak", "temporary fix"],
    "sealing tape"
  ),

  // Pet care additions
  p(
    "prod_pet_shampoo_001",
    "Pet Shampoo",
    "Pet Care",
    "Pet Care",
    260,
    21,
    ["pet", "dog", "cat", "bath", "cleaning"],
    "pet shampoo"
  ),
  p(
    "prod_pet_bowl_001",
    "Pet Feeding Bowl",
    "Pet Care",
    "Pet Care",
    180,
    18,
    ["pet", "dog", "cat", "food", "bowl"],
    "pet bowl"
  ),
  p(
    "prod_pet_treats_001",
    "Pet Treats Pack",
    "Pet Care",
    "Pet Care",
    150,
    14,
    ["pet", "dog", "cat", "treats", "food"],
    "pet treats"
  ),
  p(
    "prod_pet_litter_001",
    "Cat Litter Small Pack",
    "Pet Care",
    "Pet Care",
    280,
    22,
    ["cat", "pet", "litter", "odor", "mess"],
    "cat litter"
  ),

  // Birthday, gift, small celebration
  p(
    "prod_birthday_banner_001",
    "Happy Birthday Banner",
    "Birthday",
    "Party & Serving",
    120,
    16,
    ["birthday", "party", "decoration", "surprise"],
    "birthday banner"
  ),
  p(
    "prod_balloon_001",
    "Party Balloons Pack",
    "Birthday",
    "Party & Serving",
    90,
    13,
    ["birthday", "party", "decoration", "kids"],
    "balloons"
  ),
  p(
    "prod_party_popper_001",
    "Party Poppers Pack",
    "Birthday",
    "Party & Serving",
    140,
    15,
    ["birthday", "party", "surprise", "celebration"],
    "party poppers"
  ),
  p(
    "prod_ribbon_001",
    "Gift Ribbon Roll",
    "Birthday",
    "Party & Serving",
    45,
    10,
    ["gift", "birthday", "wrapping", "surprise"],
    "gift ribbon"
  ),
  p(
    "prod_greeting_card_001",
    "Greeting Card",
    "Birthday",
    "Party & Serving",
    60,
    11,
    ["birthday", "gift", "card", "surprise"],
    "greeting card"
  ),

  // Travel additions
  p(
    "prod_hand_towel_001",
    "Small Hand Towel",
    "Travel",
    "Travel Essentials",
    90,
    13,
    ["travel", "gym", "personal care", "packing"],
    "hand towel"
  ),
  p(
    "prod_eye_mask_001",
    "Travel Eye Mask",
    "Travel",
    "Travel Essentials",
    130,
    17,
    ["travel", "sleep", "flight", "comfort"],
    "eye mask"
  ),
  p(
    "prod_neck_pillow_001",
    "Inflatable Neck Pillow",
    "Travel",
    "Travel Essentials",
    220,
    20,
    ["travel", "sleep", "flight", "comfort"],
    "neck pillow"
  ),
  p(
    "prod_luggage_tag_001",
    "Luggage Tag",
    "Travel",
    "Travel Essentials",
    80,
    12,
    ["travel", "packing", "bag", "organize"],
    "luggage tag"
  ),
  p(
    "prod_mini_lock_001",
    "Small Luggage Lock",
    "Travel",
    "Travel Essentials",
    150,
    15,
    ["travel", "security", "bag", "packing"],
    "luggage lock"
  ),

  // Fitness and hydration
  p(
    "prod_protein_bar_001",
    "Protein Bar",
    "Fitness",
    "Health & Wellness",
    95,
    10,
    ["fitness", "snack", "protein", "travel"],
    "protein bar"
  ),
  p(
    "prod_glucose_001",
    "Glucose Powder",
    "Fitness",
    "Health & Wellness",
    85,
    11,
    ["energy", "sports", "hydration", "summer"],
    "glucose powder"
  ),
  p(
    "prod_shaker_001",
    "Protein Shaker Bottle",
    "Fitness",
    "Health & Wellness",
    180,
    18,
    ["fitness", "gym", "protein", "bottle"],
    "shaker bottle"
  ),
  p(
    "prod_water_bottle_001",
    "Reusable Water Bottle",
    "Fitness",
    "Health & Wellness",
    160,
    16,
    ["water", "travel", "gym", "hydration"],
    "water bottle"
  ),

  // Laundry additions
  p(
    "prod_fabric_softener_001",
    "Fabric Softener",
    "Laundry",
    "Laundry",
    190,
    18,
    ["laundry", "clothes", "fresh", "cleaning"],
    "fabric softener"
  ),
  p(
    "prod_cloth_clips_001",
    "Cloth Clips Pack",
    "Laundry",
    "Laundry",
    60,
    10,
    ["laundry", "clothes", "drying", "home"],
    "cloth clips"
  ),
  p(
    "prod_clothesline_001",
    "Clothesline Rope",
    "Laundry",
    "Laundry",
    80,
    12,
    ["laundry", "clothes", "drying", "home"],
    "clothesline"
  ),
  p(
    "prod_shoe_polish_001",
    "Black Shoe Polish",
    "Personal Care",
    "Personal Care",
    75,
    11,
    ["interview", "grooming", "shoes", "formal"],
    "shoe polish"
  ),

  // Tiered alternatives for budget/preference differentiation
  p(
    "prod_snack_budget_combo_001",
    "Budget Namkeen Combo Pack",
    "Snacks",
    "Snacks & Party",
    55,
    8,
    ["snacks", "guests", "party", "budget", "value", "fastest", "quick"],
    "namkeen combo",
    { budgetTier: "save", speedTier: "express", packSize: "mini" }
  ),
  p(
    "prod_snack_premium_platter_001",
    "Gourmet Snack Platter",
    "Snacks",
    "Snacks & Party",
    320,
    22,
    [
      "snacks",
      "guests",
      "party",
      "premium",
      "complete",
      "shareable",
      "gourmet",
    ],
    "gourmet snacks",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_drink_value_pack_001",
    "Value Cola Mini Cans 4 Pack",
    "Beverages",
    "Beverages",
    120,
    12,
    ["drinks", "guests", "party", "value", "combo", "cold beverage"],
    "cola cans",
    { budgetTier: "balanced", speedTier: "fast", packSize: "medium" }
  ),
  p(
    "prod_drink_premium_juice_001",
    "Cold Pressed Juice Assortment",
    "Beverages",
    "Beverages",
    260,
    20,
    ["juice", "guests", "premium", "healthy", "complete", "party"],
    "premium juice bottles",
    { budgetTier: "premium", speedTier: "standard", packSize: "medium" }
  ),
  p(
    "prod_party_serving_budget_001",
    "Eco Serving Kit for 6",
    "Party Essentials",
    "Party & Serving",
    80,
    9,
    [
      "serving",
      "guests",
      "party",
      "cups",
      "plates",
      "spoons",
      "budget",
      "fastest",
    ],
    "party serving kit",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_party_serving_premium_001",
    "Premium Party Serving Kit for 12",
    "Party Essentials",
    "Party & Serving",
    260,
    18,
    ["serving", "guests", "party", "premium", "complete", "plates", "cups"],
    "premium serving kit",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_dip_salsa_001",
    "Salsa Dip Cup",
    "Snacks",
    "Snacks & Party",
    70,
    11,
    ["dip", "snacks", "party", "guests", "value", "nachos"],
    "salsa dip",
    { budgetTier: "save", speedTier: "fast", packSize: "small" }
  ),
  p(
    "prod_dip_cheese_001",
    "Cheese Dip Bowl",
    "Snacks",
    "Snacks & Party",
    140,
    16,
    ["dip", "snacks", "party", "guests", "premium", "nachos"],
    "cheese dip",
    { budgetTier: "balanced", speedTier: "standard", packSize: "medium" }
  ),
  p(
    "prod_breakfast_value_combo_001",
    "Bread Butter Jam Value Combo",
    "Breakfast",
    "Breakfast & Dairy",
    140,
    10,
    [
      "breakfast",
      "bread",
      "butter",
      "jam",
      "value",
      "combo",
      "fastest",
      "kids",
    ],
    "breakfast combo",
    { budgetTier: "save", speedTier: "express", packSize: "medium" }
  ),
  p(
    "prod_breakfast_premium_combo_001",
    "Premium Breakfast Basket",
    "Breakfast",
    "Breakfast & Dairy",
    420,
    22,
    ["breakfast", "premium", "complete", "basket", "fruit", "bread", "healthy"],
    "breakfast basket",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_milk_small_001",
    "Fresh Milk 500ml",
    "Dairy",
    "Breakfast & Dairy",
    38,
    7,
    ["milk", "breakfast", "tea", "budget", "fastest", "daily essential"],
    "small milk pouch",
    { budgetTier: "save", speedTier: "express", packSize: "mini" }
  ),
  p(
    "prod_milk_organic_001",
    "Organic Milk 1L",
    "Dairy",
    "Breakfast & Dairy",
    110,
    16,
    ["milk", "breakfast", "premium", "organic", "healthy"],
    "organic milk",
    { budgetTier: "premium", speedTier: "standard", packSize: "medium" }
  ),
  p(
    "prod_bread_premium_001",
    "Multigrain Seeded Bread",
    "Bakery",
    "Breakfast & Dairy",
    95,
    14,
    ["bread", "breakfast", "premium", "healthy", "toast"],
    "multigrain bread",
    { budgetTier: "balanced", speedTier: "fast", packSize: "medium" }
  ),
  p(
    "prod_fruit_cup_001",
    "Cut Fruit Cup",
    "Fruits",
    "Fresh",
    90,
    9,
    ["fruit", "breakfast", "healthy", "fastest", "ready-to-eat", "snack"],
    "fruit cup",
    { budgetTier: "balanced", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_smoothie_001",
    "Ready Breakfast Smoothie",
    "Beverages",
    "Breakfast & Dairy",
    160,
    13,
    ["breakfast", "drink", "smoothie", "healthy", "premium", "quick meal"],
    "smoothie bottle",
    { budgetTier: "balanced", speedTier: "fast", packSize: "small" }
  ),
  p(
    "prod_birthday_budget_kit_001",
    "Mini Birthday Decoration Kit",
    "Birthday",
    "Party & Serving",
    120,
    10,
    [
      "birthday",
      "party",
      "decoration",
      "budget",
      "value",
      "fastest",
      "surprise",
    ],
    "mini birthday kit",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_birthday_premium_kit_001",
    "Premium Birthday Decor Box",
    "Birthday",
    "Party & Serving",
    480,
    23,
    ["birthday", "party", "decoration", "premium", "complete", "surprise"],
    "premium birthday box",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_cake_small_001",
    "Cupcake Duo",
    "Bakery",
    "Snacks & Party",
    90,
    11,
    ["cake", "birthday", "dessert", "sweet", "budget", "fastest"],
    "cupcakes",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_cake_premium_001",
    "Designer Bento Cake",
    "Bakery",
    "Snacks & Party",
    550,
    24,
    ["cake", "birthday", "dessert", "premium", "surprise", "complete"],
    "bento cake",
    { budgetTier: "premium", speedTier: "standard", packSize: "medium" }
  ),
  p(
    "prod_gift_chocolates_premium_001",
    "Premium Chocolate Gift Box",
    "Sweets",
    "Snacks & Party",
    399,
    22,
    ["chocolate", "gift", "birthday", "premium", "sweet", "surprise"],
    "chocolate gift box",
    { budgetTier: "premium", speedTier: "standard", packSize: "medium" }
  ),
  p(
    "prod_travel_value_toiletry_001",
    "Travel Toiletry Value Kit",
    "Travel",
    "Travel Essentials",
    130,
    10,
    ["travel", "hygiene", "packing", "toiletry", "budget", "fastest"],
    "travel toiletry kit",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_travel_premium_toiletry_001",
    "Premium Travel Toiletry Kit",
    "Travel",
    "Travel Essentials",
    390,
    21,
    ["travel", "hygiene", "packing", "toiletry", "premium", "complete"],
    "premium toiletry kit",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_travel_snack_budget_001",
    "Budget Travel Snack Pack",
    "Snacks",
    "Travel Essentials",
    70,
    8,
    ["travel", "snack", "budget", "value", "fastest", "packing"],
    "travel snack pack",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_travel_snack_premium_001",
    "Trail & Protein Travel Pack",
    "Snacks",
    "Travel Essentials",
    260,
    16,
    ["travel", "snack", "protein", "premium", "complete", "healthy"],
    "premium trail pack",
    { budgetTier: "premium", speedTier: "fast", packSize: "medium" }
  ),
  p(
    "prod_power_bank_mini_001",
    "Mini Emergency Power Bank",
    "Electronics Accessories",
    "Emergency & Weather",
    499,
    16,
    ["power", "travel", "phone", "emergency", "charging", "fastest"],
    "mini power bank",
    { budgetTier: "balanced", speedTier: "fast", packSize: "small" }
  ),
  p(
    "prod_charger_budget_001",
    "USB-C Cable + Adapter Basic Kit",
    "Electronics Accessories",
    "Work & Electronics",
    299,
    14,
    ["charger", "cable", "electronics", "work", "travel", "value"],
    "charger basic kit",
    { budgetTier: "balanced", speedTier: "fast", packSize: "small" }
  ),
  p(
    "prod_interview_budget_grooming_001",
    "Pocket Grooming Kit",
    "Personal Care",
    "Personal Care",
    120,
    9,
    ["interview", "grooming", "meeting", "budget", "fastest", "fresh"],
    "pocket grooming kit",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_interview_premium_grooming_001",
    "Premium Grooming Set",
    "Personal Care",
    "Personal Care",
    450,
    20,
    ["interview", "grooming", "meeting", "premium", "complete", "presentation"],
    "premium grooming set",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_shirt_freshener_001",
    "Fabric Freshener Mini Spray",
    "Personal Care",
    "Personal Care",
    85,
    8,
    ["interview", "grooming", "fresh", "clothes", "fastest", "odor"],
    "fabric freshener",
    { budgetTier: "save", speedTier: "express", packSize: "mini" }
  ),
  p(
    "prod_formal_socks_001",
    "Formal Socks Pair",
    "Personal Care",
    "Personal Care",
    120,
    13,
    ["interview", "formal", "grooming", "clothes", "work"],
    "formal socks",
    { budgetTier: "balanced", speedTier: "fast", packSize: "small" }
  ),
  p(
    "prod_pet_cleanup_budget_001",
    "Pet Cleanup Value Kit",
    "Pet Care",
    "Pet Care",
    150,
    10,
    ["pet", "dog", "cat", "mess", "cleaning", "budget", "fastest"],
    "pet cleanup kit",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_pet_cleanup_premium_001",
    "Deep Pet Cleanup Kit",
    "Pet Care",
    "Pet Care",
    420,
    20,
    ["pet", "dog", "cat", "mess", "cleaning", "premium", "complete", "odor"],
    "deep pet cleanup kit",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_pet_food_trial_001",
    "Pet Food Trial Pack",
    "Pet Care",
    "Pet Care",
    90,
    9,
    ["pet", "dog", "cat", "food", "budget", "fastest", "urgent"],
    "pet food trial pack",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_pet_food_premium_001",
    "Premium Pet Meal Pouch",
    "Pet Care",
    "Pet Care",
    280,
    18,
    ["pet", "dog", "cat", "food", "premium", "complete", "treats"],
    "premium pet meal",
    { budgetTier: "premium", speedTier: "standard", packSize: "medium" }
  ),
  p(
    "prod_first_aid_pocket_001",
    "Pocket First Aid Essentials",
    "First Aid",
    "Health & Wellness",
    95,
    8,
    ["first aid", "cut", "wound", "budget", "fastest", "emergency"],
    "pocket first aid",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_first_aid_premium_001",
    "Family First Aid Box",
    "First Aid",
    "Health & Wellness",
    520,
    22,
    ["first aid", "emergency", "injury", "premium", "complete", "family"],
    "family first aid box",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_cold_relief_value_001",
    "Cold Comfort Value Kit",
    "Wellness",
    "Health & Wellness",
    110,
    10,
    ["cold", "sore throat", "wellness", "comfort", "budget", "fastest"],
    "cold value kit",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_cold_relief_premium_001",
    "Cold Recovery Complete Kit",
    "Wellness",
    "Health & Wellness",
    430,
    23,
    ["cold", "sore throat", "wellness", "comfort", "premium", "complete"],
    "cold recovery kit",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_powercut_value_kit_001",
    "Power Cut Value Kit",
    "Emergency",
    "Emergency & Weather",
    180,
    9,
    [
      "power cut",
      "light",
      "emergency",
      "budget",
      "fastest",
      "candle",
      "battery",
    ],
    "power cut value kit",
    { budgetTier: "save", speedTier: "express", packSize: "medium" }
  ),
  p(
    "prod_powercut_premium_kit_001",
    "Rechargeable Emergency Light Kit",
    "Emergency",
    "Emergency & Weather",
    699,
    23,
    ["power cut", "light", "emergency", "premium", "complete", "rechargeable"],
    "emergency light kit",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_battery_budget_001",
    "AA Batteries 2 Pack",
    "Emergency",
    "Emergency & Weather",
    50,
    8,
    ["battery", "torch", "remote", "power cut", "budget", "fastest"],
    "battery 2 pack",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_battery_premium_001",
    "Long-Life AA Batteries 8 Pack",
    "Emergency",
    "Emergency & Weather",
    220,
    18,
    ["battery", "torch", "remote", "power cut", "premium", "complete"],
    "long life batteries",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_cleanup_value_kit_001",
    "Quick Spill Cleanup Value Kit",
    "Cleaning",
    "Cleaning & Home",
    110,
    8,
    ["spill", "cleaning", "kitchen", "budget", "fastest", "quick cleanup"],
    "spill cleanup kit",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_cleanup_complete_kit_001",
    "Complete Home Cleanup Kit",
    "Cleaning",
    "Cleaning & Home",
    390,
    21,
    ["spill", "cleaning", "home", "premium", "complete", "disinfect"],
    "complete cleanup kit",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_disinfectant_wipes_001",
    "Disinfectant Wipes Pack",
    "Cleaning",
    "Cleaning & Home",
    120,
    9,
    ["cleaning", "disinfect", "hygiene", "spill", "fastest", "home"],
    "disinfectant wipes",
    { budgetTier: "balanced", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_premium_floor_cleaner_001",
    "Premium Fragrant Floor Cleaner",
    "Cleaning",
    "Cleaning & Home",
    260,
    18,
    ["floor", "cleaning", "premium", "fragrant", "home", "complete"],
    "premium floor cleaner",
    { budgetTier: "premium", speedTier: "standard", packSize: "medium" }
  ),
  p(
    "prod_study_value_kit_001",
    "Exam Study Value Kit",
    "Office",
    "Work & Electronics",
    120,
    9,
    ["exam", "study", "office", "budget", "fastest", "notes"],
    "study value kit",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_study_complete_kit_001",
    "Exam Night Complete Kit",
    "Office",
    "Work & Electronics",
    360,
    19,
    ["exam", "study", "office", "premium", "complete", "late night"],
    "study complete kit",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_energy_snack_combo_001",
    "Energy Snack Combo",
    "Snacks",
    "Snacks & Party",
    140,
    11,
    ["study", "work", "late night", "energy", "snack", "combo", "value"],
    "energy snack combo",
    { budgetTier: "balanced", speedTier: "fast", packSize: "medium" }
  ),
  p(
    "prod_premium_stationery_001",
    "Premium Stationery Set",
    "Office",
    "Work & Electronics",
    280,
    18,
    ["study", "office", "premium", "complete", "stationery", "exam"],
    "premium stationery",
    { budgetTier: "premium", speedTier: "standard", packSize: "medium" }
  ),
  p(
    "prod_dinner_value_kit_001",
    "Quick Dinner Value Kit",
    "Quick Meals",
    "Kitchen & Quick Meals",
    180,
    11,
    ["dinner", "quick meal", "value", "combo", "fastest", "student"],
    "quick dinner kit",
    { budgetTier: "save", speedTier: "fast", packSize: "medium" }
  ),
  p(
    "prod_dinner_premium_kit_001",
    "Premium Pasta Dinner Kit",
    "Kitchen",
    "Kitchen & Quick Meals",
    520,
    22,
    ["dinner", "pasta", "premium", "complete", "cooking", "meal"],
    "premium pasta dinner kit",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_ready_meal_combo_001",
    "Ready Meal Combo Bowl",
    "Quick Meals",
    "Kitchen & Quick Meals",
    170,
    10,
    ["dinner", "quick meal", "combo", "ready-to-eat", "fastest", "student"],
    "ready meal combo",
    { budgetTier: "balanced", speedTier: "express", packSize: "medium" }
  ),
  p(
    "prod_gourmet_sauce_001",
    "Gourmet Pasta Sauce",
    "Kitchen",
    "Kitchen & Quick Meals",
    240,
    18,
    ["cooking", "dinner", "pasta", "sauce", "premium", "gourmet"],
    "gourmet sauce",
    { budgetTier: "premium", speedTier: "standard", packSize: "medium" }
  ),
  p(
    "prod_baby_urgent_value_001",
    "Baby Emergency Essentials Mini Kit",
    "Baby Care",
    "Baby Care",
    220,
    10,
    [
      "baby",
      "urgent",
      "wipes",
      "diaper",
      "budget",
      "fastest",
      "forgotten essential",
    ],
    "baby essentials mini kit",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_baby_complete_kit_001",
    "Baby Care Complete Kit",
    "Baby Care",
    "Baby Care",
    650,
    23,
    ["baby", "care", "diaper", "wipes", "premium", "complete", "urgent"],
    "baby care complete kit",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_diaper_small_001",
    "Baby Diapers Small Trial Pack",
    "Baby Care",
    "Baby Care",
    120,
    9,
    ["baby", "diapers", "urgent", "budget", "fastest", "trial"],
    "diaper trial pack",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_diaper_premium_001",
    "Premium Baby Diapers Jumbo Pack",
    "Baby Care",
    "Baby Care",
    720,
    22,
    ["baby", "diapers", "premium", "jumbo", "complete", "urgent"],
    "premium diapers",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
  p(
    "prod_rain_value_kit_001",
    "Rain Emergency Value Kit",
    "Rain Essentials",
    "Emergency & Weather",
    160,
    9,
    ["rain", "weather", "umbrella", "budget", "fastest", "urgent"],
    "rain value kit",
    { budgetTier: "save", speedTier: "express", packSize: "small" }
  ),
  p(
    "prod_rain_premium_kit_001",
    "Rain Protection Complete Kit",
    "Rain Essentials",
    "Emergency & Weather",
    590,
    22,
    ["rain", "weather", "umbrella", "premium", "complete", "urgent"],
    "rain complete kit",
    { budgetTier: "premium", speedTier: "standard", packSize: "large" }
  ),
];

const byId = new Map();

for (const product of existingProducts) {
  byId.set(product.id, product);
}

for (const product of extraProducts) {
  byId.set(product.id, product);
}

const mergedProducts = Array.from(byId.values()).map((product) => ({
  ...product,
  entityType: "PRODUCT",
  available: product.available !== false,
}));

mergedProducts.sort((a, b) => a.id.localeCompare(b.id));

fs.writeFileSync(productsPath, JSON.stringify(mergedProducts, null, 2));

console.log(
  JSON.stringify(
    {
      success: true,
      before: existingProducts.length,
      addedOrUpdated: extraProducts.length,
      after: mergedProducts.length,
      file: productsPath,
    },
    null,
    2
  )
);
