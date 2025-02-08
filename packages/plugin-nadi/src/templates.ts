export const tweetTemplate = `
# Context
{{recentMessages}}

# Topics
{{topics}}

# Post Directions
{{postDirections}}

# Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

# Providers
{{providers}}

# Chosen Sentence and reason
{{sentence}}
{{reason}}

# Task
Generate a tweet that:
1. Relates to the recent conversation or requested topic
2. Matches the character's style and voice
3. Is concise and engaging
4. Must be UNDER 180 characters (this is a strict requirement)
5. Speaks from the perspective of {{agentName}}
6. Must include exact chosen sentence and why it is chosen
7. specify that this sentence is chosen what people shared on NADI
8. specify that this sentence is now available on NADI.

Generate only the tweet text, no other commentary.`;

export const reviewTemplate2 = `
# Context
{{recentMessages}}

# Topics
{{topics}}

# Candidate Sentences and ID
{{candidates}}

# Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

# Task
Pick one candidate sentence that:
1. beneficial to share
2. inspirational
3. not insulting, not violent
4. with the reason why it is picked
5. if there is not worthy to share, approved is false

Response must be in this JSON format:
{
    "document": "string",  // Required: Copy the exact documentId from the selected candidate
    "content": "string",     // The selected sentence content
    "authorId": "string",    // The author ID of the selected sentence
    "reason": "string"       // Your reason for selecting or rejecting
    "approved": "boolean"   // Whether the sentence is approved or not
}
`;
