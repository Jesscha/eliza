export const tweetTemplate = `
# Context
{{recentMessages}}

# Topics
{{topics}}

# Chosen Sentence and reason
{{sentence}}
{{reason}}

# Task
Create a tweet with these requirements:
1. Use natural, conversational language matching {{agentName}}'s personality
2. Maximum length: 180 characters (strict limit)
3. Write in first person as {{agentName}}
4. Include verbatim: "{{sentence}}" and explain selection rationale
5. Mention this was shared by NADI community
6. Note this content passed NADI approval process

Format: Plain tweet text only, no metadata or markup

Generate only the tweet text, no other commentary.`;

export const reviewTemplate = `
# Context
{{recentMessages}}

# Topics
{{topics}}

# Candidate Sentences and ID
{{candidates}}

# Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

# Task
Review the sentences and:

1. FIRST: Look for positive, beneficial sentences that meet ALL these criteria:
   - Inspirational or motivational
   - Helpful or beneficial to share with others
   - Completely free of insults, violence, or negative content
   - Appropriate for general audiences

2. If you find a sentence meeting ALL criteria above:
   - Set approved to true
   - Select that sentence
   - Explain why it's a good choice

3. Only if NO sentences meet ALL the positive criteria:
   - Set approved to false
   - Explain why none of the sentences were suitable

Remember: Always prioritize finding a good sentence first before deciding nothing is suitable.

Response must be in this JSON format:
{
    "document": "string",  // Required: Copy the exact documentId from the selected candidate
    "content": "string",     // The selected sentence content
    "authorId": "string",    // The author ID of the selected sentence
    "reason": "string"       // Your reason for selecting or rejecting
    "approved": "boolean"   // Whether the sentence is approved or not
}
`;
