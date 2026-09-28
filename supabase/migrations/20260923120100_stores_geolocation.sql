-- Coordenadas da loja, preenchidas por geocodificação (Nominatim/OSM) na
-- criação da loja e a cada edição de endereço — ver src/lib/geocoding.ts.
--
-- Nullable de propósito: geocodificação é best-effort (o serviço é público, com
-- rate limit, e endereço mal formatado simplesmente não resolve). Loja sem
-- coordenada não é bloqueada; ela só não fica elegível à entrega expressa, que
-- depende de distância real até o endereço de entrega.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

COMMENT ON COLUMN public.stores.latitude IS 'Latitude do endereço da loja (geocodificação best-effort via Nominatim). NULL = nunca geocodificado.';
COMMENT ON COLUMN public.stores.longitude IS 'Longitude do endereço da loja (geocodificação best-effort via Nominatim). NULL = nunca geocodificado.';
COMMENT ON COLUMN public.stores.geocoded_at IS 'Quando lat/long foram resolvidos pela última vez — serve pra reprocessar endereços antigos.';
