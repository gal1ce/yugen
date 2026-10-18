// spread onto anything that needs a label: the same string is the tooltip and
// the accessible name of an icon-only button (components/ui/Tip draws it)
export const tip = (text: string) => ({ 'data-tip': text, 'aria-label': text })
