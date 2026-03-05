const PDFDocument = require('pdfkit');
const path = require("path");
const fs = require('fs');
const PDFTable = require('pdfkit-table');
const { PDFDocument: PDFDocumentL, StandardFonts, rgb } = require('pdf-lib');
const moment = require('moment');

const outputPath = path.join(__dirname, '../files/certificados');
const outputPathRecibos = path.join(__dirname, '../files/recibos');
const outputPathRelatorios = path.join(__dirname, '../files/relatorios');
const outputPathOrdensServico = path.join(__dirname, '../files/ordens-servico');

const logoPath = path.join(__dirname, '../email-templates/images/logo.png');
const assinaturaPath = path.join(__dirname, '../email-templates/images/assinatura-david.png');

const bgCertificado = path.join(__dirname, '../email-templates/images/bg-certificado.png');
const montserratFont = path.join(__dirname, '../email-templates/fonts/Montserrat/Montserrat-Regular.ttf');
const montserratBoldFont = path.join(__dirname, '../email-templates/fonts/Montserrat/Montserrat-Bold.ttf');

//Helper para transformar o nome em cada primeira letra de palavra em maiuscula se tiver mais de 3 letras
const capitalizeName = (name) => {
    if (!name) return '';
    name = name.toLowerCase().trim();
    return name.split(' ').map(word => word.length > 3 ? word.charAt(0).toUpperCase() + word.slice(1) : word).join(' ');
}

const formatValor = (valor) => {
    if (!valor) return 'R$ 0,00'
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const dbQuery = require('./dbHelper');

/**
 * Busca os dados da empresa pelo empresa_id para uso nos PDFs
 * @param {number} empresa_id
 * @returns {Object} { nome, documento, telefone, email, endereco, numero, bairro, cidade, estado, cep, logo }
 */
async function getEmpresaData(empresa_id) {
    if (!empresa_id) return null;
    try {
        const rows = await dbQuery('SELECT * FROM Empresas WHERE id = ? AND deleted_at IS NULL', [empresa_id]);
        return rows.length > 0 ? rows[0] : null;
    } catch (e) {
        console.error('Erro ao buscar empresa para PDF:', e.message);
        return null;
    }
}

/**
 * Formata o documento (CPF/CNPJ) com máscara
 */
const formatDocumento = (doc) => {
    if (!doc) return '';
    const d = doc.replace(/\D/g, '');
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return doc;
}

/**
 * Monta o endereço completo da empresa
 */
const formatEnderecoEmpresa = (emp) => {
    if (!emp) return '';
    const parts = [];
    if (emp.endereco) parts.push(emp.endereco);
    if (emp.numero) parts.push(emp.numero);
    if (emp.bairro) parts.push(emp.bairro);
    let str = parts.join(', ');
    if (emp.cidade) str += ` - ${emp.cidade}`;
    if (emp.estado) str += `/${emp.estado}`;
    return str;
}

/**
 * Renderiza o header padrão "pequeno" (logo 80px) nos PDFs
 * Usado por: Recibo, RelatorioSaida, RelatorioReceber, RelatorioServicosTecnicos
 */
function renderHeaderPequeno(doc, emp) {
    if (emp?.logo) {
        try {
            const logoData = emp.logo.startsWith('data:') ? Buffer.from(emp.logo.split(',')[1], 'base64') : emp.logo;
            doc.image(logoData, 50, 50, { width: 80 });
        } catch (e) {
            if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 50, { width: 80 });
        }
    } else if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 50, { width: 80 });
    }

    doc.fontSize(14).text(emp?.nome || '', 150, 50);
    const docFormatado = formatDocumento(emp?.documento || emp?.cnpj || emp?.cpf || '');
    if (docFormatado) doc.fontSize(10).text(`CNPJ: ${docFormatado}`, 150, 69);
    if (emp?.telefone) doc.fontSize(10).text(`Contato: ${emp.telefone}`, 150, 84);
    if (emp?.email) doc.fontSize(10).text(`E-mail: ${emp.email}`, 150, 98);
}

/**
 * Renderiza o header padrão "grande" (logo 150px) nos PDFs
 * Usado por: RelatorioComissoes, OrdemServico, Orcamento
 */
function renderHeaderGrande(doc, emp) {
    if (emp?.logo) {
        try {
            const logoData = emp.logo.startsWith('data:') ? Buffer.from(emp.logo.split(',')[1], 'base64') : emp.logo;
            doc.image(logoData, 50, 0, { width: 150 });
        } catch (e) {
            if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 0, { width: 150 });
        }
    } else if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 0, { width: 150 });
    }

    const xHeader = 200;
    doc.fontSize(14).text(emp?.nome || '', xHeader, 40);
    const docFormatado = formatDocumento(emp?.documento || emp?.cnpj || emp?.cpf || '');
    if (docFormatado) doc.fontSize(10).text(`CNPJ: ${docFormatado}`, xHeader, 58);
    if (emp?.telefone) doc.fontSize(10).text(`Contato: ${emp.telefone}`, xHeader, 72);
    const endereco = formatEnderecoEmpresa(emp);
    if (endereco) doc.fontSize(10).text(`Endereço: ${endereco}`, xHeader, 86);
    if (emp?.email) doc.fontSize(10).text(`E-mail: ${emp.email}`, xHeader, 100);
}

/**
 * Renderiza o background do certificado programaticamente para empresas que não são Oregon.
 * Replica o layout visual do bg-certificado.png: bordas diagonais azuis, header com dados da empresa,
 * título "CERTIFICADO DE GARANTIA", marca d'água central e selo dourado.
 */
function _renderCertificadoBg(doc, emp) {
    const pageW = doc.page.width;   // 842 (A4 landscape)
    const pageH = doc.page.height;  // 595

    const corPrimaria = '#16375b';
    const corSecundaria = '#2a6496';
    const corClara = '#d6e4f0';

    // --- Bordas diagonais (canto superior-esquerdo e inferior-direito) ---
    // Superior esquerdo
    doc.save();
    doc.moveTo(0, 0).lineTo(140, 0).lineTo(0, 200).closePath().fill(corPrimaria);
    doc.moveTo(0, 0).lineTo(170, 0).lineTo(0, 240).closePath().fill(corSecundaria);
    doc.restore();

    // Inferior direito
    doc.save();
    doc.moveTo(pageW, pageH).lineTo(pageW - 140, pageH).lineTo(pageW, pageH - 200).closePath().fill(corPrimaria);
    doc.moveTo(pageW, pageH).lineTo(pageW - 170, pageH).lineTo(pageW, pageH - 240).closePath().fill(corSecundaria);
    doc.restore();

    // --- Borda retangular interna ---
    doc.save();
    doc.rect(25, 25, pageW - 50, pageH - 50).lineWidth(1.5).strokeColor(corPrimaria).stroke();
    doc.rect(30, 30, pageW - 60, pageH - 60).lineWidth(0.5).strokeColor(corClara).stroke();
    doc.restore();

    // --- Header: logo + dados da empresa ---
    const headerY = 45;
    let logoEndX = 50; // posição X após a logo

    if (emp?.logo) {
        try {
            const logoData = emp.logo.startsWith('data:') ? Buffer.from(emp.logo.split(',')[1], 'base64') : emp.logo;
            doc.image(logoData, 55, headerY, { height: 90 });
            logoEndX = 160;
        } catch (e) {
            // Se falhar a logo, segue sem ela
        }
    }

    // Dados da empresa ao lado da logo
    const infoX = logoEndX + 15;
    doc.font(montserratBoldFont).fontSize(14).fillColor(corPrimaria);
    doc.text((emp?.razao_social || emp?.nome || '').toUpperCase(), infoX, headerY + 5);

    doc.font(montserratFont).fontSize(11).fillColor('#333');
    const docFormatado = formatDocumento(emp?.documento || emp?.cnpj || emp?.cpf || '');
    if (docFormatado) {
        const tipoDoc = (emp?.documento || emp?.cnpj || '').replace(/\D/g, '').length === 14 ? 'CNPJ' : 'CPF';
        doc.text(`${tipoDoc}: ${docFormatado}`, infoX, doc.y + 2);
    }
    const enderecoEmp = formatEnderecoEmpresa(emp);
    if (enderecoEmp) doc.text(`ENDEREÇO: ${enderecoEmp.toUpperCase()}`, infoX, doc.y + 1);
    if (emp?.telefone) doc.text(`FONE: ${emp.telefone}`, infoX, doc.y + 1);

    // --- Título "CERTIFICADO DE GARANTIA" ---
    doc.font(montserratBoldFont).fontSize(28).fillColor(corPrimaria);
    doc.text('CERTIFICADO DE GARANTIA', 0, 160, { align: 'center', width: pageW });

    // --- Marca d'água central (nome da empresa em grande, semi-transparente) ---
    doc.save();
    doc.opacity(0.06);
    doc.font(montserratBoldFont).fontSize(60).fillColor(corSecundaria);
    doc.text((emp?.nome || '').toUpperCase(), 0, 220, { align: 'center', width: pageW });
    doc.restore();

    // Posicionar o cursor Y para o conteúdo do texto do certificado
    doc.y = 280;
}

