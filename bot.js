const { Client, NoAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Inicializa Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

// Inicializa WhatsApp Client (sem autenticação persistente para plano free)
const client = new Client({
    authStrategy: new NoAuth(), // NoAuth para evitar dependência de armazenamento persistente
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-extensions'
        ],
        headless: true
    }
});

// Armazena contexto das conversas (máximo 20 mensagens por chat)
const conversationContext = new Map();

// Estatísticas do bot
let stats = {
    totalMessages: 0,
    responsesGenerated: 0,
    startTime: new Date(),
    lastMessage: null,
    authenticationStatus: 'aguardando'
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
    console.log('\n📱 QR CODE GERADO!');
    console.log('❗ ATENÇÃO: Escaneie este QR Code com seu WhatsApp:');
    console.log('\n' + '='.repeat(50));
    qrcode.generate(qr, { small: true });
    console.log('='.repeat(50));
    console.log('🔄 Aguardando autenticação...');
    console.log('⚠️  IMPORTANTE: No plano FREE, você precisará reautenticar a cada restart!');
    
    stats.authenticationStatus = 'aguardando_scan';
});

client.on('ready', () => {
    console.log('✅ Bot do WhatsApp está pronto!');
    console.log('💬 Aguardando mensagens...');
    stats.authenticationStatus = 'conectado';
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp autenticado com sucesso!');
    stats.authenticationStatus = 'autenticado';
});

client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
    stats.authenticationStatus = 'falha_auth';
});

client.on('disconnected', (reason) => {
    console.log('🔌 Cliente desconectado:', reason);
    stats.authenticationStatus = 'desconectado';
});

client.on('message', async (message) => {
    try {
        // Atualiza estatísticas
        stats.totalMessages++;
        stats.lastMessage = new Date();
        
        const chatId = message.from;
        const messageBody = message.body;
        
        console.log(`📩 Nova mensagem de ${chatId}: ${messageBody}`);
        
        // Ignora mensagens de grupos (opcional - descomente para permitir grupos)
        if (message.from.includes('@g.us')) {
            console.log('👥 Mensagem de grupo ignorada');
            return;
        }
        
        // Ignora mensagens próprias
        if (message.fromMe) {
            return;
        }
        
        // Responde automaticamente a todas as mensagens
        if (messageBody && messageBody.trim() !== '') {
            await generate(messageBody, message, chatId);
        }
        
        // Para usar apenas com prefixo .bot, substitua o bloco acima por:
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
console.log('🚀 Inicializando cliente WhatsApp...');
client.initialize();

// Servidor Express para o Render
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve arquivos estáticos (incluindo dashboard.html)

// Endpoint principal - serve o dashboard HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Endpoint JSON com estatísticas (para API)
app.get('/api', (req, res) => {
    const uptime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000);
    const uptimeFormatted = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`;
    
    res.json({
        status: '✅ Bot WhatsApp + Gemini está rodando!',
        authenticationStatus: stats.authenticationStatus,
        plan: 'FREE (autenticação temporária)',
        uptime: uptimeFormatted,
        stats: {
            totalMessages: stats.totalMessages,
            responsesGenerated: stats.responsesGenerated,
            lastMessage: stats.lastMessage,
            activeChats: conversationContext.size
        },
        timestamp: new Date().toLocaleString('pt-BR'),
        endpoints: {
            '/': 'Dashboard HTML',
            '/api': 'Status JSON',
            '/ping': 'Health check',
            '/health': 'Status detalhado'
        },
        instructions: {
            authentication: 'Verifique os logs para o QR Code (primeira execução)',
            usage: 'Envie qualquer mensagem para o número autenticado',
            note: 'No plano FREE, requer reautenticação a cada restart'
        }
    });
});

// Health check endpoint
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'pong', 
        authStatus: stats.authenticationStatus,
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - stats.startTime.getTime()) / 1000)
    });
});

// Endpoint de saúde detalhado
app.get('/health', (req, res) => {
    const clientState = client ? 'inicializado' : 'não inicializado';
    const geminiConfigured = process.env.GEMINI_API_KEY ? 'configurado' : 'não configurado';
    
    res.json({
        whatsapp: {
            client: clientState,
            authStatus: stats.authenticationStatus
        },
        gemini: geminiConfigured,
        server: 'online',
        memory: process.memoryUsage(),
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        },
        timestamp: new Date().toISOString()
    });
});

// Endpoint para status de autenticação
app.get('/auth-status', (req, res) => {
    res.json({
        status: stats.authenticationStatus,
        message: getAuthMessage(stats.authenticationStatus),
        timestamp: new Date().toISOString()
    });
});

function getAuthMessage(status) {
    const messages = {
        'aguardando': 'Inicializando cliente...',
        'aguardando_scan': 'QR Code gerado! Verifique os logs e escaneie com WhatsApp',
        'autenticado': 'WhatsApp autenticado com sucesso',
        'conectado': 'Bot conectado e funcionando',
        'falha_auth': 'Falha na autenticação. Reescaneie o QR Code',
        'desconectado': 'Cliente desconectado. Reiniciando...'
    };
    return messages[status] || 'Status desconhecido';
}

// Inicia o servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor Express rodando na porta ${PORT}`);
    console.log(`🌐 Dashboard HTML disponível em: http://localhost:${PORT}`);
    console.log(`📊 API JSON disponível em: http://localhost:${PORT}/api`);
    console.log(`⚡ Plano: FREE (autenticação temporária)`);
    console.log(`🔄 Aguarde o QR Code aparecer nos logs...`);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    // Não fazer exit imediato para permitir reconexão
    setTimeout(() => {
        process.exit(1);
    }, 5000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Recebido SIGTERM, encerrando gracefully...');
    client.destroy();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Recebido SIGINT, encerrando gracefully...');
    client.destroy();
    process.exit(0);
});