const { Client, NoAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ MODELO CORRETO - MESMO DO ALTERNATIVEDIALOGUE
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-2.0-flash-exp" });

// Estados dos chats
const chatStates = new Map();
const voiceStates = new Map();
const liveSessions = new Map(); // ✅ Sessões Live por chat
const DEFAULT_SYSTEM_PROMPT = "Você é um assistente útil e amigável. Responda de forma clara e prestativa em português brasileiro.";

// ✅ VOZES DISPONÍVEIS - MESMO DO ALTERNATIVEDIALOGUE
const AVAILABLE_VOICES = ['Puck', 'Kore', 'Aoede', 'Charon'];
const DEFAULT_VOICE = 'Puck';

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
            voiceModel: DEFAULT_VOICE,
            autoVoice: false
        });
    }
    return voiceStates.get(chatId);
}

// ✅ FUNÇÃO PARA CRIAR SESSÃO LIVE - LÓGICA DO ALTERNATIVEDIALOGUE
async function createLiveSession(chatId, voiceName = DEFAULT_VOICE) {
    try {
        console.log(`🎙️ Criando sessão Live para ${chatId} com voz ${voiceName}`);
        
        // ✅ CONFIGURAÇÃO EXATA DO ALTERNATIVEDIALOGUE
        const session = await model.startChat({
            generationConfig: {
                responseModalities: "audio", // ✅ RESPOSTA EM ÁUDIO DIRETO
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: voiceName
                        }
                    }
                }
            }
        });
        
        liveSessions.set(chatId, session);
        console.log(`✅ Sessão Live criada para ${chatId}`);
        return session;
        
    } catch (error) {
        console.error(`❌ Erro ao criar sessão Live para ${chatId}:`, error);
        return null;
    }
}

// ✅ FUNÇÃO PARA CONVERTER BASE64 PARA BLOB
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

// ✅ FUNÇÃO PARA CONVERTER BLOB PARA BASE64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ✅ PROCESSAR ÁUDIO COM GEMINI LIVE - LÓGICA EXATA DO ALTERNATIVEDIALOGUE
async function processAudioWithGeminiLive(audioBase64, chatState, voiceState, chatId) {
    try {
        console.log('🎙️ Processando áudio com Gemini Live (áudio nativo)...');
        
        // Obtém ou cria sessão Live
        let session = liveSessions.get(chatId);
        if (!session) {
            session = await createLiveSession(chatId, voiceState.voiceModel);
            if (!session) {
                throw new Error('Falha ao criar sessão Live');
            }
        }
        
        // Adiciona contexto se necessário
        let contextPrompt = chatState.systemPrompt;
        if (chatState.messages.length > 0) {
            const recentMessages = chatState.messages.slice(-10);
            const contextString = recentMessages.map(msg => `${msg.sender}: ${msg.text}`).join('\n');
            contextPrompt += `\n\nContexto da conversa:\n${contextString}`;
        }
        
        // ✅ ENVIA ÁUDIO PARA GEMINI LIVE - FORMATO DO ALTERNATIVEDIALOGUE
        const result = await session.sendMessage([
            { text: contextPrompt + "\n\nProcesse este áudio e responda:" },
            {
                inlineData: {
                    mimeType: "audio/wav", // Formato de entrada
                    data: audioBase64
                }
            }
        ]);
        
        console.log('📡 Áudio enviado para Gemini Live, aguardando resposta...');
        
        // ✅ RECEBE RESPOSTA COM ÁUDIO - LÓGICA DO ALTERNATIVEDIALOGUE
        const response = await result.response;
        
        let responseText = '';
        let responseAudioBase64 = null;
        let responseMimeType = null;
        
        // Procura por partes de áudio e texto na resposta
        if (response.candidates && response.candidates[0]) {
            const candidate = response.candidates[0];
            
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    // Extrai texto se disponível
                    if (part.text) {
                        responseText += part.text;
                    }
                    
                    // ✅ EXTRAI ÁUDIO - LÓGICA PRINCIPAL DO ALTERNATIVEDIALOGUE
                    if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
                        responseAudioBase64 = part.inlineData.data;
                        responseMimeType = part.inlineData.mimeType;
                        console.log(`🔊 Áudio recebido! Tipo: ${responseMimeType}`);
                        break;
                    }
                }
            }
        }
        
        return {
            text: responseText || 'Resposta processada com áudio!',
            audioBase64: responseAudioBase64,
            audioMimeType: responseMimeType
        };
        
    } catch (error) {
        console.error('❌ Erro ao processar áudio com Gemini Live:', error);
        
        // Remove sessão com erro
        liveSessions.delete(chatId);
        
        return {
            text: 'Desculpe, houve um erro ao processar seu áudio. Tente novamente.',
            audioBase64: null,
            audioMimeType: null
        };
    }
}

