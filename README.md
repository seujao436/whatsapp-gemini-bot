# 🤖 Bot WhatsApp + Gemini AI

Bot inteligente para WhatsApp integrado com Gemini AI, que mantém contexto de conversas e responde automaticamente.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/seujao436/whatsapp-gemini-bot)

## ✨ Recursos

- 💬 Respostas automáticas com IA Gemini
- 🧠 Mantém contexto das conversas
- ⚡ Deploy em 1 clique no Render
- 🔄 Suporta múltiplas conversas simultâneas
- 📊 Dashboard com estatísticas em tempo real
- 💰 Custo extremamente baixo (Gemini Flash)

## 🚀 Deploy Rápido

### Opção 1: Deploy Automático (Recomendado)

1. Clique no botão **Deploy to Render** acima
2. Crie uma conta no Render (se ainda não tiver)
3. Configure a variável de ambiente:
   - `GEMINI_API_KEY`: Sua chave da API do Gemini ([obter aqui](https://aistudio.google.com/app/apikey))
4. Clique em **Apply**
5. Aguarde o deploy completar
6. Acesse os logs do serviço e **escaneie o QR Code** com seu WhatsApp
7. Pronto! Seu bot está no ar 🎉

### Opção 2: Deploy Manual

```bash
# 1. Clone o repositório
git clone https://github.com/seujao436/whatsapp-gemini-bot.git
cd whatsapp-gemini-bot

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env e adicione sua GEMINI_API_KEY

# 4. Execute localmente
npm start

# 5. Escaneie o QR Code que aparecerá no terminal
```

## ⚙️ Configuração

### Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `GEMINI_API_KEY` | Chave da API do Google Gemini | ✅ Sim |
| `PORT` | Porta do servidor (padrão: 10000) | ❌ Não |

### Obter Chave do Gemini

1. Acesse [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Faça login com sua conta Google
3. Clique em **"Get API Key"**
4. Copie a chave gerada

## 📱 Como Usar

Após o deploy e autenticação via QR Code:

1. **Envie qualquer mensagem** para o número que você autenticou
2. O bot responderá automaticamente usando Gemini AI
3. Ele mantém contexto das últimas 20 mensagens da conversa

### Exemplo de Conversa

```
Você: Olá! Como você está?
Bot: Olá! Estou bem, obrigado por perguntar...

Você: Qual o clima hoje?
Bot: [Resposta contextual baseada em IA]
```

## 🛠️ Tecnologias

- [Node.js](https://nodejs.org/) - Runtime JavaScript
- [whatsapp-web.js](https://wwebjs.dev/) - Biblioteca WhatsApp
- [Google Gemini](https://ai.google.dev/) - IA Generativa
- [Express](https://expressjs.com/) - Framework web
- [Render](https://render.com/) - Hospedagem cloud

## 📊 Endpoints da API

| Endpoint | Método | Descrição |
|----------|--------|-----------||
| `/` | GET | Status e estatísticas do bot |
| `/ping` | GET | Health check (retorna "pong") |
| `/health` | GET | Status de saúde detalhado |

## 🔧 Desenvolvimento

### Estrutura do Projeto

```
whatsapp-gemini-bot/
├── bot.js           # Arquivo principal do bot
├── package.json     # Dependências do projeto
├── render.yaml      # Configuração do Render
├── .env.example     # Exemplo de variáveis
├── .gitignore       # Arquivos ignorados
└── README.md        # Este arquivo
```

### Comandos Úteis

```bash
# Instalar dependências
npm install

# Iniciar em desenvolvimento
npm start

# Ver logs do Render
render logs -f
```

## 🐛 Solução de Problemas

### QR Code não aparece

- Verifique os logs do Render
- O QR Code aparece apenas na primeira execução
- Após escaneado, a autenticação fica salva

### Bot não responde

- Confirme que a `GEMINI_API_KEY` está configurada
- Verifique se o serviço está online no dashboard do Render
- Veja os logs para identificar erros

### Serviço dorme após inatividade

- Use o [keep-alive service](https://github.com/seujao436/keep-alive-service) complementar
- Ou configure UptimeRobot para pingar a cada 5-12 minutos

## 💡 Dicas

1. **Custos**: O Gemini Flash é extremamente barato (~$0.075 por 1M tokens)
2. **Contexto**: O bot mantém as últimas 20 mensagens por chat
3. **Grupos**: Por padrão, ignora mensagens de grupos (pode ser modificado)
4. **Prefixo**: Remova o prefixo `.bot` no código se quiser responder todas as mensagens

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para:

1. Fazer fork do projeto
2. Criar uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abrir um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🌟 Créditos

Desenvolvido com ❤️ usando:
- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
- [Google Gemini API](https://ai.google.dev/)
- Inspirado na comunidade [TabNews](https://tabnews.com.br/)

## 📞 Suporte

- 🐛 Issues: [GitHub Issues](https://github.com/seujao436/whatsapp-gemini-bot/issues)
- 💬 Discussões: [GitHub Discussions](https://github.com/seujao436/whatsapp-gemini-bot/discussions)
- 📧 Email: [seu-email@exemplo.com](mailto:seu-email@exemplo.com)

---

**⭐ Se este projeto te ajudou, deixe uma estrela no GitHub!**