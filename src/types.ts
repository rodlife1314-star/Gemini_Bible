export type Module = 'octagon' | 'bible' | 'drift' | 'staff' | 'inventory' | 'service' | 'prophecy' | 'library';
export type JemmaMode = 'TRAINING' | 'OPERATOR';

export interface ChatMessage {
  id: number;
  role: 'jemma' | 'user';
  content: string;
  timestamp: string;
}

export interface Recipe {
  id: string;
  name: string;
  engine: string;
  station: string;
  time: string;
  servings: number;
  difficulty: 'Operator' | 'Head Chef' | 'Line';
  ingredients: Array<{ item: string; qty: string; prep: string }>;
  method: string[];
  allergens: string[];
  driftNotes: string;
  plating: string;
  price: number;
  cost: number;
  classicNote?: string;
}

export interface MenuMatrixEntry {
  id: string;
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  service: 'Lunch' | 'Dinner' | 'All Day';
  recipeId: string;
  recipeName: string;
  engine: string;
  position: number;
  gpPercent: number;
  notes?: string;
  locked?: boolean;
}

export interface Cookbook {
  id: string;
  title: string;
  category: string;
  description: string;
  linkedRecipes?: string[];
}
