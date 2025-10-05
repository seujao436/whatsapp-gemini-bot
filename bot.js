const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Inicializa Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

// Inicializa WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './session_data'
    }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

// Armazena contexto das conversas (máximo 20 mensagens por chat)
const conversationContext = new Map();

// Estatísticas do bot
let stats = {
    totalMessages: 0,
    responsesGenerated: 0,
    startTime: new Date(),
    lastMessage: null
};

// Função para gerar resposta com Gemini
async function generate(prompt, message, chatId) {
    try {
        // Recupera contexto da conversa
        const context = conversationContext.get(chatId) || [];
        
        // Monta prompt com contexto
        const contextPrompt = context.length > 0 
            ? `Contexto da conversa anterior:\n${context.join('\n')}\n\nNova mensagem: ${prompt}`
            : prompt;
            
        const result = await model.generateContent(contextPrompt);
        const response = await result.response;
        const text = response.text();
        
        // Atualiza contexto
        context.push(`Usuário: ${prompt}`);
        context.push(`Bot: ${text}`);
        
        // Mantém apenas as últimas 20 mensagens no contexto
        if (context.length > 20) {
            context.splice(0, context.length - 20);
        }
        
        conversationContext.set(chatId, context);
        
        // Envia resposta
        await message.reply(text);
        
        // Atualiza estatísticas
        stats.responsesGenerated++;
        stats.lastMessage = new Date();
        
        console.log(`✅ Resposta enviada para ${chatId}: ${text.substring(0, 50)}...`);
    } catch (error) {
        console.error('❌ Erro ao gerar resposta:', error);
        await message.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns momentos.');
    }
}

// Event listeners do WhatsApp
client.on('qr', (qr) => {
    console.log('📱 QR Code gerado! Escaneie com seu WhatsApp:');
    qrcode.generate(qr, { small: true });
    console.log('\n🔄 Aguardando autenticação...');
});

client.on('ready', () => {
    console.log('🤖 Bot do WhatsApp está pronto!');
    console.log('💬 Aguardando mensagens...');
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp autenticado com sucesso!');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
});

client.on('disconnected', (reason) => {
    console.log('🔌 Cliente desconectado:', reason);
});

client.on('message', async (message) => {
    try {
        // Atualiza estatísticas
        stats.totalMessages++;
        stats.lastMessage = new Date();
        
        const chatId = message.from;
        const messageBody = message.body;
        
        console.log(`📩 Nova mensagem de ${chatId}: ${messageBody}`);
        
        // Ignora mensagens de grupos (opcional)
        if (message.from.includes('@g.us')) {
            console.log('👥 Mensagem de grupo ignorada');
            return;
        }
        
        // Ignora mensagens próprias
        if (message.fromMe) {
            return;
        }
        
        // Responde automaticamente a todas as mensagens
        // (remova o if abaixo se quiser responder apenas mensagens com prefixo)
        if (messageBody) {
            await generate(messageBody, message, chatId);
        }
        
        // Para usar apenas com prefixo .bot, descomente as linhas abaixo:
        /*
        if (messageBody.startsWith('.bot ')) {
            const query = messageBody.replace('.bot ', '');
            await generate(query, message, chatId);
        }
        */
        
    } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
    }
});

// Inicializa o cliente
client.initialize();

// Servidor Express para o Render
app.use(express.json());

// Endpoint principal com estatísticas
app.get('/', (req, res) => {
    const uptime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000);
    const uptimeFormatted = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`;
    
    res.json({
        status: '✅ Bot WhatsApp + Gemini está rodando!',
        uptime: uptimeFormatted,
        stats: {
            totalMessages: stats.totalMessages,
            responsesGenerated: stats.responsesGenerated,
            lastMessage: stats.lastMessage,
            activeChats: conversationContext.size
        },
        timestamp: new Date().toLocaleString('pt-BR'),
        endpoints: {
            '/': 'Status e estatísticas',
            '/ping': 'Health check',
            '/health': 'Status detalhado'
        }
    });
});

// Health check endpoint
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'pong', 
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - stats.startTime.getTime()) / 1000)
    });
});

// Endpoint de saúde detalhado
app.get('/health', (req, res) => {
    const clientState = client ? 'conectado' : 'desconectado';
    const geminiConfigured = process.env.GEMINI_API_KEY ? 'configurado' : 'não configurado';
    
    res.json({
        whatsapp: clientState,
        gemini: geminiConfigured,
        server: 'online',
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// Inicia o servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor Express rodando na porta ${PORT}`);
    console.log(`📊 Dashboard disponível em: http://localhost:${PORT}`);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});