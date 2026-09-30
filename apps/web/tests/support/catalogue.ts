type StarSuggestion = Readonly<{ canonical_name: string; slug: string }>;

export function starSuggestions(items: Array<StarSuggestion>) {
  return {
    items: items.map((item) => ({
      ...item,
      entity_type: "star",
      id: "12345678-1234-4234-9234-123456789abc",
    })),
  };
}
