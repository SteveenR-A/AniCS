/** Match punctuation differences without merging distinct seasons. */
export function localAnimeTitlesMatch(a: string, b: string): boolean {
  const canonical = (title: string) => title.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b(1st|first|primer[ao]?)\s+season\b/g, 'season 1')
    .replace(/\b(2nd|second|segund[ao]?)\s+season\b/g, 'season 2')
    .replace(/\b(3rd|third|tercer[ao]?)\s+season\b/g, 'season 3')
    .replace(/\b(4th|fourth|cuart[ao]?)\s+season\b/g, 'season 4')
    .replace(/\b(5th|fifth|quint[ao]?)\s+season\b/g, 'season 5')
    .replace(/\b(temporada|temp)\s+(\d+)\b/g, 'season $2')
    .replace(/\bs(\d+)\b/g, 'season $1').replace(/\s+/g, '');
  const first = canonical(a);
  return first.length > 0 && first === canonical(b);
}