async function createCertificate(data) {
    try {
        console.log('Criando certificado: ', data);
        // Buscar dados da empresa se não vieram no data
        if (!data.empresa && data.empresa_id) data.empresa = await getEmpresaData(data.empresa_id);
        // Certifique-se de que o diretório de saída existe
        const certDir = path.join(outputPath, data.age_id.toString());
        if (!fs.existsSync(certDir)) {
            fs.mkdirSync(certDir, { recursive: true });
        }

        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margins: {
                top: 270,
                bottom: 20,
                left: 20,
                right: 20
            }
        });

        // Pipe the PDF into a writable stream
        const filePath = path.join(certDir, `Certificado ${data.name}.pdf`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        const isOregon = data.empresa_id == 1;

        if (isOregon) {
            // Empresa Oregon: usa background fixo com dados da empresa embutidos
            doc.image(bgCertificado, 0, 0, { width: doc.page.width });
        } else {
            // Outras empresas: gera certificado programaticamente
            _renderCertificadoBg(doc, data.empresa);
        }

        let isCPF = data.cpf && data.cpf.includes('/') ? 'CNPJ' : 'CPF';

        const margin = 100;
        const width = doc.page.width - margin * 2;

        doc
            .font(montserratFont)
            .fontSize(14)
            .fillColor('#16375b')
            .text('Certificamos que ', margin, doc.y, { width, continued: true })
            .font(montserratBoldFont).text(capitalizeName(data.name), { continued: true })
            .font(montserratFont).text(
                `${data.cpf ? `, portadora do ${isCPF}: ${data.cpf}` : ''}, localizada(o) na ${data.endereco
                }, realizou os serviços de `,
                { width, continued: true }
            )
            .font(montserratBoldFont).text(
                `${data.services.join(', ')}`,
                { width, continued: true }
            )
            .font(montserratFont).text('.', { width });

        if (data.dataAplicacao || data.dataGarantia) {
            doc
                .moveDown(2)
                .font(montserratFont)
                .fillColor('#16375b')
            if (data.dataAplicacao) {
                doc.text(
                    `${data.dataAplicacao ? 'Aplicação: ' + data.dataAplicacao : ''}`,
                    0, doc.y, { align: 'center' })
            }

            if (data.dataGarantia) {
                doc.text(
                    `${data.dataGarantia ? 'Validade: ' + data.dataGarantia : ''}`,
                    0, doc.y, { align: 'center' })
            }
            doc.moveDown(.2)
        }

        doc.moveDown(2);

        // Footer com cidade e data
        doc
            .fontSize(15)
            .font(montserratFont)
            .text(`${data.empresa?.cidade || ''}, ${data.date}`, 0, 410, { align: 'center' });


        // Finalize the PDF and end the stream
        doc.end();

        // Aguardar o término da gravação do stream
        await new Promise(resolve => writeStream.on('finish', resolve));

        console.log('Certificado criado com sucesso!', filePath);
        return {
            filePath,
            fileName: `Certificado ${data.name}.pdf`
        };
    } catch (error) {
        throw new Error(`Erro ao gerar o certificado: ${error}`);
    }
}

