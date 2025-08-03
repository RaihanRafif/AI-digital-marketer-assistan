const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const { getJson } = require("google-search-results-nodejs");
require('dotenv').config();

// Inisialisasi Aplikasi Express
const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// --- Konfigurasi Klien ---
// Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const generationModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
// Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);


// --- Endpoint Baru: Feedback Loop ---
app.post('/api/v1/feedback', async (req, res) => {
    const { userId, platform, content } = req.body;

    if (!userId || !platform || !content) {
        return res.status(400).json({ error: 'userId, platform, and content are required.' });
    }

    try {
        console.log(`Creating embedding for successful content...`);
        const result = await embeddingModel.embedContent(content);
        const embedding = result.embedding.values;

        const { data, error } = await supabase
            .from('successful_content')
            .insert({
                user_id: userId,
                platform: platform,
                content: content,
                embedding: embedding
            });

        if (error) throw error;

        console.log('Feedback saved successfully.');
        res.status(201).json({ message: 'Feedback learned!', data });

    } catch (error) {
        console.error('Error in feedback loop:', error);
        res.status(500).json({ error: 'Failed to learn from feedback.', details: error.message });
    }
});

// --- Endpoint Generate Utama ---
app.post('/api/v1/generate', async (req, res) => {
    try {
        const { url, userId } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        const supabase = createAuthenticatedClient(req); // Gunakan klien terautentikasi

        // (BARU) Langkah 0: Ambil Persona dari Database
        let userPersona = { brand_voice: 'Profesional', target_audience: 'Publik umum' }; // Default
        if (userId) {
            const { data: personaData, error } = await supabase
                .from('personas')
                .select('*')
                .eq('user_id', userId)
                .single();
            if (personaData) {
                userPersona = personaData;
            }
        }

        console.log("VVVV : ", userPersona);


        // Langkah 1: Ekstrak Konten
        console.log(`Fetching content from: ${url}`);
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        let articleText = '';
        $('h1, h2, h3, p, li').each((i, elem) => {
            articleText += $(elem).text() + '\n';
        });

        // Langkah 1.5: Analisis Tren
        console.log("Running Trend Analysis...");
        const firstH1 = $('h1').first().text();
        let trendAnalysis = "No trending questions found.";
        if (firstH1) {
            try {
                const searchData = JSON.stringify({ "q": firstH1 });
                const config = {
                    method: 'post',
                    url: 'https://google.serper.dev/search',
                    headers: {
                        'X-API-KEY': process.env.SERPER_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    data: searchData
                };

                const response = await axios.request(config);
                const searchResults = response.data;

                if (searchResults.peopleAlsoAsk && searchResults.peopleAlsoAsk.length > 0) {
                    trendAnalysis = "Trending questions people are asking:\n" +
                        searchResults.peopleAlsoAsk.map(q => `- ${q.question}`).join('\n');
                    console.log("Trend analysis successful.");
                }
            } catch (searchError) {
                console.error("Serper API error, skipping trend analysis.", searchError.message);
            }
        }

        // Langkah 2: Jalankan Agen Analis
        const analystPrompt = `
        Analyze the following article based on this persona:
        Brand Voice: "${userPersona.brand_voice || 'Professional'}", 
        Target Audience: "${userPersona.target_audience || 'General Public'}", and recent trends.
        
        TRENDS:
        ${trendAnalysis}
        ARTICLE:
        ${articleText.substring(0, 7000)}
        ANALYSIS (in 3 parts):
        1. Main Topic: (A single sentence)
        2. Key Points: (3-5 bullet points)
        3. Interesting Angle: (A unique angle based on the trends)
        `;

        console.log("analysisPrompt : ", analystPrompt);


        console.log('Running Analyst Agent...');
        const analystResult = await generationModel.generateContent(analystPrompt);
        const analysisText = analystResult.response.text();

        // Langkah 2.5: Cari Contoh Sukses
        let successfulExamples = [];
        if (userId) {
            const { embedding } = await embeddingModel.embedContent(analysisText);
            const { data: similarPosts, error } = await supabase.rpc('match_content', {
                query_embedding: embedding.values, match_threshold: 0.75, match_count: 2, p_user_id: userId
            });
            if (error) console.error("Error searching for similar posts:", error);
            else if (similarPosts?.length > 0) successfulExamples = similarPosts;
        }

        // Langkah 3: Jalankan Agen Kreatif
        const examplesText = successfulExamples.map(p => `- ${p.content.substring(0, 200)}...`).join('\n');
        const smartPromptAddition = examplesText ? `\n\nFor reference, here are past successful posts from this user. Learn their style:\n${examplesText}\n\nNow, create the new content.` : ``;
        const creativePrompts = {
            instagram: `You are a Social Media Manager. Based on this analysis:\n\n${analysisText}\n\nCreate a 5-slide Instagram carousel idea. Respond ONLY with a valid JSON object like this: {"slides": [{"slide": 1, "text": "Text for slide 1..."}, {"slide": 2, "text": "Text for slide 2..."}]}.${smartPromptAddition}`,
            twitter: `You are a Twitter ghostwriter. Based on this analysis:\n\n${analysisText}\n\nCreate a 3-tweet thread with a strong hook.${smartPromptAddition}`,
            linkedin: `You are a B2B Content Strategist. Turn this analysis:\n\n${analysisText}\n\nInto a professional LinkedIn post.${smartPromptAddition}`,
        };
        console.log('Running Creative Agent...');
        const [instagramResult, twitterText, linkedinText] = await Promise.all([
            generationModel.generateContent(creativePrompts.instagram),
            generationModel.generateContent(creativePrompts.twitter).then(res => res.response.text()),
            generationModel.generateContent(creativePrompts.linkedin).then(res => res.response.text()),
        ]);

        const instagramResponseText = instagramResult.response.text();
        const instagramJsonMatch = instagramResponseText.match(/\{[\s\S]*\}/);
        if (!instagramJsonMatch) throw new Error("Creative agent for Instagram did not return valid JSON.");
        const instagramData = JSON.parse(instagramJsonMatch[0]);
        const instagramSlides = instagramData.slides || [];

        // Langkah 4: Jalankan Agen Optimasi & Gambar secara PARALEL
        console.log("Running Optimizer and Artist Agents in parallel...");
        const instagramImagePromises = instagramSlides.map(slide => generateImageAsset(slide.text));
        const [
            instagramOptimization, twitterOptimization, linkedinOptimization,
            twitterImageUrl, linkedinImageUrl,
            instagramImageUrls
        ] = await Promise.all([
            optimizeContent('Instagram', instagramSlides.map(s => s.text).join('\n\n')),
            optimizeContent('Twitter/X', twitterText),
            optimizeContent('LinkedIn', linkedinText),
            generateImageAsset(twitterText),
            generateImageAsset(linkedinText),
            Promise.all(instagramImagePromises)
        ]);

        // Langkah 5: Kirim Hasil Lengkap ke Frontend
        res.status(200).json({
            analysis: analysisText,
            platforms: {
                instagram: {
                    id: `ig-${Date.now()}`, slides: instagramSlides, optimization: instagramOptimization, imageUrls: instagramImageUrls
                },
                twitter: {
                    id: `tw-${Date.now()}`, text: twitterText, optimization: twitterOptimization, imageUrl: twitterImageUrl
                },
                linkedin: {
                    id: `li-${Date.now()}`, text: linkedinText, optimization: linkedinOptimization, imageUrl: linkedinImageUrl
                },
            },
        });

    } catch (error) {
        console.error('Error during content generation:', error);
        res.status(500).json({ error: 'Failed to generate content.', details: error.message });
    }
});

// GET: Mengambil persona pengguna saat ini
app.get('/api/v1/persona/:userId', async (req, res) => {
    const supabase = createAuthenticatedClient(req); // Gunakan klien terautentikasi
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'User ID is required.' });

    try {
        const { data, error } = await supabase
            .from('personas')
            .select('*')
            .eq('user_id', userId)
            .single(); // Ambil satu baris saja

        if (error && error.code !== 'PGRST116') { // Abaikan error jika tidak ada baris (itu normal)
            throw error;
        }
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch persona.', details: error.message });
    }
});

