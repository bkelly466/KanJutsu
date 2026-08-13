/**
 * Deck categories, shared by deck creation and deck display so the picker,
 * labels and badge colours stay in sync.
 */

export const CATEGORY_OPTIONS = [
  { value: 'jlpt', label: 'JLPT Level' },
  { value: 'grade', label: 'School Grade' },
  { value: 'theme', label: 'Theme' },
  { value: 'custom', label: 'Custom' },
];

// Bootstrap contextual colour per category type, for deck badges.
export const CATEGORY_COLORS = {
  jlpt: 'primary',
  grade: 'success',
  theme: 'warning',
  custom: 'secondary',
};

export const DEFAULT_CATEGORY_COLOR = 'secondary';

export const JLPT_VALUES = ['N1', 'N2', 'N3', 'N4', 'N5'];

export const GRADE_VALUES = [
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Secondary',
];
