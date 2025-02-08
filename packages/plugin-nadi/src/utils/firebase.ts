export const extractSentences = (documentData) => {
    if (!documentData?.documents) {
        return [];
    }

    return documentData.documents.map((doc) => doc.fields);
};
