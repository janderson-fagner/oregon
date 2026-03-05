const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const moment = require('moment');

//Moment locale pt-br
moment.locale('pt-br');

const { inserirAssinaturaDigitalDoc } = require('../utils/generatePDF');
const { getAgendamentos } = require('../utils/agendaUtils');

const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');

const caminho = path.join(__dirname, '../uploads/assinaturas-ordem-servico');

if (!fs.existsSync(caminho)) {
    fs.mkdirSync(caminho, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, caminho);
    },
    filename: function (req, file, cb) {
        cb(null, new Date().getTime() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

router.get('/:age_id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const age_id = req.params.age_id;

        if (!age_id) {
            return res.status(400).json({ message: 'Agendamento não encontrado' });
        }

        const agendamentos = await getAgendamentos('SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?', [age_id, empresa_id], empresa_id);

        if (agendamentos.length === 0) {
            return res.status(404).json({ message: 'Agendamento não encontrado' });
        }

        const agendamento = agendamentos[0];

        if (!agendamento.age_ordemServico || !agendamento.age_ordemServico.assinaturaData) {
            return res.status(404).json({ message: 'Ordem de serviço não encontrada' });
        }

        return res.status(200).json(agendamento);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao obter ordem de serviço' });
    }
});

router.post('/assinar/:age_id', upload.single('assinatura'), async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const age_id = req.params.age_id;

        if (!age_id) {
            return res.status(400).json({ message: 'Agendamento não encontrado' });
        }

        let { assinaturaCoordinates } = req.body;

        if (!assinaturaCoordinates) {
            return res.status(400).json({ message: "Assinatura inválida" });
        }

        assinaturaCoordinates = JSON.parse(assinaturaCoordinates);

        const agendamentos = await getAgendamentos('SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?', [age_id, empresa_id], empresa_id);

        if (agendamentos.length === 0) {
            return res.status(404).json({ message: 'Agendamento não encontrado' });
        }

        const agendamento = agendamentos[0];

        if (!agendamento.age_ordemServico || !agendamento.age_ordemServico.assinaturaData) {
            return res.status(404).json({ message: 'Ordem de serviço não encontrada' });
        }

        let ordemData = agendamento.age_ordemServico;

        const documentoAssinado = await inserirAssinaturaDigitalDoc({ ...ordemData, age_id: agendamento.age_id }, req.file.path, assinaturaCoordinates);

        if (!documentoAssinado) {
            return res.status(400).json({ message: "Erro ao assinar o documento." });
        }

        console.log('filePDFExist:', ordemData.assinaturaData.filePdf);
        ordemData.assinaturaData.filePdf = documentoAssinado;
        console.log('filePDFNew:', ordemData.assinaturaData.filePdf);


        ordemData.assinaturaData = {
            ...ordemData.assinaturaData,
            assinaturasDatas: [
                ...(ordemData.assinaturaData.assinaturasDatas || []),
                moment().format('DD/MM/YYYY HH:mm:ss')
            ]
        }

        console.log('Ordem de serviço assinada:', JSON.stringify(ordemData));

        await dbQuery('UPDATE AGENDAMENTO SET age_ordemServico = ? WHERE age_id = ? AND empresa_id = ?', [JSON.stringify(ordemData), agendamento.age_id, empresa_id]);

        return res.status(200).json({ message: 'Ordem de serviço assinada com sucesso' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao assinar ordem de serviço' });
    }
});

module.exports = router;