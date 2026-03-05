const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const transporter = require('../transporter');
const fs = require('fs');
const handlebars = require('handlebars');
const util = require('util');

require('dotenv').config();
const paginateArray = (array, perPage, page) => array.slice((page - 1) * perPage, page * perPage)
const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');
const caminhoimg = path.join(__dirname, '../uploads/fotos-perfil');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, caminhoimg);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

router.get('/get', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { type = null, types = [] } = req.query;

        let query = 'SELECT * FROM Options WHERE empresa_id = ?';
        let values = [empresa_id];

        if (type) {
            query += ' AND type = ?';
            values.push(type);
        } else if (types.length > 0) {
            const placeholders = types.map(() => '?').join(',');
            query += ` AND type IN (${placeholders})`;
            values.push(...types);
        }

        const config = await dbQuery(query, values);

        if (config.length === 0) {
            return res.status(404).json({ message: 'Nenhuma configuração encontrada', types, type });
        }

        res.status(200).json(config);
    } catch (error) {
        console.log('Erro ao buscar configurações', error)
        res.status(500).json({ error: error.message });
    }
})

router.get('/g/:type', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;

        console.log('Empresa ID:', empresa_id);
        const { type } = req.params;

        const config = await dbQuery('SELECT * FROM Options WHERE type = ? AND empresa_id = ?', [type, empresa_id]);

        if (config.length === 0) {
            return res.status(404).send('Configuração não encontrada');
        }

        res.status(200).json(config);
    } catch (error) {
        console.log('Erro ao buscar configuração', error)
        res.status(500).json({ error: error.message });
    }
});

router.post('/update', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { data, type_del = null } = req.body;

        if (!data) {
            return res.status(400).send('Dados não informados');
        }

        if (type_del) {
            await dbQuery('DELETE FROM Options WHERE type = ? AND empresa_id = ?', [type_del, empresa_id]);
            return res.status(200).send('Configuração deletada com sucesso');
        }

        let deletesNoExist = [];
        let currentValues = null;

        for (const item of data) {
            if (!item.multiple) {
                // Verificar se o tipo existe
                let keyExists = await dbQuery('SELECT * FROM Options WHERE type = ? AND empresa_id = ?', [item.type, empresa_id]);
                if (keyExists.length === 0) {
                    // Inserir novo tipo
                    await dbQuery('INSERT INTO Options (type, value, empresa_id) VALUES (?, ?, ?)', [item.type, item.value, empresa_id]);
                } else {
                    // Atualizar valor existente
                    await dbQuery('UPDATE Options SET value = ? WHERE type = ? AND empresa_id = ?', [item.value, item.type, empresa_id]);
                }
            } else {
                let existe = await dbQuery('SELECT * FROM Options WHERE type = ? AND value = ? AND empresa_id = ?', [item.type, item.value, empresa_id]);

                if (existe.length === 0) {
                    await dbQuery('INSERT INTO Options (type, value, empresa_id) VALUES (?, ?, ?)', [item.type, item.value, empresa_id]);
                    continue;
                }

                currentValues = await dbQuery('SELECT * FROM Options WHERE type = ? AND empresa_id = ?', [item.type, empresa_id]);
            }
        }

        if (currentValues) {
            for (const item of currentValues) {
                let exists = data.find(x => x.type === item.type && x.value === item.value);
                if (!exists) {
                    deletesNoExist.push(item);
                }
            }

            for (const item of deletesNoExist) {
                console.log('Deletando', item);
                await dbQuery('DELETE FROM Options WHERE type = ? AND value = ? AND empresa_id = ?', [item.type, item.value, empresa_id]);
            }
        }

        res.status(200).send('Configurações atualizadas com sucesso');
    } catch (error) {
        console.log('Erro ao atualizar configurações', error);
        res.status(500).json({ error: error.message });
    }
});