// POST: Membuat atau memperbarui persona pengguna
app.post('/api/v1/persona', async (req, res) => {
    const supabase = createAuthenticatedClient(req); // Gunakan klien terautentikasi
    const { userId, brandVoice, targetAudience, contentGoal } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required.' });


    try {
        const { data, error } = await supabase
            .from('personas')
            .upsert({
                user_id: userId,
                brand_voice: brandVoice,
                target_audience: targetAudience,
                content_goal: contentGoal,
                updated_at: new Date()
            }, {
                onConflict: 'user_id' // Jika user_id sudah ada, perbarui barisnya
            })
            .select()
            .single();
        console.log("66666", error);
        if (error) throw error;


        res.status(200).json({ message: 'Persona saved successfully!', persona: data });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save persona.', details: error.message });
    }
});

// --- (BARU) Fungsi untuk Agen Seniman & Generasi Gambar ---
async function generateImageAsset(contentText) {
    try {
        // Langkah 1: Buat prompt visual yang deskriptif
        console.log("Running Artist Agent to create image prompt...");
        const artistAgentPrompt = `
            Based on the following social media post text, create a short, descriptive, and visually imaginative prompt for an AI image generation model. 
            Focus on the core concept. Describe the style, subject, and mood. Don't describe text in the image.
            Example:
            Text: "5 tips for better time management for busy founders."
            Prompt: "A minimalist flat design illustration showing a person happily juggling a clock, a calendar, and a coffee cup, vibrant colors, clean background, concept of productivity and balance."
            
            Text: "${contentText}"
            Prompt:
        `;
        const promptResult = await generationModel.generateContent(artistAgentPrompt);
        const imagePrompt = promptResult.response.text().trim();
        console.log(`Generated Image Prompt: "${imagePrompt}"`);

        // Langkah 2: Panggil API Imagen 3 untuk menghasilkan gambar
        console.log("Calling Imagen 3 API to generate image...");
        const apiKey = process.env.GOOGLE_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

        const payload = {
            instances: [{ "prompt": imagePrompt }],
            parameters: { "sampleCount": 1 }
        };

        const imageResponse = await axios.post(apiUrl, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        const predictions = imageResponse.data.predictions;
        if (predictions && predictions.length > 0 && predictions[0].bytesBase64Encoded) {
            const imageUrl = `data:image/png;base64,${predictions[0].bytesBase64Encoded}`;
            console.log("Image generated successfully.");
            return imageUrl;
        } else {
            throw new Error("Image generation failed, no image data returned.");
        }

    } catch (error) {
        console.error("Error during image asset generation:", error.response ? error.response.data : error.message);
        return null; // Kembalikan null jika gagal agar tidak merusak aplikasi
    }
}

async function optimizeContent(platform, text) {
    console.log(`Optimizing content for ${platform}...`);
    const optimizerPrompt = `
        You are an expert Social Media Optimizer. For the following ${platform} post, please provide optimizations.
        Respond ONLY with a valid JSON object. Do not include any other text or markdown formatting.

        POST:
        """
        ${text}
        """

        JSON_RESPONSE_FORMAT:
        {
          "hashtags": ["list", "of", "5-7", "relevant", "hashtags"],
          "abHooks": ["An alternative compelling first sentence.", "Another variation of the hook."],
          "schedulingSuggestion": "A brief suggestion on the best time to post this on ${platform}."
        }
    `;
    try {
        const result = await generationModel.generateContent(optimizerPrompt);
        const responseText = result.response.text();
        const jsonStringMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonStringMatch) {
            throw new Error("Optimizer did not return valid JSON.");
        }
        return JSON.parse(jsonStringMatch[0]);
    } catch (e) {
        console.error(`Failed to optimize for ${platform}:`, e.message);
        return {
            hashtags: ["optimization_failed"],
            abHooks: ["Could not generate alternative hooks."],
            schedulingSuggestion: "Could not generate scheduling suggestion."
        };
    }
}

const createAuthenticatedClient = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // Jika tidak ada token, gunakan klien anonim (hanya untuk operasi publik jika ada)
        return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    }
    const token = authHeader.split(' ')[1];

    // Buat klien baru dengan header otorisasi pengguna
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: {
            headers: { Authorization: `Bearer ${token}` }
        }
    });
};

// Jalankan Server
app.listen(port, () => {
    console.log(`Aetherium backend listening on http://localhost:${port}`);
});