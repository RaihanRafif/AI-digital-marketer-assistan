// app/page.js (FINAL & STABLE with RLS FIX)
'use client';

import { useEffect, useState } from 'react';
import { supabase } from './utils/supabaseClient'; // Pastikan path ini benar
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { toast } from "sonner";
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';

// Import komponen UI dan ikon
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { Label } from "./components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "./components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./components/ui/accordion";
import { ThumbsUp, Wand2, BarChart, Loader2, ImageIcon, Copy, ChevronLeft, ChevronRight, Settings } from "lucide-react";

// --- Komponen Helper ---

const handleCopy = (textToCopy) => {
    if (!textToCopy) return toast.error("Tidak ada teks untuk disalin.");
    navigator.clipboard.writeText(textToCopy).then(() => toast.success("Teks berhasil disalin!"));
};

const OptimizationAccordion = ({ optimization }) => {
    if (!optimization) return null;
    return (
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="optimizations">
                <AccordionTrigger>🚀 Lihat Optimasi & Saran</AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                    <div>
                        <h4 className="font-semibold">Hashtags:</h4>
                        <p className="text-sm text-muted-foreground">{optimization.hashtags?.join(' ')}</p>
                    </div>
                    <div>
                        <h4 className="font-semibold">A/B Test Hooks:</h4>
                        <ul className="list-disc list-inside text-sm text-muted-foreground">
                            {optimization.abHooks?.map((hook, i) => <li key={i}>{hook}</li>)}
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold">Tips Jadwal:</h4>
                        <p className="text-sm text-muted-foreground">{optimization.schedulingSuggestion}</p>
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
};

const CarouselView = ({ platformData }) => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const slides = platformData?.slides || [];
    const imageUrls = platformData?.imageUrls || [];

    if (slides.length === 0) {
        return <div className="text-center p-8 text-muted-foreground">Konten Instagram tidak tersedia atau gagal dibuat.</div>;
    }

    const goToNext = () => setCurrentSlide((prev) => (prev + 1) % slides.length);
    const goToPrev = () => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);

    return (
        <div className="grid md:grid-cols-2 gap-6 items-start">
            <div className="w-full aspect-square bg-slate-100 rounded-lg flex items-center justify-center border sticky top-8">
                <div className="relative w-full h-full">
                    {imageUrls[currentSlide] ? (
                        <Image src={imageUrls[currentSlide]} alt={`AI image for slide ${currentSlide + 1}`} fill className="rounded-lg object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
                    ) : (
                        <div className="text-center text-muted-foreground flex flex-col items-center justify-center h-full"><ImageIcon className="mx-auto h-12 w-12" /><p>Gambar untuk slide ini tidak tersedia.</p></div>
                    )}
                    {slides.length > 1 && (
                        <>
                            <Button size="icon" variant="secondary" className="absolute left-2 top-1/2 -translate-y-1/2" onClick={goToPrev}><ChevronLeft /></Button>
                            <Button size="icon" variant="secondary" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={goToNext}><ChevronRight /></Button>
                        </>
                    )}
                </div>
            </div>
            <div className="space-y-4">
                <h3 className="font-semibold">Slide {currentSlide + 1} dari {slides.length}</h3>
                <div className="relative p-4 bg-white rounded-md border group min-h-[200px]">
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={() => handleCopy(slides[currentSlide]?.text || '')} aria-label="Salin konten"><Copy className="h-4 w-4" /></Button>
                    <ReactMarkdown >{slides[currentSlide]?.text || ''}</ReactMarkdown>
                </div>
                <OptimizationAccordion optimization={platformData?.optimization} />
            </div>
        </div>
    );
};

const SinglePostView = ({ platformData }) => {
    if (!platformData?.text) {
        return <div className="text-center p-8 text-muted-foreground">Konten tidak tersedia.</div>;
    }
    return (
        <div className="grid md:grid-cols-2 gap-6 items-start">
            <div className="w-full aspect-square bg-slate-100 rounded-lg flex items-center justify-center border sticky top-8">
                 {platformData.imageUrl ? (
                    <Image src={platformData.imageUrl} alt={`AI generated image`} fill className="rounded-lg object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
                 ) : (
                    <div className="text-center text-muted-foreground flex flex-col items-center justify-center h-full"><ImageIcon className="mx-auto h-12 w-12" /><p>Gambar tidak tersedia.</p></div>
                 )}
            </div>
            <div className="space-y-4">
                <div className="relative p-4 bg-white rounded-md border group min-h-[200px]">
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={() => handleCopy(platformData.text)} aria-label="Salin konten"><Copy className="h-4 w-4" /></Button>
                    <ReactMarkdown >{platformData.text}</ReactMarkdown>
                </div>
                <OptimizationAccordion optimization={platformData?.optimization} />
            </div>
        </div>
    );
};

