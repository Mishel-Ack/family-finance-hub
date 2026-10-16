export function matchesCommandLabel(label: string, search: string) {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  return !normalizedSearch || label.toLocaleLowerCase().includes(normalizedSearch);
}
