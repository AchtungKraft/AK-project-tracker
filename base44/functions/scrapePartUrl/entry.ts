import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Vendor Intelligence Extraction Engine
 * Multi-layer product extraction pipeline with vendor-specific adapters
 */

// Vendor adapter registry
const VENDOR_ADAPTERS = {
    amazon: {
        name: 'amazon',
        domains: ['amazon.com', 'amazon.ca', 'amazon.co.uk', 'amzn.to'],
        extractors: {
            // Amazon stores image data in complex JSON structures
            images: (html) => {
                const images = [];
                
                // Extract from data-a-dynamic-image (primary method)
                const dynamicImagePattern = /data-a-dynamic-image=["'](\{[^"']+\})["']/gi;
                let match;
                while ((match = dynamicImagePattern.exec(html)) !== null) {
                    try {
                        const decoded = match[1].replace(/&quot;/g, '"');
                        const imgData = JSON.parse(decoded);
                        // Get highest resolution variant
                        const urls = Object.keys(imgData);
                        if (urls.length > 0) {
                            // Sort by resolution (area) and pick largest
                            const sorted = urls.sort((a, b) => {
                                const aRes = imgData[a][0] * imgData[a][1];
                                const bRes = imgData[b][0] * imgData[b][1];
                                return bRes - aRes;
                            });
                            images.push(...sorted.slice(0, 3));
                        }
                    } catch (e) { /* ignore parse errors */ }
                }
                
                // Extract from colorImages.initial
                const colorImagesPattern = /'colorImages':\s*\{[^}]*'initial':\s*(\[[^\]]+\])/i;
                const colorMatch = html.match(colorImagesPattern);
                if (colorMatch) {
                    try {
                        const colorData = JSON.parse(colorMatch[1].replace(/'/g, '"'));
                        colorData.forEach(item => {
                            if (item.hiRes) images.push(item.hiRes);
                            else if (item.large) images.push(item.large);
                        });
                    } catch (e) { /* ignore */ }
                }
                
                // Extract from imageBlockVariation
                const imageBlockPattern = /ImageBlockATF[^{]*(\{[^}]+mainUrl[^}]+\})/gi;
                while ((match = imageBlockPattern.exec(html)) !== null) {
                    const urlMatch = match[1].match(/mainUrl["']?\s*:\s*["']([^"']+)["']/);
                    if (urlMatch) images.push(urlMatch[1]);
                }
                
                return images;
            },
            sku: (html) => {
                // ASIN extraction
                const asinPatterns = [
                    /data-asin=["']([A-Z0-9]{10})["']/i,
                    /"asin"\s*:\s*["']([A-Z0-9]{10})["']/i,
                    /\/dp\/([A-Z0-9]{10})/i
                ];
                for (const pattern of asinPatterns) {
                    const match = html.match(pattern);
                    if (match) return match[1];
                }
                return null;
            },
            price: (html) => {
                // Amazon price extraction
                const pricePatterns = [
                    /"priceAmount"\s*:\s*([0-9.]+)/,
                    /class="a-price-whole"[^>]*>([0-9,]+)/,
                    /id="priceblock_ourprice"[^>]*>\s*\$([0-9,.]+)/
                ];
                for (const pattern of pricePatterns) {
                    const match = html.match(pattern);
                    if (match) return parseFloat(match[1].replace(/,/g, ''));
                }
                return null;
            }
        }
    },
    pelican: {
        name: 'pelican_parts',
        domains: ['pelicanparts.com'],
        extractors: {
            images: (html) => {
                const images = [];
                // Pelican slideshow images
                const slidePattern = /data-thumb=["'](https?:\/\/[^"']+)["']/gi;
                let match;
                while ((match = slidePattern.exec(html)) !== null) {
                    // Replace thumb with large image
                    const largeUrl = match[1].replace(/\/thumb\//, '/large/').replace(/_thumb\./, '_large.');
                    images.push(largeUrl);
                    images.push(match[1]);
                }
                // Catalog images
                const catalogPattern = /["'](https?:\/\/[^"']*\/catalog\/images\/[^"']+\.(?:jpg|png)[^"']*)["']/gi;
                while ((match = catalogPattern.exec(html)) !== null) {
                    images.push(match[1]);
                }
                return images;
            },
            sku: (html) => {
                const match = html.match(/itemprop=["']sku["'][^>]*content=["']([^"']+)["']/i);
                return match ? match[1] : null;
            }
        }
    },
    fcpEuro: {
        name: 'fcp_euro',
        domains: ['fcpeuro.com'],
        extractors: {
            images: (html) => {
                const images = [];
                // FCP uses Shopify-style URLs
                const pattern = /["'](https?:\/\/[^"']*fcpeuro[^"']*\.(?:jpg|png|webp)[^"']*)["']/gi;
                let match;
                while ((match = pattern.exec(html)) !== null) {
                    // Get highest res version
                    const url = match[1].replace(/_\d+x\d*\./, '_2000x.');
                    images.push(url);
                }
                return images;
            }
        }
    },
    summit: {
        name: 'summit_racing',
        domains: ['summitracing.com'],
        extractors: {
            images: (html) => {
                const images = [];
                const pattern = /["'](https?:\/\/[^"']*summitracing[^"']*\/images\/[^"']+\.(?:jpg|png)[^"']*)["']/gi;
                let match;
                while ((match = pattern.exec(html)) !== null) {
                    images.push(match[1]);
                }
                return images;
            },
            sku: (html) => {
                const match = html.match(/data-part-number=["']([^"']+)["']/i);
                return match ? match[1] : null;
            }
        }
    },
    mcmaster: {
        name: 'mcmaster_carr',
        domains: ['mcmaster.com'],
        extractors: {
            images: (html) => {
                const images = [];
                // McMaster uses dynamic image loading
                const pattern = /["'](https?:\/\/[^"']*mcmaster[^"']*\.(?:jpg|png|gif)[^"']*)["']/gi;
                let match;
                while ((match = pattern.exec(html)) !== null) {
                    images.push(match[1]);
                }
                return images;
            },
            sku: (html) => {
                const match = html.match(/data-partnumber=["']([^"']+)["']/i) ||
                              html.match(/\/([0-9A-Z]+)$/);
                return match ? match[1] : null;
            }
        }
    }
};

/**
 * Detect vendor from URL
 */
function detectVendor(url) {
    const urlLower = url.toLowerCase();
    for (const [key, adapter] of Object.entries(VENDOR_ADAPTERS)) {
        if (adapter.domains.some(domain => urlLower.includes(domain))) {
            return adapter;
        }
    }
    return null;
}

/**
 * Extract JSON-LD structured data (Layer 1 - Highest Priority)
 */
function extractJsonLd(html) {
    const result = {
        part_name: null,
        part_number: null,
        description: null,
        price: null,
        vendor_name: null,
        image_urls: []
    };
    
    const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    
    while ((match = jsonLdPattern.exec(html)) !== null) {
        try {
            const jsonData = JSON.parse(match[1]);
            
            const processItem = (obj) => {
                if (!obj) return;
                
                // Product type
                if (obj['@type'] === 'Product' || obj.type === 'Product') {
                    if (obj.name && !result.part_name) result.part_name = obj.name;
                    if (obj.sku && !result.part_number) result.part_number = obj.sku;
                    if (obj.mpn && !result.part_number) result.part_number = obj.mpn;
                    if (obj.description && !result.description) result.description = obj.description;
                    if (obj.brand) {
                        result.vendor_name = typeof obj.brand === 'string' ? obj.brand : obj.brand.name;
                    }
                    
                    // Images
                    if (obj.image) {
                        const images = Array.isArray(obj.image) ? obj.image : [obj.image];
                        images.forEach(img => {
                            const url = typeof img === 'string' ? img : (img.url || img.contentUrl);
                            if (url && !result.image_urls.includes(url)) {
                                result.image_urls.push(url);
                            }
                        });
                    }
                    
                    // Price from offers
                    if (obj.offers) {
                        const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
                        for (const offer of offers) {
                            if (offer.price && !result.price) {
                                result.price = parseFloat(offer.price);
                            }
                        }
                    }
                }
                
                // Process @graph arrays
                if (obj['@graph'] && Array.isArray(obj['@graph'])) {
                    obj['@graph'].forEach(processItem);
                }
            };
            
            processItem(jsonData);
        } catch (e) {
            // Ignore parse errors
        }
    }
    
    return result;
}

/**
 * Extract OpenGraph metadata (Layer 2)
 */
function extractOpenGraph(html) {
    const result = {
        part_name: null,
        description: null,
        image_urls: []
    };
    
    const patterns = {
        title: [
            /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
            /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i
        ],
        description: [
            /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
            /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i
        ],
        image: [
            /<meta[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/gi,
            /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/gi
        ]
    };
    
    for (const pattern of patterns.title) {
        const match = html.match(pattern);
        if (match) { result.part_name = match[1]; break; }
    }
    
    for (const pattern of patterns.description) {
        const match = html.match(pattern);
        if (match) { result.description = match[1]; break; }
    }
    
    for (const pattern of patterns.image) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            if (!result.image_urls.includes(match[1])) {
                result.image_urls.push(match[1]);
            }
        }
    }
    
    return result;
}

/**
 * Extract generic DOM patterns (Layer 4 - Fallback)
 */
function extractDomFallback(html) {
    const result = {
        part_name: null,
        part_number: null,
        price: null,
        image_urls: []
    };
    
    // Title patterns
    const titlePatterns = [
        /<h1[^>]*class=["'][^"']*product[^"']*["'][^>]*>([^<]+)</i,
        /<h1[^>]*>([^<]+)</i,
        /<title>([^<|]+)/i
    ];
    for (const pattern of titlePatterns) {
        const match = html.match(pattern);
        if (match && match[1].trim()) {
            result.part_name = match[1].trim();
            break;
        }
    }
    
    // SKU patterns
    const skuPatterns = [
        /itemprop=["']sku["'][^>]*content=["']([^"']+)["']/i,
        /data-sku=["']([^"']+)["']/i,
        /sku[:\s]+["']?([A-Z0-9-]+)["']?/i,
        /part\s*(?:number|#|no\.?)[:\s]+["']?([A-Z0-9-]+)["']?/i
    ];
    for (const pattern of skuPatterns) {
        const match = html.match(pattern);
        if (match) { result.part_number = match[1]; break; }
    }
    
    // Price patterns
    const pricePatterns = [
        /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
        /data-price=["']([0-9.]+)["']/i,
        /data-product-price=["'](\d+)["']/i,
        /class=["'][^"']*price[^"']*["'][^>]*>\s*\$?([0-9,.]+)/i
    ];
    for (const pattern of pricePatterns) {
        const match = html.match(pattern);
        if (match) {
            let priceStr = match[1].replace(/,/g, '');
            // Shopify stores in cents
            if (pattern.source.includes('data-product-price') && priceStr.length > 2) {
                result.price = parseFloat(priceStr) / 100;
            } else {
                result.price = parseFloat(priceStr);
            }
            if (!isNaN(result.price) && result.price > 0) break;
        }
    }
    
    // Image patterns
    const imagePatterns = [
        /data-zoom-image=["'](https?:\/\/[^"']+)["']/gi,
        /data-large=["'](https?:\/\/[^"']+)["']/gi,
        /data-src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
        /srcset=["']([^"']+)["']/gi
    ];
    
    for (const pattern of imagePatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            if (pattern.source.includes('srcset')) {
                // Parse srcset
                const urls = match[1].split(',').map(s => s.trim().split(' ')[0]);
                urls.forEach(url => {
                    if (url.startsWith('http') && !result.image_urls.includes(url)) {
                        result.image_urls.push(url);
                    }
                });
            } else {
                if (!result.image_urls.includes(match[1])) {
                    result.image_urls.push(match[1]);
                }
            }
        }
    }
    
    return result;
}

/**
 * Normalize image URLs - remove thumbnail parameters, get highest res
 */
function normalizeImageUrls(urls) {
    return urls.map(url => {
        if (!url) return null;
        
        // Remove common thumbnail suffixes
        let normalized = url
            .replace(/_SL\d+_\./, '_SL1500_.')  // Amazon - upgrade to large
            .replace(/_AC_SX\d+_/, '_AC_SX1500_')  // Amazon
            .replace(/_SS\d+_\./, '_SL1500_.')  // Amazon
            .replace(/\?.*$/, '')  // Remove query params (sometimes)
            .replace(/_\d+x\d*\./, '_2000x.')  // Shopify - upgrade
            .replace(/\/thumb\//, '/large/')  // Common pattern
            .replace(/_thumb\./, '_large.');  // Common pattern
            
        return normalized;
    }).filter(Boolean);
}

/**
 * Filter out non-product images
 */
function filterProductImages(urls) {
    const excludePatterns = [
        'icon', 'logo', '1x1', 'placeholder', 'tracking', 'pixel',
        'spinner', 'loading', 'header', 'footer', 'banner', 'nav',
        'button', 'arrow', 'triangle', 'warning', 'prop65',
        'manufacturer_logos', 'redesign', 'assets/img', '/graphics/',
        '.svg', '.gif'
    ];
    
    return urls.filter(url => {
        if (!url || !url.startsWith('http')) return false;
        const lower = url.toLowerCase();
        if (lower.endsWith('.pdf')) return false;
        return !excludePatterns.some(p => lower.includes(p));
    });
}

/**
 * Calculate extraction confidence
 */
function calculateConfidence(result) {
    let score = 0;
    const missing = [];
    
    if (result.part_name) score += 25;
    else missing.push('part_name');
    
    if (result.part_number) score += 25;
    else missing.push('part_number');
    
    if (result.price) score += 25;
    else missing.push('price');
    
    if (result.image_urls && result.image_urls.length > 0) score += 25;
    else missing.push('images');
    
    let confidence = 'LOW';
    if (score >= 75) confidence = 'HIGH';
    else if (score >= 50) confidence = 'MEDIUM';
    
    return { confidence, score, fields_missing: missing };
}

/**
 * Main extraction pipeline
 */
async function extractProductData(url, html) {
    const startTime = Date.now();
    const vendor = detectVendor(url);
    
    console.log(`Extraction started for ${url}`);
    console.log(`Vendor detected: ${vendor?.name || 'generic'}`);
    
    // Layer 1: JSON-LD
    const jsonLdData = extractJsonLd(html);
    console.log('JSON-LD extraction:', { 
        hasName: !!jsonLdData.part_name, 
        hasSku: !!jsonLdData.part_number,
        hasPrice: !!jsonLdData.price,
        imageCount: jsonLdData.image_urls.length 
    });
    
    // Layer 2: OpenGraph
    const ogData = extractOpenGraph(html);
    console.log('OpenGraph extraction:', { 
        hasName: !!ogData.part_name,
        imageCount: ogData.image_urls.length 
    });
    
    // Layer 3: Vendor-specific
    let vendorData = { image_urls: [], part_number: null, price: null };
    if (vendor) {
        if (vendor.extractors.images) {
            vendorData.image_urls = vendor.extractors.images(html);
        }
        if (vendor.extractors.sku) {
            vendorData.part_number = vendor.extractors.sku(html);
        }
        if (vendor.extractors.price) {
            vendorData.price = vendor.extractors.price(html);
        }
        console.log(`Vendor (${vendor.name}) extraction:`, {
            hasSku: !!vendorData.part_number,
            hasPrice: !!vendorData.price,
            imageCount: vendorData.image_urls.length
        });
    }
    
    // Layer 4: DOM fallback
    const domData = extractDomFallback(html);
    console.log('DOM fallback extraction:', { 
        hasName: !!domData.part_name,
        hasSku: !!domData.part_number,
        hasPrice: !!domData.price,
        imageCount: domData.image_urls.length 
    });
    
    // Merge results with priority
    const result = {
        part_name: jsonLdData.part_name || ogData.part_name || domData.part_name,
        part_number: jsonLdData.part_number || vendorData.part_number || domData.part_number,
        description: jsonLdData.description || ogData.description,
        notes: jsonLdData.description || ogData.description,
        price: jsonLdData.price || vendorData.price || domData.price,
        vendor_name: jsonLdData.vendor_name,
        vendor_normalized_name: vendor?.name || null,
        image_urls: [],
        source_adapter: vendor?.name || 'generic',
        extraction_time_ms: Date.now() - startTime
    };
    
    // Merge and dedupe images with priority
    const allImages = [
        ...vendorData.image_urls,  // Vendor-specific first (usually best quality)
        ...jsonLdData.image_urls,
        ...ogData.image_urls,
        ...domData.image_urls
    ];
    
    // Normalize, filter, and dedupe
    const normalizedImages = normalizeImageUrls(allImages);
    const filteredImages = filterProductImages(normalizedImages);
    result.image_urls = [...new Set(filteredImages)];
    
    // Calculate confidence
    const { confidence, score, fields_missing } = calculateConfidence(result);
    result.extraction_confidence = confidence;
    result.confidence_score = score;
    result.fields_missing = fields_missing;
    
    console.log('Final extraction result:', {
        confidence,
        score,
        fields_missing,
        imageCount: result.image_urls.length,
        extraction_time_ms: result.extraction_time_ms
    });
    
    return result;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { url } = await req.json();
        
        if (!url) {
            return Response.json({ error: 'URL is required' }, { status: 400 });
        }

        console.log('=== Vendor Intelligence Extraction ===');
        console.log('URL:', url);

        // Fetch page HTML
        let html = '';
        try {
            const pageResponse = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Cache-Control': 'max-age=0',
                }
            });
            
            if (pageResponse.ok) {
                html = await pageResponse.text();
                console.log('HTML fetched, length:', html.length);
            } else {
                console.log('Failed to fetch page:', pageResponse.status);
            }
        } catch (fetchError) {
            console.error('Error fetching page:', fetchError.message);
        }

        // Run extraction pipeline
        let extractedData = null;
        if (html.length > 0) {
            extractedData = await extractProductData(url, html);
        }

        // Fallback to LLM if extraction confidence is LOW
        let llmData = null;
        if (!extractedData || extractedData.extraction_confidence === 'LOW') {
            console.log('Running LLM fallback...');
            try {
                llmData = await base44.integrations.Core.InvokeLLM({
                    prompt: `Extract product information from this URL: ${url}

Extract:
- Product name/title
- Part number or SKU  
- Product description
- Price (number only)
- Image URLs (full URLs starting with http)`,
                    add_context_from_internet: true,
                    response_json_schema: {
                        type: "object",
                        properties: {
                            part_name: { type: "string" },
                            part_number: { type: "string" },
                            notes: { type: "string" },
                            price: { type: "number" },
                            image_urls: { type: "array", items: { type: "string" } }
                        }
                    }
                });
                console.log('LLM fallback result:', { 
                    hasName: !!llmData?.part_name,
                    imageCount: llmData?.image_urls?.length || 0 
                });
            } catch (llmError) {
                console.error('LLM fallback failed:', llmError.message);
            }
        }

        // Merge LLM data if extraction was poor
        const finalData = {
            part_name: extractedData?.part_name || llmData?.part_name,
            part_number: extractedData?.part_number || llmData?.part_number,
            notes: extractedData?.notes || llmData?.notes,
            description: extractedData?.description || llmData?.notes,
            price: extractedData?.price || llmData?.price,
            vendor_name: extractedData?.vendor_name,
            vendor_normalized_name: extractedData?.vendor_normalized_name || 'generic',
            image_urls: extractedData?.image_urls?.length > 0 
                ? extractedData.image_urls 
                : (llmData?.image_urls || []),
            extraction_confidence: extractedData?.extraction_confidence || 'LOW',
            confidence_score: extractedData?.confidence_score || 0,
            source_adapter: extractedData?.source_adapter || 'llm_fallback',
            fields_missing: extractedData?.fields_missing || []
        };

        // Download and re-upload images
        const uploadedImageUrls = [];
        const imagesToProcess = finalData.image_urls.slice(0, 5);

        for (const imageUrl of imagesToProcess) {
            try {
                if (!imageUrl || !imageUrl.startsWith('http')) continue;
                
                console.log('Downloading image:', imageUrl.substring(0, 100));
                
                const imageResponse = await fetch(imageUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'image/*,*/*',
                        'Referer': url
                    }
                });
                
                if (!imageResponse.ok) continue;
                
                const imageBlob = await imageResponse.blob();
                
                // Skip tiny images
                if (imageBlob.size < 1000) continue;
                
                const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
                let ext = 'jpg';
                if (contentType.includes('png')) ext = 'png';
                else if (contentType.includes('webp')) ext = 'webp';
                
                const fileName = `part_image_${Date.now()}_${uploadedImageUrls.length}.${ext}`;
                const file = new File([imageBlob], fileName, { type: contentType });
                
                const uploadResult = await base44.integrations.Core.UploadFile({ file });
                
                if (uploadResult.file_url) {
                    uploadedImageUrls.push(uploadResult.file_url);
                    console.log('Uploaded image:', uploadResult.file_url);
                }
            } catch (imgError) {
                console.error('Image processing error:', imgError.message);
            }
        }

        return Response.json({
            success: true,
            data: {
                part_name: finalData.part_name,
                part_number: finalData.part_number,
                notes: finalData.notes,
                price: finalData.price,
                image_urls: uploadedImageUrls,
                // Metadata for UI feedback
                extraction_confidence: finalData.extraction_confidence,
                confidence_score: finalData.confidence_score,
                source_adapter: finalData.source_adapter,
                vendor_name: finalData.vendor_name,
                vendor_normalized_name: finalData.vendor_normalized_name,
                fields_missing: finalData.fields_missing
            }
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Error in extraction:", error);
        return Response.json({ error: error.message }, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});