const PersonaDialog = ({ session, onPersonaUpdate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [persona, setPersona] = useState({ brand_voice: '', target_audience: '', content_goal: '' });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchPersona = async () => {
            if (isOpen && session) {
                const { data: { session: currentSession } } = await supabase.auth.getSession();
                if (!currentSession) return;

                const response = await fetch(`http://localhost:8080/api/v1/persona/${session.user.id}`, {
                    headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
                });
                const data = await response.json();
                if (data) setPersona(data);
            }
        };
        fetchPersona();
    }, [isOpen, session]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (!currentSession) throw new Error("Sesi tidak valid. Silakan login kembali.");

            const response = await fetch('http://localhost:8080/api/v1/persona', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentSession.access_token}`
                },
                body: JSON.stringify({
                    userId: session.user.id,
                    brandVoice: persona.brand_voice,
                    targetAudience: persona.target_audience,
                    contentGoal: persona.content_goal,
                }),
            });
            if (!response.ok) throw new Error("Gagal menyimpan persona.");
            const data = await response.json();
            toast.success("Persona berhasil disimpan!");
            onPersonaUpdate(data.persona);
            setIsOpen(false);
        } catch (error) {
            toast.error(error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (e) => setPersona({ ...persona, [e.target.name]: e.target.value });

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline"><Settings className="mr-2 h-4 w-4" /> Setup Persona</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Your Persona</DialogTitle>
                    <DialogDescription>Setup the AI to make your personal content.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="brand_voice" className="text-right">Brand Voice</Label>
                        <Textarea id="brand_voice" name="brand_voice" value={persona.brand_voice || ''} onChange={handleChange} className="col-span-3" placeholder="Example: Professional, Funny..." />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="target_audience" className="text-right">Target Audiens</Label>
                        <Textarea id="target_audience" name="target_audience" value={persona.target_audience || ''} onChange={handleChange} className="col-span-3" placeholder="Example: Startup founder..." />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="content_goal" className="text-right">Content Goals</Label>
                        <Textarea id="content_goal" name="content_goal" value={persona.content_goal || ''} onChange={handleChange} className="col-span-3" placeholder="Example: Increase brand awareness..." />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" onClick={handleSave} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default function Home() {
    const [session, setSession] = useState(null);
    const [userPersona, setUserPersona] = useState(null);
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        const fetchInitialData = async (currentSession) => {
            if (!currentSession) return;
            const response = await fetch(`http://localhost:8080/api/v1/persona/${currentSession.user.id}`, {
                headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
            });
            const data = await response.json();
            setUserPersona(data);
        };

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            fetchInitialData(session);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                fetchInitialData(session);
            } else {
                setUserPersona(null);
            }
        });
        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!session) return toast.error("Anda harus login untuk membuat konten.");
        setIsLoading(true);
        setResult(null);
        try {
            const response = await fetch('http://localhost:8080/api/v1/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ url, userId: session.user.id }),
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.details || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setResult(data);
            toast.success("Strategi konten berhasil dibuat!");
        } catch (err) {
            toast.error("Gagal membuat konten.", { description: err.message });
        } finally {
            setIsLoading(false);
        }
    };
    
    // Fungsi feedback (jika Anda ingin menggunakannya)
    const handleFeedback = async (platform) => {
        // ...
    };

    if (!session) {
        return (
            <main className="flex items-center justify-center min-h-screen bg-slate-50">
                <Card className="w-full max-w-md mx-4">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl">Selamat Datang di Aetherium</CardTitle>
                        <CardDescription>Masuk untuk mengakses co-pilot AI Anda</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={['google', 'github']} theme="light" />
                    </CardContent>
                </Card>
            </main>
        );
    }

    return (
        <main className="container mx-auto p-4 md:p-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold flex items-center gap-2"><Wand2 className="text-purple-500" /> Aetherium</h1>
                <div className="flex items-center gap-2">
                    <PersonaDialog session={session} onPersonaUpdate={setUserPersona} />
                    <Button variant="outline" onClick={() => supabase.auth.signOut()}>Sign Out</Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Create Your Content</CardTitle>
                    <CardDescription>Input your reference and let the AI make your content.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
                        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://blog-anda.com/artikel-untuk-diubah" required disabled={isLoading} />
                        <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {isLoading ? 'Analysing...' : 'Create Content'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {isLoading && <div className="text-center p-8"><Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" /></div>}

            {result && !isLoading && (
                <Card className="mt-8">
                    <CardHeader>
                        <CardTitle>Your Content Strategy and the Asset</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="instagram" className="w-full">
                            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
                                <TabsTrigger value="instagram">Instagram</TabsTrigger>
                                <TabsTrigger value="twitter">Twitter/X</TabsTrigger>
                                <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
                                <TabsTrigger value="analysis">Analisis</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="instagram" className="mt-4">
                                <CarouselView platformData={result.platforms.instagram} />
                            </TabsContent>
                            <TabsContent value="twitter" className="mt-4">
                                <SinglePostView platformData={result.platforms.twitter} />
                            </TabsContent>
                            <TabsContent value="linkedin" className="mt-4">
                                <SinglePostView platformData={result.platforms.linkedin} />
                            </TabsContent>
                            <TabsContent value="analysis" className="mt-4">
                                <div className="p-4 bg-white rounded-md border">
                                    <ReactMarkdown >{result.analysis}</ReactMarkdown>
                                 </div>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            )}
        </main>
    );
}
