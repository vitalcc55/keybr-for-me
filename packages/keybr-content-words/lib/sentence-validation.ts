const ENGLISH_TEXT_PATTERN = /^[\x20-\x7e]+$/u;

export function isValidEnglishText(value: string): boolean {
  return (
    value === value.normalize("NFC") &&
    value.length > 0 &&
    [...value].length <= 240 &&
    ENGLISH_TEXT_PATTERN.test(value) &&
    !hasControlCharacters(value)
  );
}

export function isValidTranslationText(value: string): boolean {
  return (
    value === value.normalize("NFC") &&
    value.length > 0 &&
    !hasControlCharacters(value)
  );
}

export function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return (
      codePoint < 0x20 ||
      codePoint === 0x7f ||
      (codePoint >= 0x80 && codePoint <= 0x9f)
    );
  });
}
