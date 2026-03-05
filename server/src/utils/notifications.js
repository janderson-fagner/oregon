const express = require("express");
const transporter = require("../transporter");
const util = require("util");
const handlebars = require("handlebars");
const path = require("path");
const fs = require("fs");

const dbQuery = require('./dbHelper');
const { empresaWhere } = require('./dbHelper');

const { emitToEmpresa } = require('../socket');

const { getBrandFromHost } = require('./brandHelper');

let fromDefault = `"Daviot Sistema" <${process.env.SMTP_FROM ? process.env.SMTP_FROM : 'automatico@oregonservicos.com.br'}>`;

async function sendMailAndNotificationUserBase(sendEmail = false, createNotification = false, userEmail, data, empresa_id = null, hostname = null) {

    const ew = empresaWhere(empresa_id);

    try {
        let userName = userEmail.split('@')[0];

        console.log('Enviando email para', userEmail, 'com os dados:', data, 'sendEmail:', sendEmail, 'createNotification:', createNotification);

        const user = await dbQuery('SELECT * FROM User WHERE email = ? AND ' + ew.sql, [userEmail, ...ew.params]);

        if (user.length > 0) {
            userName = user[0].fullName;
            //Pegar só o primeiro nome
            userName = userName.split(' ')[0];
        }

        if (sendEmail) {
            const templatePath = path.join(__dirname, '../email-templates', 'base-send-user.html');

            const source = fs.readFileSync(templatePath, 'utf8');
            const template = handlebars.compile(source);
            const brand = hostname ? getBrandFromHost(hostname) : getBrandFromHost(null);
            const replacements = {
                name: userName,
                sendMessage: data.message,
                linkAction: data.linkAction,
                textAction: data.textAction,
                app_name: brand.appName,
                app_url: brand.appUrl,
                app_logo_url: brand.appUrl + brand.logoUrl,
            };

            const html = template(replacements);

            const emailFrom = hostname ? getBrandFromHost(hostname).emailFrom : fromDefault;
            const mailOptions = {
                from: emailFrom,
                to: userEmail,
                subject: data.mailTitle,
                html
            };

            console.log('Enviando email para', userEmail);

            try {
                await transporter.sendMail(mailOptions);
                console.log('Email enviado com sucesso para', userEmail);
            } catch (error) {
                console.error('Erro ao enviar email para', userEmail, error);
            }
        }

        if (createNotification) {

            let notificationData = {
                title: data.notificationTitle,
                subtitle: data.notificationSubtitle,
                params: data.params
            };

            let userId = user[0].id;

            const notification = await dbQuery('INSERT INTO Notificacoes (title, subtitle, params, time, userId, empresa_id) VALUES (?, ?, ?, ?, ?, ?)', [notificationData.title, notificationData.subtitle, notificationData.params, formatDateToMySQL(new Date()), userId, empresa_id]);

            emitToEmpresa(empresa_id, "newNotification", notification);
        }
    } catch (error) {
        console.error('Erro ao enviar email e criar notificação', error);
    }
}

// Formata a data para o MySQL
const formatDateToMySQL = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

module.exports = {
    sendMailAndNotificationUserBase
};