//Tipos de agendamento
router.get('/get-tipos-agendamento', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const tiposAgendamento = await dbQuery('SELECT * FROM AGENDAMENTO_TIPOS WHERE empresa_id = ?', [empresa_id]);

        if (tiposAgendamento.length === 0) {
            return res.status(404).json({ message: 'Nenhum tipo de agendamento encontrado' });
        }

        tiposAgendamento.forEach(tipo => {
            tipo.icon = tipo.icon ? Buffer.from(tipo.icon, 'base64').toString('utf8') : null;
        });
        res.status(200).json(tiposAgendamento);
    } catch (error) {
        console.log('Erro ao buscar tipos de agendamento', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/upsert-tipo-agendamento', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        let { id = null, name, icon } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Nome do tipo de agendamento é obrigatório' });
        }

        icon = icon ? Buffer.from(icon).toString('base64') : null;

        if (id) {
            const atualTipoAgendamento = await dbQuery('SELECT * FROM AGENDAMENTO_TIPOS WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

            if (atualTipoAgendamento.length === 0) {
                return res.status(404).json({ message: 'Tipo de agendamento não encontrado' });
            }

            const agendamentos = await dbQuery('SELECT * FROM AGENDAMENTO WHERE age_type = ? AND empresa_id = ?', [atualTipoAgendamento[0].name, empresa_id]);

            if (agendamentos.length > 0) {
                await dbQuery('UPDATE AGENDAMENTO SET age_type = ? WHERE age_type = ? AND empresa_id = ?', [name, atualTipoAgendamento[0].name, empresa_id]);
            }

            await dbQuery('UPDATE AGENDAMENTO_TIPOS SET name = ?, icon = ? WHERE id = ? AND empresa_id = ?', [name, icon, id, empresa_id]);
            return res.status(200).json({ message: 'Tipo de agendamento atualizado com sucesso' });
        }

        const tipoAgendamento = await dbQuery('INSERT INTO AGENDAMENTO_TIPOS (name, icon, empresa_id) VALUES (?, ?, ?)', [name, icon, empresa_id]);
        return res.status(200).json({ message: 'Tipo de agendamento inserido com sucesso', id: tipoAgendamento.insertId });

    } catch (error) {
        console.log('Erro ao upsert tipo de agendamento', error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/delete-tipo-agendamento', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({ message: 'ID do tipo de agendamento é obrigatório' });
        }

        const atualTipoAgendamento = await dbQuery('SELECT * FROM AGENDAMENTO_TIPOS WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        if (atualTipoAgendamento.length === 0) {
            return res.status(404).json({ message: 'Tipo de agendamento não encontrado' });
        }

        const agendamentos = await dbQuery('SELECT * FROM AGENDAMENTO WHERE age_type = ? AND empresa_id = ?', [atualTipoAgendamento[0].name, empresa_id]);

        if (agendamentos.length > 0) {
            return res.status(400).json({ message: `Tipo de agendamento não pode ser deletado porque está sendo usado em ${agendamentos.length} agendamentos` });
        }

        await dbQuery('DELETE FROM AGENDAMENTO_TIPOS WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        return res.status(200).json({ message: 'Tipo de agendamento deletado com sucesso' });
    } catch (error) {
        console.log("Erro ao deletar tipo de agendamento:", error, error.response);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /config/elevenlabs-voices
 * Lista vozes disponíveis do ElevenLabs
 * @query {string} type - 'community' (padrão) ou 'default'
 * @query {string} freeOnly - 'true' (padrão) filtra apenas vozes gratuitas, 'false' mostra todas
 */
router.get('/elevenlabs-voices', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { type = 'community', freeOnly = 'true' } = req.query;
        const filterFreeOnly = freeOnly === 'true';

        // Buscar API key do ElevenLabs
        const config = await dbQuery('SELECT value FROM Options WHERE type = ? AND empresa_id = ?', ['elevenlabs_key', empresa_id]);
        const apiKey = config[0]?.value;

        if (!apiKey) {
            return res.status(400).json({
                success: false,
                error: 'API Key do ElevenLabs não configurada'
            });
        }

        const https = require('https');
        let organizedVoices = [];

        console.log('Buscando vozes do ElevenLabs', type);

        if (type === 'default') {
            // Buscar vozes padrão do ElevenLabs
            const data = await new Promise((resolve, reject) => {
                const options = {
                    hostname: 'api.elevenlabs.io',
                    port: 443,
                    path: '/v1/voices?page_size=100',
                    method: 'GET',
                    headers: { 'xi-api-key': apiKey }
                };

                const req = https.request(options, (response) => {
                    let data = '';
                    response.on('data', chunk => data += chunk);
                    response.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error('Erro ao parsear resposta'));
                        }
                    });
                });

                req.on('error', reject);
                req.end();
            });

            organizedVoices = (data.voices || []).map(v => ({
                voice_id: v.voice_id,
                name: v.name,
                category: v.category || 'premade',
                preview_url: v.preview_url,
                gender: v.labels?.gender || 'unknown',
                accent: v.labels?.accent || 'unknown',
                age: v.labels?.age || 'unknown',
                description: v.description || '',
                locale: v.labels?.language || 'multilingual',
                free_users_allowed: true // Vozes padrão da conta são sempre permitidas
            }));
        } else if (type === 'community') {
            // Buscar vozes da comunidade (brasileiro)
            const data = await new Promise((resolve, reject) => {
                const queryParams = new URLSearchParams({
                    language: 'pt',
                    accent: 'brazilian',
                    page_size: '100'
                });

                const options = {
                    hostname: 'api.elevenlabs.io',
                    port: 443,
                    path: `/v1/shared-voices?${queryParams.toString()}`,
                    method: 'GET',
                    headers: { 'xi-api-key': apiKey }
                };

                const req = https.request(options, (response) => {
                    let data = '';
                    response.on('data', chunk => data += chunk);
                    response.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error('Erro ao parsear resposta'));
                        }
                    });
                });

                req.on('error', reject);
                req.end();
            });

            console.log('Vozes encontradas', data.voices?.length || data);

            // Mapear vozes da comunidade
            let communityVoices = (data.voices || []).map(v => ({
                voice_id: v.voice_id,
                name: v.name,
                category: v.category || 'community',
                preview_url: v.preview_url,
                gender: v.gender || 'unknown',
                accent: v.accent || 'unknown',
                age: v.age || 'unknown',
                description: v.description || '',
                locale: v.locale || 'pt-BR',
                free_users_allowed: v.free_users_allowed || false,
                public_owner_id: v.public_owner_id || null // Necessário para adicionar à conta
            }));

            // Filtrar apenas vozes gratuitas se solicitado
            if (filterFreeOnly) {
                console.log(`Filtrando vozes gratuitas: ${communityVoices.filter(v => v.free_users_allowed).length} de ${communityVoices.length}`);
                communityVoices = communityVoices.filter(v => v.free_users_allowed === true);
            }

            organizedVoices = communityVoices;
        }

        // Separar por gênero
        const voicesByGender = {
            female: organizedVoices.filter(v => v.gender === 'female'),
            male: organizedVoices.filter(v => v.gender === 'male'),
            other: organizedVoices.filter(v => !['female', 'male'].includes(v.gender))
        };

        // Buscar voz configurada atualmente
        const audioConfig = await dbQuery('SELECT value FROM Options WHERE type = ? AND empresa_id = ?', ['gemini_audio', empresa_id]);
        let currentVoiceId = null;
        if (audioConfig[0]?.value) {
            try {
                const parsed = JSON.parse(audioConfig[0].value);
                currentVoiceId = parsed.voiceId || null;
            } catch (_) {}
        }

        res.json({
            success: true,
            type,
            freeOnly: filterFreeOnly,
            total: organizedVoices.length,
            voicesByGender,
            voices: organizedVoices,
            currentVoiceId
        });

    } catch (error) {
        console.error('Erro em elevenlabs-voices:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /config/elevenlabs-select-voice
 * Seleciona uma voz do ElevenLabs, adicionando à conta se necessário
 * Remove vozes antigas da comunidade para liberar espaço (limite de 3)
 */
router.post('/elevenlabs-select-voice', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { voiceId, voiceName, publicOwnerId } = req.body;

        if (!voiceId) {
            return res.status(400).json({
                success: false,
                error: 'voiceId é obrigatório'
            });
        }

        // Buscar API key do ElevenLabs
        const config = await dbQuery('SELECT value FROM Options WHERE type = ? AND empresa_id = ?', ['elevenlabs_key', empresa_id]);
        const apiKey = config[0]?.value;

        if (!apiKey) {
            return res.status(400).json({
                success: false,
                error: 'API Key do ElevenLabs não configurada'
            });
        }

        const https = require('https');

        // 1. Verificar se a voz já está na conta
        const myVoices = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.elevenlabs.io',
                port: 443,
                path: '/v1/voices',
                method: 'GET',
                headers: { 'xi-api-key': apiKey }
            };

            const req = https.request(options, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Erro ao parsear resposta'));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });

        const voiceExists = (myVoices.voices || []).find(v => v.voice_id === voiceId);

        if (voiceExists) {
            // Voz já está na conta, pode usar diretamente
            return res.json({
                success: true,
                message: 'Voz já está disponível na sua conta',
                voiceId,
                alreadyInAccount: true
            });
        }

        // 2. Se não tem publicOwnerId, não podemos adicionar (é uma voz premade ou precisa buscar)
        if (!publicOwnerId) {
            return res.status(400).json({
                success: false,
                error: 'Esta voz não pode ser adicionada. Selecione uma voz da comunidade ou use uma voz padrão.',
                voiceId
            });
        }

        // 3. Deletar vozes "professional" antigas para liberar espaço
        const professionalVoices = (myVoices.voices || []).filter(v => v.category === 'professional');
        console.log(`🗑️ Removendo ${professionalVoices.length} vozes professional antigas...`);

        for (const voice of professionalVoices) {
            try {
                await new Promise((resolve, reject) => {
                    const options = {
                        hostname: 'api.elevenlabs.io',
                        port: 443,
                        path: `/v1/voices/${voice.voice_id}`,
                        method: 'DELETE',
                        headers: { 'xi-api-key': apiKey }
                    };

                    const req = https.request(options, (response) => {
                        let data = '';
                        response.on('data', chunk => data += chunk);
                        response.on('end', () => {
                            console.log(`   ✅ Removida: ${voice.name}`);
                            resolve();
                        });
                    });

                    req.on('error', reject);
                    req.end();
                });
            } catch (err) {
                console.error(`   ❌ Erro ao remover ${voice.name}:`, err.message);
            }
        }

        // 4. Adicionar a nova voz da comunidade
        console.log(`➕ Adicionando voz: ${voiceName || voiceId}...`);

        const addResult = await new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                new_name: voiceName || 'Voz Selecionada'
            });

            const options = {
                hostname: 'api.elevenlabs.io',
                port: 443,
                path: `/v1/voices/add/${publicOwnerId}/${voiceId}`,
                method: 'POST',
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (response.statusCode !== 200) {
                            reject(new Error(parsed.detail?.message || `Erro ${response.statusCode}`));
                            return;
                        }
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error('Erro ao parsear resposta'));
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        console.log(`✅ Voz adicionada com sucesso!`);

        res.json({
            success: true,
            message: 'Voz adicionada à sua conta com sucesso',
            voiceId: addResult.voice_id || voiceId,
            removedVoices: professionalVoices.map(v => v.name),
            alreadyInAccount: false
        });

    } catch (error) {
        console.error('Erro em elevenlabs-select-voice:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;