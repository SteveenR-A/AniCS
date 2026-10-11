import { expect, it } from 'vitest';
import { localAnimeTitlesMatch } from '../localAnimeTitles';

it.each([
  ['Seito-kai ni mo Ana wa Aru!', 'Seitokai ni mo Ana wa Aru'],
  ['Re:Zero', 'Re Zero'],
  ['Narúto_Shippuden', 'Naruto Shippuden'],
])('matches a download folder with punctuation differences: %s', (a, b) => {
  expect(localAnimeTitlesMatch(a, b)).toBe(true);
});
it('matches season aliases but keeps different seasons separate', () => {
  expect(localAnimeTitlesMatch('Anime 2nd Season', 'Anime temporada 2')).toBe(true);
  expect(localAnimeTitlesMatch('Anime S1', 'Anime S2')).toBe(false);
  expect(localAnimeTitlesMatch('Anime', 'Anime S2')).toBe(false);
});
it('preserves Japanese and Chinese titles instead of normalizing them to empty strings', () => {
  expect(localAnimeTitlesMatch('進撃の巨人', '進撃の巨人')).toBe(true);
  expect(localAnimeTitlesMatch('斗破苍穹', '斗破苍穹')).toBe(true);
  expect(localAnimeTitlesMatch('进击的巨人', '斗破苍穹')).toBe(false);
});
it('does not match empty titles or prefixes of different anime', () => {
  expect(localAnimeTitlesMatch('', '')).toBe(false);
  expect(localAnimeTitlesMatch('Naruto', 'Naruto Shippuden')).toBe(false);
});
