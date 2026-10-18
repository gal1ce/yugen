// class names, with the falsy ones left out. no merging: a class passed in adds
// to the base ones rather than fighting them
export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
