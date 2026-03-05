const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../database');

const dbQuery = require('../utils/dbHelper');

/**
 * Nomes de roles reservadas da empresa principal (id=1).
 * Outras empresas não podem criar/usar essas roles.
 */
const ROLES_RESERVADAS = ['admin', 'gerente'];

/**
 * Verifica se as permissões contêm manage all.
 * Somente empresa_id === 1 pode ter manage all.
 */
const contemManageAll = (permissions) => {
    if (!Array.isArray(permissions)) return false;
    return permissions.some(p => p.action === 'manage' && p.subject === 'all');
};

// ADD
router.post('/add-role', async (req, res) => {
    try {
        const { name, permissions } = req.body;
        const empresa_id = req.user.empresa_id;

        if (!name || !permissions) {
            return res.status(400).json({ message: 'O nome do setor e permissões são obrigatórios' });
        }

        // Bloqueia roles reservadas para outras empresas
        if (empresa_id !== 1 && ROLES_RESERVADAS.includes(name.toLowerCase())) {
            return res.status(403).json({ message: `A função "${name}" é reservada e não pode ser criada.` });
        }

        // Bloqueia manage all para outras empresas
        if (empresa_id !== 1 && contemManageAll(permissions)) {
            return res.status(403).json({ message: 'Permissão total (manage all) não é permitida para esta empresa.' });
        }

        const exists = await dbQuery('SELECT id FROM Roles WHERE role_name = ? AND empresa_id = ?', [name, empresa_id]);
        if (exists.length > 0) {
            return res.status(409).json({ message: 'Setor já cadastrado' });
        }

        const permissionsJSON = JSON.stringify(permissions);
        const result = await dbQuery('INSERT INTO Roles (role_name, role_ability, empresa_id) VALUES (?, ?, ?)', [name, permissionsJSON, empresa_id]);

        return res.status(201).json({ message: 'Setor criado com sucesso', id: result.insertId });
    } catch (error) {
        return res.status(500).json({ message: 'Erro no servidor', error });
    }
});


router.post('/edit-role', async (req, res) => {
    try {
        const { id, name, permissions } = req.body;
        const empresa_id = req.user.empresa_id;

        if (!id || !name || !permissions || permissions.length === 0) {
            return res.status(400).json({ message: 'O nome do setor e permissões são obrigatórios' });
        }

        const check = await dbQuery('SELECT * FROM Roles WHERE id = ?', [id]);
        if (check.length === 0) {
            return res.status(404).json({ message: 'Função não encontrada' });
        }

        if (check[0].role_name == 'admin') {
            return res.status(403).json({ message: 'A função admin não pode ser editada' });
        }

        // Bloqueia renomear para roles reservadas (outras empresas)
        if (empresa_id !== 1 && ROLES_RESERVADAS.includes(name.toLowerCase())) {
            return res.status(403).json({ message: `A função "${name}" é reservada e não pode ser usada.` });
        }

        // Bloqueia manage all para outras empresas
        if (empresa_id !== 1 && contemManageAll(permissions)) {
            return res.status(403).json({ message: 'Permissão total (manage all) não é permitida para esta empresa.' });
        }

        // Verifica que a role pertence à empresa do usuário (exceto empresa 1 que pode editar qualquer)
        if (empresa_id !== 1 && check[0].empresa_id !== empresa_id) {
            return res.status(403).json({ message: 'Você não tem permissão para editar esta função.' });
        }

        const nomeOriginal = check[0].role_name;

        console.log(nomeOriginal, name);
        if (nomeOriginal != name) {
            const exists = await dbQuery('SELECT id FROM Roles WHERE role_name = ? AND id != ? AND empresa_id = ?', [name, id, empresa_id]);
            if (exists.length > 0) {
                return res.status(409).json({ message: 'Já existe uma função com esse nome' });
            }

            let atualizarUsers = await dbQuery('UPDATE User SET role = ? WHERE role = ? AND empresa_id = ?', [name, nomeOriginal, empresa_id]);

            console.log('Usuários atualizados:', atualizarUsers.affectedRows);
        }

        let permissionsJSON = [];

        if (!permissions.some(p => p.action === 'read' && p.subject === 'all')) {
            permissions.push({ action: 'read', subject: 'all' });
        }

        permissionsJSON = JSON.stringify([...permissions, ...permissionsJSON]);

        const query = 'UPDATE Roles SET role_name = ?, role_ability = ? WHERE id = ?';
        await dbQuery(query, [name, permissionsJSON, id]);

        return res.status(200).json({ message: 'Função atualizada com sucesso' });
    } catch (error) {
        return res.status(500).json({ message: 'Ocorreu um erro ao atualizar a função!', error: error });
    }
});

// LIST (roles)
router.get('/list-role', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;

        // Empresa 1 vê todas as roles, outras empresas veem só as suas
        const rows = empresa_id === 1
            ? await dbQuery('SELECT id, role_name, role_ability, empresa_id FROM Roles', [])
            : await dbQuery('SELECT id, role_name, role_ability, empresa_id FROM Roles WHERE empresa_id = ?', [empresa_id]);

        const rolesFiltered = rows
            .map(r => {
                let parsed = [];
                try { parsed = JSON.parse(r.role_ability || '[]'); } catch (_) { parsed = []; }
                return { ...r, role_ability: parsed };
            });

        for (let role of rolesFiltered) {
            let countUsers = await dbQuery('SELECT COUNT(*) AS total FROM User WHERE role = ? AND empresa_id = ?', [role.role_name, empresa_id]);
            role.userCount = countUsers[0]?.total || 0;
        }

        return res.status(200).json({ results: rolesFiltered });
    } catch (error) {
        return res.status(500).json({ message: 'Erro no servidor', error });
    }
});

// LIST (users by role)
router.get('/list-role-users', async (req, res) => {
    try {
        const { role } = req.query;
        if (!role) {
            return res.status(400).json({ message: 'O nome do setor é obrigatório' });
        }

        const users = await dbQuery('SELECT * FROM User WHERE role = ?', [role]);
        return res.status(200).json({ results: users });
    } catch (error) {
        return res.status(500).json({ message: 'Erro no servidor', error });
    }
});

// DELETE
router.post('/delete-role', async (req, res) => {
    try {
        const { id } = req.body;
        const empresa_id = req.user.empresa_id;

        if (!id) {
            return res.status(400).json({ message: 'O ID do setor é obrigatório' });
        }

        // Verifica que a role pertence à empresa (exceto empresa 1)
        const check = await dbQuery('SELECT * FROM Roles WHERE id = ?', [id]);
        if (check.length === 0) {
            return res.status(404).json({ message: 'Setor não encontrado' });
        }

        if (empresa_id !== 1 && check[0].empresa_id !== empresa_id) {
            return res.status(403).json({ message: 'Você não tem permissão para excluir esta função.' });
        }

        // Não permite excluir role admin
        if (check[0].role_name === 'admin') {
            return res.status(403).json({ message: 'A função admin não pode ser excluída.' });
        }

        const result = await dbQuery('DELETE FROM Roles WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Setor não encontrado' });
        }

        return res.status(200).json({ message: 'Setor excluído com sucesso' });
    } catch (error) {
        return res.status(500).json({ message: 'Erro no servidor', error });
    }
});


module.exports = router;