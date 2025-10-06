const { Client, NoAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Inicializa Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

// Estados dos chats
const chatStates = new Map(); // chatId -> { active: boolean, systemPrompt: string, messages: [] }
const DEFAULT_SYSTEM_PROMPT = "Você é um assistente útil e amigável. Responda de forma clara e prestativa em português brasileiro.";

// Estatísticas globais
const stats = {
    totalMessages: 0,
    totalChats: 0,
    activeChats: 0,
    startTime: Date.now(),
    lastActivity: Date.now(),
    qrCode: null,
    qrCodeExpired: false,
    lastQrTime: null,
    isAuthenticated: false,
    connectionStatus: 'disconnected'
};

// Inicializa WhatsApp Client
const client = new Client({
    authStrategy: new NoAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Função para obter ou criar estado do chat
function getChatState(chatId) {
    if (!chatStates.has(chatId)) {
        chatStates.set(chatId, {
            active: false, // Por padrão, novos chats começam desativados
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            messages: []
        });
        stats.totalChats++;
    }
    return chatStates.get(chatId);
}

// Função para contar chats ativos
function updateActiveChatsCount() {
    let active = 0;
    for (const [chatId, state] of chatStates) {
        if (state.active) active++;
    }
    stats.activeChats = active;
}

// Função para gerar resposta com Gemini usando contexto completo
async function generate(prompt, message, chatId) {
    try {
        const chatState = getChatState(chatId);
        const systemPrompt = chatState.systemPrompt;
        
        // Constrói o contexto completo da conversa
        let contextMessages = chatState.messages.slice(-50); // Últimas 50 mensagens para não ultrapassar limites
        let contextString = contextMessages.map(msg => `${msg.sender}: ${msg.text}`).join('\n');
        
        // Prompt completo com sistema + contexto + nova mensagem
        const fullPrompt = `${systemPrompt}\n\nContexto da conversa:\n${contextString}\n\nUsuário: ${prompt}`;
        
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();
        
        // Adiciona mensagens ao contexto
        chatState.messages.push(
            { sender: 'Usuário', text: prompt, timestamp: new Date() },
            { sender: 'Bot', text: text, timestamp: new Date() }
        );
        
        await message.reply(text);
        
        stats.totalMessages++;
        stats.lastActivity = Date.now();
        
        console.log(`✅ Resposta enviada para ${chatId}`);
    } catch (error) {
        console.error('❌ Erro ao gerar resposta:', error);
        await message.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.');
    }
}

// Event listeners do WhatsApp
client.on('qr', async (qr) => {
    try {
        // Gera QR code como imagem base64
        const qrImage = await qrcode.toDataURL(qr, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        
        stats.qrCode = qrImage;
        stats.qrCodeExpired = false;
        stats.lastQrTime = Date.now();
        stats.connectionStatus = 'aguardando_scan';
        
        console.log('📱 QR Code gerado! Acesse o dashboard para escanear');
        console.log('🌐 Dashboard: https://seu-bot.onrender.com');
    } catch (error) {
        console.error('❌ Erro ao gerar QR Code:', error);
    }
});

client.on('ready', () => {
    console.log('🤖 Bot do WhatsApp está pronto!');
    stats.isAuthenticated = true;
    stats.connectionStatus = 'conectado';
    stats.qrCode = null; // Remove QR Code quando conectado
    stats.qrCodeExpired = false;
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp autenticado com sucesso!');
    stats.isAuthenticated = true;
    stats.connectionStatus = 'conectado';
});

client.on('auth_failure', () => {
    console.log('❌ Falha na autenticação');
    stats.isAuthenticated = false;
    stats.connectionStatus = 'erro_auth';
    stats.qrCodeExpired = true;
});

client.on('disconnected', (reason) => {
    console.log('🔌 Cliente desconectado:', reason);
    stats.isAuthenticated = false;
    stats.connectionStatus = 'desconectado';
});

client.on('message', async (message) => {
    try {
        const chatId = message.from;
        const messageBody = message.body?.trim();
        
        // Ignora mensagens de grupos (opcional - pode ser removido)
        if (message.from.includes('@g.us')) {
            console.log('👥 Mensagem de grupo ignorada');
            return;
        }
        
        // Ignora mensagens vazias
        if (!messageBody) return;
        
        console.log(`📨 Mensagem recebida de ${chatId}: ${messageBody}`);
        
        const chatState = getChatState(chatId);
        
        // Comando: /bot (toggle ativo/inativo)
        if (messageBody === '/bot') {
            chatState.active = !chatState.active;
            updateActiveChatsCount();
            
            if (chatState.active) {
                await message.reply('✅ Bot ATIVADO neste chat!\nAgora vou responder suas mensagens.');
            } else {
                await message.reply('❌ Bot DESATIVADO neste chat.\nUse /bot para reativar.');
            }
            return;
        }
        
        // Comando: /bot status
        if (messageBody === '/bot status') {
            const status = chatState.active ? 'ATIVO ✅' : 'DESATIVADO ❌';
            const instruction = chatState.active ? 
                'Bot respondendo mensagens normalmente.' : 
                'Use /bot para ativar.';
            
            await message.reply(`📊 Status: ${status}\n${instruction}`);
            return;
        }
        
        // Comando: /prompt [texto] (definir novo system prompt)
        if (messageBody.startsWith('/prompt ')) {
            const newPrompt = messageBody.replace('/prompt ', '').trim();
            
            if (newPrompt.length === 0) {
                await message.reply('❌ Prompt não pode ser vazio.\n\nUso: /prompt [seu texto aqui]');
                return;
            }
            
            if (newPrompt.length > 1000) {
                await message.reply('❌ Prompt muito longo (máximo 1000 caracteres).');
                return;
            }
            
            const oldPrompt = chatState.systemPrompt;
            chatState.systemPrompt = newPrompt;
            
            // Adiciona a mudança de prompt ao contexto
            chatState.messages.push({
                sender: 'Sistema',
                text: `Prompt alterado para: "${newPrompt}"`,
                timestamp: new Date()
            });
            
            const now = new Date().toLocaleString('pt-BR');
            await message.reply(
                `✅ System prompt alterado!\n\n` +
                `📋 PROMPT ANTERIOR:\n"${oldPrompt}"\n\n` +
                `🆕 NOVO PROMPT:\n"${newPrompt}"\n\n` +
                `🕒 Alterado em: ${now}`
            );
            return;
        }
        
        // Comando: /prompt show (mostrar prompt atual)
        if (messageBody === '/prompt show') {
            await message.reply(`📋 PROMPT ATUAL:\n"${chatState.systemPrompt}"`);
            return;
        }
        
        // Comando: /prompt reset (voltar ao prompt padrão)
        if (messageBody === '/prompt reset') {
            const oldPrompt = chatState.systemPrompt;
            chatState.systemPrompt = DEFAULT_SYSTEM_PROMPT;
            
            chatState.messages.push({
                sender: 'Sistema',
                text: 'Prompt resetado para padrão',
                timestamp: new Date()
            });
            
            await message.reply(
                `✅ Prompt resetado para o padrão!\n\n` +
                `📋 PROMPT ANTERIOR:\n"${oldPrompt}"\n\n` +
                `🆕 PROMPT ATUAL:\n"${DEFAULT_SYSTEM_PROMPT}"`
            );
            return;
        }
        
        // Processa mensagens normais apenas se o bot estiver ativo
        if (chatState.active && messageBody) {
            console.log(`🤖 Processando mensagem de chat ativo: ${chatId}`);
            await generate(messageBody, message, chatId);
        }
        
    } catch (error) {
        console.error('❌ Erro no processamento da mensagem:', error);
    }
});

// Inicializa cliente
console.log('🔄 Inicializando WhatsApp Client...');
client.initialize();

// Configurar Express para servir arquivos estáticos
app.use(express.static(path.join(__dirname)));

// Rota principal - Dashboard HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// API - Dados JSON
app.get('/api', (req, res) => {
    const uptime = Date.now() - stats.startTime;
    const uptimeFormatted = formatUptime(uptime);
    
    // Estatísticas dos chats
    const chatsInfo = [];
    for (const [chatId, state] of chatStates) {
        const phone = chatId.replace('@c.us', '');
        chatsInfo.push({
            phone: phone,
            active: state.active,
            customPrompt: state.systemPrompt !== DEFAULT_SYSTEM_PROMPT,
            promptPreview: state.systemPrompt.substring(0, 50) + (state.systemPrompt.length > 50 ? '...' : ''),
            messageCount: state.messages.length
        });
    }
    
    res.json({
        status: 'online',
        uptime: uptimeFormatted,
        timestamp: new Date().toLocaleString('pt-BR'),
        authenticated: stats.isAuthenticated,
        connectionStatus: stats.connectionStatus,
        qrCodeAvailable: !!stats.qrCode,
        qrCodeExpired: stats.qrCodeExpired,
        stats: {
            totalMessages: stats.totalMessages,
            totalChats: stats.totalChats,
            activeChats: stats.activeChats,
            inactiveChats: stats.totalChats - stats.activeChats,
            customPrompts: chatsInfo.filter(chat => chat.customPrompt).length
        },
        chats: chatsInfo,
        commands: [
            '/bot - Liga/desliga bot (toggle)',
            '/bot status - Mostra status',
            '/prompt [texto] - Define novo prompt',
            '/prompt show - Mostra prompt atual',
            '/prompt reset - Reseta prompt'
        ]
    });
});

// Endpoint para obter QR Code
app.get('/qr-code', (req, res) => {
    if (stats.qrCode && !stats.qrCodeExpired) {
        res.json({
            success: true,
            qrCode: stats.qrCode,
            timestamp: stats.lastQrTime
        });
    } else {
        res.json({
            success: false,
            message: stats.qrCodeExpired ? 'QR Code expirado' : 'QR Code não disponível',
            connectionStatus: stats.connectionStatus
        });
    }
});

// Health checks
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: Date.now() - stats.startTime,
        authenticated: stats.isAuthenticated,
        connectionStatus: stats.connectionStatus,
        activeChats: stats.activeChats
    });
});

// Função para formatar uptime
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🔄 Encerrando bot...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🔄 Encerrando bot...');
    await client.destroy();
    process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔌 API: http://localhost:${PORT}/api`);
});