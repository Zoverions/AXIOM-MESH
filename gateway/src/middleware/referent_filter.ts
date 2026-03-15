export function filterACS(text: string): string {
    if (!text) return text;

    let filteredText = text;

    // Strip sycophantic filler phrases
    const phrasesToStrip = [
        "Great question!",
        "Certainly!",
        "I hope this helps!",
        "As an AI..."
    ];

    for (const phrase of phrasesToStrip) {
        // Case-insensitive replacement, optionally followed by punctuation or spaces
        const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s*", "gi");
        filteredText = filteredText.replace(regex, "");
    }

    // Strip AI sludge words
    const sludgeWords = [
        "Delve",
        "Tapestry",
        "Testament",
        "Landscape",
        "Showcase",
        "Underscore"
    ];

    for (const word of sludgeWords) {
        // Match standalone words (case-insensitive)
        const regex = new RegExp("\\b" + word + "\\b\\s*", "gi");
        filteredText = filteredText.replace(regex, "");
    }

    // Clean up extra spaces or punctuation left behind (optional but good practice)
    filteredText = filteredText.replace(/\s+/g, ' ').trim();

    return filteredText;
}
