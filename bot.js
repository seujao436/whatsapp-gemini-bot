const { Client, NoAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Inicializa Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-live-2.5-flash-preview" });

// Estados dos chats
const chatStates = new Map(); // chatId -> { active: boolean, systemPrompt: string, messages: [] }
const voiceStates = new Map(); // chatId -> { voiceEnabled: boolean, voiceModel: string, autoVoice: boolean }
const DEFAULT_SYSTEM_PROMPT = "Você é um assistente útil e amigável. Responda de forma clara e prestativa em português brasileiro.";
const DEFAULT_VOICE_MODEL = "kore";

// Vozes disponíveis
const AVAILABLE_VOICES = ['kore', 'aoede', 'puck', 'charon'];

// Estatísticas globais
const stats = {
    totalMessages: 0,
    totalChats: 0,
    activeChats: 0,
    voiceChats: 0,
    audioMessages: 0,
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
            active: false,
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            messages: []
        });
        stats.totalChats++;
    }
    return chatStates.get(chatId);
}

// Função para obter ou criar estado de voz
function getVoiceState(chatId) {
    if (!voiceStates.has(chatId)) {
        voiceStates.set(chatId, {
            voiceEnabled: false,
            voiceModel: DEFAULT_VOICE_MODEL,
            autoVoice: false // Responde em áudio automaticamente
        });
    }
    return voiceStates.get(chatId);
}

// Função para contar chats ativos e com voz
function updateChatsCount() {
    let active = 0;
    let voice = 0;
    for (const [chatId, state] of chatStates) {
        if (state.active) active++;
    }
    for (const [chatId, state] of voiceStates) {
        if (state.voiceEnabled) voice++;
    }
    stats.activeChats = active;
    stats.voiceChats = voice;
}

// Função para processar áudio com Gemini Live
async function processAudioWithGemini(audioData, chatState, voiceState) {
    try {
        console.log('🎙️ Processando áudio com Gemini Live...');
        
        // Configuração para receber áudio e responder em áudio
        const config = {
            response_modalities: ["AUDIO"],
            voice_config: {
                voice_name: voiceState.voiceModel
            }
        };
        
        // Constrói contexto completo
        let contextMessages = chatState.messages.slice(-20);
        let systemPromptWithContext = chatState.systemPrompt;
        
        if (contextMessages.length > 0) {
            const contextString = contextMessages.map(msg => `${msg.sender}: ${msg.text}`).join('\n');
            systemPromptWithContext += `\n\nContexto da conversa:\n${contextString}`;
        }
        
        // Gera resposta com áudio
        const result = await model.generateContent([
            {
                parts: [
                    { text: systemPromptWithContext },
                    {
                        inlineData: {
                            mimeType: "audio/wav",
                            data: audioData
                        }
                    }
                ]
            }
        ], config);
        
        const response = await result.response;
        
        // Extrai texto e áudio da resposta
        let responseText = '';
        let responseAudio = null;
        
        if (response.candidates && response.candidates[0]) {
            const candidate = response.candidates[0];
            
            // Extrai texto
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.text) {
                        responseText += part.text;
                    }
                }
            }
            
            // Extrai áudio
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData && part.inlineData.mimeType?.includes('audio')) {
                        responseAudio = part.inlineData.data;
                        break;
                    }
                }
            }
        }
        
        return {
            text: responseText || 'Resposta processada com sucesso!',
            audio: responseAudio
        };
        
    } catch (error) {
        console.error('❌ Erro ao processar áudio:', error);
        return {
            text: 'Desculpe, houve um erro ao processar seu áudio. Tente novamente.',
            audio: null
        };
    }
}

// Função para gerar áudio a partir de texto
async function generateAudioFromText(text, voiceModel) {
    try {
        console.log(`🔊 Gerando áudio com voz ${voiceModel}...`);
        
        const config = {
            response_modalities: ["AUDIO"],
            voice_config: {
                voice_name: voiceModel
            }
        };
        
        const result = await model.generateContent([
            { parts: [{ text: text }] }
        ], config);
        
        const response = await result.response;
        
        // Extrai áudio da resposta
        if (response.candidates && response.candidates[0]) {
            const candidate = response.candidates[0];
            
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData && part.inlineData.mimeType?.includes('audio')) {
                        return part.inlineData.data;
                    }
                }
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ Erro ao gerar áudio:', error);
        return null;
    }
}

// Função para enviar mensagem de voz
async function sendVoiceMessage(message, audioData) {
    try {
        if (!audioData) {
            console.log('⚠️ Dados de áudio não disponíveis, enviando texto.');
            return false;
        }
        
        // Converte base64 para buffer
        const audioBuffer = Buffer.from(audioData, 'base64');
        
        // Cria MessageMedia para áudio
        const audioMedia = new MessageMedia(
            'audio/ogg; codecs=opus',
            audioData,
            'response.ogg'
        );
        
        // Envia como mensagem de voz
        await message.reply(audioMedia, undefined, { 
            sendAudioAsVoice: true 
        });
        
        console.log('✅ Áudio enviado com sucesso!');
        stats.audioMessages++;
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao enviar áudio:', error);
        return false;
    }
}

