# 🤖 Bot WhatsApp + Gemini AI

Bot inteligente para WhatsApp integrado com Gemini AI, que mantém contexto de conversas e responde automaticamente.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/seujao436/whatsapp-gemini-bot)

## ✨ Recursos

- 💬 Respostas automáticas com IA Gemini
- 🧠 Mantém contexto das conversas
- ⚡ Deploy em 1 clique no Render
- 🔄 Suporta múltiplas conversas simultâneas
- 📊 **Dashboard HTML** com monitoramento em tempo real
- 💰 Custo extremamente baixo (Gemini Flash)
- 🆓 100% gratuito no Render FREE

## 🚀 Deploy Rápido

### Opção 1: Deploy Automático (Recomendado)

1. Clique no botão **Deploy to Render** acima
2. Crie uma conta no Render (se ainda não tiver)
3. Configure a variável de ambiente:
   - `GEMINI_API_KEY`: Sua chave da API do Gemini ([obter aqui](https://aistudio.google.com/app/apikey))
4. Clique em **Apply**
5. Aguarde o deploy completar
6. **Acesse o dashboard**: `https://seu-bot.onrender.com`
7. Verifique os logs e **escaneie o QR Code** com seu WhatsApp
8. Pronto! Seu bot está no ar 🎉

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

# 5. Acesse: http://localhost:10000
# 6. Escaneie o QR Code que aparecerá nos logs
```

## 📊 Dashboard HTML

### 🌐 Acesso ao Dashboard

Após o deploy, acesse a URL do seu serviço para ver o dashboard em tempo real:

```
https://seu-bot.onrender.com/
```

### 🔍 Funcionalidades do Dashboard

- **Status em Tempo Real**: Monitoramento da conexão WhatsApp
- **Estatísticas**: Mensagens processadas, respostas IA, uptime
- **Autenticação**: Status do QR Code e instruções
- **Auto-Refresh**: Atualização automática a cada 30 segundos
- **Links Rápidos**: Acesso direto aos logs e endpoints

### 📁 Arquivos do Dashboard

- `dashboard.html` - Interface visual completa
- Endpoints JSON disponíveis em `/api`
- Acesso direto via URL do serviço

## ❗ Importante - Plano FREE do Render

### Limitações do Plano Gratuito:

- **🔄 Reautenticação Necessária**: A cada restart do serviço, você precisará reescanear o QR Code
- **💾 Sem Armazenamento Persistente**: Não salva sessão entre restarts
- **⏰ Sleep Mode**: Serviço dorme após 15 min de inatividade (use [Keep-Alive Service](https://github.com/seujao436/keep-alive-service))
- **🕑 750h/mês**: Limite de horas mensais do plano free

### 🔧 Como Funciona:

1. **Primeira vez**: QR Code aparece nos logs - escaneie com WhatsApp
2. **Bot ativo**: Responde mensagens normalmente
3. **Restart**: Novo QR Code gerado - precisa escanear novamente
4. **Sleep/Wake**: Use Keep-Alive para manter sempre ativo
5. **Dashboard**: Monitore tudo em tempo real via interface web

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
4. **Monitore via dashboard** para acompanhar estatísticas

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
|----------|--------|-----------|
| `/` | GET | Dashboard HTML |
| `/api` | GET | Status JSON completo |
| `/ping` | GET | Health check |
| `/health` | GET | Status detalhado |
| `/auth-status` | GET | Status autenticação |
| `/dashboard.html` | GET | Dashboard HTML (arquivo estático) |

## 🔧 Desenvolvimento

### Estrutura do Projeto

```
whatsapp-gemini-bot/
├── bot.js           # Arquivo principal do bot
├── dashboard.html    # Dashboard de monitoramento
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

# Acessar dashboard localmente
# http://localhost:10000
```

## 🐛 Solução de Problemas

### QR Code não aparece

- ✅ Verifique os logs do Render via dashboard
- ✅ Aguarde alguns minutos após o deploy
- ✅ O QR Code aparece apenas quando o client inicializa
- ✅ Use o dashboard para monitorar o status em tempo real

### Bot não responde

- ✅ Confirme que a `GEMINI_API_KEY` está configurada
- ✅ Verifique se o QR Code foi escaneado via dashboard
- ✅ Monitore o status no dashboard HTML
- ✅ Veja os logs para identificar erros

### Serviço dorme após inatividade

- ✅ Use o [keep-alive service](https://github.com/seujao436/keep-alive-service) complementar
- ✅ Configure UptimeRobot para pingar a cada 12 minutos
- ✅ Monitore o uptime via dashboard

## 🔄 Manter Sempre Ativo

### Opção 1: Keep-Alive Service (Recomendado)

1. Deploy o [Keep-Alive Service](https://github.com/seujao436/keep-alive-service)
2. Configure a `BOT_URL` com: `https://seu-bot.onrender.com/ping`
3. O serviço fará ping a cada 12 minutos
4. Monitore ambos via seus respectivos dashboards

### Opção 2: UptimeRobot

1. Crie conta gratuita em [uptimerobot.com](https://uptimerobot.com/)
2. Adicione monitor HTTP(s)
3. URL: `https://seu-bot.onrender.com/ping`
4. Intervalo: 5-12 minutos

## 💡 Dicas

1. **Dashboard**: Use o dashboard HTML para monitoramento em tempo real
2. **Custos**: O Gemini Flash é extremamente barato (~$0.075 por 1M tokens)
3. **Contexto**: O bot mantém as últimas 20 mensagens por chat
4. **Grupos**: Por padrão, ignora mensagens de grupos (modificável)
5. **Reautenticação**: É normal no plano FREE - monitore via dashboard
6. **Logs**: Dashboard fornece links diretos para logs do Render

## ⚙️ Customizações

### Permitir Grupos

Comente esta linha no `bot.js`:

```javascript
// if (message.from.includes('@g.us')) {
//     console.log('👥 Mensagem de grupo ignorada');
//     return;
// }
```

### Usar Apenas Prefixo

Substitua o bloco de resposta automática por:

```javascript
if (messageBody.startsWith('.bot ')) {
    const query = messageBody.replace('.bot ', '');
    await generate(query, message, chatId);
}
```

### Personalizar Dashboard

Edite o arquivo `dashboard.html` para:
- Alterar cores e estilos
- Adicionar mais métricas
- Customizar intervals de atualização
- Adicionar novos gráficos

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

## 🔗 Projetos Relacionados

- [Keep-Alive Service](https://github.com/seujao436/keep-alive-service) - Mantém o bot sempre ativo
- [TabNews](https://tabnews.com.br/) - Comunidade brasileira de tecnologia

## 📞 Suporte

- 🐛 Issues: [GitHub Issues](https://github.com/seujao436/whatsapp-gemini-bot/issues)
- 💬 Discussões: [GitHub Discussions](https://github.com/seujao436/whatsapp-gemini-bot/discussions)
- 📧 Email: [seu-email@exemplo.com](mailto:seu-email@exemplo.com)

---

**⭐ Se este projeto te ajudou, deixe uma estrela no GitHub!**

**🌐 Acesse o dashboard após o deploy para monitoramento em tempo real!**