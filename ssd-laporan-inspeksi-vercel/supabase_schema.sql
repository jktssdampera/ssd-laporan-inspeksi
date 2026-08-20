-- Run this in the Supabase SQL Editor

CREATE TABLE public.reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer JSONB DEFAULT '{}'::jsonb,
    inspections JSONB DEFAULT '{}'::jsonb,
    summary JSONB DEFAULT '{}'::jsonb,
    "pdfPath" TEXT,
    "isCurrent" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Allow public access for this app (since there's no auth yet)
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read all reports" ON public.reports
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow public insert reports" ON public.reports
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow public update reports" ON public.reports
    FOR UPDATE TO public USING (true);

-- Create a bucket for photos
INSERT INTO storage.buckets (id, name, public) VALUES ('inspeksi', 'inspeksi', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'inspeksi');
CREATE POLICY "Public Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'inspeksi');
CREATE POLICY "Public Delete" ON storage.objects FOR DELETE USING (bucket_id = 'inspeksi');
