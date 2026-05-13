CREATE TABLE public.historico_mensagem (
  id BIGSERIAL PRIMARY KEY,
  who_sent TEXT NOT NULL DEFAULT 'client',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT historico_mensagem_who_sent_check CHECK (who_sent IN ('bot', 'client'))
);

CREATE INDEX idx_historico_mensagem_created_at ON public.historico_mensagem(created_at DESC);
CREATE INDEX idx_historico_mensagem_who_sent ON public.historico_mensagem(who_sent);

ALTER TABLE public.historico_mensagem ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read historico_mensagem"
  ON public.historico_mensagem FOR SELECT
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.historico_mensagem;
