export const extractSentences = (documentData) => {
    if (!documentData?.documents) {
        return [];
    }

    return documentData.documents
        .filter((doc) => doc.fields?.content?.stringValue)
        .map((doc) => doc.fields.content.stringValue);
};