// Função para gerar resposta com Gemini (modo texto)
async function generate(prompt, message, chatId) {
    try {
        const chatState = getChatState(chatId);
        const voiceState = getVoiceState(chatId);
        const systemPrompt = chatState.systemPrompt;
        
        // Constrói o contexto completo da conversa
        let contextMessages = chatState.messages.slice(-50);
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
        
        // Se modo voz ativo ou autoVoice, responde em áudio
        if (voiceState.voiceEnabled || voiceState.autoVoice) {
            const audioData = await generateAudioFromText(text, voiceState.voiceModel);
            const audioSent = await sendVoiceMessage(message, audioData);
            
            if (!audioSent) {
                // Fallback para texto se áudio falhar
                await message.reply(text);
            }
        } else {
            await message.reply(text);
        }
        
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
    } catch (error) {
        console.error('❌ Erro ao gerar QR Code:', error);
    }
});

client.on('ready', () => {
    console.log('🤖 Bot do WhatsApp está pronto!');
    stats.isAuthenticated = true;
    stats.connectionStatus = 'conectado';
    stats.qrCode = null;
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
        
        // Ignora mensagens de grupos
        if (message.from.includes('@g.us')) {
            console.log('👥 Mensagem de grupo ignorada');
            return;
        }
        
        console.log(`📨 Mensagem recebida de ${chatId}: ${message.type === 'ptt' ? '[ÁUDIO]' : messageBody}`);
        
        const chatState = getChatState(chatId);
        const voiceState = getVoiceState(chatId);
        
        // Processa mensagens de ÁUDIO (PTT = Push To Talk)
        if (message.type === 'ptt') {
            console.log('🎙️ Mensagem de áudio recebida');
            
            if (!chatState.active) {
                await message.reply('❌ Bot está desativado neste chat. Use /bot para ativar.');
                return;
            }
            
            try {
                // Download do áudio
                const media = await message.downloadMedia();
                const audioData = media.data; // Base64
                
                console.log('📥 Áudio baixado, processando...');
                
                // Processa áudio com Gemini Live
                const result = await processAudioWithGemini(audioData, chatState, voiceState);
                
                // Adiciona ao contexto
                chatState.messages.push(
                    { sender: 'Usuário', text: '[Mensagem de áudio]', timestamp: new Date() },
                    { sender: 'Bot', text: result.text, timestamp: new Date() }
                );
                
                // Sempre responde em áudio para mensagens de áudio
                if (result.audio) {
                    const audioSent = await sendVoiceMessage(message, result.audio);
                    if (!audioSent) {
                        await message.reply(result.text);
                    }
                } else {
                    await message.reply(result.text);
                }
                
                stats.totalMessages++;
                stats.lastActivity = Date.now();
                
            } catch (error) {
                console.error('❌ Erro ao processar áudio:', error);
                await message.reply('Desculpe, não consegui processar seu áudio. Tente enviar novamente ou digite sua mensagem.');
            }
            return;
        }
        
        // Ignora mensagens vazias
        if (!messageBody) return;
        
        // Comando: /bot (toggle ativo/inativo)
        if (messageBody === '/bot') {
            chatState.active = !chatState.active;
            updateChatsCount();
            
            if (chatState.active) {
                await message.reply('✅ Bot ATIVADO neste chat!\nAgora vou responder suas mensagens.\n\n🎙️ Use /voz para ativar respostas em áudio!');
            } else {
                await message.reply('❌ Bot DESATIVADO neste chat.\nUse /bot para reativar.');
            }
            return;
        }
        
        // Comando: /bot status
        if (messageBody === '/bot status') {
            const status = chatState.active ? 'ATIVO ✅' : 'DESATIVADO ❌';
            const voiceStatus = voiceState.voiceEnabled ? `🎙️ Voz: ${voiceState.voiceModel} ✅` : '🔇 Voz: DESABILITADA';
            const instruction = chatState.active ? 
                'Bot respondendo mensagens normalmente.' : 
                'Use /bot para ativar.';
            
            await message.reply(`📊 Status: ${status}\n${voiceStatus}\n${instruction}`);
            return;
        }
        
        // Comandos de VOZ
        if (messageBody.startsWith('/voz')) {
            const args = messageBody.split(' ');
            
            if (args.length === 1) {
                // Toggle modo voz
                voiceState.voiceEnabled = !voiceState.voiceEnabled;
                voiceState.autoVoice = voiceState.voiceEnabled;
                updateChatsCount();
                
                if (voiceState.voiceEnabled) {
                    await message.reply(`🎙️ Modo voz ATIVADO!\nVoz: ${voiceState.voiceModel}\nAgora responderei em áudio.`);
                } else {
                    await message.reply('🔇 Modo voz DESATIVADO.\nVoltando a responder apenas em texto.');
                }
                return;
            }
            
            const param = args[1].toLowerCase();
            
            // /voz show - Mostra configuração atual
            if (param === 'show') {
                const status = voiceState.voiceEnabled ? 'ATIVADO' : 'DESATIVADO';
                const autoStatus = voiceState.autoVoice ? 'SIM' : 'NÃO';
                await message.reply(
                    `🎙️ CONFIGURAÇÃO DE VOZ:\n\n` +
                    `Status: ${status}\n` +
                    `Voz atual: ${voiceState.voiceModel}\n` +
                    `Resposta automática: ${autoStatus}\n\n` +
                    `Vozes disponíveis: ${AVAILABLE_VOICES.join(', ')}`
                );
                return;
            }
            
            // /voz reset - Reseta configurações
            if (param === 'reset') {
                voiceState.voiceEnabled = false;
                voiceState.voiceModel = DEFAULT_VOICE_MODEL;
                voiceState.autoVoice = false;
                updateChatsCount();
                
                await message.reply('✅ Configurações de voz resetadas!\n🔇 Modo voz desativado.');
                return;
            }
            
            // /voz texto - Desativa voz
            if (param === 'texto') {
                voiceState.voiceEnabled = false;
                voiceState.autoVoice = false;
                updateChatsCount();
                
                await message.reply('📝 Modo texto ativado!\nAgora responderei apenas em texto.');
                return;
            }
            
            // /voz [nome_da_voz] - Define voz específica
            if (AVAILABLE_VOICES.includes(param)) {
                const oldVoice = voiceState.voiceModel;
                voiceState.voiceModel = param;
                voiceState.voiceEnabled = true;
                voiceState.autoVoice = true;
                updateChatsCount();
                
                await message.reply(
                    `🎙️ Voz alterada!\n\n` +
                    `📋 VOZ ANTERIOR: ${oldVoice}\n` +
                    `🆕 NOVA VOZ: ${param}\n\n` +
                    `Modo voz ativado! Responderei em áudio.`
                );
                return;
            }
            
            // Comando inválido
            await message.reply(
                `❌ Comando de voz inválido!\n\n` +
                `📋 COMANDOS DISPONÍVEIS:\n` +
                `/voz - Liga/desliga modo voz\n` +
                `/voz show - Mostra configuração\n` +
                `/voz reset - Reseta configurações\n` +
                `/voz texto - Modo apenas texto\n\n` +
                `🎭 VOZES DISPONÍVEIS:\n${AVAILABLE_VOICES.map(v => `/voz ${v}`).join('\n')}`
            );
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

// Express routes...
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/api', (req, res) => {
    const uptime = Date.now() - stats.startTime;
    const uptimeFormatted = formatUptime(uptime);
    
    const chatsInfo = [];
    for (const [chatId, state] of chatStates) {
        const phone = chatId.replace('@c.us', '');
        const voiceState = getVoiceState(chatId);
        chatsInfo.push({
            phone: phone,
            active: state.active,
            customPrompt: state.systemPrompt !== DEFAULT_SYSTEM_PROMPT,
            promptPreview: state.systemPrompt.substring(0, 50) + (state.systemPrompt.length > 50 ? '...' : ''),
            messageCount: state.messages.length,
            voiceEnabled: voiceState.voiceEnabled,
            voiceModel: voiceState.voiceModel,
            autoVoice: voiceState.autoVoice
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
            voiceChats: stats.voiceChats,
            audioMessages: stats.audioMessages,
            customPrompts: chatsInfo.filter(chat => chat.customPrompt).length
        },
        chats: chatsInfo,
        availableVoices: AVAILABLE_VOICES,
        commands: [
            '/bot - Liga/desliga bot',
            '/bot status - Status do chat',
            '/voz - Liga/desliga modo voz',
            '/voz [kore/aoede/puck/charon] - Define voz',
            '/voz show - Mostra config de voz',
            '/prompt [texto] - Define prompt',
            '/prompt show - Mostra prompt atual'
        ]
    });
});

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

app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: Date.now() - stats.startTime,
        authenticated: stats.isAuthenticated,
        connectionStatus: stats.connectionStatus,
        activeChats: stats.activeChats,
        voiceChats: stats.voiceChats
    });
});

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
    console.log(`🎙️ Modelo: gemini-live-2.5-flash-preview`);
    console.log(`🎭 Vozes: ${AVAILABLE_VOICES.join(', ')}`);
});