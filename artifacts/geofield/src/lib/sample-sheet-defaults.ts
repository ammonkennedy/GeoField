import { loadAccountPreferences, writeAccountPreference } from './account-preferences.ts';
export type SheetTemplate = { labels: string[]; customIds?: string[]; basicOrder?: string[]; parameterOrder?: string[] };
export function loadTemplates(): Record<string, SheetTemplate> {
  return Object.fromEntries(loadAccountPreferences().filter(item => item.key.startsWith('sample-sheet:') && item.value).map(item => {
    const value = item.value as any;
    const strings = (list: unknown) => Array.isArray(list) ? list.filter(value => typeof value === 'string') : [];
    return [item.key.slice('sample-sheet:'.length), {labels:strings(value.labels),customIds:strings(value.customIds),basicOrder:strings(value.basicOrder),parameterOrder:strings(value.parameterOrder)}];
  }));
}
export function saveTemplate(type: string, template: SheetTemplate) {
  writeAccountPreference(`sample-sheet:${type}`, template);
}
