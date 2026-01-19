import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

        // First, try to fetch the page HTML directly to extract images and price
        let extractedImageUrls = [];
        let extractedPrice = null;
        console.log('Fetching page HTML from:', url);
        try {
            const pageResponse = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'max-age=0',
                }
            });
            
            console.log('Page response status:', pageResponse.status);
            
            if (pageResponse.ok) {
                const html = await pageResponse.text();
                console.log('HTML length:', html.length);
                
                // === PRICE EXTRACTION ===
                // Try JSON-LD first (most reliable for structured data)
                const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
                let jsonMatch;
                while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
                    try {
                        const jsonContent = jsonMatch[1];
                        const jsonData = JSON.parse(jsonContent);
                        
                        const findProductData = (obj) => {
                            if (!obj) return;
                            
                            // Extract price from offers
                            if (obj.offers) {
                                const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
                                for (const offer of offers) {
                                    if (offer.price && !extractedPrice) {
                                        extractedPrice = parseFloat(offer.price);
                                        console.log('Found JSON-LD price:', extractedPrice);
                                    }
                                }
                            }
                            
                            // Extract images
                            if (obj.image) {
                                const images = Array.isArray(obj.image) ? obj.image : [obj.image];
                                for (const img of images) {
                                    const imgUrl = typeof img === 'string' ? img : (img.url || img.contentUrl);
                                    if (imgUrl && !extractedImageUrls.includes(imgUrl)) {
                                        console.log('Found JSON-LD image:', imgUrl);
                                        extractedImageUrls.unshift(imgUrl);
                                    }
                                }
                            }
                            
                            if (obj['@graph'] && Array.isArray(obj['@graph'])) {
                                for (const item of obj['@graph']) findProductData(item);
                            }
                        };
                        findProductData(jsonData);
                    } catch (e) {
                        console.log('JSON-LD parse error:', e.message);
                    }
                }
                
                // Try meta tags for price
                if (!extractedPrice) {
                    const priceMetaPatterns = [
                        /<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i,
                        /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']product:price:amount["']/i,
                        /<meta[^>]*property=["']og:price:amount["'][^>]*content=["']([^"']+)["']/i,
                        /<meta[^>]*name=["']price["'][^>]*content=["']([^"']+)["']/i,
                    ];
                    for (const pattern of priceMetaPatterns) {
                        const match = html.match(pattern);
                        if (match && match[1]) {
                            extractedPrice = parseFloat(match[1].replace(/[^0-9.]/g, ''));
                            if (!isNaN(extractedPrice)) {
                                console.log('Found meta price:', extractedPrice);
                                break;
                            }
                        }
                    }
                }
                
                // Try common price patterns in HTML
                if (!extractedPrice) {
                    const pricePatterns = [
                        // Shopify patterns
                        /data-product-price=["'](\d+)["']/i,
                        /"price":\s*(\d+(?:\.\d{2})?)/,
                        /"price":\s*"(\d+(?:\.\d{2})?)"/,
                        // Common class patterns - look for price in span/div content
                        /class=["'][^"']*(?:price|part-price|product-price)[^"']*["'][^>]*>\s*\$?([\d,]+(?:\.\d{2})?)/i,
                        /class=["'][^"']*mi-price[^"']*["'][^>]*>\s*\$?([\d,]+(?:\.\d{2})?)/i,
                        // Pelican Parts specific patterns
                        /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
                        /class=["']p-product-price["'][^>]*>.*?\$?([\d,]+\.\d{2})/is,
                        // Inline price patterns - be more specific to avoid false matches
                        /(?:price|cost|total)[:\s]*\$\s*([\d,]+\.\d{2})/i,
                        // Data attribute patterns
                        /data-price=["']([^"']+)["']/i,
                        /data-product-price=["']([^"']+)["']/i,
                        // Schema.org price in content
                        /itemprop=["']price["']\s*content=["']([^"']+)["']/i,
                    ];
                    for (const pattern of pricePatterns) {
                        const match = html.match(pattern);
                        if (match && match[1]) {
                            let priceStr = match[1].replace(/,/g, '');
                            // Shopify stores price in cents
                            if (pattern.source.includes('data-product-price') && priceStr.length > 2) {
                                extractedPrice = parseFloat(priceStr) / 100;
                            } else {
                                extractedPrice = parseFloat(priceStr);
                            }
                            if (!isNaN(extractedPrice) && extractedPrice > 0) {
                                console.log('Found HTML price:', extractedPrice);
                                break;
                            }
                        }
                    }
                }
                
                // === IMAGE EXTRACTION ===
                // Extract og:image meta tag (try multiple patterns)
                const ogPatterns = [
                    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
                    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
                    /og:image["']\s*content=["']([^"']+)["']/i
                ];
                for (const pattern of ogPatterns) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        console.log('Found og:image:', match[1]);
                        if (!extractedImageUrls.includes(match[1])) {
                            extractedImageUrls.push(match[1]);
                        }
                        break;
                    }
                }
                
                // Look for srcset images (often higher resolution)
                const srcsetPattern = /srcset=["']([^"']+)["']/gi;
                let srcsetMatch;
                while ((srcsetMatch = srcsetPattern.exec(html)) !== null) {
                    const srcset = srcsetMatch[1];
                    const srcsetUrls = srcset.split(',').map(s => s.trim().split(' ')[0]);
                    for (const imgUrl of srcsetUrls) {
                        if (imgUrl.startsWith('http') && 
                            !imgUrl.includes('icon') && 
                            !imgUrl.includes('logo') && 
                            !imgUrl.includes('1x1') &&
                            !extractedImageUrls.includes(imgUrl)) {
                            extractedImageUrls.push(imgUrl);
                        }
                    }
                }
                
                // Look for data-src attributes (lazy loaded images)
                const dataSrcPatterns = [
                    /data-src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
                    /data-zoom-image=["'](https?:\/\/[^"']+)["']/gi,
                    /data-large=["'](https?:\/\/[^"']+)["']/gi,
                    /data-image=["'](https?:\/\/[^"']+)["']/gi,
                ];
                for (const pattern of dataSrcPatterns) {
                    let match;
                    while ((match = pattern.exec(html)) !== null) {
                        let imgUrl = match[1];
                        if (!imgUrl.includes('icon') && !imgUrl.includes('logo') && !extractedImageUrls.includes(imgUrl)) {
                            extractedImageUrls.push(imgUrl);
                        }
                    }
                }
                
                // Look for CDN image URLs common in e-commerce (Shopify, etc)
                const cdnPattern = /["'](https?:\/\/cdn[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
                let cdnMatch;
                while ((cdnMatch = cdnPattern.exec(html)) !== null) {
                    let imgUrl = cdnMatch[1];
                    if (!imgUrl.includes('icon') && !imgUrl.includes('logo') && !extractedImageUrls.includes(imgUrl)) {
                        extractedImageUrls.push(imgUrl);
                    }
                }
                
                // Look for common e-commerce image patterns
                const ecomPatterns = [
                    /["'](https?:\/\/[^"']*\/products\/[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
                    /["'](https?:\/\/[^"']*\/images\/[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
                    /["'](https?:\/\/[^"']*shopify[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
                    /["'](https?:\/\/[^"']*cloudinary[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
                    /["'](https?:\/\/[^"']*imgix[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
                    /["'](https?:\/\/[^"']*amazonaws[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
                    /["'](https?:\/\/i\d*\.wp\.com[^"']+)["']/gi,
                ];
                
                for (const pattern of ecomPatterns) {
                    let match;
                    while ((match = pattern.exec(html)) !== null) {
                        let imgUrl = match[1];
                        if (imgUrl.includes('icon') || imgUrl.includes('logo') || imgUrl.includes('1x1') || imgUrl.includes('placeholder')) continue;
                        if (!extractedImageUrls.includes(imgUrl)) {
                            extractedImageUrls.push(imgUrl);
                        }
                    }
                }
                
                // Look for standard img src tags with product-like URLs
                const imgSrcPattern = /<img[^>]*src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
                let imgMatch;
                while ((imgMatch = imgSrcPattern.exec(html)) !== null) {
                    let imgUrl = imgMatch[1];
                    if (imgUrl.includes('icon') || imgUrl.includes('logo') || imgUrl.includes('1x1') || imgUrl.includes('placeholder')) continue;
                    // Prioritize product-like URLs
                    if ((imgUrl.includes('product') || imgUrl.includes('item') || imgUrl.includes('media')) && !extractedImageUrls.includes(imgUrl)) {
                        extractedImageUrls.push(imgUrl);
                    }
                }
                
                // Pelican Parts specific: look for slideshow data-thumb attributes
                const dataThumbPattern = /data-thumb=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
                let thumbMatch;
                while ((thumbMatch = dataThumbPattern.exec(html)) !== null) {
                    let imgUrl = thumbMatch[1];
                    if (!extractedImageUrls.includes(imgUrl)) {
                        console.log('Found data-thumb image:', imgUrl);
                        extractedImageUrls.push(imgUrl);
                    }
                }
                
                // Look for background-image URLs in style attributes (common for slideshows)
                const bgImagePattern = /background-image:\s*url\(['"]?(https?:\/\/[^'")\s]+\.(?:jpg|jpeg|png|webp)[^'")\s]*)['"]?\)/gi;
                let bgMatch;
                while ((bgMatch = bgImagePattern.exec(html)) !== null) {
                    let imgUrl = bgMatch[1];
                    if (!imgUrl.includes('icon') && !imgUrl.includes('logo') && !extractedImageUrls.includes(imgUrl)) {
                        console.log('Found background-image:', imgUrl);
                        extractedImageUrls.push(imgUrl);
                    }
                }
                
                // Look for catalog/images patterns (Pelican Parts, etc)
                const catalogPattern = /["'](https?:\/\/[^"']*\/catalog\/images\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
                let catalogMatch;
                while ((catalogMatch = catalogPattern.exec(html)) !== null) {
                    let imgUrl = catalogMatch[1];
                    if (!extractedImageUrls.includes(imgUrl)) {
                        console.log('Found catalog image:', imgUrl);
                        extractedImageUrls.push(imgUrl);
                    }
                }
                
                // Generic CDN patterns for various auto parts sites
                const autoCdnPatterns = [
                    /["'](https?:\/\/cdn\d*\.[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
                    /["'](https?:\/\/[^"']*\.com\/[^"']*images[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
                ];
                for (const pattern of autoCdnPatterns) {
                    let match;
                    while ((match = pattern.exec(html)) !== null) {
                        let imgUrl = match[1];
                        if (imgUrl.includes('icon') || imgUrl.includes('logo') || imgUrl.includes('spinner') || imgUrl.includes('loading')) continue;
                        if (!extractedImageUrls.includes(imgUrl)) {
                            extractedImageUrls.push(imgUrl);
                        }
                    }
                }
                
                console.log('Extracted price:', extractedPrice);
                console.log('Total extracted image URLs:', extractedImageUrls.length);
                if (extractedImageUrls.length > 0) {
                    console.log('First 5 images:', extractedImageUrls.slice(0, 5));
                }
            }
        } catch (fetchError) {
            console.error('Error fetching page HTML:', fetchError.message);
        }

        // Use InvokeLLM with add_context_from_internet to scrape and parse product data
        const result = await base44.integrations.Core.InvokeLLM({
            prompt: `Extract product information from this URL: ${url}

Please extract the following information if available:
- Product name/title
- Part number or SKU  
- Product description or notes
- Price (if shown)
- Image URLs - THIS IS CRITICAL: Find ALL product image URLs on the page. Look for:
  - Main product images
  - Product gallery images
  - Thumbnail images that link to larger versions
  - Images in srcset attributes
  - CDN URLs (often contain "cdn" or "shopify" in the URL)
  - URLs ending in .jpg, .jpeg, .png, .webp
  
Return the FULL URLs for images, not partial paths.`,
            add_context_from_internet: true,
            response_json_schema: {
                type: "object",
                properties: {
                    part_name: {
                        type: "string",
                        description: "The product name or title"
                    },
                    part_number: {
                        type: "string",
                        description: "Part number, SKU, or product code"
                    },
                    notes: {
                        type: "string",
                        description: "Product description or notes"
                    },
                    price: {
                        type: "number",
                        description: "Product price as a number (without currency symbols)"
                    },
                    image_urls: {
                        type: "array",
                        items: { type: "string" },
                        description: "Array of FULL product image URLs (must start with http)"
                    }
                }
            }
        });
        
        console.log('LLM result:', { price: result.price, image_urls: result.image_urls });

        // Use extracted price if available, otherwise fall back to LLM result
        const finalPrice = extractedPrice || result.price || null;
        console.log('Final price:', finalPrice);

        // Combine LLM images with extracted images, preferring extracted ones
        const allImageUrls = [...extractedImageUrls, ...(result.image_urls || [])];
        
        // Remove duplicates and filter out invalid URLs
        const uniqueImageUrls = [...new Set(allImageUrls)].filter(url => {
            if (!url || !url.startsWith('http')) return false;
            const lowerUrl = url.toLowerCase();
            // Exclude common non-product images
            const excludePatterns = [
                'icon', 'logo', '1x1', 'placeholder', 'tracking', 'pixel',
                'spinner', 'loading', 'header', 'footer', 'banner', 'nav',
                'button', 'arrow', 'triangle', 'warning', 'prop65',
                'manufacturer_logos', 'redesign', 'assets/img'
            ];
            return !excludePatterns.some(pattern => lowerUrl.includes(pattern));
        });

        console.log('Total unique images found:', uniqueImageUrls.length, uniqueImageUrls.slice(0, 5));
        
        // Download and re-upload up to 5 images
        const uploadedImageUrls = [];
        const imagesToProcess = uniqueImageUrls.slice(0, 5);

        for (const imageUrl of imagesToProcess) {
            try {
                if (!imageUrl || !imageUrl.startsWith('http')) continue;
                
                console.log('Attempting to download image:', imageUrl);
                
                // Fetch the image
                const imageResponse = await fetch(imageUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'image/*,*/*',
                        'Referer': url
                    }
                });
                
                console.log('Image response status:', imageResponse.status);
                
                if (!imageResponse.ok) continue;
                
                const imageBlob = await imageResponse.blob();
                console.log('Image blob size:', imageBlob.size);
                
                // Skip tiny images (likely tracking pixels)
                if (imageBlob.size < 1000) continue;
                
                // Determine file extension from content type or URL
                const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
                let ext = 'jpg';
                if (contentType.includes('png')) ext = 'png';
                else if (contentType.includes('webp')) ext = 'webp';
                else if (contentType.includes('gif')) ext = 'gif';
                
                // Create a File object
                const fileName = `part_image_${Date.now()}_${uploadedImageUrls.length}.${ext}`;
                const file = new File([imageBlob], fileName, { type: contentType });
                
                // Upload to Base44
                const uploadResult = await base44.integrations.Core.UploadFile({ file });
                console.log('Upload result:', uploadResult);
                
                if (uploadResult.file_url) {
                    uploadedImageUrls.push(uploadResult.file_url);
                }
            } catch (imgError) {
                console.error('Error processing image:', imageUrl, imgError.message);
            }
        }

        return Response.json({
            success: true,
            data: {
                ...result,
                price: finalPrice,
                image_urls: uploadedImageUrls
            }
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Error scraping URL:", error);
        return Response.json({ error: error.message }, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});