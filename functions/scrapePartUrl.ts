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

        // Download and re-upload the first 2 images
        const uploadedImageUrls = [];
        const imageUrls = result.image_urls || [];
        const imagesToProcess = imageUrls.slice(0, 2);

        for (const imageUrl of imagesToProcess) {
            try {
                if (!imageUrl || !imageUrl.startsWith('http')) continue;
                
                // Fetch the image
                const imageResponse = await fetch(imageUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                if (!imageResponse.ok) continue;
                
                const imageBlob = await imageResponse.blob();
                
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
                
                if (uploadResult.file_url) {
                    uploadedImageUrls.push(uploadResult.file_url);
                }
            } catch (imgError) {
                console.error('Error processing image:', imageUrl, imgError);
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