// ✅ GERAR ÁUDIO A PARTIR DE TEXTO - LÓGICA DO ALTERNATIVEDIALOGUE
async function generateAudioFromText(text, voiceModel, chatId) {
    try {
        console.log(`🔊 Gerando áudio com voz ${voiceModel}...`);
        
        // Obtém ou cria sessão Live
        let session = liveSessions.get(chatId);
        if (!session) {
            session = await createLiveSession(chatId, voiceModel);
            if (!session) {
                throw new Error('Falha ao criar sessão Live');
            }
        }
        
        // ✅ ENVIA TEXTO PARA GERAR ÁUDIO
        const result = await session.sendMessage([
            { text: text }
        ]);
        
        const response = await result.response;
        
        // Procura áudio na resposta
        if (response.candidates && response.candidates[0]) {
            const candidate = response.candidates[0];
            
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
                        console.log(`✅ Áudio gerado! Tipo: ${part.inlineData.mimeType}`);
                        return {
                            audioBase64: part.inlineData.data,
                            audioMimeType: part.inlineData.mimeType
                        };
                    }
                }
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ Erro ao gerar áudio:', error);
        
        // Remove sessão com erro
        liveSessions.delete(chatId);
        return null;
    }
}

// ✅ ENVIAR MENSAGEM DE VOZ PARA WHATSAPP
async function sendVoiceMessage(message, audioBase64, audioMimeType) {
    try {
        if (!audioBase64) {
            console.log('⚠️ Dados de áudio não disponíveis');
            return false;
        }
        
        console.log(`🎵 Enviando áudio (${audioMimeType})...`);
        
        // Converte para formato compatível com WhatsApp (OGG Opus)
        let finalMimeType = 'audio/ogg; codecs=opus';
        let finalAudioData = audioBase64;
        
        // Se recebeu PCM ou outro formato, mantém base64 mas usa OGG como tipo
        if (audioMimeType && audioMimeType.includes('pcm')) {
            finalMimeType = 'audio/ogg; codecs=opus';
        }
        
        // Cria MessageMedia para áudio
        const audioMedia = new MessageMedia(
            finalMimeType,
            finalAudioData,
            'response.ogg'
        );
        
        // ✅ ENVIA COMO VOICE NOTE
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
        
        // Se modo voz ativo, gera áudio direto
        if (voiceState.voiceEnabled || voiceState.autoVoice) {
            console.log(`🎙️ Gerando resposta em áudio com voz ${voiceState.voiceModel}...`);
            
            // Gera texto primeiro
            const textResult = await model.generateContent(fullPrompt);
            const responseText = textResult.response.text();
            
            // Gera áudio a partir do texto
            const audioResult = await generateAudioFromText(responseText, voiceState.voiceModel, chatId);
            
            // Adiciona mensagens ao contexto
            chatState.messages.push(
                { sender: 'Usuário', text: prompt, timestamp: new Date() },
                { sender: 'Bot', text: responseText, timestamp: new Date() }
            );
            
            if (audioResult && audioResult.audioBase64) {
                // Envia áudio
                const audioSent = await sendVoiceMessage(message, audioResult.audioBase64, audioResult.audioMimeType);
                if (!audioSent) {
                    // Fallback para texto se áudio falhar
                    await message.reply(`🎙️ ${responseText}`);
                }
            } else {
                // Fallback para texto
                await message.reply(`📝 ${responseText}\n\n⚠️ Erro ao gerar áudio`);
            }
        } else {
            // Modo texto normal
            const result = await model.generateContent(fullPrompt);
            const text = result.response.text();
            
            // Adiciona mensagens ao contexto
            chatState.messages.push(
                { sender: 'Usuário', text: prompt, timestamp: new Date() },
                { sender: 'Bot', text: text, timestamp: new Date() }
            );
            
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
    console.log(`🎙️ Modelo: models/gemini-2.0-flash-exp (Áudio nativo)`);
    console.log(`🎭 Vozes disponíveis: ${AVAILABLE_VOICES.join(', ')}`);
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
    
    // Limpa sessões Live
    liveSessions.clear();
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
        
        // ✅ PROCESSA MENSAGENS DE ÁUDIO (PTT) - LÓGICA DO ALTERNATIVEDIALOGUE
        if (message.type === 'ptt') {
            console.log('🎙️ Mensagem de áudio recebida');
            
            if (!chatState.active) {
                await message.reply('❌ Bot está desativado neste chat. Use /bot para ativar.');
                return;
            }
            
            try {
                // Download do áudio
                const media = await message.downloadMedia();
                const audioBase64 = media.data;
                
                console.log('📥 Áudio baixado, processando com Gemini Live...');
                
                // ✅ PROCESSA ÁUDIO COM GEMINI LIVE (RESPOSTA EM ÁUDIO)
                const result = await processAudioWithGeminiLive(audioBase64, chatState, voiceState, chatId);
                
                // Adiciona ao contexto
                chatState.messages.push(
                    { sender: 'Usuário', text: '[Mensagem de áudio]', timestamp: new Date() },
                    { sender: 'Bot', text: result.text, timestamp: new Date() }
                );
                
                // ✅ SEMPRE RESPONDE EM ÁUDIO PARA MENSAGENS DE ÁUDIO
                if (result.audioBase64) {
                    console.log('🎵 Enviando resposta em áudio...');
                    const audioSent = await sendVoiceMessage(message, result.audioBase64, result.audioMimeType);
                    
                    if (!audioSent) {
                        // Fallback para texto se áudio falhar
                        await message.reply(`🎙️ **Resposta (falha no áudio):**\n${result.text}`);
                    }
                } else {
                    // Sem áudio, envia texto
                    await message.reply(`💬 **Resposta:**\n${result.text}`);
                }
                
                stats.totalMessages++;
                stats.audioMessages++;
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
                await message.reply('✅ Bot ATIVADO neste chat!\n\n🎙️ Recursos disponíveis:\n• Mensagens de texto\n• Mensagens de áudio (PTT)\n• Respostas em áudio\n• 4 vozes HD disponíveis\n\nUse /voz para configurar áudio!');
            } else {
                await message.reply('❌ Bot DESATIVADO neste chat.\nUse /bot para reativar.');
            }
            return;
        }
        
        // Comando: /bot status
        if (messageBody === '/bot status') {
            const status = chatState.active ? 'ATIVO ✅' : 'DESATIVADO ❌';
            const voiceStatus = voiceState.voiceEnabled ? 
                `🎙️ Voz: ${voiceState.voiceModel} ✅` : 
                '🔇 Voz: DESABILITADA';
            const liveSession = liveSessions.has(chatId) ? '🔴 LIVE' : '⚫ DESCONECTADO';
            
            await message.reply(
                `📊 **STATUS DO CHAT:**\n\n` +
                `Bot: ${status}\n` +
                `${voiceStatus}\n` +
                `Sessão Live: ${liveSession}\n` +
                `Modelo: gemini-2.0-flash-exp\n\n` +
                `${chatState.active ? 'Enviando mensagens/áudio normalmente!' : 'Use /bot para ativar.'}`
            );
            return;
        }
        
        // ✅ COMANDOS DE VOZ - IMPLEMENTAÇÃO COMPLETA
        if (messageBody.startsWith('/voz')) {
            const args = messageBody.split(' ');
            
            if (args.length === 1) {
                // Toggle modo voz
                voiceState.voiceEnabled = !voiceState.voiceEnabled;
                voiceState.autoVoice = voiceState.voiceEnabled;
                updateChatsCount();
                
                if (voiceState.voiceEnabled) {
                    // Cria sessão Live imediatamente
                    await createLiveSession(chatId, voiceState.voiceModel);
                    
                    await message.reply(
                        `🎙️ **MODO VOZ ATIVADO!**\n\n` +
                        `🎭 Voz atual: ${voiceState.voiceModel}\n` +
                        `🔊 Respostas em áudio: ATIVO\n` +
                        `📱 Processamento de PTT: ATIVO\n\n` +
                        `Agora responderei em áudio! 🎵`
                    );
                } else {
                    // Remove sessão Live
                    liveSessions.delete(chatId);
                    
                    await message.reply('🔇 Modo voz DESATIVADO.\nVoltando a responder apenas em texto.');
                }
                return;
            }
            
            const param = args[1];
            
            // /voz show
            if (param === 'show') {
                const status = voiceState.voiceEnabled ? 'ATIVADO ✅' : 'DESATIVADO ❌';
                const liveSession = liveSessions.has(chatId) ? 'CONECTADA 🔴' : 'DESCONECTADA ⚫';
                
                await message.reply(
                    `🎙️ **CONFIGURAÇÃO DE VOZ:**\n\n` +
                    `Status: ${status}\n` +
                    `Voz atual: ${voiceState.voiceModel}\n` +
                    `Sessão Live: ${liveSession}\n` +
                    `Modelo: gemini-2.0-flash-exp\n\n` +
                    `🎭 **Vozes disponíveis:**\n${AVAILABLE_VOICES.map(v => `• ${v}`).join('\n')}\n\n` +
                    `Use: /voz [nome] para trocar`
                );
                return;
            }
            
            // /voz reset
            if (param === 'reset') {
                liveSessions.delete(chatId);
                voiceState.voiceEnabled = false;
                voiceState.voiceModel = DEFAULT_VOICE;
                voiceState.autoVoice = false;
                updateChatsCount();
                
                await message.reply('✅ Configurações de voz resetadas!\n🔇 Modo voz desativado.');
                return;
            }
            
            // /voz [nome_da_voz]
            const voiceName = AVAILABLE_VOICES.find(v => v.toLowerCase() === param.toLowerCase());
            if (voiceName) {
                const oldVoice = voiceState.voiceModel;
                voiceState.voiceModel = voiceName;
                voiceState.voiceEnabled = true;
                voiceState.autoVoice = true;
                updateChatsCount();
                
                // Recria sessão Live com nova voz
                liveSessions.delete(chatId);
                await createLiveSession(chatId, voiceName);
                
                await message.reply(
                    `🎙️ **VOZ ALTERADA!**\n\n` +
                    `📋 Anterior: ${oldVoice}\n` +
                    `🆕 Nova: ${voiceName}\n\n` +
                    `Modo voz ativado! Agora responderei com a voz ${voiceName}. 🎵`
                );
                return;
            }
            
            // Comando inválido
            await message.reply(
                `❌ Comando de voz inválido!\n\n` +
                `📋 **COMANDOS DISPONÍVEIS:**\n` +
                `/voz - Liga/desliga modo voz\n` +
                `/voz show - Mostra configuração\n` +
                `/voz reset - Reseta configurações\n\n` +
                `🎭 **VOZES DISPONÍVEIS:**\n${AVAILABLE_VOICES.map(v => `/voz ${v}`).join('\n')}`
            );
            return;
        }
        
        // Comando: /prompt [texto]
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
            
            // Remove sessão Live para aplicar novo prompt
            liveSessions.delete(chatId);
            
            chatState.messages.push({
                sender: 'Sistema',
                text: `Prompt alterado para: "${newPrompt}"`,
                timestamp: new Date()
            });
            
            const now = new Date().toLocaleString('pt-BR');
            await message.reply(
                `✅ **System prompt alterado!**\n\n` +
                `📋 **ANTERIOR:**\n"${oldPrompt}"\n\n` +
                `🆕 **NOVO:**\n"${newPrompt}"\n\n` +
                `🕒 Alterado em: ${now}\n` +
                `🔄 Sessão Live resetada para aplicar mudanças`
            );
            return;
        }
        
        // Comando: /prompt show
        if (messageBody === '/prompt show') {
            await message.reply(`📋 **PROMPT ATUAL:**\n"${chatState.systemPrompt}"`);
            return;
        }
        
        // Comando: /prompt reset
        if (messageBody === '/prompt reset') {
            const oldPrompt = chatState.systemPrompt;
            chatState.systemPrompt = DEFAULT_SYSTEM_PROMPT;
            
            // Remove sessão Live
            liveSessions.delete(chatId);
            
            chatState.messages.push({
                sender: 'Sistema',
                text: 'Prompt resetado para padrão',
                timestamp: new Date()
            });
            
            await message.reply(
                `✅ **Prompt resetado!**\n\n` +
                `📋 **ANTERIOR:**\n"${oldPrompt}"\n\n` +
                `🆕 **ATUAL:**\n"${DEFAULT_SYSTEM_PROMPT}"\n\n` +
                `🔄 Sessão Live resetada`
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
console.log('🎙️ Modelo: models/gemini-2.0-flash-exp (Áudio nativo)');
console.log(`🎭 Vozes: ${AVAILABLE_VOICES.join(', ')}`);
client.initialize();

// Express routes
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
        const hasLiveSession = liveSessions.has(chatId);
        
        chatsInfo.push({
            phone: phone,
            active: state.active,
            customPrompt: state.systemPrompt !== DEFAULT_SYSTEM_PROMPT,
            promptPreview: state.systemPrompt.substring(0, 50) + (state.systemPrompt.length > 50 ? '...' : ''),
            messageCount: state.messages.length,
            voiceEnabled: voiceState.voiceEnabled,
            voiceModel: voiceState.voiceModel,
            autoVoice: voiceState.autoVoice,
            liveSession: hasLiveSession
        });
    }
    
    res.json({
        status: 'online',
        model: 'models/gemini-2.0-flash-exp',
        audioNative: true,
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
            liveSessions: liveSessions.size,
            customPrompts: chatsInfo.filter(chat => chat.customPrompt).length
        },
        chats: chatsInfo,
        availableVoices: AVAILABLE_VOICES,
        defaultVoice: DEFAULT_VOICE,
        audioFeatures: {
            audioProcessing: true,
            nativeAudioGeneration: true,
            voiceRecognition: true,
            liveSession: true,
            affectiveDialog: true
        },
        commands: [
            '/bot - Liga/desliga bot',
            '/bot status - Status completo',
            '/voz - Liga/desliga modo voz',
            '/voz [Puck/Kore/Aoede/Charon] - Define voz',
            '/voz show - Config atual',
            '/voz reset - Reseta voz',
            '/prompt [texto] - Define prompt',
            '/prompt show - Ver prompt',
            '/prompt reset - Reseta prompt'
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
        model: 'models/gemini-2.0-flash-exp',
        audioNative: true,
        uptime: Date.now() - stats.startTime,
        authenticated: stats.isAuthenticated,
        connectionStatus: stats.connectionStatus,
        activeChats: stats.activeChats,
        voiceChats: stats.voiceChats,
        liveSessions: liveSessions.size
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

// Limpeza de sessões ao encerrar
process.on('SIGINT', async () => {
    console.log('🔄 Encerrando bot...');
    liveSessions.clear();
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🔄 Encerrando bot...');
    liveSessions.clear();
    await client.destroy();
    process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔌 API: http://localhost:${PORT}/api`);
    console.log(`🎙️ Modelo com áudio nativo: models/gemini-2.0-flash-exp`);
    console.log(`🎭 Vozes HD: ${AVAILABLE_VOICES.join(', ')}`);
    console.log(`🎵 Pronto para áudio!`);
});