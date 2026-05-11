import { Recipe } from '../types';
import { baseRecipes } from './base_recipes';
import { starterRecipes } from './starters';
import { mainRecipes } from './mains';
import { dessertRecipes } from './desserts';

export const recipes: Recipe[] = [
  ...baseRecipes,
  ...starterRecipes,
  ...mainRecipes,
  ...dessertRecipes
];
