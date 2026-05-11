import { Cookbook } from '../types';

export const bookshelves: Cookbook[] = [
  { id: "larousse", title: "Larousse Gastronomique", category: "Core Reference", description: "Primary food bible — mother sauces, classical techniques, precision standards.", linkedRecipes: ["cla001", "cla002", "cla003"] },
  { id: "ginger-pig", title: "Ginger Pig Meat Book", category: "Core Reference", description: "Butchery, aging, and professional meat cookery standards.", linkedRecipes: ["p002", "p010"] },
  { id: "dairy-book", title: "The Dairy Book of British Food", category: "Core Reference", description: "British dairy and traditional ingredients.", linkedRecipes: ["cla001", "cla008"] },
  { id: "clean-cakes", title: "Clean Cakes", category: "Pastry / Dessert", description: "Modern, clean pastry and cake techniques.", linkedRecipes: ["p_tiramisu"] },
  { id: "georgias-cakes", title: "Georgia’s Cakes", category: "Pastry / Dessert", description: "Signature cake and celebration baking.", linkedRecipes: ["p_baked_alaska"] },
  { id: "dessert-person", title: "Dessert Person", category: "Pastry / Dessert", description: "Claire Saffitz’s elevated home desserts.", linkedRecipes: ["p_tiramisu"] },
  { id: "sugar-i-love-you", title: "Sugar, I Love You", category: "Pastry / Dessert", description: "Sugar work and advanced patisserie.", linkedRecipes: [] },
  { id: "leiths", title: "Leiths Cookery Bible", category: "General / Professional", description: "Comprehensive professional cookery reference.", linkedRecipes: ["cla004", "cla005"] },
  { id: "sunday-times", title: "The Sunday Times Complete Cook Book", category: "General / Professional", description: "Classic British and international execution standards.", linkedRecipes: [] },
  { id: "where-chefs-eat", title: "Where Chefs Eat", category: "General / Professional", description: "Chef-inspired global dining references.", linkedRecipes: [] },
  { id: "naked-chef", title: "The Naked Chef", category: "General / Professional", description: "Jamie Oliver’s foundational modern British cooking.", linkedRecipes: ["p001"] },
  { id: "kerridge", title: "Tom Kerridge’s Best Ever Dishes", category: "General / Professional", description: "Pub-style elevated British classics.", linkedRecipes: ["f006"] },
  { id: "east", title: "East", category: "Regional / Ingredient-Focused", description: "Indian and South Asian flavours.", linkedRecipes: [] },
  { id: "sri-lanka", title: "Sri Lanka: The Cookbook", category: "Regional / Ingredient-Focused", description: "Authentic Sri Lankan cuisine.", linkedRecipes: [] },
  { id: "spice", title: "Spice", category: "Regional / Ingredient-Focused", description: "Spice mastery and global applications.", linkedRecipes: ["b008"] },
  { id: "broth", title: "Broth", category: "Regional / Ingredient-Focused", description: "Stocks, broths and foundational liquids.", linkedRecipes: ["cla002", "cla007"] },
  { id: "bite-by-bite", title: "Bite by Bite", category: "Misc / Entertaining", description: "Modern entertaining and sharing plates.", linkedRecipes: ["p008"] },
  { id: "sundays", title: "Sundays", category: "Misc / Entertaining", description: "Sunday lunch and family-style service.", linkedRecipes: ["p002"] }
];