async function createRecibo(data) {
    try {
        console.log('Criando recibo: ', data);
        if (!data.empresa && data.empresa_id) data.empresa = await getEmpresaData(data.empresa_id);

        // Certifique-se de que o diretório de saída existe
        const certDir = path.join(outputPathRecibos, data.age_id.toString());
        if (!fs.existsSync(certDir)) {
            fs.mkdirSync(certDir, { recursive: true });
        }

        const doc = new PDFDocument({
            size: 'A4',
            margins: {
                top: 50,
                bottom: 50,
                left: 50,
                right: 50
            }
        });

        // Pipe the PDF into a writable stream
        const filePath = path.join(certDir, `Recibo ${data.name} - ${data.age_id}.pdf`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // Add the header com dados da empresa
        renderHeaderPequeno(doc, data.empresa);

        doc.moveDown();

        // Add a line
        doc.moveTo(50, 120)
            .lineTo(550, 120)
            .stroke();

        doc.moveDown(4);

        // Add the title
        doc
            .fontSize(16)
            .text('Recibo', 50, doc.y, { align: 'center', underline: true })
            .moveDown();

        // Add the body text
        doc
            .fontSize(12)
            .text(`Recebemos de `, 50, doc.y, { continued: true, width: 480, })
            .font('Helvetica-Bold')
            .text(`${data.name.toUpperCase()} ${data.cpf ? '- CPF:' + data.cpf : ''}`, { continued: true, width: 480 })
            .font('Helvetica')
            .text(`, Endereço: `, { continued: true, width: 480 })
            .font('Helvetica-Bold')
            .text(`${data.endereco.toUpperCase()}`, { width: 480 })
            .moveDown(1);

        doc
            .fontSize(12)
            .text(`O valor de `, 50, doc.y, { continued: true, width: 480 })
            .font('Helvetica-Bold')
            .text(`${data.valor} (${data.valorExtenso})`, { continued: true, width: 480 })
            .font('Helvetica')
            .text(` referente ${data.quantityServices == 1 ? 'ao serviço' : 'aos serviços'} de: `, { continued: true, width: 480 })
            .font('Helvetica-Bold')
            .text(`${data.services.join(', ')}`, { continued: true, width: 480 })
            .font('Helvetica')
            .text(`, ${data.quantityServices == 1 ? 'realizado' : 'realizados'} na data de `, { continued: true, width: 480 })
            .font('Helvetica-Bold')
            .text(`${data.date.toUpperCase()}. `, { continued: true, width: 480 })
            .moveDown(8);

        // Add the signature
        doc
            .image(assinaturaPath, 400, doc.y, { width: 135 });


        // Add the footer
        doc
            .moveDown(3)
            .fontSize(12)
            .text(`${data.empresa?.cidade || ''}, ${data.dataRecibo}`, doc.x - 10, doc.y, { align: 'right', lineBreak: false });

        // Finalize the PDF and end the stream
        doc.end();

        // Aguardar o término da gravação do stream
        await new Promise(resolve => writeStream.on('finish', resolve));

        console.log('Recibo criado com sucesso!', filePath);
        return {
            filePath,
            fileName: `Recibo ${data.name} - ${data.age_id}.pdf`
        };
    } catch (error) {
        throw new Error(`Erro ao gerar o recibo: ${error}`);
    }
}

async function createRelatorioSaida(data) {
    try {
        console.log('Criando relatório de saída: ', data);
        if (!data.empresa && data.empresa_id) data.empresa = await getEmpresaData(data.empresa_id);

        // Certifique-se de que o diretório de saída existe
        const certDir = path.join(outputPathRelatorios);
        if (!fs.existsSync(certDir)) {
            fs.mkdirSync(certDir, { recursive: true });
        }

        const doc = new PDFTable({
            size: 'A4',
            margins: {
                top: 50,
                bottom: 50,
                left: 50,
                right: 50
            }
        });

        // Data no formato dd-mm-aaaa
        const dataAtual = new Date();
        const dataFormatada = `${dataAtual.getDate()}-${dataAtual.getMonth() + 1}-${dataAtual.getFullYear()}`;

        // Pipe the PDF into a writable stream
        const filePath = path.join(certDir, `Relatório de saídas - ${dataFormatada}.pdf`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // Add the header com dados da empresa
        renderHeaderPequeno(doc, data.empresa);

        doc.moveDown();

        // Add a line
        doc.moveTo(50, 120)
            .lineTo(550, 120)
            .stroke();

        doc.moveDown(4);

        // Add the title
        doc
            .fontSize(13)
            .text(`Relatório de saídas ${data.mesText}`, 50, doc.y, { align: 'center', underline: true })
            .moveDown();

        // Define the table
        const table = {
            headers: [
                { label: 'DESCRIÇÃO', width: 180 },
                { label: 'DATA', width: 70 },
                { label: 'VALOR', width: 60 },
                { label: 'FORMA DE PGT.', width: 100 },
                { label: 'LANÇADA POR', width: 90 },
            ],
            rows: data.saidas.map(saida => [
                saida.sai_descricao,
                new Date(saida.sai_data).toLocaleDateString('pt-BR'),
                `R$ ${saida.sai_valor.toFixed(2).replace('.', ',')}`,
                saida.sai_fpt,
                saida.sai_user_name
            ])
        };

        // Add the table to the document
        doc.table(table, {
            x: 0,
            y: doc.y,
            padding: 5,
            columnSpacing: 5,
            minRowHeight: 20,
            prepareHeader: () => doc.fontSize(8).font("Helvetica-Bold"),
            prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
                doc.fontSize(10);
                doc.fillColor('#000000');
                doc.font("Helvetica");

                //Se a coluna for par, pinta de cinza
                if (indexRow % 2 === 0) {
                    doc.fillColor('#000000');
                    doc.addBackground(rectCell, '#f3f3f3', 1);
                }

            }
        });

        doc
            .moveDown(1)
            .fontSize(10)
            .font("Helvetica")
            .text(`Quantidade de saídas:`, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(`${data.totalSaidas}`);

        doc
            .moveDown(0.3)
            .fontSize(10)
            .font("Helvetica")
            .text(`Valor total de saidas: `, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(`R$ ${data.valorTotalSaidas.toFixed(2).replace('.', ',')}`, { continued: true });

        // Add the footer
        doc
            .moveDown(3)
            .fontSize(10)
            .font("Helvetica")
            .text(`Gerado em ${data.dataRelatorio}`, doc.x + 10, doc.y, { align: 'left', lineBreak: false });

        // Finalize the PDF and end the stream
        doc.end();

        // Aguardar o término da gravação do stream
        await new Promise(resolve => writeStream.on('finish', resolve));

        console.log('Relatório criado com sucesso!', filePath);
        return {
            filePath,
            fileName: `Relatório de saídas - ${dataFormatada}.pdf`
        };
    } catch (error) {
        throw new Error(`Erro ao gerar o Relatório: ${error}`);
    }
}

async function createRelatorioReceber(data) {
    try {
        console.log('Criando relatório de recebimento: ', data);
        if (!data.empresa && data.empresa_id) data.empresa = await getEmpresaData(data.empresa_id);

        // Certifique-se de que o diretório de saída existe
        const certDir = path.join(outputPathRelatorios);
        if (!fs.existsSync(certDir)) {
            fs.mkdirSync(certDir, { recursive: true });
        }

        const doc = new PDFTable({
            size: 'A4',
            margins: {
                top: 50,
                bottom: 50,
                left: 50,
                right: 50
            }
        });

        // Data no formato dd-mm-aaaa
        const dataAtual = new Date();
        const dataFormatada = `${dataAtual.getDate()}-${dataAtual.getMonth() + 1}-${dataAtual.getFullYear()}`;

        // Pipe the PDF into a writable stream
        const filePath = path.join(certDir, `Relatório de recebimentos - ${dataFormatada}.pdf`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // Add the header com dados da empresa
        renderHeaderPequeno(doc, data.empresa);

        doc.moveDown();

        // Add a line
        doc.moveTo(50, 120)
            .lineTo(550, 120)
            .stroke();

        doc.moveDown(4);

        // Add the title
        doc
            .fontSize(13)
            .text(`Relatório de recebimentos ${data.mesText}`, 50, doc.y, { align: 'center', underline: true })
            .moveDown();

        // Define the table
        const table = {
            headers: [
                { label: 'CLIENTE', width: 180 },
                { label: 'DATA AGENDA.', width: 72 },
                { label: 'VALOR', width: 60 },
                { label: 'FORMA DE PGT.', width: 100 },
                { label: 'DATA PGTO.', width: 70 },
            ],
            rows: data.recebimentos.map(receber => [
                receber.cliente,
                new Date(receber.age_data).toLocaleDateString('pt-BR'),
                `R$ ${receber.pgt_valor.toFixed(2).replace('.', ',')}`,
                receber.fpg_name,
                receber.pgt_data ? new Date(receber.pgt_data).toLocaleDateString('pt-BR') : 'Não Pago'
            ])
        };

        // Add the table to the document
        doc.table(table, {
            x: 0,
            y: doc.y,
            padding: 5,
            columnSpacing: 5,
            minRowHeight: 20,
            prepareHeader: () => doc.fontSize(8).font("Helvetica-Bold"),
            prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
                doc.fontSize(10);
                doc.fillColor('#000000');
                doc.font("Helvetica");

                //Se a coluna for impar, pinta de cinza
                if (indexRow % 2 === 0) {
                    doc.fillColor('#000000');
                    doc.addBackground(rectCell, '#f3f3f3', 1);
                }

                //console.log('row', rectCell)

                //Adicionar somente no rectCell que o width seja igual a 70
                let rectCellDataPgto = { x: 460, y: rectCell.y, width: 70, height: rectCell.height };

                if (rectCellDataPgto) {
                    if (row[4] === 'Não Pago') {
                        doc.addBackground(rectCellDataPgto, '#fca2a2', 1);
                    } else {
                        doc.addBackground(rectCellDataPgto, '#befca2', 1);
                    }
                }

            }
        });

        doc
            .moveDown(1)
            .fontSize(10)
            .font("Helvetica")
            .text(`Quantidade de recebimentos:`, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(`${data.totalRecebimentos}`);

        doc
            .moveDown(0.3)
            .fontSize(10)
            .font("Helvetica")
            .text(`Valor total de recebimentos: `, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(`R$ ${data.valorTotalRecebimentos.toFixed(2).replace('.', ',')}`);

        doc
            .moveDown(0.3)
            .fontSize(10)
            .fillColor('red')
            .font("Helvetica")
            .text(`Valor total (Não Pagos): `, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(`R$ ${data.valorTotalNaoPago.toFixed(2).replace('.', ',')}`);

        doc
            .moveDown(0.3)
            .fontSize(10)
            .fillColor('green')
            .font("Helvetica")
            .text(`Valor total (Pagos): `, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(`R$ ${data.valorTotalPago.toFixed(2).replace('.', ',')}`);

        // Add the footer
        doc
            .moveDown(3)
            .fontSize(10)
            .font("Helvetica")
            .fillColor('black')
            .text(`Gerado em ${data.dataRelatorio}`, doc.x, doc.y, { width: 500, align: 'center', lineBreak: false });

        // Finalize the PDF and end the stream
        doc.end();

        // Aguardar o término da gravação do stream
        await new Promise(resolve => writeStream.on('finish', resolve));

        console.log('Relatório criado com sucesso!', filePath);
        return {
            filePath,
            fileName: `Relatório de recebimentos - ${dataFormatada}.pdf`
        };
    } catch (error) {
        throw new Error(`Erro ao gerar o Relatório: ${error}`);
    }
}

async function createRelatorioComissoes(data) {
    try {
        console.log('Criando relatório de comissões: ', data);
        if (!data.empresa && data.empresa_id) data.empresa = await getEmpresaData(data.empresa_id);

        // Certifique-se de que o diretório de saída existe
        const certDir = path.join(outputPathRelatorios);
        if (!fs.existsSync(certDir)) {
            fs.mkdirSync(certDir, { recursive: true });
        }

        const doc = new PDFTable({
            size: 'A4',
            margins: {
                top: 50,
                bottom: 50,
                left: 50,
                right: 50
            }
        });

        // Data no formato dd-mm-aaaa
        const dataAtual = new Date();
        const dataFormatada = `${dataAtual.getDate()}-${dataAtual.getMonth() + 1}-${dataAtual.getFullYear()}`;

        // Pipe the PDF into a writable stream
        const filePath = path.join(certDir, `Relatório de comissões - ${data.funcionario} - ${dataFormatada}.pdf`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // Add the header com dados da empresa
        renderHeaderGrande(doc, data.empresa);

        doc.moveDown(2);

        // Add the title
        doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .text(`Relatório de Comissões - ${data.funcionario}`, 50, doc.y, { align: 'center' })
            .font('Helvetica')
            .fontSize(10)
            .text(` ${data.mesText}`, { align: 'center' })
            .moveDown(2);

        // Define the table
        const table = {
            headers: [
                { label: 'AGENDAMENTO', width: 160 },
                { label: 'SERVIÇOS', width: 180 },
                { label: 'VLR. AGE.', width: 60 },
                { label: 'VLR. COM.', width: 60 },
                { label: 'STATUS', width: 60 },
            ],
            rows: data.comissoes.map(comissao => [
                `N° #${comissao.age_id} - ${moment(comissao.age_data).format('DD/MM/YYYY')}\nCliente: ${comissao.cli_nome}`,
                comissao.servicos.map(s => `${s.ser_quantity || 1}x ${s.ser_nome}`).join(', ') || 'N/A',
                formatValor(comissao.age_valor),
                formatValor(comissao.com_valor),
                comissao.com_paga ? 'Pago' : 'Pendente'
            ])
        };

        // Add the table to the document
        doc.table(table, {
            x: 50,
            y: doc.y,
            padding: 5,
            columnSpacing: 5,
            minRowHeight: 25,
            prepareHeader: () => doc.fontSize(8).font("Helvetica-Bold"),
            prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
                doc.fontSize(9);
                doc.fillColor('#000000');
                doc.font("Helvetica");

                //Se a coluna for impar, pinta de cinza
                if (indexRow % 2 === 0) {
                    doc.fillColor('#000000');
                    doc.addBackground(rectCell, '#f3f3f3', 1);
                }

                // Destacar status da comissão
                if (indexColumn === 4) {
                    if (row[4] === 'Pago') {
                        doc.addBackground(rectCell, '#befca2', 1);
                    } else {
                        doc.addBackground(rectCell, '#fca2a2', 1);
                    }
                }
            }
        });

        doc
            .moveDown(1)
            .fontSize(10)
            .font("Helvetica")
            .text(`Quantidade de comissões:`, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(` ${data.totalComissoes}`);

        doc
            .moveDown(0.3)
            .fontSize(10)
            .font("Helvetica")
            .text(`Valor total de comissões: `, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(`${formatValor(data.valorTotalComissoes)}`);

        doc
            .moveDown(0.3)
            .fontSize(10)
            .fillColor('red')
            .font("Helvetica")
            .text(`Valor total (Não Pagos): `, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(`${formatValor(data.valorTotalNaoPago)}`);

        doc
            .moveDown(0.3)
            .fontSize(10)
            .fillColor('green')
            .font("Helvetica")
            .text(`Valor total (Pagos): `, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(`${formatValor(data.valorTotalPago)}`);

        // Add the footer
        doc
            .moveDown(3)
            .fontSize(10)
            .font("Helvetica")
            .fillColor('black')
            .text(`Gerado em ${data.dataRelatorio}`, doc.x, doc.y, { width: 500, align: 'center', lineBreak: false });

        // Finalize the PDF and end the stream
        doc.end();

        // Aguardar o término da gravação do stream
        await new Promise(resolve => writeStream.on('finish', resolve));

        console.log('Relatório criado com sucesso!', filePath);
        return {
            filePath,
            fileName: `Relatório de comissões - ${data.funcionario} - ${dataFormatada}.pdf`
        };
    } catch (error) {
        throw new Error(`Erro ao gerar o Relatório: ${error}`);
    }
}

async function createRelatorioServicosTecnicos(data) {
    try {
        console.log('Criando relatório de serviços por técnico: ', data);
        if (!data.empresa && data.empresa_id) data.empresa = await getEmpresaData(data.empresa_id);

        // Certifique-se de que o diretório de saída existe
        const certDir = path.join(outputPathRelatorios);
        if (!fs.existsSync(certDir)) {
            fs.mkdirSync(certDir, { recursive: true });
        }

        const doc = new PDFTable({
            size: 'A4',
            margins: {
                top: 50,
                bottom: 50,
                left: 50,
                right: 50
            }
        });

        // Data no formato dd-mm-aaaa
        const dataAtual = new Date();
        const dataFormatada = `${dataAtual.getDate()}-${dataAtual.getMonth() + 1}-${dataAtual.getFullYear()}`;

        // Pipe the PDF into a writable stream
        const filePath = path.join(certDir, `Relatório de Serviços por Técnico - ${data.tecnico} - ${dataFormatada}.pdf`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // Add the header com dados da empresa
        renderHeaderPequeno(doc, data.empresa);

        doc.moveDown();

        // Add a line
        doc.moveTo(50, 120)
            .lineTo(550, 120)
            .stroke();

        doc.moveDown(4);

        // Add the title
        doc
            .fontSize(13)
            .text(`Relatório de serviços do Técnico ${data.tecnico}`, 50, doc.y, { align: 'center', underline: true })
            .font('Helvetica')
            .fontSize(10)
            .text(` ${data.mesText}`, { align: 'center' })
            .moveDown(2);

        // Define the table
        const table = {
            headers: [
                { label: 'AGENDAMENTO', width: 200 },
                { label: 'SERVIÇOS', width: 150 },
                { label: 'VALOR DO AGEND.', width: 75 },
                { label: 'DATA DO AGEND.', width: 75 }
            ],
            rows: data.agendamentos.map(agendamento => [
                'Cliente: ' + agendamento.cliente[0]?.cli_nome + '\n' +
                'Endereço: ' + agendamento.endereco[0]?.end_logradouro + ', ' +
                agendamento.endereco[0]?.end_numero + ' - ' + agendamento.endereco[0]?.end_bairro + ' - ' +
                agendamento.endereco[0]?.end_cidade + '/' + agendamento.endereco[0]?.end_estado,

                agendamento.servicos.map(servico => servico.ser_nome + ' - ' + servico.ser_descricao + ' - ' + formatValor(servico.ser_valor)).join('\n'),
                formatValor(agendamento.age_valor),
                new Date(agendamento.age_data).toLocaleDateString('pt-BR')
            ])
        };

        // Add the table to the document
        doc.table(table, {
            x: 50,
            y: doc.y,
            padding: 5,
            columnSpacing: 5,
            minRowHeight: 52,
            prepareHeader: () => doc.fontSize(8).font("Helvetica-Bold"),
            prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
                doc.fontSize(10);
                doc.fillColor('#000000');
                doc.font("Helvetica");

                //Se a coluna for impar, pinta de cinza
                if (indexRow % 2 === 0) {
                    doc.fillColor('#000000');
                    doc.addBackground(rectCell, '#f3f3f3', 1);
                }
            }
        });

        doc
            .moveDown(1)
            .fontSize(10)
            .font("Helvetica")
            .text(`Quantidade de serviços atendidos:`, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(`${data.totalServicosAtendidos}`);

        doc
            .moveDown(0.3)
            .fontSize(10)
            .font("Helvetica")
            .text(`Valor total de serviços atendidos: `, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(`${formatValor(data.valorTotalServicosAtendidos)}`);

        doc
            .moveDown(0.3)
            .fontSize(10)
            .font("Helvetica")
            .text(`Valor total Agendamentos: `, 50, doc.y, { continued: true })
            .font("Helvetica-Bold")
            .text(`${formatValor(data.valorTotalAgendamentos)}`);

        // Add the footer
        doc
            .moveDown(3)
            .fontSize(10)
            .font("Helvetica")
            .fillColor('black')
            .text(`Gerado em ${data.dataRelatorio}`, doc.x, doc.y, { width: 500, align: 'center', lineBreak: false });

        // Finalize the PDF and end the stream
        doc.end();

        // Aguardar o término da gravação do stream
        await new Promise(resolve => writeStream.on('finish', resolve));

        console.log('Relatório criado com sucesso!', filePath);
        return {
            filePath,
            fileName: `Relatório de Serviços por Técnico - ${data.tecnico} - ${dataFormatada}.pdf`
        };
    } catch (error) {
        throw new Error(`Erro ao gerar o Relatório: ${error}`);
    }
}

async function createOrdemServico(data) {
    try {
        if(!data || !data.age_id) throw new Error('Dados inválidos');
        if (!data.empresa && data.empresa_id) data.empresa = await getEmpresaData(data.empresa_id);

        console.log('Criando ordem de serviço: ', data);

        // Certifique-se de que o diretório de saída existe
        const certDir = path.join(outputPathOrdensServico, data.age_id.toString());
        if (!fs.existsSync(certDir)) {
            fs.mkdirSync(certDir, { recursive: true });
        }

        const doc = new PDFTable({
            size: 'A4',
            margins: {
                top: 50,
                bottom: 50,
                left: 50,
                right: 50
            }
        });

        const filePath = path.join(certDir, `Ordem de Serviço - ${data.age_id}.pdf`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // Add the header com dados da empresa
        renderHeaderGrande(doc, data.empresa);

        doc.moveDown(2);

        doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .text('Ordem de Serviço', 0, doc.y, { align: 'center' })
        .font('Helvetica')
        .fontSize(11);

        doc.moveDown(2);

        //_ linha inteira até o final da página
        let vazio = '                   ';

        let texts = [
            /* `Cliente: ${data.cliente}`,
            'Endereço da Aplicação', */
            {
                title: 'Cliente:',
                value: data?.cliente || vazio
            },
            {
                title: 'Endereço da aplicação:',
                value: data?.endereco || vazio
            },
            {
                title: 'Data de execução:',
                value: data?.dataExecucao || vazio
            },
            {
                title: 'Data de validade do serviço:',
                value: data?.dataValidade || vazio
            },
            {
                title: 'Pragas alvo:',
                value: data?.pragasAlvo || vazio
            },
            {
                title: 'Prazo de assistência técnica por serviço:',
                value: data?.prazoAssistencia || vazio,
                jump: true
            },
            {
                title: 'Nome e concentração do(s) produto(s):',
                value: data?.nomeConcentracao || vazio
            },
            {
                title: 'Grupo(s) químico(s) do(s) produto(s):',
                value: data?.gruposQuimicos || vazio
            },
            {
                title: 'Principio ativo do(s) produto(s):',
                value: data?.principioAtivos || vazio,
                jump: true
            },
            {
                title: 'Orientações:',
                value: data?.orientacoes || vazio
            },
            {
                title: 'Funcionário(s):',
                value: data?.funcionarios && Array.isArray(data?.funcionarios) ? 
                data?.funcionarios.map(funcionario => funcionario.fullName).join(', ') : vazio
            },
            {
                title: 'Observações:',
                value: data?.obs || vazio
            },
        ];

        doc
        .lineGap(1)
        .font('Helvetica')
        .text('Licença Sanitária:', 50, doc.y, { align: 'left', continued: true })
        .text(data.licensaSanitaria?.text || vazio, doc.x + 3, doc.y, { align: 'left', underline: true, continued: true })
        .text('Validade:', doc.x + 6, doc.y, { align: 'left', underline: false, continued: true })
        .text(data.licensaSanitaria?.validade || vazio, doc.x + 3, doc.y, { align: 'left', underline: true });

        doc
        .moveDown(.4)
        .text('Licença Ambiental:', 50, doc.y, { align: 'left', continued: true })
        .text(data.licensaAmbiental?.text || vazio, doc.x + 3, doc.y, { align: 'left', underline: true, continued: true })
        .text('Validade:', doc.x + 6, doc.y, { align: 'left', underline: false, continued: true })
        .text(data.licensaAmbiental?.validade || vazio, doc.x + 3, doc.y, { align: 'left', underline: true });

        doc.moveDown(1);

        for(let i = 0; i < texts.length; i++) {
            let lineY = doc.y + 5;

            doc
            .text(texts[i].title, 50, lineY, { align: 'left', continued: true })
            .text(texts[i].value, doc.x + 3, lineY, { align: 'left', underline: true });

            if(texts[i].jump) {
                doc.moveDown(1);
            }

        }

        doc.moveDown(4);

        //Asinatura
        let yAssinatura = doc.y;
        
        doc
        .text('________________________________', 70, yAssinatura)
        .text('Assinatura do Cliente', 115, doc.y + 4);

        doc
        .text('________________________________', 300, yAssinatura)
        .text('Assinatura do Técnico', 335, doc.y + 4);

        // Finalize the PDF and end the stream
        doc.end();

        // Aguardar o término da gravação do stream
        await new Promise(resolve => writeStream.on('finish', resolve));

        console.log('Ordem de serviço criada com sucesso!', filePath);
        return {
            filePath,
            fileName: `Ordem de Serviço - ${data.age_id}.pdf`
        };
    } catch (error) {
        throw new Error(`Erro ao gerar a ordem de serviço: ${error}`);
    }
}

async function inserirAssinaturaDigitalDoc(dados, pathAssinatura, coordsRaw) {
    try {
        if (!dados || !pathAssinatura || !coordsRaw) {
            console.error('Dados, caminho da assinatura ou coordenadas não fornecidos.');
            return false;
        }
        // 1) parse das coordenadas
        const { page, xNorm, yNorm, wNorm, hNorm } =
            typeof coordsRaw === "string" ? JSON.parse(coordsRaw) : coordsRaw;

        // 2) carrega o PDF
        const pathDoc = dados.assinaturaData?.filePdf?.filePath;

        console.log('Caminho do documento:', dados.assinaturaData);
        if (!pathDoc) {
            console.error('Caminho do documento não encontrado.');
            return false;
        }
        const basePath = path.dirname(pathDoc);

        const existingPdfBytes = fs.readFileSync(pathDoc);
        const pdfDoc = await PDFDocumentL.load(existingPdfBytes);
        const pdfPage = pdfDoc.getPages()[page - 1];

        // 3) dimensões em pontos
        const pdfW = pdfPage.getWidth();
        const pdfH = pdfPage.getHeight();

        // 4) converte frações para pontos e inverte Y
        const xPdf = xNorm * pdfW;
        const widthPdf = wNorm * pdfW;
        const heightPdf = hNorm * pdfH;
        const yPdf = pdfH - (yNorm + hNorm) * pdfH;

        // 5) lê PNG já recortado e embeda
        const pngBase64 = fs.readFileSync(pathAssinatura, { encoding: "base64" });
        const pngImage = await pdfDoc.embedPng(pngBase64);

        // 6) desenha na página
        pdfPage.drawImage(pngImage, {
            x: xPdf,
            y: yPdf,
            width: widthPdf,
            height: heightPdf,
        });

        // 7) salva de volta
        const modifiedPdfBytes = await pdfDoc.save();

        let fileName = path.basename(pathDoc);
        let fileExt = path.extname(pathDoc);

        let fileNameWithoutExt = path.basename(pathDoc, fileExt);
        
        if (fileNameWithoutExt.includes('_assinado')) {
            let parts = fileNameWithoutExt.split('_assinado');
            fileNameWithoutExt = parts[0];
        }

        let newFileName = `${fileNameWithoutExt}_assinado_${new Date().getTime()}${fileExt}`;
        let newFile = path.join(basePath, newFileName);

        if (!fs.existsSync(basePath)) {
            fs.mkdirSync(basePath, { recursive: true });
        }

        // 5) Salva o PDF assinado
        fs.writeFileSync(newFile, modifiedPdfBytes);

        console.log('Assinatura digital inserida com sucesso no documento:', newFileName);

        return {
            fileName: newFileName,
            filePath: newFile,
            url: `/download/docs/ordens-servico/${dados.age_id}/${newFileName}`
        }
    } catch (error) {
        console.error('Erro ao inserir assinatura digital:', error);
        return false;
    }
}


/**
 * Gera PDF de orçamento da calculadora de precificação
 * @param {Object} data - Dados do orçamento
 * @returns {Object} { filePath, fileName }
 */
/**
 * Substitui variáveis de template no texto HTML do orçamento
 * Ex: {{cliente_nome}}, {{valor_total}}, {{data_hoje}}
 */
function substituirVariaveisTemplate(texto, data) {
    if (!texto) return '';
    return texto
        .replace(/\{\{cliente_nome\}\}/g, data.cliente_nome || '')
        .replace(/\{\{cliente_telefone\}\}/g, data.cliente_telefone || '')
        .replace(/\{\{cliente_endereco\}\}/g, data.cliente_endereco || '')
        .replace(/\{\{valor_total\}\}/g, formatValor(data.valor_final || 0))
        .replace(/\{\{valor_original\}\}/g, formatValor(data.valor_original || data.valor_final || 0))
        .replace(/\{\{desconto\}\}/g, data.desconto ? `${data.desconto}${data.desconto_tipo === 'percentual' ? '%' : ''}` : '0')
        .replace(/\{\{data_hoje\}\}/g, moment().format('DD/MM/YYYY'))
        .replace(/\{\{validade_dias\}\}/g, String(data.validade_dias || 30))
        .replace(/\{\{orcamento_id\}\}/g, String(data.id || ''));
}

/**
 * Converte HTML simples para texto formatado para PDFKit
 */
function htmlParaTexto(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li>/gi, '  - ')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<h[1-6][^>]*>/gi, '')
        .replace(/<strong>/gi, '')
        .replace(/<\/strong>/gi, '')
        .replace(/<em>/gi, '')
        .replace(/<\/em>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function createOrcamento(data) {
    try {
        if (!data.empresa && data.empresa_id) data.empresa = await getEmpresaData(data.empresa_id);
        const emp = data.empresa;
        const outputPathOrcamentos = path.join(__dirname, '../files/orcamentos');
        if (!fs.existsSync(outputPathOrcamentos)) {
            fs.mkdirSync(outputPathOrcamentos, { recursive: true });
        }

        const fileName = `Orcamento-${data.id}.pdf`;
        const filePath = path.join(outputPathOrcamentos, fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        const pageW = 595.28;
        const marginL = 50;
        const marginR = 50;
        const contentW = pageW - marginL - marginR;

        const doc = new PDFTable({
            size: 'A4',
            margins: { top: 40, bottom: 50, left: marginL, right: marginR },
            bufferPages: true
        });

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // === HEADER DA EMPRESA ===
        let logoRendered = false;
        const headerTop = 40;
        const logoW = 100;

        if (emp?.logo) {
            try {
                const logoData = emp.logo.startsWith('data:') ? Buffer.from(emp.logo.split(',')[1], 'base64') : emp.logo;
                doc.image(logoData, marginL, headerTop, { width: logoW });
                logoRendered = true;
            } catch (e) {
                if (fs.existsSync(logoPath)) { doc.image(logoPath, marginL, headerTop, { width: logoW }); logoRendered = true; }
            }
        } else if (fs.existsSync(logoPath)) {
            doc.image(logoPath, marginL, headerTop, { width: logoW });
            logoRendered = true;
        }

        const xEmpresa = logoRendered ? marginL + logoW + 15 : marginL;
        const wEmpresa = pageW - marginR - xEmpresa;
        let yEmp = headerTop;

        if (emp?.nome) {
            doc.font(montserratBoldFont).fontSize(13).fillColor('#222')
               .text(emp.nome, xEmpresa, yEmp, { width: wEmpresa });
            yEmp += 18;
        }

        doc.font(montserratFont).fontSize(8.5).fillColor('#555');
        const docFormatado = formatDocumento(emp?.documento || emp?.cnpj || emp?.cpf || '');
        if (docFormatado) { doc.text(`CNPJ/CPF: ${docFormatado}`, xEmpresa, yEmp, { width: wEmpresa }); yEmp += 12; }
        const enderecoEmp = formatEnderecoEmpresa(emp);
        if (enderecoEmp) { doc.text(enderecoEmp, xEmpresa, yEmp, { width: wEmpresa }); yEmp += 12; }
        if (emp?.telefone) { doc.text(`Tel: ${emp.telefone}`, xEmpresa, yEmp, { width: wEmpresa, continued: !!emp?.email }); }
        if (emp?.email) { doc.text(`  |  ${emp.email}`, { width: wEmpresa }); }

        const headerEndY = Math.max(yEmp + 20, headerTop + 75);
        doc.strokeColor('#2196F3').lineWidth(1.5)
           .moveTo(marginL, headerEndY).lineTo(pageW - marginR, headerEndY).stroke();

        doc.y = headerEndY + 15;
        doc.x = marginL;

        // === TÍTULO ===
        doc.font(montserratBoldFont).fontSize(15).fillColor('#1a1a1a')
           .text(`ORÇAMENTO`, { align: 'center' });

        doc.font(montserratFont).fontSize(9).fillColor('#666')
           .text(`${data.data || moment().format('DD/MM/YYYY')}`, { align: 'center' });

        doc.moveDown(0.8);

        // === DADOS DO CLIENTE ===
        if (data.cliente_nome) {
            const boxY = doc.y;
            const boxPad = 12;
            doc.save();
            doc.roundedRect(marginL, boxY, contentW, 55, 4).fillColor('#F5F7FA').fill();
            doc.restore();

            let yDados = boxY + boxPad;
            const col1X = marginL + boxPad;
            const col2X = marginL + contentW / 2 + boxPad;

            doc.font(montserratBoldFont).fontSize(9).fillColor('#333')
               .text('Cliente:', col1X, yDados, { continued: true })
               .font(montserratFont).fillColor('#555')
               .text(`  ${data.cliente_nome}`);
            yDados += 14;

            if (data.cliente_telefone) {
                doc.font(montserratBoldFont).fillColor('#333')
                   .text('Telefone:', col1X, yDados, { continued: true })
                   .font(montserratFont).fillColor('#555')
                   .text(`  ${data.cliente_telefone}`);
                yDados += 14;
            }

            if (data.cliente_endereco) {
                doc.font(montserratBoldFont).fillColor('#333')
                   .text('Endereço:', col1X, yDados, { continued: true })
                   .font(montserratFont).fillColor('#555')
                   .text(`  ${data.cliente_endereco}`);
                yDados += 14;
            }

            doc.y = boxY + 55 + 10;
        }

        // === CONTEÚDO HTML DO MODELO ===
        if (data.conteudo_html_customizado) {
            doc.strokeColor('#e0e0e0').lineWidth(0.5)
               .moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).stroke();
            doc.moveDown(0.8);

            let textoHtml = substituirVariaveisTemplate(data.conteudo_html_customizado, data);
            let texto = htmlParaTexto(textoHtml);

            doc.font(montserratFont).fontSize(10).fillColor('#333')
               .text(texto, { align: 'justify', lineGap: 4 });

            doc.moveDown(0.8);
        }

        // === TABELA DE SERVIÇOS ===
        const servicos = data.servicos || [];
        if (servicos.length > 0) {
            doc.strokeColor('#e0e0e0').lineWidth(0.5)
               .moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).stroke();
            doc.moveDown(0.5);

            doc.font(montserratBoldFont).fontSize(11).fillColor('#1a1a1a')
               .text('SERVIÇOS', marginL, doc.y);

            doc.moveDown(0.5);

            const table = {
                headers: [
                    { label: 'Serviço', width: 280 },
                    { label: 'Unidade', width: 80 },
                    { label: 'Valor', width: 120 },
                ],
                rows: servicos.map(s => {
                    const isValor = s.tipo === 'valor';
                    const valor = s.valor_final || (isValor ? (parseFloat(s.valor) || 0) : (parseFloat(s.valor_ref) || 0));
                    return [
                        s.nome || '-',
                        isValor ? '1' : `${parseFloat(s.horas) || 0}h`,
                        formatValor(valor)
                    ];
                })
            };

            await doc.table(table, {
                x: marginL,
                y: doc.y,
                padding: 5,
                columnSpacing: 5,
                minRowHeight: 22,
                prepareHeader: () => doc.fontSize(9).font(montserratBoldFont).fillColor('#333'),
                prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
                    doc.fontSize(9);
                    doc.fillColor('#000000');
                    doc.font(montserratFont);
                    if (indexRow % 2 === 0) {
                        doc.fillColor('#000000');
                        doc.addBackground(rectCell, '#f3f3f3', 1);
                    }
                }
            });

            doc.moveDown(0.5);
        } else if (data.tipo_servico) {
            doc.font(montserratBoldFont).fontSize(11).fillColor('#1a1a1a')
               .text('SERVIÇO', marginL, doc.y);
            doc.moveDown(0.3);
            doc.font(montserratFont).fontSize(10).fillColor('#333')
               .text(`${data.tipo_servico || '-'}`, marginL, doc.y);
            doc.moveDown(1);
        }

        // === VALOR FINAL (com desconto se aplicável) ===
        doc.strokeColor('#2196F3').lineWidth(1)
           .moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).stroke();
        doc.moveDown(0.8);

        if (data.desconto && parseFloat(data.desconto) > 0 && data.valor_original) {
            // Mostrar valor original riscado
            doc.font(montserratFont).fontSize(10).fillColor('#999')
               .text('Valor original:', marginL, doc.y, { continued: true });

            // Simular texto riscado (desenhar linha sobre o texto)
            const valorOrigStr = `  ${formatValor(data.valor_original)}`;
            const xValOrig = doc.x;
            const yValOrig = doc.y;
            doc.text(valorOrigStr, { continued: false });
            // Linha de risco sobre o valor original
            doc.save();
            doc.strokeColor('#999').lineWidth(1)
               .moveTo(xValOrig, yValOrig + 5).lineTo(xValOrig + doc.widthOfString(valorOrigStr), yValOrig + 5).stroke();
            doc.restore();

            doc.moveDown(0.3);

            // Mostrar desconto
            const descontoLabel = data.desconto_tipo === 'percentual'
                ? `${data.desconto}% de desconto`
                : `Desconto de ${formatValor(data.desconto)}`;
            doc.font(montserratFont).fontSize(9).fillColor('#4CAF50')
               .text(descontoLabel, marginL, doc.y);

            doc.moveDown(0.3);
        }

        // Valor final em destaque
        doc.font(montserratFont).fontSize(11).fillColor('#333')
           .text('Valor total:', marginL, doc.y, { continued: true })
           .font(montserratBoldFont).fontSize(18).fillColor('#1a1a1a')
           .text(`  ${formatValor(data.valor_final)}`, { continued: false });

        doc.moveDown(0.8);
        doc.strokeColor('#2196F3').lineWidth(1)
           .moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).stroke();

        // === CONDIÇÕES DE PAGAMENTO ===
        if (data.condicoes_pagamento) {
            doc.moveDown(0.8);
            doc.font(montserratBoldFont).fontSize(10).fillColor('#1a1a1a')
               .text('CONDIÇÕES DE PAGAMENTO', marginL, doc.y);
            doc.moveDown(0.3);
            doc.font(montserratFont).fontSize(9).fillColor('#444')
               .text(data.condicoes_pagamento, marginL, doc.y, { width: contentW, lineGap: 3 });
        }

        // === VALIDADE ===
        if (data.validade_dias) {
            doc.moveDown(0.8);
            doc.font(montserratFont).fontSize(9).fillColor('#666')
               .text(`Este orçamento é válido por ${data.validade_dias} dias a partir da data de emissão.`, marginL, doc.y, { width: contentW });
        }

        // === OBSERVAÇÕES ===
        if (data.observacoes) {
            doc.moveDown(0.8);
            doc.font(montserratBoldFont).fontSize(10).fillColor('#1a1a1a')
               .text('Observações:', marginL, doc.y);
            doc.moveDown(0.2);
            doc.font(montserratFont).fontSize(9).fillColor('#444')
               .text(data.observacoes, marginL, doc.y, { width: contentW, lineGap: 2 });
        }

        // === ASSINATURAS ===
        if (doc.y > 650) {
            doc.addPage();
        }

        doc.moveDown(2);
        doc.strokeColor('#e0e0e0').lineWidth(0.5)
           .moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).stroke();
        doc.moveDown(1);

        // Data e local
        doc.font(montserratFont).fontSize(9).fillColor('#555')
           .text(`${emp?.cidade || ''}${emp?.cidade && emp?.estado ? '/' : ''}${emp?.estado || ''}, ${moment().format('DD [de] MMMM [de] YYYY')}`, { align: 'center' });

        doc.moveDown(2);

        const assinaturaY = doc.y;

        doc.strokeColor('#999').lineWidth(0.5)
           .moveTo(80, assinaturaY + 50).lineTo(280, assinaturaY + 50).stroke();
        doc.font(montserratBoldFont).fontSize(8).fillColor('#444')
           .text('Assinatura do Cliente', 80, assinaturaY + 55, { width: 200, align: 'center' });
        if (data.cliente_nome) {
            doc.font(montserratFont).fontSize(7.5).fillColor('#888')
               .text(data.cliente_nome, 80, assinaturaY + 66, { width: 200, align: 'center' });
        }

        doc.strokeColor('#999').lineWidth(0.5)
           .moveTo(310, assinaturaY + 50).lineTo(510, assinaturaY + 50).stroke();
        doc.font(montserratBoldFont).fontSize(8).fillColor('#444')
           .text('Responsável', 310, assinaturaY + 55, { width: 200, align: 'center' });
        if (emp?.nome) {
            doc.font(montserratFont).fontSize(7.5).fillColor('#888')
               .text(emp.nome, 310, assinaturaY + 66, { width: 200, align: 'center' });
        }

        // === RODAPÉ ===
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            doc.font(montserratFont).fontSize(7).fillColor('#aaa')
               .text(
                   `Página ${i + 1} de ${pages.count}  |  Orçamento ${data.id}  |  Gerado em ${moment().format('DD/MM/YYYY HH:mm')}`,
                   marginL, 800,
                   { width: contentW, align: 'center' }
               );
        }

        doc.end();
        await new Promise(resolve => writeStream.on('finish', resolve));

        console.log('Orçamento PDF criado com sucesso!', filePath);
        return { filePath, fileName };
    } catch (error) {
        throw new Error(`Erro ao gerar o orçamento PDF: ${error}`);
    }
}

/**
 * Gera PDF de contrato a partir do HTML do editor
 * @param {Object} contrato - Dados do contrato com dados do cliente
 * @returns {Object} { filePath, fileName, fileUrl }
 */
async function createContratoPDF(contrato) {
    try {
        if (!contrato.empresa && contrato.empresa_id) contrato.empresa = await getEmpresaData(contrato.empresa_id);
        const emp = contrato.empresa;
        const outputPathContratos = path.join(__dirname, '../files/contratos', contrato.id.toString());
        if (!fs.existsSync(outputPathContratos)) {
            fs.mkdirSync(outputPathContratos, { recursive: true });
        }

        const fileName = `Contrato-${contrato.numero || contrato.id}.pdf`;
        const filePath = path.join(outputPathContratos, fileName);

        // Remove PDF anterior se existir
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        const pageW = 595.28; // A4 width
        const marginL = 50;
        const marginR = 50;
        const contentW = pageW - marginL - marginR;

        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 40, bottom: 50, left: marginL, right: marginR },
            bufferPages: true
        });

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // ========== HEADER DA EMPRESA ==========
        let logoRendered = false;
        const headerTop = 40;
        const logoW = 100;

        if (emp?.logo) {
            try {
                const logoData = emp.logo.startsWith('data:') ? Buffer.from(emp.logo.split(',')[1], 'base64') : emp.logo;
                doc.image(logoData, marginL, headerTop, { width: logoW });
                logoRendered = true;
            } catch (e) {
                if (fs.existsSync(logoPath)) { doc.image(logoPath, marginL, headerTop, { width: logoW }); logoRendered = true; }
            }
        } else if (fs.existsSync(logoPath)) {
            doc.image(logoPath, marginL, headerTop, { width: logoW });
            logoRendered = true;
        }

        // Dados da empresa ao lado do logo
        const xEmpresa = logoRendered ? marginL + logoW + 15 : marginL;
        const wEmpresa = pageW - marginR - xEmpresa;
        let yEmp = headerTop;

        if (emp?.nome) {
            doc.font(montserratBoldFont).fontSize(13).fillColor('#222')
               .text(emp.nome, xEmpresa, yEmp, { width: wEmpresa });
            yEmp += 18;
        }

        doc.font(montserratFont).fontSize(8.5).fillColor('#555');
        const docFormatado = formatDocumento(emp?.documento || emp?.cnpj || emp?.cpf || '');
        if (docFormatado) { doc.text(`CNPJ/CPF: ${docFormatado}`, xEmpresa, yEmp, { width: wEmpresa }); yEmp += 12; }
        const enderecoEmp = formatEnderecoEmpresa(emp);
        if (enderecoEmp) { doc.text(enderecoEmp, xEmpresa, yEmp, { width: wEmpresa }); yEmp += 12; }
        if (emp?.telefone) { doc.text(`Tel: ${emp.telefone}`, xEmpresa, yEmp, { width: wEmpresa, continued: !!emp?.email }); }
        if (emp?.email) { doc.text(`  |  ${emp.email}`, { width: wEmpresa }); }

        // Linha separadora abaixo do header
        const headerEndY = Math.max(yEmp + 20, headerTop + 75);
        doc.strokeColor('#2196F3').lineWidth(1.5)
           .moveTo(marginL, headerEndY).lineTo(pageW - marginR, headerEndY).stroke();

        doc.y = headerEndY + 15;

        // ========== TÍTULO DO CONTRATO ==========
        doc.font(montserratBoldFont).fontSize(15).fillColor('#1a1a1a')
           .text(`CONTRATO ${contrato.numero ? `N° ${contrato.numero}` : ''}`, { align: 'center' });

        doc.moveDown(0.8);

        // ========== BOX DE DADOS DO CONTRATO ==========
        const boxY = doc.y;
        const boxPad = 12;

        // Fundo do box
        doc.save();
        doc.roundedRect(marginL, boxY, contentW, 70, 4).fillColor('#F5F7FA').fill();
        doc.restore();

        let yDados = boxY + boxPad;
        const col1X = marginL + boxPad;
        const col2X = marginL + contentW / 2 + boxPad;

        doc.font(montserratFont).fontSize(9).fillColor('#666');

        // Coluna esquerda
        if (contrato.cli_nome) {
            doc.font(montserratBoldFont).fillColor('#333').text('Cliente:', col1X, yDados, { continued: true })
               .font(montserratFont).fillColor('#555').text(`  ${contrato.cli_nome}`);
        }
        yDados += 15;
        if (contrato.inicio_data) {
            doc.font(montserratBoldFont).fillColor('#333').text('Início:', col1X, yDados, { continued: true })
               .font(montserratFont).fillColor('#555').text(`  ${moment(contrato.inicio_data).format('DD/MM/YYYY')}`);
        }
        yDados += 15;
        if (contrato.periodo && contrato.periodo_type) {
            doc.font(montserratBoldFont).fillColor('#333').text('Vigência:', col1X, yDados, { continued: true })
               .font(montserratFont).fillColor('#555').text(`  ${contrato.periodo} ${contrato.periodo_type}`);
        }

        // Coluna direita
        yDados = boxY + boxPad;
        if (contrato.valor) {
            doc.font(montserratBoldFont).fillColor('#333').text('Valor:', col2X, yDados, { continued: true })
               .font(montserratFont).fillColor('#555').text(`  ${formatValor(parseFloat(contrato.valor))}`);
        }
        yDados += 15;
        if (contrato.cli_cpf) {
            doc.font(montserratBoldFont).fillColor('#333').text('CPF/CNPJ:', col2X, yDados, { continued: true })
               .font(montserratFont).fillColor('#555').text(`  ${formatDocumento(contrato.cli_cpf)}`);
        }
        yDados += 15;
        if (contrato.cli_email) {
            doc.font(montserratBoldFont).fillColor('#333').text('E-mail:', col2X, yDados, { continued: true })
               .font(montserratFont).fillColor('#555').text(`  ${contrato.cli_email}`);
        }

        doc.y = boxY + 70 + 15;

        // ========== CONTEÚDO DO CONTRATO ==========
        if (contrato.conteudo_html) {
            // Linha divisória sutil antes do conteúdo
            doc.strokeColor('#e0e0e0').lineWidth(0.5)
               .moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).stroke();
            doc.moveDown(0.8);

            // Converte HTML para texto
            let texto = contrato.conteudo_html
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<\/div>/gi, '\n')
                .replace(/<\/li>/gi, '\n')
                .replace(/<li>/gi, '  - ')
                .replace(/<\/h[1-6]>/gi, '\n\n')
                .replace(/<h[1-6][^>]*>/gi, '')
                .replace(/<strong>/gi, '')
                .replace(/<\/strong>/gi, '')
                .replace(/<em>/gi, '')
                .replace(/<\/em>/gi, '')
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            doc.font(montserratFont).fontSize(10).fillColor('#333')
               .text(texto, {
                   align: 'justify',
                   lineGap: 4
               });
        }

        // ========== OBSERVAÇÕES ==========
        if (contrato.obs) {
            doc.moveDown(1.5);
            doc.font(montserratBoldFont).fontSize(9).fillColor('#666')
               .text('Observações:');
            doc.font(montserratFont).fontSize(9).fillColor('#666')
               .text(contrato.obs, { lineGap: 2 });
        }

        // ========== ÁREA DE ASSINATURAS ==========
        // Verifica se cabe na página (precisa de ~120px), senão adiciona nova página
        if (doc.y > 650) {
            doc.addPage();
        }

        doc.moveDown(2);

        // Linha divisória
        doc.strokeColor('#e0e0e0').lineWidth(0.5)
           .moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).stroke();

        doc.moveDown(1);

        // Data e local
        doc.font(montserratFont).fontSize(9).fillColor('#555')
           .text(`${emp?.cidade || ''}${emp?.cidade && emp?.estado ? '/' : ''}${emp?.estado || ''}, ${moment().format('DD [de] MMMM [de] YYYY')}`, { align: 'center' });

        doc.moveDown(2);

        const assinaturaY = doc.y;

        // Assinatura Empresa (esquerda)
        doc.strokeColor('#999').lineWidth(0.5)
           .moveTo(80, assinaturaY + 50).lineTo(280, assinaturaY + 50).stroke();
        doc.font(montserratBoldFont).fontSize(8).fillColor('#444')
           .text('Assinatura da Empresa', 80, assinaturaY + 55, { width: 200, align: 'center' });
        if (emp?.nome) {
            doc.font(montserratFont).fontSize(7.5).fillColor('#888')
               .text(emp.nome, 80, assinaturaY + 66, { width: 200, align: 'center' });
        }

        // Assinatura Cliente (direita)
        doc.strokeColor('#999').lineWidth(0.5)
           .moveTo(310, assinaturaY + 50).lineTo(510, assinaturaY + 50).stroke();
        doc.font(montserratBoldFont).fontSize(8).fillColor('#444')
           .text('Assinatura do Cliente', 310, assinaturaY + 55, { width: 200, align: 'center' });
        if (contrato.cli_nome) {
            doc.font(montserratFont).fontSize(7.5).fillColor('#888')
               .text(contrato.cli_nome, 310, assinaturaY + 66, { width: 200, align: 'center' });
        }

        // ========== RODAPÉ ==========
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            doc.font(montserratFont).fontSize(7).fillColor('#aaa')
               .text(
                   `Página ${i + 1} de ${pages.count}  |  Contrato ${contrato.numero || contrato.id}  |  Gerado em ${moment().format('DD/MM/YYYY HH:mm')}`,
                   marginL, 800,
                   { width: contentW, align: 'center' }
               );
        }

        doc.end();

        await new Promise((resolve, reject) => {
            stream.on('finish', resolve);
            stream.on('error', reject);
        });

        const fileUrl = `/download/docs/contratos/${contrato.id}/${fileName}`;

        console.log('[Contratos] PDF gerado com sucesso:', filePath);
        return { filePath, fileName, fileUrl };
    } catch (error) {
        console.error('[Contratos] Erro ao gerar PDF:', error);
        return false;
    }
}

module.exports = {
    createCertificate,
    createRecibo,
    createRelatorioSaida,
    createRelatorioReceber,
    createRelatorioComissoes,
    createRelatorioServicosTecnicos,
    createOrdemServico,
    inserirAssinaturaDigitalDoc,
    createOrcamento,
    createContratoPDF,
    getEmpresaData
};