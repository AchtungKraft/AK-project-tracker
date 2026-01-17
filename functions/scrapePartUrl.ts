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

        // First, try to fetch the page HTML directly to extract images
        let extractedImageUrls = [];
        console.log('Fetching page HTML from:', url);
        try {
            const pageResponse = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                }
            });
            
            console.log('Page response status:', pageResponse.status);
            
            if (pageResponse.ok) {
                const html = await pageResponse.text();
                console.log('HTML length:', html.length);
                
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
                        extractedImageUrls.push(match[1]);
                        break;
                    }
                }
                
                // Look for CDN image URLs common in e-commerce (Shopify, etc)
                const cdnPattern = /["'](https?:\/\/cdn[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
                let cdnMatch;
                while ((cdnMatch = cdnPattern.exec(html)) !== null) {
                    if (!extractedImageUrls.includes(cdnMatch[1])) {
                        extractedImageUrls.push(cdnMatch[1]);
                    }
                }
                
                // Look for common e-commerce image patterns
                const ecomPatterns = [
                    /["'](https?:\/\/[^"']*\/products\/[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
                    /["'](https?:\/\/[^"']*\/images\/[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
                    /["'](https?:\/\/[^"']*shopify[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi
                ];
                
                for (const pattern of ecomPatterns) {
                    let match;
                    while ((match = pattern.exec(html)) !== null) {
                        let imgUrl = match[1];
                        if (imgUrl.includes('icon') || imgUrl.includes('logo') || imgUrl.includes('1x1')) continue;
                        if (!extractedImageUrls.includes(imgUrl)) {
                            extractedImageUrls.push(imgUrl);
                        }
                    }
                }
                
                // Also look for JSON-LD product data
                const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
                let jsonMatch;
                while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
                    try {
                        const jsonContent = jsonMatch[1];
                        const jsonData = JSON.parse(jsonContent);
                        const findImages = (obj) => {
                            if (!obj) return;
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
                                for (const item of obj['@graph']) findImages(item);
                            }
                        };
                        findImages(jsonData);
                    } catch (e) {
                        console.log('JSON-LD parse error:', e.message);
                    }
                }
                
                console.log('Total extracted image URLs:', extractedImageUrls.length);
                if (extractedImageUrls.length > 0) {
                    console.log('First 3 images:', extractedImageUrls.slice(0, 3));
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
- Image URLs (find the main product images, not icons or logos)

Be thorough in finding image URLs - look for product gallery images, main product images, etc.`,
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
                        description: "Array of product image URLs"
                    }
                }
            }
        });

        // Combine LLM images with extracted images, preferring extracted ones
        const allImageUrls = [...extractedImageUrls, ...(result.image_urls || [])];
        // Remove duplicates
        const uniqueImageUrls = [...new Set(allImageUrls)];

        console.log('Total unique images found:', uniqueImageUrls.length, uniqueImageUrls.slice(0, 3));
        
        // Download and re-upload the first 2 images
        const uploadedImageUrls = [];
        const imagesToProcess = uniqueImageUrls.slice(0, 2);

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