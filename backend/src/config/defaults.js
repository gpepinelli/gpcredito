const CATEGORIA = {
  CREDITO: 'CREDITO',
  SCORE: 'SCORE',
  COBRANCA: 'COBRANCA',
  VENDAS: 'VENDAS',
  PIX: 'PIX',
  SISTEMA: 'SISTEMA',
};

const TIPO = {
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
  TIME: 'TIME',
};

const CONFIG_DEFINITIONS = [
  { chave: 'JUROS_PADRAO', valor: '30', tipo: TIPO.NUMBER, categoria: CATEGORIA.CREDITO, descricao: 'Percentual de juros pre-preenchido ao criar nova operacao', obrigatorio: true, min: 0, max: 100 },
  { chave: 'CARTEIRA_OPERACIONAL', valor: '0', tipo: TIPO.NUMBER, categoria: CATEGORIA.CREDITO, descricao: 'Capital proprio reservado para operar credito e liberacoes', obrigatorio: true, min: 0 },
  { chave: 'JUROS_MINIMO', valor: '0', tipo: TIPO.NUMBER, categoria: CATEGORIA.CREDITO, descricao: 'Menor percentual de juros permitido', obrigatorio: true, min: 0 },
  { chave: 'JUROS_MAXIMO', valor: '100', tipo: TIPO.NUMBER, categoria: CATEGORIA.CREDITO, descricao: 'Maior percentual de juros permitido', obrigatorio: true, min: 0 },
  { chave: 'VALOR_MINIMO_EMPRESTIMO', valor: '10', tipo: TIPO.NUMBER, categoria: CATEGORIA.CREDITO, descricao: 'Valor minimo para criar operacao de credito', obrigatorio: true, min: 0 },
  { chave: 'VALOR_MAXIMO_EMPRESTIMO', valor: '100000', tipo: TIPO.NUMBER, categoria: CATEGORIA.CREDITO, descricao: 'Valor maximo permitido por operacao', obrigatorio: true, min: 0 },
  { chave: 'PARCELAS_MINIMAS', valor: '1', tipo: TIPO.NUMBER, categoria: CATEGORIA.CREDITO, descricao: 'Numero minimo de parcelas', obrigatorio: true, min: 1 },
  { chave: 'PARCELAS_MAXIMAS', valor: '60', tipo: TIPO.NUMBER, categoria: CATEGORIA.CREDITO, descricao: 'Numero maximo de parcelas', obrigatorio: true, min: 1 },
  { chave: 'INTERVALO_PARCELAS_DIAS', valor: '30', tipo: TIPO.NUMBER, categoria: CATEGORIA.CREDITO, descricao: 'Dias entre parcelas', obrigatorio: true, min: 1 },
  { chave: 'ALLOW_MULTIPLE_ACTIVE_OPERATIONS', valor: 'false', tipo: TIPO.BOOLEAN, categoria: CATEGORIA.CREDITO, descricao: 'Permite multiplas operacoes ativas por cliente', obrigatorio: true },
  { chave: 'DIAS_PRIMEIRO_VENCIMENTO', valor: '30', tipo: TIPO.NUMBER, categoria: CATEGORIA.CREDITO, descricao: 'Dias apos a criacao para primeiro vencimento', obrigatorio: true, min: 1 },

  { chave: 'SCORE_INICIAL', valor: '100', tipo: TIPO.NUMBER, categoria: CATEGORIA.SCORE, descricao: 'Pontuacao inicial do cliente', obrigatorio: true, min: 0 },
  { chave: 'SCORE_MINIMO', valor: '0', tipo: TIPO.NUMBER, categoria: CATEGORIA.SCORE, descricao: 'Piso do score', obrigatorio: true, min: 0 },
  { chave: 'SCORE_MAXIMO', valor: '200', tipo: TIPO.NUMBER, categoria: CATEGORIA.SCORE, descricao: 'Teto do score', obrigatorio: true, min: 1 },
  { chave: 'SCORE_LIMITE_BLOQUEADO', valor: '50', tipo: TIPO.NUMBER, categoria: CATEGORIA.SCORE, descricao: 'Abaixo desse valor nega credito', obrigatorio: true, min: 0 },
  { chave: 'SCORE_LIMITE_RISCO_MEDIO', valor: '80', tipo: TIPO.NUMBER, categoria: CATEGORIA.SCORE, descricao: 'Abaixo desse valor libera com alerta', obrigatorio: true, min: 0 },
  { chave: 'SCORE_PAGAMENTO_ANTECIPADO', valor: '15', tipo: TIPO.NUMBER, categoria: CATEGORIA.SCORE, descricao: 'Pontos ganhos por pagamento antecipado', obrigatorio: true },
  { chave: 'SCORE_PAGAMENTO_EM_DIA', valor: '10', tipo: TIPO.NUMBER, categoria: CATEGORIA.SCORE, descricao: 'Pontos ganhos por pagamento em dia', obrigatorio: true },
  { chave: 'SCORE_ATRASO_ATE_3_DIAS', valor: '-10', tipo: TIPO.NUMBER, categoria: CATEGORIA.SCORE, descricao: 'Pontos por atraso ate 3 dias', obrigatorio: true },
  { chave: 'SCORE_ATRASO_4_A_7_DIAS', valor: '-15', tipo: TIPO.NUMBER, categoria: CATEGORIA.SCORE, descricao: 'Pontos por atraso de 4 a 7 dias', obrigatorio: true },
  { chave: 'SCORE_ATRASO_ACIMA_7_DIAS', valor: '-25', tipo: TIPO.NUMBER, categoria: CATEGORIA.SCORE, descricao: 'Pontos por atraso acima de 7 dias', obrigatorio: true },
  { chave: 'SCORE_PENALIDADE_INADIMPLENCIA', valor: '-50', tipo: TIPO.NUMBER, categoria: CATEGORIA.SCORE, descricao: 'Penalidade unica por inadimplencia', obrigatorio: true },

  { chave: 'COBRANCA_HORA_MANHA', valor: '09:00', tipo: TIPO.TIME, categoria: CATEGORIA.COBRANCA, descricao: 'Hora do disparo de cobranca da manha', obrigatorio: true },
  { chave: 'COBRANCA_HORA_TARDE', valor: '18:00', tipo: TIPO.TIME, categoria: CATEGORIA.COBRANCA, descricao: 'Hora do disparo de cobranca da tarde', obrigatorio: true },
  { chave: 'RENOVACAO_HORA', valor: '09:30', tipo: TIPO.TIME, categoria: CATEGORIA.COBRANCA, descricao: 'Hora da verificacao de renovacoes', obrigatorio: true },
  { chave: 'DIAS_INADIMPLENCIA_PENALIDADE', valor: '8', tipo: TIPO.NUMBER, categoria: CATEGORIA.COBRANCA, descricao: 'Dias de atraso para penalidade de inadimplencia', obrigatorio: true, min: 1 },
  { chave: 'RENOVACAO_DIAS_APOS_QUITACAO', valor: '15', tipo: TIPO.NUMBER, categoria: CATEGORIA.COBRANCA, descricao: 'Dias apos quitacao para oferta de renovacao', obrigatorio: true, min: 1 },

  { chave: 'JUROS_VENDA_PADRAO', valor: '30', tipo: TIPO.NUMBER, categoria: CATEGORIA.VENDAS, descricao: 'Percentual de juros fixo nas vendas', obrigatorio: true, min: 0 },
  { chave: 'VALOR_MINIMO_VENDA', valor: '1', tipo: TIPO.NUMBER, categoria: CATEGORIA.VENDAS, descricao: 'Valor minimo para registrar uma venda', obrigatorio: true, min: 0 },

  { chave: 'PIX_CHAVE', valor: '', tipo: TIPO.STRING, categoria: CATEGORIA.PIX, descricao: 'Chave Pix para cobrancas', obrigatorio: false },
  { chave: 'PIX_NOME', valor: '', tipo: TIPO.STRING, categoria: CATEGORIA.PIX, descricao: 'Nome do recebedor Pix', obrigatorio: false },
  { chave: 'PIX_CIDADE', valor: 'SAO PAULO', tipo: TIPO.STRING, categoria: CATEGORIA.PIX, descricao: 'Cidade do recebedor Pix', obrigatorio: false },
  { chave: 'MERCADOPAGO_ATIVO', valor: 'false', tipo: TIPO.BOOLEAN, categoria: CATEGORIA.PIX, descricao: 'Habilita integracao Mercado Pago', obrigatorio: true },

  { chave: 'NOME_EMPRESA', valor: 'GPCredito', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Nome exibido em contratos e mensagens', obrigatorio: true },
  { chave: 'TOKEN_EXPIRACAO_HORAS', valor: '8', tipo: TIPO.NUMBER, categoria: CATEGORIA.SISTEMA, descricao: 'Duracao da sessao admin em horas', obrigatorio: true, min: 1 },
  { chave: 'UPLOAD_TAMANHO_MAXIMO_MB', valor: '5', tipo: TIPO.NUMBER, categoria: CATEGORIA.SISTEMA, descricao: 'Tamanho maximo de documento', obrigatorio: true, min: 1 },
  { chave: 'UPLOAD_TIPOS_PERMITIDOS', valor: 'jpg,png,pdf', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Extensoes permitidas para upload', obrigatorio: true },
  { chave: 'LOG_NIVEL', valor: 'info', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Nivel de detalhe dos logs', obrigatorio: true },
  { chave: 'TIMEZONE', valor: 'America/Sao_Paulo', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Fuso horario do sistema', obrigatorio: true },
  { chave: 'WHATSAPP_TEMPLATE_LEMBRETE', valor: 'Ola *{{nome}}*!\n\nPassando para lembrar que seu pagamento de *{{valor}}* vence amanha ({{dataVencimento}}).\n\nPague em dia e mantenha seu credito em boas condicoes.', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Mensagem enviada antes do vencimento', obrigatorio: false },
  { chave: 'WHATSAPP_TEMPLATE_VENCIMENTO_HOJE', valor: 'Ola *{{nome}}*!\n\nSeu pagamento de *{{valor}}* vence hoje.\n\nSegue o Pix para pagamento na proxima mensagem.', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Mensagem enviada no dia do vencimento', obrigatorio: false },
  { chave: 'WHATSAPP_TEMPLATE_PIX_MANUAL', valor: 'Pix para pagamento: {{chavePix}}\nFavorecido: {{nomePix}}\nValor: {{valor}}\n\nApos pagar, envie o comprovante por aqui para conferencia.', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Mensagem com dados Pix manuais', obrigatorio: false },
  { chave: 'WHATSAPP_TEMPLATE_ATRASO', valor: 'Ola *{{nome}}*!\n\nSeu pagamento de *{{valor}}* esta em atraso ha *{{diasAtraso}} dia(s)*.\n\nRegularize sua situacao o quanto antes. O Pix para pagamento vai na proxima mensagem.', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Mensagem de cobranca em atraso', obrigatorio: false },
  { chave: 'WHATSAPP_TEMPLATE_CONFIRMACAO', valor: '*Pagamento confirmado!*\n\nOla *{{nome}}*, recebemos seu pagamento de *{{valor}}*.\n\nObrigado pela confianca.', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Mensagem de confirmacao de pagamento', obrigatorio: false },
  { chave: 'WHATSAPP_TEMPLATE_RECIBO', valor: 'Ola *{{nome}}*, recebemos seu pagamento de *{{valor}}*.\n\nSegue em anexo o recibo em PDF para seu controle.', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Legenda do PDF de recibo enviado ao cliente', obrigatorio: false },
  { chave: 'WHATSAPP_TEMPLATE_RENOVACAO', valor: 'Ola *{{nome}}*!\n\nSeu emprestimo foi quitado com sucesso.\n\nDeseja renovar seu credito? Responda SIM para receber uma nova proposta.', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Mensagem de oferta de renovacao', obrigatorio: false },
  { chave: 'WHATSAPP_TEMPLATE_PIX_GERADO', valor: 'Ola *{{nome}}*!\n\nSeu emprestimo de *{{valor}}* foi aprovado.\n\nUse o Pix abaixo para confirmar:\n\n{{copiaCola}}\n\nCopie o codigo acima e cole no app do seu banco.', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Mensagem com Pix gerado automaticamente', obrigatorio: false },
  { chave: 'WHATSAPP_TEMPLATE_CONTRATO_AVISO', valor: 'Ola *{{nome}}*, estou enviando agora o contrato de emprestimo em PDF.\n\nApos ler, responda *DE ACORDO* para registrar o aceite digital.', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Mensagem antes de enviar contrato', obrigatorio: false },
  { chave: 'WHATSAPP_TEMPLATE_CONTRATO', valor: '*Contrato de Emprestimo*\n\nOla *{{nome}}*, segue em anexo o seu contrato.\n\nSe estiver de acordo, responda *DE ACORDO* neste WhatsApp para registrar o aceite digital.', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Legenda do PDF de contrato', obrigatorio: false },
  { chave: 'WHATSAPP_TEMPLATE_ORCAMENTO', valor: 'Ola *{{nome}}*, segue em anexo a simulacao de credito solicitada.\n\nEste orcamento vale por 24 horas e nao substitui o contrato final.', tipo: TIPO.STRING, categoria: CATEGORIA.SISTEMA, descricao: 'Legenda do PDF de orcamento', obrigatorio: false },
];

const CONFIG_MAP = Object.fromEntries(CONFIG_DEFINITIONS.map(item => [item.chave, item]));

module.exports = { CATEGORIA, TIPO, CONFIG_DEFINITIONS, CONFIG_MAP };
