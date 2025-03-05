// This file exports the worker code as a string that can be used with a Blob
const workerCode = `
self.onmessage = function(e) {
    try {
        const { csvText, companyName, keywordList, websiteUrl } = e.data;
        
        if (!csvText || !companyName || !websiteUrl) {
            throw new Error('Missing required data: CSV text, company name, or website URL');
        }
        
        const results = countAnchors(csvText, companyName, websiteUrl, keywordList || []);
        self.postMessage({ success: true, results });
    } catch (error) {
        self.postMessage({ 
            success: false, 
            error: error.message || 'An error occurred during processing' 
        });
    }
};

// Memoization cache for similarity calculations
const similarityCache = new Map();

const countAnchors = (csvText, companyName, websiteUrl, keywordList) => {
    // Normalize company name and website URL once for all comparisons
    const normalizedCompanyName = companyName.toLowerCase();
    const normalizedWebsiteUrl = websiteUrl.toLowerCase();
    
    // Preprocess keywords for faster matching
    const normalizedKeywords = keywordList.map(keyword => keyword.toLowerCase());
    
    // Initialize counters
    let totalAnchors = 0;
    let brandedAnchors = 0;
    let nakedUrlAnchors = 0;
    let exactMatch = 0;
    let partialMatch = 0;
    let generic = 0;
    let miscellaneous = 0;
    let emptyAnchors = 0;
    
    try {
        // Split CSV into rows and handle potential errors
        const rows = csvText.split('\\n');
        if (rows.length <= 1) {
            throw new Error('CSV file appears to be empty or invalid');
        }
        
        // Find the index of the "Anchor" column
        const headers = parseCSVRow(rows[0]);
        const anchorIndex = headers.findIndex(header => 
            header.trim().toLowerCase() === 'anchor'
        );
        
        if (anchorIndex === -1) {
            throw new Error('Could not find "Anchor" column in CSV');
        }
        
        // Skip header row
        const dataRows = rows.slice(1);
        
        // Process in chunks to avoid UI freezing for large files
        const chunkSize = 1000;
        
        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            if (!row.trim()) continue; // Skip empty rows
            
            try {
                // Handle potential CSV parsing issues
                const columns = parseCSVRow(row);
                const anchor = columns[anchorIndex]?.trim() || ''; // Use the found anchor index
                
                totalAnchors += 1;
                
                if (!anchor) {
                    emptyAnchors += 1;
                    continue;
                }
                
                const normalizedAnchor = anchor.toLowerCase();
                
                // Check for miscellaneous first (non-English characters or spam patterns)
                if (isMiscellaneous(anchor)) {
                    miscellaneous += 1;
                }
                // Check for naked URLs (contains the company website URL)
                else if (isUrl(normalizedAnchor, normalizedWebsiteUrl)) {
                    nakedUrlAnchors += 1;
                }
                // Check for branded keywords (contains company name with high similarity)
                else if (normalizedAnchor.includes(normalizedCompanyName) || 
                         getSimilarity(normalizedAnchor, normalizedCompanyName) >= 90) {
                    brandedAnchors += 1;
                }
                else {
                    // Check for exact match first (more efficient)
                    let matched = false;
                    
                    for (const keyword of normalizedKeywords) {
                        const similarity = getSimilarity(normalizedAnchor, keyword);
                        
                        if (similarity >= 90) {
                            exactMatch += 1;
                            matched = true;
                            break;
                        }
                    }
                    
                    // If not an exact match, check for partial match
                    if (!matched) {
                        for (const keyword of normalizedKeywords) {
                            const similarity = getSimilarity(normalizedAnchor, keyword);
                            
                            if (similarity >= 60) {
                                partialMatch += 1;
                                matched = true;
                                break;
                            }
                        }
                        
                        // If neither exact nor partial match, it's generic
                        if (!matched) {
                            generic += 1;
                        }
                    }
                }
            } catch (rowError) {
                console.error('Error processing row:', rowError);
                // Continue with next row instead of failing the entire process
            }
        }
    } catch (error) {
        console.error('Error processing CSV:', error);
        throw error;
    }
    
    return {
        totalAnchors,
        brandedAnchors,
        nakedUrlAnchors,
        exactMatch,
        partialMatch,
        generic,
        miscellaneous,
        emptyAnchors,
    };
};

// Helper function to parse CSV rows properly (handles quoted fields with commas)
const parseCSVRow = (row) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current); // Add the last field
    return result;
};

// Improved URL detection that checks if the anchor contains the company website URL
const isUrl = (anchor, websiteUrl) => {
    // Check if the anchor contains the website URL
    if (anchor.includes(websiteUrl)) {
        return true;
    }
    
    // Also check for common URL patterns with the website domain
    const urlPatterns = [
        \`http://\${websiteUrl}\`,
        \`https://\${websiteUrl}\`,
        \`www.\${websiteUrl}\`,
        \`\${websiteUrl}/\`
    ];
    
    return urlPatterns.some(pattern => anchor.includes(pattern));
};

// Enhanced miscellaneous detection
const isMiscellaneous = (anchor) => {
    // Check for non-ASCII characters
    if (/[^\\x00-\\x7F]+/.test(anchor)) {
        return true;
    }
    
    // Check for excessive special characters (potential spam)
    const specialCharRatio = (anchor.match(/[^\\w\\s]/g) || []).length / anchor.length;
    if (specialCharRatio > 0.3) { // If more than 30% of characters are special
        return true;
    }
    
    // Check for very long anchors (potential spam)
    if (anchor.length > 100) {
        return true;
    }
    
    return false;
};

// Memoized similarity calculation
const getSimilarity = (phrase1, phrase2) => {
    // Create a cache key
    const cacheKey = \`\${phrase1}|\${phrase2}\`;
    
    // Check if we've already calculated this
    if (similarityCache.has(cacheKey)) {
        return similarityCache.get(cacheKey);
    }
    
    // Calculate similarity
    const similarity = similarityToPercentage(phrase1, phrase2);
    
    // Store in cache (limit cache size to prevent memory issues)
    if (similarityCache.size > 10000) {
        // Clear cache if it gets too large
        similarityCache.clear();
    }
    
    similarityCache.set(cacheKey, similarity);
    return similarity;
};

// Optimized Levenshtein distance calculation
const calculateLevenshteinDistance = (phrase1, phrase2) => {
    // Early exit for identical strings
    if (phrase1 === phrase2) return 0;
    
    // Early exit for empty strings
    if (phrase1.length === 0) return phrase2.length;
    if (phrase2.length === 0) return phrase1.length;
    
    // Optimization: use smaller arrays
    const len1 = phrase1.length;
    const len2 = phrase2.length;
    
    // Use two rows instead of a full matrix to save memory
    let prevRow = Array(len2 + 1).fill(0);
    let currRow = Array(len2 + 1).fill(0);
    
    // Initialize the previous row
    for (let j = 0; j <= len2; j++) {
        prevRow[j] = j;
    }
    
    // Fill in the current row
    for (let i = 1; i <= len1; i++) {
        currRow[0] = i;
        
        for (let j = 1; j <= len2; j++) {
            const cost = (phrase1.charAt(i - 1) === phrase2.charAt(j - 1)) ? 0 : 1;
            currRow[j] = Math.min(
                currRow[j - 1] + 1,         // Insertion
                prevRow[j] + 1,             // Deletion
                prevRow[j - 1] + cost       // Substitution
            );
        }
        
        // Swap rows
        [prevRow, currRow] = [currRow, prevRow];
    }
    
    // The result is in prevRow due to the final swap
    return prevRow[len2];
};

const similarityToPercentage = (phrase1, phrase2) => {
    const maxLength = Math.max(phrase1.length, phrase2.length);
    if (maxLength === 0) return 100; // Both strings are empty
    
    const distance = calculateLevenshteinDistance(phrase1, phrase2);
    const percentage = ((maxLength - distance) / maxLength) * 100;
    
    // Return as number instead of string for better performance
    return Math.round(percentage);
};
`;

export default workerCode; 