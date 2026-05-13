CREATE TABLE public.historico_mensagem (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historico_mensagem_created_at ON public.historico_mensagem(created_at DESC);

ALTER TABLE public.historico_mensagem ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read historico_mensagem"
  ON public.historico_mensagem FOR SELECT
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.historico_mensagem;
