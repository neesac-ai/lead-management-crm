-- Add call quality metrics and sentiment reasoning to call_recordings

ALTER TABLE call_recordings 
ADD COLUMN IF NOT EXISTS sentiment_reasoning TEXT,
ADD COLUMN IF NOT EXISTS call_quality JSONB;

-- Comment for clarity
COMMENT ON COLUMN call_recordings.sentiment_reasoning IS 'AI explanation for why the sentiment was classified as positive/neutral/negative';
COMMENT ON COLUMN call_recordings.call_quality IS 'JSON object containing call quality scores and feedback';


