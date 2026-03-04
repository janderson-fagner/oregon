const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const moment = require("moment");

//Moment locale pt-br
moment.locale("pt-br");

const {
  createCertificate,
  createRecibo,
  createOrdemServico,
} = require("../utils/generatePDF");
const {
  getAgendamentos,
  getHistoricoAgendamento,
  setHistoricoAgendamento,
  createPagamento,
} = require("../utils/agendaUtils");
const {
  sanitizeInput,
  isDiff,
  can,
  escreverEndereco,
} = require("../utils/functions");
const { triggerAgendamentoFlows } = require("../flows/core/flowTriggers");

const dbQuery = require("../utils/dbHelper");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let caminho = path.join(
      __dirname,
      "../uploads/fotos-agendamento",
      req.params.age_id
    );

    //Se o diretório não existir, cria
    if (!fs.existsSync(caminho)) {
      fs.mkdirSync(caminho, { recursive: true });
    }

    cb(null, caminho);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

router.get("/agendamentos", async (req, res) => {
  try {
    let {
      start = null,
      end = null,
      fun_id,
      type = null,
      types = null,
      status = null,
      notBloqueio = false,
      onlyCount = false,
      cliente = null,
      pago = null,
      dup = false,
    } = req.query;
    const user = req.user;
    const empresa_id = req.user.empresa_id;

    if (!user.role || user.abilitys.length === 0) {
      return res.status(400).json({ message: "Sem permissão!" });
    }

    if (
      !can("view", "agendamento", user.abilitys) &&
      !can("view-all", "agendamento", user.abilitys)
    ) {
      return res.status(400).json({ message: "Sem permissão!" });
    }

    let query = "SELECT * FROM AGENDAMENTO WHERE age_ativo = 1 AND empresa_id = ?";
    let values = [empresa_id];

    if (fun_id && can("view-all", "agendamento", user.abilitys)) {
      query += " AND fun_id = ?";
      values.push(fun_id);
    }

    if (type && can("view-all", "agendamento", user.abilitys)) {
      query += " AND age_type = ?";
      values.push(type);
    }

    if (types && can("view-all", "agendamento", user.abilitys)) {
      query += " AND age_type IN (?)";
      values.push(types);
    }

    if (status && can("view-all", "agendamento", user.abilitys)) {
      query += " AND ast_id = ?";
      values.push(status);
    }

    if (cliente && can("view-all", "agendamento", user.abilitys)) {
      query += " AND cli_id = ?";
      values.push(cliente);
    }

    /*  if (pago && can('view-all', 'agendamento', user.abilitys)) {
       query += ' AND pago = ?';
       values.push(pago);
     } */

    if (notBloqueio) {
      query += ' AND age_type != "bloqueio"';
    }

    if (can("view-all", "agendamento", user.abilitys)) {
      if (!start) {
        start = moment().add(1, "days").format("YYYY-MM-DD");
      }

      if (!end) {
        end = moment().add(7, "days").format("YYYY-MM-DD");
      }

      query += " AND (age_data <= ? AND COALESCE(age_dataFim, age_data) >= ?)";
      values.push(
        moment(end).format("YYYY-MM-DD"),
        moment(start).format("YYYY-MM-DD")
      );
    } else if (can("view", "agendamento", user.abilitys)) {
      let dataHoje = moment().format("YYYY-MM-DD");
      let dataAmanha = moment().add(7, "days").format("YYYY-MM-DD");

      fun_id = user.id;

      query +=
        " AND (fun_id = ? AND ast_id IN (1,2) AND (age_data <= ? AND COALESCE(age_dataFim, age_data) >= ?))";
      values.push(
        fun_id,
        moment(dataAmanha).format("YYYY-MM-DD"),
        moment(dataHoje).format("YYYY-MM-DD")
      );
    } else {
      return res.status(400).json({ message: "Sem permissão!" });
    }

    if (onlyCount || onlyCount === "true") {
      const total = await dbQuery(query, values);
      return res.status(200).json({ total: total.length });
    }

    console.log("Query: ", query, "values: ", values);
    const agendamentos = await getAgendamentos(query, values);

    if (dup || dup === "true") {
      const correctAgendamentos = [];

      for (const agendamento of agendamentos) {
        // Sem término: devolve normal
        if (!agendamento.age_dataFim) {
          correctAgendamentos.push(agendamento);
          continue;
        }

        // Datas base (por dia)
        const startDay = moment(agendamento.age_data).startOf("day");
        const endDay = moment(agendamento.age_dataFim).startOf("day");

        console.log(
          "Start Day: ",
          startDay.format("YYYY-MM-DD"),
          "End Day: ",
          endDay.format("YYYY-MM-DD")
        );

        // Se por algum motivo fim < início, evita bug
        if (endDay.isBefore(startDay)) {
          correctAgendamentos.push({ ...agendamento, age_dataFim: null });
          continue;
        }

        // Gera 1 item por dia (inclusive)
        for (
          let d = startDay.clone();
          d.isSameOrBefore(endDay, "day");
          d.add(1, "day")
        ) {
          const isFirst = d.isSame(startDay, "day");
          const isLast = d.isSame(endDay, "day");

          console.log(
            "D: ",
            d.format("YYYY-MM-DD"),
            "Is First: ",
            isFirst,
            "Is Last: ",
            isLast
          );

          const day = d.format("YYYY-MM-DD");

          let horaInicio = isLast
            ? agendamento.age_horaInicioFim || agendamento.age_horaInicio
            : agendamento.age_horaInicio;

          let horaFim = isLast
            ? agendamento.age_horaFimFim || agendamento.age_horaFim
            : agendamento.age_horaFim;

          if (!horaFim) {
            //Adiciona 1 hora a mais no fim
            horaFim = moment(horaInicio, "HH:mm:ss")
              .add(1, "hour")
              .format("HH:mm:ss");
          }

          correctAgendamentos.push({
            ...agendamento,
            age_data: `${day} ${horaInicio || "00:00:00"}`,
            age_data_end: `${day} ${horaFim || "23:59:59"}`,
            age_dataFim: null,
            age_horaInicioFim: null,
            age_horaFimFim: null,
            age_horaInicio: horaInicio,
            age_horaFim: horaFim,
            periodo: isFirst ? "Ínicio" : isLast ? "Término" : "Meio",
          });
        }
      }

      return res.status(200).json(correctAgendamentos);
    }

    res.status(200).json(agendamentos);
  } catch (error) {
    console.error("Erro ao buscar agendamentos: ", error);
    res.status(500).json(error);
  }
});

router.get("/agendamento/single/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    let query = "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?";
    let values = [id, empresa_id];

    const agendamentos = await dbQuery(query, values);

    for (let agendamento of agendamentos) {
      agendamento.cliente = await dbQuery(
        "SELECT * FROM CLIENTES WHERE cli_Id = ? AND empresa_id = ?",
        [agendamento.cli_id, empresa_id]
      );
      agendamento.funcionario = await dbQuery(
        "SELECT * FROM User WHERE id = ? AND empresa_id = ?",
        [agendamento.fun_id, empresa_id]
      );

      if (agendamento.age_type == "bloqueio") {
        let bkColor = await dbQuery(
          'SELECT * FROM Options WHERE type = "cor_bloqueio" AND empresa_id = ?',
          [empresa_id]
        );

        agendamento.bkColor = bkColor.length > 0 ? bkColor[0].value : "#000000";
      } else if (agendamento.ast_id === 3) {
        //Atendido
        let bkColor = await dbQuery(
          'SELECT * FROM Options WHERE type = "cor_atendido" AND empresa_id = ?',
          [empresa_id]
        );

        agendamento.bkColor = bkColor.length > 0 ? bkColor[0].value : "#A8A8A8";
      } else if (agendamento.ast_id === 6) {
        //Cancelado
        let bkColor = await dbQuery(
          'SELECT * FROM Options WHERE type = "cor_cancelado" AND empresa_id = ?',
          [empresa_id]
        );

        agendamento.bkColor = bkColor.length > 0 ? bkColor[0].value : "#AA0000";
      } else if (agendamento.ast_id === 7) {
        //Remarcado
        let bkColor = await dbQuery(
          'SELECT * FROM Options WHERE type = "cor_remarcado" AND empresa_id = ?',
          [empresa_id]
        );

        agendamento.bkColor = bkColor.length > 0 ? bkColor[0].value : "#FF4500";
      } else {
        agendamento.bkColor = agendamento.funcionario[0]
          ? agendamento.funcionario[0].color
          : "#BDBDBD";
      }
    }

    res.status(200).json(agendamentos);
  } catch (error) {
    console.error("Erro ao buscar agendamentos: ", error);
    res.status(500).json(error);
  }
});

router.get("/agendamento/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    const agendamentos = await getAgendamentos(
      "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
      [id, empresa_id]
    );

    if (agendamentos.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    const agendamento = agendamentos[0];

    const funcionarios = await dbQuery(
      "SELECT * FROM User WHERE ativo = 1 AND podeAgendamento = 1 AND empresa_id = ?",
      [empresa_id]
    );

    agendamento.funcionarios = funcionarios;

    res.status(200).json(agendamento);
  } catch (error) {
    console.error("Erro ao encontrar agendamento: ", error);
    res.status(500).json(error);
  }
});

router.post(
  "/upload-images/:age_id",
  upload.array("images", 10),
  async (req, res) => {
    try {
      const { age_id } = req.params;
      const userData = req.user;

      if (!userData || !userData.id || !userData.fullName) {
        return res.status(403).json({ message: "Sem permissão" });
      }

      const empresa_id = req.user.empresa_id;
      let inseridas = [];

      for (let file of req.files) {
        let filename = file.filename;
        let url = `/uploads/fotos-agendamento/${age_id}/${filename}`;

        let img_inserida = await dbQuery(
          "INSERT INTO IMAGENS_AGE (age_id, url, filename, empresa_id) VALUES (?, ?, ?, ?)",
          [age_id, url, filename, empresa_id]
        );

        inseridas.push({
          img_id: img_inserida.insertId,
          url: url,
          filename: filename,
          age_id: age_id,
        });
      }

      await dbQuery("UPDATE AGENDAMENTO SET updated_by = ? WHERE age_id = ? AND empresa_id = ?", [
        userData.fullName,
        age_id,
        empresa_id,
      ]);

      setHistoricoAgendamento(age_id, {
        title: "Imagens adicionadas",
        description: `${inseridas.length} ${
          inseridas.length === 1
            ? "imagem foi adicionada"
            : "imagens foram adicionadas"
        } ao agendamento`,
        feitoPor: userData.fullName,
        color: "info",
        icon: "tabler-photo-plus",
      });

      res.status(200).json(inseridas);
    } catch (error) {
      console.error("Erro ao salvar imagens: ", error);
      res.status(500).json(error);
    }
  }
);

router.delete("/remove-image/:img_id", async (req, res) => {
  try {
    const { img_id } = req.params;
    const userData = req.user;
    const empresa_id = req.user.empresa_id;

    const imagem = await dbQuery("SELECT * FROM IMAGENS_AGE WHERE img_id = ? AND empresa_id = ?", [
      img_id, empresa_id,
    ]);
    if (imagem.length === 0) {
      return res.status(404).json({ message: "Imagem não encontrada" });
    }

    const age_id = imagem[0].age_id;

    fs.unlinkSync(
      path.join(
        __dirname,
        "../uploads/fotos-agendamento",
        imagem[0].age_id.toString(),
        imagem[0].filename
      )
    );

    await dbQuery("DELETE FROM IMAGENS_AGE WHERE img_id = ? AND empresa_id = ?", [img_id, empresa_id]);

    if (userData && userData.fullName) {
      setHistoricoAgendamento(age_id, {
        title: "Imagem removida",
        description: `Imagem ${imagem[0].filename} foi removida do agendamento`,
        feitoPor: userData.fullName,
        color: "warning",
        icon: "tabler-photo-minus",
      });
    }

    res.status(200).json({ message: "Imagem deletada com sucesso" });
  } catch (error) {
    console.error("Erro ao deletar imagem: ", error);
    res.status(500).json(error);
  }
});

router.get("/funcionarios", async (req, res) => {
  const { ativo = 1, fun_id = null, all = false } = req.query;

  const userData = req.user;
  const empresa_id = req.user.empresa_id;

  if (!userData || !userData.id || !userData.fullName) {
    return res.status(403).json({ message: "Sem permissão" });
  }

  if (all && !can("view-all", "agendamento", userData.abilitys)) {
    return res.status(403).json({ message: "Sem permissão" });
  }

  try {
    let query = "SELECT * FROM User WHERE empresa_id = ?";
    let params = [empresa_id];

    if (ativo) {
      query += " AND ativo = ?";
      params.push(ativo);
    } else {
      query += " AND ativo = 1";
    }

    if (fun_id && fun_id != "null" && fun_id != "0" && fun_id != 0) {
      query += " AND id = ?";
      params.push(fun_id);
    }

    if (!all || (all && !can("view-all", "agendamento", userData.abilitys))) {
      query += " AND podeAgendamento = 1";
    }

    const funcionarios = await dbQuery(query, params);

    res.status(200).json(funcionarios);
  } catch (error) {
    console.error("Erro ao buscar funcionários: ", error);
    res.status(500).json(error);
  }
});

router.get("/funcionariosCalendar", async (req, res) => {
  const { data } = req.query;
  const empresa_id = req.user.empresa_id;

  // Verificar se o parâmetro data foi fornecido
  if (!data) {
    return res.status(400).json({ message: "O parâmetro data é obrigatório" });
  }

  try {
    const userId = data;
    const funcionarios = await dbQuery(
      "SELECT * FROM User WHERE id = ? AND ativo = 1 AND podeAgendamento = 1 AND empresa_id = ?",
      [userId, empresa_id]
    );

    res.status(200).json(funcionarios);
  } catch (error) {
    console.error("Erro ao buscar funcionários: ", error);
    res.status(500).json(error);
  }
});

router.post("/funcionariosOrder", async (req, res) => {
  try {
    const { funcionarios } = req.body;
    const empresa_id = req.user.empresa_id;

    if (!funcionarios || !Array.isArray(funcionarios)) {
      return res.status(400).json({ message: "Funcionários não encontrados" });
    }

    if (funcionarios.length === 0) {
      return res.status(400).json({ message: "Funcionários não encontrados" });
    }

    for (let funcionario of funcionarios) {
      await dbQuery("UPDATE User SET ordemCalendar = ? WHERE id = ? AND empresa_id = ?", [
        funcionario.ordemCalendar,
        funcionario.id,
        empresa_id,
      ]);
    }

    res.status(200).json({ message: "Funcionários ordenados com sucesso" });
  } catch (error) {
    console.error("Erro ao ordenar funcionários: ", error);
    res.status(500).json(error);
  }
});

router.post("/setDiscount", async (req, res) => {
  try {
    const { age_id, discount } = req.body;
    const userData = req.user;
    const empresa_id = req.user.empresa_id;

    if (!userData || !userData.id || !userData.fullName) {
      return res.status(403).json({ message: "Sem permissão" });
    }

    await dbQuery(
      "UPDATE AGENDAMENTO SET age_desconto = ?, updated_by = ? WHERE age_id = ? AND empresa_id = ?",
      [discount, userData.fullName, age_id, empresa_id]
    );

    setHistoricoAgendamento(age_id, {
      title: "Desconto aplicado",
      description: `Desconto de R$ ${parseFloat(discount).toFixed(
        2
      )} aplicado ao agendamento`,
      feitoPor: userData.fullName,
      color: "warning",
      icon: "tabler-discount",
    });

    res.status(200).json({ message: "Desconto aplicado com sucesso" });
  } catch (error) {
    console.error("Erro ao aplicar desconto: ", error);
    res.status(500).json(error);
  }
});

router.post("/setComissao", async (req, res) => {
  try {
    const { age_id, comissao } = req.body;
    const empresa_id = req.user.empresa_id;

    await dbQuery("UPDATE AGENDAMENTO SET age_comissao = ? WHERE age_id = ? AND empresa_id = ?", [
      comissao,
      age_id,
      empresa_id,
    ]);

    setHistoricoAgendamento(age_id, {
      title: "Comissão alterada",
      description: `Comissão de R$ ${parseFloat(comissao).toFixed(
        2
      )} aplicada ao agendamento`,
      feitoPor: "Sistema",
      color: "info",
      icon: "tabler-coins",
    });

    res.status(200).json({ message: "Comissão aplicada com sucesso" });
  } catch (error) {
    console.error("Erro ao aplicar comissão: ", error);
    res.status(500).json(error);
  }
});

router.post("/changeStatus", async (req, res) => {
  try {
    const { age_id, status } = req.body;

    const userData = req.user;
    const empresa_id = req.user.empresa_id;

    if (!userData || !userData.id || !userData.fullName) {
      return res.status(403).json({ message: "Sem permissão" });
    }

    let ast_Query = await dbQuery(
      "SELECT * FROM AGENDAMENTO_STATUS WHERE ast_descricao = ? AND empresa_id = ?",
      [status, empresa_id]
    );

    let ast_id = ast_Query.length > 0 ? ast_Query[0].ast_id : 1;

    await dbQuery(
      "UPDATE AGENDAMENTO SET ast_id = ?, updated_by = ? WHERE age_id = ? AND empresa_id = ?",
      [ast_id, userData.fullName, age_id, empresa_id]
    );

    setHistoricoAgendamento(age_id, {
      title: "Status alterado",
      description: `Status alterado para: ${status}`,
      feitoPor: userData.fullName,
      color: "primary",
      icon: "tabler-flag",
    });

    // Disparar fluxos de alteração de status
    try {
      const agendamentoAtualizado = await getAgendamentos(
        "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
        [age_id, empresa_id]
      );
      if (agendamentoAtualizado && agendamentoAtualizado.length > 0) {
        await triggerAgendamentoFlows("status_agendamento", {
          agendamento: agendamentoAtualizado[0],
          statusAnterior: null, // Poderia buscar o status anterior se necessário
          statusNovo: ast_id,
        });
      }
    } catch (error) {
      console.error("Erro ao disparar fluxos de alteração de status:", error);
    }

    res.status(200).json({ message: "Status alterado com sucesso" });
  } catch (error) {
    console.error("Erro ao alterar status: ", error);
    res.status(500).json(error);
  }
});

router.post("/remarcar", async (req, res) => {
  try {
    const userData = req.user;
    const empresa_id = req.user.empresa_id;
    const {
      age_id,
      age_data,
      age_horaInicio,
      age_horaFim,
      fun_id,
      ast_id,
      age_dataFim,
      age_horaInicioFim,
      age_horaFimFim,
    } = req.body;

    if (!userData || !userData.id || !userData.fullName) {
      return res.status(401).json({ message: "Sem permissão" });
    }

    let agendamento = await getAgendamentos(
      "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
      [age_id, empresa_id]
    );

    if (agendamento.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    let cliente = agendamento[0].cliente;
    let endereco = agendamento[0].endereco;

    let createdAt = new Date().toISOString().slice(0, 19).replace("T", " ");

    let newAge_ast_id = ast_id ? ast_id : 1;
    let newAge_data = age_data
      ? moment(age_data).format("YYYY-MM-DD")
      : agendamento[0].age_data;
    let newAge_horaInicio = age_horaInicio
      ? age_horaInicio
      : agendamento[0].age_horaInicio;
    let newAge_horaFim = age_horaFim ? age_horaFim : agendamento[0].age_horaFim;
    let newAge_dataFim = age_dataFim
      ? moment(age_dataFim).format("YYYY-MM-DD")
      : agendamento[0].age_dataFim;
    let newAge_horaInicioFim = age_horaInicioFim
      ? age_horaInicioFim
      : agendamento[0].age_horaInicioFim;
    let newAge_horaFimFim = age_horaFimFim
      ? age_horaFimFim
      : agendamento[0].age_horaFimFim;

    let newAge_endereco = agendamento[0].age_endereco;
    let newAge_retrabalho = agendamento[0].age_retrabalho;
    let newAge_cli_id = agendamento[0].cli_id;
    let newAge_fun_id = fun_id ? fun_id : agendamento[0].fun_id;
    let newAge_valor = agendamento[0].age_valor;
    let newAge_desconto = agendamento[0].age_desconto;
    let newAge_observacao = agendamento[0].age_observacao;
    let newAge_garantia = agendamento[0].age_garantia;
    let newAge_metragem = agendamento[0].age_metragem;
    let newAge_local = agendamento[0].age_local;
    let newAge_type = agendamento[0].age_type;

    /* let query = 'INSERT INTO AGENDAMENTO (ast_id, age_data, age_horaInicio, age_horaFim, age_endereco, age_retrabalho, cli_id, fun_id, age_valor, age_desconto, age_observacao, age_garantia, age_metragem, age_local, created_at, created_by, updated_by)';
    query += ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    let values = [newAge_ast_id, newAge_data, newAge_horaInicio, newAge_horaFim, newAge_endereco, newAge_retrabalho, newAge_cli_id, newAge_fun_id, newAge_valor, newAge_desconto, newAge_observacao, newAge_garantia, newAge_metragem, newAge_local, createdAt, userData.fullName, userData.fullName];
*/

    let objCreate = {
      ast_id: newAge_ast_id,
      age_data: newAge_data,
      age_type: newAge_type,
      age_horaInicio: newAge_horaInicio,
      age_horaFim: newAge_horaFim,
      age_dataFim: newAge_dataFim,
      age_horaInicioFim: newAge_horaInicioFim,
      age_horaFimFim: newAge_horaFimFim,
      age_endereco: newAge_endereco,
      age_retrabalho: newAge_retrabalho,
      cli_id: newAge_cli_id,
      fun_id: newAge_fun_id,
      age_valor: newAge_valor,
      age_desconto: newAge_desconto,
      age_observacao: newAge_observacao,
      age_garantia: newAge_garantia,
      age_metragem: newAge_metragem
        ? typeof newAge_metragem === "object"
          ? JSON.stringify(newAge_metragem)
          : newAge_metragem
        : null,
      age_local: newAge_local,
      created_at: createdAt,
      created_by: userData.fullName,
      updated_by: userData.fullName,
      empresa_id: empresa_id,
    };

    // console.log(objCreate);

    let newAgendamento = await dbQuery(
      "INSERT INTO AGENDAMENTO SET ?",
      objCreate
    );

    /* let axs = await dbQuery('SELECT * FROM AXS WHERE age_id = ?', [age_id]);

    if (axs.length > 0) {
        for (let ax of axs) {
            let query = 'INSERT INTO AXS (age_id, ser_id, ser_quantity) VALUES (?, ?, ?)';
            let values = [newAgendamento.insertId, ax.ser_id, ax.ser_quantity];

            await dbQuery(query, values);
        }
    } */

    let servicos = agendamento[0].servicos;

    if (servicos.length > 0) {
      for (let servico of servicos) {
        if (servico.isOld) continue;

        let objAx = {
          age_id: newAgendamento.insertId,
          ser_id: servico.ser_id,
          ser_sub_id: servico.ser_sub_id,
          ser_quantity: servico.ser_quantity,
          ser_valor: servico.ser_valor,
          ser_descricao: servico.ser_descricao,
          ser_data: servico.ser_data
            ? typeof servico.ser_data === "object"
              ? JSON.stringify(servico.ser_data)
              : servico.ser_data
            : null,
          empresa_id: empresa_id,
        };

        await dbQuery("INSERT INTO AXS SET ?", objAx);
      }
    }

    let comissao = await dbQuery("SELECT * FROM COMISSOES WHERE age_id = ? AND empresa_id = ?", [
      age_id, empresa_id,
    ]);

    if (comissao.length > 0) {
      let query =
        "INSERT INTO COMISSOES (age_id, com_valor, com_paga, com_paga_data, fun_id, created_at, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?)";
      let values = [
        newAgendamento.insertId,
        comissao[0].com_valor,
        comissao[0].com_paga,
        comissao[0].com_paga_data,
        newAge_fun_id,
        createdAt,
        empresa_id,
      ];

      await dbQuery(query, values);
    }

    let pagamento = await dbQuery("SELECT * FROM PAGAMENTO WHERE age_id = ? AND empresa_id = ?", [
      age_id, empresa_id,
    ]);

    if (pagamento.length > 0) {
      let valor = pagamento[0].pgt_valor;
      if (valor) {
        if (isNaN(valor)) {
          valor = 0;
        } else {
          valor = parseFloat(valor).toFixed(2);
        }
      } else {
        valor = 0;
      }

      let query =
        "INSERT INTO PAGAMENTO (age_id, pgt_valor, pgt_data, empresa_id) VALUES (?, ?, ?, ?)";
      let values = [newAgendamento.insertId, valor, createdAt, empresa_id];

      await dbQuery(query, values);
    }

    let imagens = await dbQuery("SELECT * FROM IMAGENS_AGE WHERE age_id = ? AND empresa_id = ?", [
      age_id, empresa_id,
    ]);

    if (imagens.length > 0) {
      for (let imagem of imagens) {
        let query =
          "INSERT INTO IMAGENS_AGE (age_id, url, filename, empresa_id) VALUES (?, ?, ?, ?)";
        let values = [newAgendamento.insertId, imagem.url, imagem.filename, empresa_id];

        await dbQuery(query, values);
      }
    }

    await dbQuery(
      "UPDATE AGENDAMENTO SET ast_id = 7, updated_by = ? WHERE age_id = ? AND empresa_id = ?",
      [userData.fullName, age_id, empresa_id]
    );

    const agendamentoInsertQuery = await getAgendamentos(
      "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
      [newAgendamento.insertId, empresa_id]
    );

    if (agendamentoInsertQuery.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    const agendamentoInsert = agendamentoInsertQuery[0];

    const funcionarios = await dbQuery(
      "SELECT * FROM User WHERE ativo = 1 AND podeAgendamento = 1 AND empresa_id = ?",
      [empresa_id]
    );

    agendamentoInsert.funcionarios = funcionarios;

    setHistoricoAgendamento(age_id, {
      title: "Agendamento remarcado",
      description: `Agendamento remarcado para ${moment(newAge_data).format(
        "DD/MM/YYYY"
      )} às ${newAge_horaInicio}. Novo agendamento #${
        newAgendamento.insertId
      } criado`,
      feitoPor: userData.fullName,
      color: "warning",
      icon: "tabler-calendar-event",
    });

    setHistoricoAgendamento(newAgendamento.insertId, {
      title: "Agendamento criado por remarcação",
      description: `Agendamento criado a partir da remarcação do agendamento #${age_id}`,
      feitoPor: userData.fullName,
      color: "success",
      icon: "tabler-calendar-plus",
    });

    res.status(200).json(agendamentoInsert);
  } catch (error) {
    console.error("Erro ao remarcar agendamento: ", error);
    res.status(500).json(error);
  }
});

router.post("/changeFuncionario", async (req, res) => {
  try {
    const { age_id, fun_id } = req.body;
    const userData = req.user;
    const empresa_id = req.user.empresa_id;

    if (!userData || !userData.id || !userData.fullName) {
      return res.status(403).json({ message: "Sem permissão" });
    }

    const funcionarioQuery = await dbQuery("SELECT * FROM User WHERE id = ? AND empresa_id = ?", [
      fun_id, empresa_id,
    ]);
    const funcionarioNome =
      funcionarioQuery.length > 0
        ? funcionarioQuery[0].fullName
        : "Funcionário";

    await dbQuery(
      "UPDATE AGENDAMENTO SET fun_id = ?, updated_by = ? WHERE age_id = ? AND empresa_id = ?",
      [fun_id, userData.fullName, age_id, empresa_id]
    );

    setHistoricoAgendamento(age_id, {
      title: "Funcionário alterado",
      description: `Funcionário alterado para: ${funcionarioNome}`,
      feitoPor: userData.fullName,
      color: "info",
      icon: "tabler-user-cog",
    });

    res.status(200).json({ message: "Funcionário alterado com sucesso" });
  } catch (error) {
    console.error("Erro ao alterar funcionário: ", error);
    res.status(500).json(error);
  }
});

router.post("/changeHorarios", async (req, res) => {
  try {
    const {
      age_id,
      age_horaInicio,
      age_horaFim,
      age_data,
      age_dataFim,
      age_horaInicioFim,
      age_horaFimFim,
    } = req.body;

    const userData = req.user;
    const empresa_id = req.user.empresa_id;

    if (!userData || !userData.id || !userData.fullName) {
      return res.status(403).json({ message: "Sem permissão" });
    }

    let agendamento = await getAgendamentos(
      "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
      [age_id, empresa_id]
    );

    if (agendamento.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    let agendamentoData = agendamento[0];

    let query =
      "UPDATE AGENDAMENTO SET age_horaInicio = ?, age_horaFim = ?, age_horaInicioFim = ?, age_horaFimFim = ?, updated_by = ?";
    let values = [
      age_horaInicio,
      age_horaFim,
      age_horaInicioFim,
      age_horaFimFim,
      userData.fullName,
    ];

    let descricaoAlteracao = `Horários do agendamento alterados:`;

    if (age_horaInicio !== agendamentoData.age_horaInicio) {
      descricaoAlteracao += `\n- Horário início: ${
        agendamentoData.age_horaInicio || "Nenhum"
      } para ${age_horaInicio || "Nenhum"}`;
    }

    if (age_horaFim !== agendamentoData.age_horaFim) {
      descricaoAlteracao += `\n- Horário fim: ${
        agendamentoData.age_horaFim || "Nenhum"
      } para ${age_horaFim || "Nenhum"}`;
    }

    if (age_data) {
      query += ", age_data = ?";
      values.push(age_data);

      if (age_data !== agendamentoData.age_data) {
        descricaoAlteracao += `\n- Data: ${
          moment(agendamentoData.age_data).format("DD/MM/YYYY") || "Nenhum"
        } para ${moment(age_data).format("DD/MM/YYYY") || "Nenhum"}`;
      }
    }

    if (age_dataFim) {
      query += ", age_dataFim = ?";
      values.push(age_dataFim);

      if (age_dataFim !== agendamentoData?.age_dataFim) {
        descricaoAlteracao += `\n- Data fim: ${
          moment(agendamentoData?.age_dataFim).format("DD/MM/YYYY") || "Nenhum"
        } para ${moment(age_dataFim).format("DD/MM/YYYY") || "Nenhum"}`;
      }
    }

    if (age_horaInicioFim) {
      query += ", age_horaInicioFim = ?";
      values.push(age_horaInicioFim);

      if (age_horaInicioFim !== agendamentoData?.age_horaInicioFim) {
        descricaoAlteracao += `\n- Horário início término: ${
          agendamentoData?.age_horaInicioFim || "Nenhum"
        } para ${age_horaInicioFim || "Nenhum"}`;
      }
    }

    if (age_horaFimFim) {
      query += ", age_horaFimFim = ?";
      values.push(age_horaFimFim);

      if (age_horaFimFim !== agendamentoData?.age_horaFimFim) {
        descricaoAlteracao += `\n- Horário fim término: ${
          agendamentoData?.age_horaFimFim || "Nenhum"
        } para ${age_horaFimFim || "Nenhum"}`;
      }
    }

    query += " WHERE age_id = ? AND empresa_id = ?";
    values.push(age_id);
    values.push(empresa_id);

    await dbQuery(query, values);

    setHistoricoAgendamento(age_id, {
      title: "Horário alterado",
      description: descricaoAlteracao,
      feitoPor: userData.fullName,
      color: "warning",
      icon: "tabler-clock",
    });

    res.status(200).json({ message: "Hora alterada com sucesso" });
  } catch (error) {
    console.error("Erro ao alterar hora: ", error);
    res.status(500).json(error);
  }
});

router.post("/create", async (req, res) => {
  try {
    const { agendamentoData } = req.body;

    const userData = req.user;
    const empresa_id = req.user.empresa_id;

    if (!userData || !userData.id || !userData.fullName) {
      return res.status(403).json({ message: "Sem permissão" });
    }

    let {
      cliente,
      funcionario,
      age_observacao,
      age_contrato = null,
      age_data,
      age_horaInicio,
      age_horaFim,
      age_type,
      age_fonte = null,
      endereco,
    } = agendamentoData;

    if (
      !age_type ||
      (age_type != "bloqueio" && !cliente) ||
      !funcionario ||
      !age_data ||
      !age_horaInicio ||
      !age_horaFim ||
      !endereco
    ) {
      return res
        .status(400)
        .json({ message: "Dados obrigatórios não informados" });
    }

    console.log("Agendamento Data: ", agendamentoData);

    cliente = cliente && cliente.id ? cliente : null;

    if (age_type != "bloqueio" && !cliente) {
      return res.status(400).json({ message: "Cliente não informado" });
    }

    let cli_id = cliente?.id;
    let fun_id =
      typeof funcionario === "object" ? funcionario?.id : funcionario;

    if (!fun_id) {
      return res.status(400).json({ message: "Funcionário não informado" });
    }

    let ast_id = 1; //Agendado
    let createdAt = moment().format("YYYY-MM-DD");

    let age_endereco = endereco?.id || null;
    let add_end = false;

    if (age_endereco && endereco) {
      const enderecoExistQuery = await dbQuery(
        "SELECT * FROM ENDERECO WHERE end_id = ? AND empresa_id = ?",
        [age_endereco, empresa_id]
      );

      if (enderecoExistQuery.length > 0) {
        const enderecoExist = enderecoExistQuery[0];

        add_end =
          isDiff(enderecoExist?.end_cep, endereco.cep) ||
          isDiff(enderecoExist?.end_logradouro, endereco.logradouro) ||
          isDiff(enderecoExist?.end_numero, endereco.numero) ||
          isDiff(enderecoExist?.end_complemento, endereco.complemento) ||
          isDiff(enderecoExist?.end_bairro, endereco.bairro) ||
          isDiff(enderecoExist?.end_cidade, endereco.cidade) ||
          isDiff(enderecoExist?.end_estado, endereco.estado);
      }
    } else {
      add_end = true;
    }

    if (add_end && endereco && cli_id) {
      let objEnd = {
        end_cep: endereco.cep,
        end_logradouro: endereco.logradouro,
        end_numero: endereco.numero,
        end_complemento: endereco.complemento,
        end_bairro: endereco.bairro,
        end_cidade: endereco.cidade,
        end_estado: endereco.estado,
        cli_id: cli_id,
        empresa_id: empresa_id,
      };

      let newEnd = await dbQuery("INSERT INTO ENDERECO SET ?", objEnd);
      age_endereco = newEnd.insertId;
    }

    /* let query = 'INSERT INTO AGENDAMENTO (cli_id, fun_id, ast_id, age_observacao, age_data, age_horaInicio, age_horaFim, age_endereco, created_at, updated_by, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    let values = [cli_id, fun_id, ast_id, age_observacao, age_data, age_horaInicio, age_horaFim, age_endereco, createdAt, userData.fullName, userData.fullName];

    let agendamento = await dbQuery(query, values); */

    let objCreate = {
      cli_id: cli_id,
      fun_id: fun_id,
      ast_id: ast_id,
      age_observacao: age_observacao,
      age_data: age_data,
      age_horaInicio: age_horaInicio,
      age_horaFim: age_horaFim,
      age_type: age_type,
      age_dataFim: agendamentoData.age_dataFim ?? null,
      age_horaInicioFim: agendamentoData.age_horaInicioFim ?? null,
      age_horaFimFim: agendamentoData.age_horaFimFim ?? null,
      age_endereco: age_endereco,
      age_fonte: age_fonte,
      age_contrato: age_contrato,
      created_at: createdAt,
      updated_by: userData.fullName,
      created_by: userData.fullName,
      empresa_id: empresa_id,
    };

    let agendamento = await dbQuery("INSERT INTO AGENDAMENTO SET ?", objCreate);

    setHistoricoAgendamento(agendamento.insertId, {
      title: "Agendamento criado",
      description: `Agendamento criado para ${moment(age_data).format(
        "DD/MM/YYYY"
      )} às ${age_horaInicio}`,
      feitoPor: userData.fullName,
      color: "success",
      icon: "tabler-calendar-plus",
    });

    // Disparar fluxos de novo agendamento
    try {
      const agendamentoCompleto = await getAgendamentos(
        "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
        [agendamento.insertId, empresa_id]
      );
      if (agendamentoCompleto && agendamentoCompleto.length > 0) {
        await triggerAgendamentoFlows("novo_agendamento", {
          agendamento: agendamentoCompleto[0],
        });
      }
    } catch (error) {
      console.error("Erro ao disparar fluxos de novo agendamento:", error);
    }

    res.status(200).json(agendamento.insertId);
  } catch (error) {
    console.error("Erro ao criar agendamento: ", error);
    res.status(500).json(error);
  }
});

router.post("/update", async (req, res) => {
  try {
    const { data } = req.body;
    const userData = req.user;
    const empresa_id = req.user.empresa_id;

    if (!userData || !userData.id || !userData.fullName) {
      return res.status(403).json({ message: "Sem permissão" });
    }

    let {
      age_id,
      age_observacao,
      age_metragem = null,
      servicos,
      endereco,
      age_valor,
      age_desconto,
      age_garantia = null,
      age_local = null,
      age_retrabalho,
      age_retrabalho_id = null,
      age_retrabalho_motivo = null,
      age_fonte = null,
      age_contrato = null,
      cli_id,
    } = data;

    // Buscar agendamento atual para comparar alterações
    const agendamentoAtualQuery = await dbQuery(
      "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
      [age_id, empresa_id]
    );
    const agendamentoAtual =
      agendamentoAtualQuery.length > 0 ? agendamentoAtualQuery[0] : null;

    endereco = endereco[0];

    let age_endereco = endereco.end_id;
    let add_end = false;

    if (age_endereco) {
      const enderecoExistQuery = await dbQuery(
        "SELECT * FROM ENDERECO WHERE end_id = ? AND empresa_id = ?",
        [age_endereco, empresa_id]
      );

      if (enderecoExistQuery.length > 0) {
        const enderecoExist = enderecoExistQuery[0];

        add_end =
          isDiff(enderecoExist?.end_cep, endereco.end_cep) ||
          isDiff(enderecoExist?.end_logradouro, endereco.end_logradouro) ||
          isDiff(enderecoExist?.end_numero, endereco.end_numero) ||
          isDiff(enderecoExist?.end_complemento, endereco.end_complemento) ||
          isDiff(enderecoExist?.end_bairro, endereco.end_bairro) ||
          isDiff(enderecoExist?.end_cidade, endereco.end_cidade) ||
          isDiff(enderecoExist?.end_estado, endereco.end_estado);
      }
    } else {
      add_end = true;
    }

    if (add_end) {
      let objEnd = {
        end_cep: endereco.end_cep,
        end_logradouro: endereco.end_logradouro,
        end_numero: endereco.end_numero,
        end_complemento: endereco.end_complemento,
        end_bairro: endereco.end_bairro,
        end_cidade: endereco.end_cidade,
        end_estado: endereco.end_estado,
        cli_id: cli_id,
        empresa_id: empresa_id,
      };

      let newEnd = await dbQuery("INSERT INTO ENDERECO SET ?", objEnd);
      age_endereco = newEnd.insertId;
    }

    await dbQuery("DELETE FROM AXS WHERE age_id = ? AND empresa_id = ?", [age_id, empresa_id]);

    let valor = 0;
    if (servicos.length > 0) {
      for (let servico of servicos) {
        if (!servico.ser_id) continue;

        let servicoDB;

        if (servico.isSub || servico.ser_sub_id) {
          let servicoQuery = await dbQuery(
            "SELECT * FROM SERVICOS_SUBS WHERE ser_id = ? AND empresa_id = ?",
            [servico.ser_sub_id, empresa_id]
          );

          servicoDB = servicoQuery.length > 0 ? servicoQuery[0] : null;
        } else {
          let servicoQuery = await dbQuery(
            "SELECT * FROM SERVICOS_NEW WHERE ser_id = ? AND empresa_id = ?",
            [servico.ser_id, empresa_id]
          );

          servicoDB = servicoQuery.length > 0 ? servicoQuery[0] : null;
        }

        if (!servicoDB) continue;

        // Convertendo ser_valor para um formato consistente
        //Se valor não for um número, setar para 0
        console.log("servico.ser_valor", servico.ser_valor);
        if (servico.ser_valor) {
          if (isNaN(servico.ser_valor)) {
            servico.ser_valor = 0;
          } else {
            servico.ser_valor = parseFloat(servico.ser_valor).toFixed(2);
          }
        } else {
          servico.ser_valor = 0;
        }

        let objAXS = {
          age_id: age_id,
          ser_id:
            !servico.isSub && !servico.ser_sub_id
              ? servico.ser_id
              : servicoDB.ser_pai,
          ser_sub_id:
            servico.isSub || servico.ser_sub_id ? servico.ser_sub_id : null,
          ser_quantity: servico.ser_quantity ? servico.ser_quantity : 1,
          ser_valor: servico.ser_valor,
          ser_descricao: servico.ser_descricao,
          ser_data: JSON.stringify(
            servico.ser_data || {
              garantia: null,
              ser_area: null,
              metragem_interno: null,
              metragem_externo: null,
              metragem_total: null,
            }
          ),
          empresa_id: empresa_id,
        };

        await dbQuery("INSERT INTO AXS SET ?", objAXS);

        valor += parseFloat(
          servico.ser_valor * (servico.ser_quantity ? servico.ser_quantity : 1)
        );
      }
    }

    age_valor = valor.toFixed(2);

    let objUpdate = {
      age_fonte,
      age_observacao,
      age_metragem: age_metragem ? JSON.stringify(age_metragem) : null,
      age_valor,
      age_desconto,
      age_garantia,
      age_local,
      age_retrabalho: age_retrabalho ? 1 : 0,
      age_retrabalho_id,
      age_retrabalho_motivo,
      age_endereco,
      age_contrato,
      updated_by: userData.fullName,
    };

    await dbQuery("UPDATE AGENDAMENTO SET ? WHERE age_id = ? AND empresa_id = ?", [
      objUpdate,
      age_id,
      empresa_id,
    ]);

    // Mapear alterações específicas
    const alteracoes = [];

    if (agendamentoAtual) {
      // Comparar observações
      if (agendamentoAtual.age_observacao != age_observacao) {
        alteracoes.push({
          title: "Observações alteradas",
          description: `Observações: "${
            agendamentoAtual.age_observacao || ""
          }" → "${age_observacao || ""}"`,
          feitoPor: userData.fullName,
          color: "info",
          icon: "tabler-notes",
        });
      }

      // Comparar valor
      if (
        parseFloat(agendamentoAtual.age_valor || 0) !=
        parseFloat(age_valor || 0)
      ) {
        alteracoes.push({
          title: "Valor alterado",
          description: `Valor: R$ ${parseFloat(
            agendamentoAtual.age_valor || 0
          ).toFixed(2)} → R$ ${parseFloat(age_valor || 0).toFixed(2)}`,
          feitoPor: userData.fullName,
          color: "warning",
          icon: "tabler-currency-real",
        });
      }

      // Comparar desconto
      if (
        parseFloat(agendamentoAtual.age_desconto || 0) !=
        parseFloat(age_desconto || 0)
      ) {
        alteracoes.push({
          title: "Desconto alterado",
          description: `Desconto: R$ ${parseFloat(
            agendamentoAtual.age_desconto || 0
          ).toFixed(2)} → R$ ${parseFloat(age_desconto || 0).toFixed(2)}`,
          feitoPor: userData.fullName,
          color: "warning",
          icon: "tabler-discount",
        });
      }

      // Comparar garantia
      if (agendamentoAtual.age_garantia != age_garantia) {
        alteracoes.push({
          title: "Garantia alterada",
          description: `Garantia: "${
            agendamentoAtual.age_garantia || "Nenhuma"
          }" → "${age_garantia || "Nenhuma"}"`,
          feitoPor: userData.fullName,
          color: "info",
          icon: "tabler-shield-check",
        });
      }

      // Comparar local
      if (agendamentoAtual.age_local != age_local) {
        alteracoes.push({
          title: "Local alterado",
          description: `Local: "${agendamentoAtual.age_local || ""}" → "${
            age_local || ""
          }"`,
          feitoPor: userData.fullName,
          color: "info",
          icon: "tabler-map-pin",
        });
      }

      // Comparar retrabalho
      if (agendamentoAtual.age_retrabalho != (age_retrabalho ? 1 : 0)) {
        alteracoes.push({
          title: "Retrabalho alterado",
          description: `Retrabalho: ${
            agendamentoAtual.age_retrabalho ? "Sim" : "Não"
          } → ${age_retrabalho ? "Sim" : "Não"}`,
          feitoPor: userData.fullName,
          color: age_retrabalho ? "error" : "success",
          icon: "tabler-alert-triangle",
        });
      }

      // Comparar motivo do retrabalho
      if (
        agendamentoAtual.age_retrabalho_motivo != age_retrabalho_motivo &&
        age_retrabalho
      ) {
        alteracoes.push({
          title: "Motivo do retrabalho alterado",
          description: `Motivo: "${
            agendamentoAtual.age_retrabalho_motivo || ""
          }" → "${age_retrabalho_motivo || ""}"`,
          feitoPor: userData.fullName,
          color: "warning",
          icon: "tabler-message-circle",
        });
      }

      // Comparar fonte
      if (agendamentoAtual.age_fonte != age_fonte) {
        alteracoes.push({
          title: "Fonte alterada",
          description: `Fonte: "${
            agendamentoAtual.age_fonte || "Nenhuma"
          }" → "${age_fonte || "Nenhuma"}"`,
          feitoPor: userData.fullName,
          color: "info",
          icon: "tabler-source-code",
        });
      }

      // Comparar contrato
      if (agendamentoAtual.age_contrato != age_contrato) {
        alteracoes.push({
          title: "Contrato alterado",
          description: `Contrato: "${
            agendamentoAtual.age_contrato || "Nenhum"
          }" → "${age_contrato || "Nenhum"}"`,
          feitoPor: userData.fullName,
          color: "info",
          icon: "tabler-file-text",
        });
      }

      // Comparar metragem
      const metragemAntigaStr = agendamentoAtual.age_metragem
        ? JSON.stringify(JSON.parse(agendamentoAtual.age_metragem))
        : "{}";
      const metragemNovaStr = age_metragem
        ? JSON.stringify(age_metragem)
        : "{}";
      if (metragemAntigaStr != metragemNovaStr) {
        alteracoes.push({
          title: "Metragem alterada",
          description: `Metragem atualizada`,
          feitoPor: userData.fullName,
          color: "info",
          icon: "tabler-ruler",
        });
      }
    }

    // Registrar todas as alterações no histórico
    if (alteracoes.length > 0) {
      setHistoricoAgendamento(age_id, alteracoes);
    } else {
      setHistoricoAgendamento(age_id, {
        title: "Agendamento salvo",
        description: `Informações do agendamento foram salvas, mas não houve alterações`,
        feitoPor: userData.fullName,
        color: "info",
        icon: "tabler-edit",
      });
    }

    res.status(200).json({ message: "Agendamento atualizado com sucesso" });
  } catch (error) {
    console.error("Erro ao atualizar agendamento: ", error);
    res.status(500).json(error);
  }
});

router.post("/setAtendido", async (req, res) => {
  try {
    const { data } = req.body;

    const userData = req.user;
    const empresa_id = req.user.empresa_id;

    if (!userData || !userData.id || !userData.fullName) {
      return res.status(403).json({ message: "Sem permissão" });
    }

    if (!can("atender", "agendamento", userData.abilitys)) {
      return res.status(400).json({ message: "Sem permissão!" });
    }

    let { age_id, servicos } = data;

    let total = servicos.reduce((acc, servico) => {
      return (
        acc +
        parseFloat(servico.ser_valor || 0) *
          (servico.ser_quantity ? servico.ser_quantity : 1)
      );
    }, 0);

    let age_valor = (total || 0).toFixed(2);

    if (isNaN(age_valor)) {
      age_valor = 0;
    }

    await dbQuery(
      "UPDATE AGENDAMENTO SET ast_id = 3, atendido_date = ?, updated_by = ? WHERE age_id = ? AND empresa_id = ?",
      [moment().format("YYYY-MM-DD"), userData.fullName, age_id, empresa_id]
    );

    let agendamento = await dbQuery(
      "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
      [age_id, empresa_id]
    );

    let pagamento = null;

    try {
      pagamento = await createPagamento(age_id);
    } catch (error) {
      console.error("Erro ao criar pagamento: ", error);
    }

    setHistoricoAgendamento(age_id, {
      title: "Agendamento atendido",
      description: `Agendamento marcado como atendido com valor de R$ ${age_valor}`,
      feitoPor: userData.fullName,
      color: "success",
      icon: "tabler-circle-check",
    });

    res.status(200).json({
      agendamento: agendamento[0],
      pagamento_id: pagamento?.insertId ?? null,
    });
  } catch (error) {
    console.error("Erro ao atualizar agendamento: ", error);
    res.status(500).json(error);
  }
});

router.post("/desetAtendido", async (req, res) => {
  try {
    const { age_id } = req.body;

    const userData = req.user;
    const empresa_id = req.user.empresa_id;

    if (!userData || !userData.id || !userData.fullName) {
      return res.status(403).json({ message: "Sem permissão" });
    }

    if (!can("atender", "agendamento", userData.abilitys)) {
      return res.status(403).json({ message: "Sem permissão" });
    }

    if (!age_id) {
      return res.status(400).json({ message: "Agendamento não informado" });
    }

    await dbQuery(
      "UPDATE AGENDAMENTO SET ast_id = 2, atendido_date = NULL, updated_by = ? WHERE age_id = ? AND empresa_id = ?",
      [userData.fullName, age_id, empresa_id]
    );

    //Excluir todos os pagamentos do agendamento
    await dbQuery("DELETE FROM PAGAMENTO WHERE age_id = ? AND empresa_id = ?", [age_id, empresa_id]);

    res.status(200).json({ message: "Agendamento desatendido com sucesso" });
  } catch (error) {
    console.error("Erro ao desatender agendamento: ", error);
    res.status(500).json(error);
  }
});

router.post("/getPagamentos", async (req, res) => {
  const { age_id } = req.body;
  const empresa_id = req.user.empresa_id;

  try {
    let pagamentos = await dbQuery(`SELECT * FROM PAGAMENTO WHERE age_id = ? AND empresa_id = ?`, [
      age_id, empresa_id,
    ]);

    if (!pagamentos.length) {
      return res.status(404).json({ message: "Pagamentos não encontrado" });
    }

    let valorPagoGeral = 0;
    let valorPagoBkGeral = 0;

    for (let pagamento of pagamentos) {
      let pags = pagamento.pgt_json ? JSON.parse(pagamento.pgt_json) : [];
      pagamento.pgt_json = pags;

      let valorPago = 0;
      let valorPagoBk = 0;

      for (let pag of pags) {
        valorPago += pagamento.pgt_data ? parseFloat(pag.pgt_valor) : 0;
        valorPagoBk += parseFloat(pag.pgt_valor);
      }

      pagamento.pgt_valor = valorPago;
      pagamento.pgt_valor_bk = valorPagoBk;

      let formas =
        pags.length > 0
          ? await dbQuery(
              `SELECT * FROM FORMAS_PAGAMENTO WHERE fpg_id IN (${pags
                .map((pag) => pag.fpg_id)
                .join(",")}) AND empresa_id = ?`,
              [empresa_id]
            )
          : [];
      pagamento.fpg_name =
        formas.length > 0
          ? formas.map((forma) => forma.fpg_descricao).join(", ")
          : "";

      pagamento.pgt_data = pagamento.pgt_data
        ? moment(pagamento.pgt_data).format("DD/MM/YYYY")
        : null;

      valorPagoGeral += valorPago;
      valorPagoBkGeral += valorPagoBk;
    }

    let agendamento = await getAgendamentos(
      `SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?`,
      [age_id, empresa_id]
    );

    //console.log('agendamento valor: ', agendamento[0].age_valor);
    //console.log('agendamento desconto: ', agendamento[0].age_desconto);
    let age_valor =
      agendamento[0].age_valor - (agendamento[0].age_desconto ?? 0);

    agendamento[0].valorPago = valorPagoGeral;
    agendamento[0].valorNaoPago = age_valor - valorPagoGeral;

    pagamentos = pagamentos.map((pagamento) => {
      pagamento.agendamento = agendamento;
      return pagamento;
    });

    res.status(200).json({
      pagamentos,
      valorPagoTotal: agendamento[0].valorPago,
      valorNaoPagoTotal: agendamento[0].valorNaoPago,
    });
  } catch (error) {
    console.error("Erro ao buscar pagamento", error);
    res.status(500).json({ error });
  }
});

router.post("/addPagamento", async (req, res) => {
  try {
    if (!can("create", "finaneiro_recebimento", req.user.abilitys)) {
      return res.status(400).json({ message: "Sem permissão!" });
    }

    const { age_id } = req.body;
    const empresa_id = req.user.empresa_id;

    let agendamento = await dbQuery(
      "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
      [age_id, empresa_id]
    );

    if (agendamento.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    let valor = agendamento[0].age_valor - (agendamento[0].age_desconto ?? 0);

    let pagamentos = await dbQuery(
      `SELECT * FROM PAGAMENTO WHERE age_id = ? AND empresa_id = ?`,
      [age_id, empresa_id]
    );

    if (pagamentos.length > 0) {
      let totalPagamentos = pagamentos.reduce(
        (acc, curr) => acc + curr.pgt_valor,
        0
      );
      let totalJaPago = pagamentos.reduce((acc, curr) => {
        let pags = curr.pgt_json ? JSON.parse(curr.pgt_json) : [];
        let valorPago = 0;

        for (let pag of pags) {
          valorPago += curr.pgt_data ? parseFloat(pag.pgt_valor) : 0;
        }

        return acc + valorPago;
      }, 0);

      if (totalJaPago > valor) {
        return res
          .status(400)
          .json({
            message:
              "Este agendamento já foi totalmente pago, edite os pagamentos existentes para ajustar o valor.",
          });
      } else if (totalPagamentos > valor) {
        return res
          .status(400)
          .json({
            message:
              "Este agendamento já possuí pagamentos com o valor total, edite os pagamentos existentes para ajustar o valor.",
          });
      } else if (totalPagamentos > 0 || totalJaPago > 0) {
        valor = valor - totalPagamentos;
      }
    }

    let formasPagamento = await dbQuery("SELECT * FROM FORMAS_PAGAMENTO WHERE empresa_id = ?", [empresa_id]);
    let fpg_id =
      formasPagamento.find((f) => f.fpg_descricao.toLowerCase() === "dinheiro")
        ?.fpg_id ??
      formasPagamento[0]?.fpg_id ??
      1;

    let objF = [
      {
        fpg_id,
        pgt_valor: valor,
      },
    ];

    let pagamento = await dbQuery(
      "INSERT INTO PAGAMENTO (age_id, pgt_valor, pgt_json, empresa_id) VALUES (?, ?, ?, ?)",
      [age_id, valor, JSON.stringify(objF), empresa_id]
    );

    res.status(200).json(pagamento.insertId);
  } catch (error) {
    console.error("Erro ao adicionar pagamento: ", error);
    res.status(500).json(error);
  }
});

router.post("/getCertificate", async (req, res) => {
  try {
    const { age_id } = req.body;
    const empresa_id = req.user.empresa_id;

    if (!age_id) {
      return res
        .status(400)
        .json({ message: "O ID do agendamento é obrigatório" });
    }

    const agendamentoQuery = await getAgendamentos(
      "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
      [age_id, empresa_id]
    );

    if (agendamentoQuery.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    const agendamento = agendamentoQuery[0];

    const cliente = agendamento.cliente;
    const endereco = agendamento.endereco;
    const servicos = agendamento.servicos;

    // let enderecoFormatado = `${endereco[0].end_logradouro}, ${endereco[0].end_numero} - ${endereco[0].end_bairro}, ${endereco[0].end_cidade}/${endereco[0].end_estado}`;
    let enderecoFormatado = escreverEndereco(endereco[0]);

    const arrMes = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];

    let mesOrigAgora = arrMes[moment().format("MM") - 1];
    let dataFormatadaAgora = moment().format(
      "DD [de] [" + mesOrigAgora + "] [de] YYYY"
    );

    //Separar serviços por virgula
    let servicosFormatados = servicos.map((servico) => {
      /* servico.ser_nome + ' - ' + servico.ser_descricao + ' - Qtd: ' + servico.ser_quantity */
      return `${servico.ser_nome}`;
    });

    let dataGarantia = agendamento.age_garantia
      ? agendamento.age_garantia
      : "180 dias";
    let dataAplicacao = moment(agendamento.age_data).format("DD/MM/YYYY");

    if (dataGarantia && dataAplicacao) {
      // Calcular a garantia do agendamento
      let periodoGarantia = agendamento.age_garantia
        ? agendamento.age_garantia
        : "180 dias";

      if (periodoGarantia.includes("meses")) {
        let meses = periodoGarantia.replace("meses", "");
        dataGarantia = moment(dataAplicacao, "DD/MM/YYYY")
          .add(meses, "months")
          .format("DD/MM/YYYY");
      } else if (periodoGarantia.includes("dias")) {
        let dias = periodoGarantia.replace("dias", "");
        dataGarantia = moment(dataAplicacao, "DD/MM/YYYY")
          .add(dias, "days")
          .format("DD/MM/YYYY");
      } else if (periodoGarantia.includes("anos")) {
        let anos = periodoGarantia.replace("anos", "");
        dataGarantia = moment(dataAplicacao, "DD/MM/YYYY")
          .add(anos, "years")
          .format("DD/MM/YYYY");
      }
    }

    let data = {
      age_id: agendamento.age_id,
      name: cliente[0].cli_nome,
      cpf: cliente[0].cli_cpf,
      endereco: enderecoFormatado,
      dataAplicacao,
      dataGarantia,
      date: dataFormatadaAgora,
      services: servicosFormatados,
      quantityServices: servicos.length,
    };

    const certificate = await createCertificate(data);

    let url = `/download/docs/certificados/${agendamento.age_id}/${certificate.fileName}`;

    //Atualizar no banco que o certificado foi gerado
    await dbQuery(
      "UPDATE AGENDAMENTO SET age_certificado = ? WHERE age_id = ? AND empresa_id = ?",
      [url, age_id, empresa_id]
    );

    res.status(200).json(url);
  } catch (error) {
    console.error("Erro ao buscar certificado: ", error);
    res.status(500).json(error);
  }
});

router.post("/getRecibo", async (req, res) => {
  try {
    const { age_id } = req.body;
    const empresa_id = req.user.empresa_id;

    const agendamentoQuery = await getAgendamentos(
      "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
      [age_id, empresa_id]
    );

    if (agendamentoQuery.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    const agendamento = agendamentoQuery[0];

    const cliente = agendamento.cliente;
    const endereco = agendamento.endereco;
    const servicos = agendamento.servicos;

    let enderecoFormatado = `${endereco[0].end_logradouro}, ${endereco[0].end_numero} - ${endereco[0].end_bairro}, ${endereco[0].end_cidade}/${endereco[0].end_estado}`;

    let dataFormatada = moment(agendamento.age_data).format(
      "DD [de] MMMM [de] YYYY"
    );
    //Separar serviços por virgula
    let servicosFormatados = servicos.map((servico) => {
      /* servico.ser_nome + ' - ' + servico.ser_descricao + ' - Qtd: ' + servico.ser_quantity */
      return `${servico.ser_nome}${
        servico.ser_descricao ? " - " + servico.ser_descricao : ""
      }${servico.ser_quantity > 0 ? " - Qtd: " + servico.ser_quantity : ""}`;
    });

    const formatValue = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(agendamento.age_valor);

    let data = {
      age_id: agendamento.age_id,
      name: cliente[0].cli_nome,
      cpf: cliente[0].cli_cpf,
      endereco: enderecoFormatado,
      date: dataFormatada,
      services: servicosFormatados,
      quantityServices: servicos.length,
      valor: formatValue,
      valorExtenso: await numeroParaExtenso(agendamento.age_valor),
      dataRecibo: dataFormatada,
    };

    const recibo = await createRecibo(data);

    let url = `/download/docs/recibos/${agendamento.age_id}/${recibo.fileName}`;

    //Atualizar no banco que o recibo foi gerado
    await dbQuery("UPDATE AGENDAMENTO SET age_recibo = ? WHERE age_id = ? AND empresa_id = ?", [
      url,
      age_id,
      empresa_id,
    ]);

    res.status(200).json(url);
  } catch (error) {
    console.error("Erro ao buscar recibo: ", error);
    res.status(500).json(error);
  }
});

router.post("/duplicar", async (req, res) => {
  const {
    age_id,
    age_data,
    age_horaInicio,
    age_horaFim,
    age_dataFim,
    age_horaInicioFim,
    age_horaFimFim,
    ast_id,
    fun_id,
    options,
  } = req.body;

  const userData = req.user;
  const empresa_id = req.user.empresa_id;

  if (!userData || !userData.id || !userData.fullName) {
    return res.status(403).json({ message: "Sem permissão" });
  }

  try {
    let agendamentoQuery = await dbQuery(
      "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
      [age_id, empresa_id]
    );

    if (agendamentoQuery.length === 0) {
      return res.status(404).json({ message: "Agendamento não encontrado" });
    }

    let agendamento = agendamentoQuery[0];

    let endereco = agendamento.age_endereco
      ? await dbQuery("SELECT * FROM ENDERECO WHERE end_id = ? AND empresa_id = ?", [
          agendamento.age_endereco, empresa_id,
        ])
      : await dbQuery("SELECT * FROM ENDERECO WHERE cli_id = ? AND empresa_id = ?", [
          agendamento.cli_id, empresa_id,
        ]);

    let createdAt = moment().format("YYYY-MM-DD HH:mm:ss");

    let objCreate = {
      ...agendamento,
      age_id: null,
      ast_id: ast_id ? ast_id : 1,
      age_data: age_data
        ? moment(age_data).format("YYYY-MM-DD")
        : moment(agendamento.age_data).format("YYYY-MM-DD"),
      age_horaInicio: age_horaInicio
        ? age_horaInicio
        : agendamento.age_horaInicio,
      age_horaFim: age_horaFim ? age_horaFim : agendamento.age_horaFim,
      age_dataFim: age_dataFim
        ? moment(age_dataFim).format("YYYY-MM-DD")
        : agendamento.age_dataFim,
      age_horaInicioFim: age_horaInicioFim
        ? age_horaInicioFim
        : agendamento.age_horaInicioFim,
      age_horaFimFim: age_horaFimFim
        ? age_horaFimFim
        : agendamento.age_horaFimFim,
      age_endereco: agendamento.age_endereco
        ? agendamento.age_endereco
        : endereco[0].end_id || null,
      age_retrabalho: agendamento.age_retrabalho,
      cli_id: agendamento.cli_id,
      created_at: createdAt,
      created_by: userData.fullName,
      updated_by: userData.fullName,
      updated_at: null,
      empresa_id: empresa_id,
    };

    let newAgendamento = await dbQuery(
      "INSERT INTO AGENDAMENTO SET ?",
      objCreate
    );

    let newAge_fun_id = fun_id ? fun_id : agendamento.fun_id;

    if (options.servicos) {
      let axs = await dbQuery("SELECT * FROM AXS WHERE age_id = ? AND empresa_id = ?", [age_id, empresa_id]);

      if (axs.length > 0) {
        for (let ax of axs) {
          const objAX = {
            age_id: newAgendamento.insertId,
            ser_id: ax.ser_id,
            ser_sub_id: ax.ser_sub_id,
            ser_quantity: ax.ser_quantity,
            ser_descricao: ax.ser_descricao,
            ser_valor: ax.ser_valor,
            ser_data: ax.ser_data,
            empresa_id: empresa_id,
          };

          await dbQuery("INSERT INTO AXS SET ?", objAX);
        }
      }
    }

    if (options.comissao) {
      let comissao = await dbQuery("SELECT * FROM COMISSOES WHERE age_id = ? AND empresa_id = ?", [
        age_id, empresa_id,
      ]);

      if (comissao.length > 0) {
        let query =
          "INSERT INTO COMISSOES (age_id, com_valor, com_paga, com_paga_data, fun_id, created_at, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?)";
        let values = [
          newAgendamento.insertId,
          comissao[0].com_valor,
          comissao[0].com_paga,
          comissao[0].com_paga_data,
          newAge_fun_id,
          createdAt,
          empresa_id,
        ];

        await dbQuery(query, values);
      }
    }

    if (options.pagamentos) {
      let pagamento = await dbQuery(
        "SELECT * FROM PAGAMENTO WHERE age_id = ? AND empresa_id = ?",
        [age_id, empresa_id]
      );

      if (pagamento.length > 0) {
        let query =
          "INSERT INTO PAGAMENTO (age_id, pgt_valor, pgt_data, empresa_id) VALUES (?, ?, ?, ?)";
        let values = [
          newAgendamento.insertId,
          pagamento[0].pgt_valor,
          createdAt,
          empresa_id,
        ];

        await dbQuery(query, values);
      }
    }

    if (options.imagens) {
      let imagens = await dbQuery(
        "SELECT * FROM IMAGENS_AGE WHERE age_id = ? AND empresa_id = ?",
        [age_id, empresa_id]
      );

      if (imagens.length > 0) {
        for (let imagem of imagens) {
          let query =
            "INSERT INTO IMAGENS_AGE (age_id, url, filename, empresa_id) VALUES (?, ?, ?, ?)";
          let values = [newAgendamento.insertId, imagem.url, imagem.filename, empresa_id];

          await dbQuery(query, values);
        }
      }
    }

    setHistoricoAgendamento(age_id, {
      title: "Agendamento duplicado",
      description: `Agendamento duplicado. Novo agendamento #${newAgendamento.insertId} criado`,
      feitoPor: userData.fullName,
      color: "info",
      icon: "tabler-copy",
    });

    setHistoricoAgendamento(newAgendamento.insertId, {
      title: "Agendamento criado por duplicação",
      description: `Agendamento criado a partir da duplicação do agendamento #${age_id}`,
      feitoPor: userData.fullName,
      color: "success",
      icon: "tabler-calendar-plus",
    });

    res.status(200).json(newAgendamento.insertId);
  } catch (error) {
    console.error("Erro ao duplicar agendamento: ", error);
    res.status(500).json(error);
  }
});

router.get("/getRetrabalhos", async (req, res) => {
  let {
    q = "",
    f = "",
    dataDe = null,
    dataAte = null,
    cliente = null,
    sortBy = "",
    itemsPerPage = 10,
    page = 1,
    orderBy = "asc",
  } = req.query;
  const empresa_id = req.user.empresa_id;

  let offset = (page - 1) * itemsPerPage;

  if (itemsPerPage == "-1") {
    offset = 0;
    itemsPerPage = 1000000;
  }

  let baseQuery = `FROM AGENDAMENTO WHERE age_retrabalho = 1 AND empresa_id = ${Number(empresa_id)}`;

  if (q) {
    baseQuery += ` AND (
            age_data LIKE %${q}% OR 
            age_valor LIKE %${q}%
        )`;
  }

  if (f) {
    baseQuery += ` AND fun_id = ${f}`;
  }

  if (dataDe) {
    baseQuery += ` AND age_data >= ${dataDe}`;
  }

  if (dataAte) {
    baseQuery += ` AND age_data <= ${dataAte}`;
  }

  if (cliente) {
    baseQuery += ` AND cli_id = ${cliente}`;
  }

  let dataQuery = `SELECT *, (SELECT COUNT(*) ${baseQuery}) as totalAgendamentos ${baseQuery}`;

  if (sortBy) {
    dataQuery += ` ORDER BY ${sortBy} ${orderBy}`;
  } else {
    dataQuery += " ORDER BY age_data DESC";
  }

  dataQuery += ` LIMIT ${offset}, ${itemsPerPage}`;

  console.log("Data Query:", dataQuery);

  try {
    const agendamentos = await getAgendamentos(dataQuery);

    console.log("Agendamentos Retrabalhos:", agendamentos.length);

    for (let agendamento of agendamentos) {
      try {
        agendamento.agendamentoAnterior = await getAgendamentos(
          "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
          [agendamento.age_retrabalho_id, empresa_id]
        );
      } catch (error) {
        console.error("Erro ao encontrar agendamento em retrabaçhps: ", error);
      }
    }

    let data = {
      agendamentos,
      totalAgendamentos:
        agendamentos.length > 0 ? agendamentos[0].totalAgendamentos : 0,
    };

    res.status(200).json(data);
  } catch (error) {
    console.error("Erro ao buscar agendamentos", error);
    res.status(500).json({ message: error.message });
  }
});

router.get("/getAgendamentosGarantia", async (req, res) => {
  let {
    q = "",
    dataDe = null,
    dataAte = null,
    cliente = null,
    expire = null,
    sortBy = "",
    itemsPerPage = 10,
    page = 1,
    orderBy = "asc",
  } = req.query;
  const empresa_id = req.user.empresa_id;

  let offset = (page - 1) * itemsPerPage;

  if (itemsPerPage == "-1") {
    offset = 0;
    itemsPerPage = 1000000;
  }

  let baseQuery = `FROM AGENDAMENTO WHERE age_garantia IS NOT NULL AND age_garantia != '' AND ast_id = 3 AND atendido_date IS NOT NULL AND empresa_id = ${Number(empresa_id)}`;

  if (q) {
    baseQuery += ` AND (
            age_data LIKE %${q}% OR 
            age_valor LIKE %${q}%
        )`;
  }

  if (dataDe) {
    baseQuery += ` AND age_data >= ${dataDe}`;
  }

  if (dataAte) {
    baseQuery += ` AND age_data <= ${dataAte}`;
  }

  if (cliente) {
    baseQuery += ` AND cli_id = ${cliente}`;
  }

  let dataQuery = `SELECT *, (SELECT COUNT(*) ${baseQuery}) as totalAgendamentos ${baseQuery}`;

  if (sortBy) {
    dataQuery += ` ORDER BY ${sortBy} ${orderBy}`;
  } else {
    dataQuery += " ORDER BY age_data DESC";
  }

  dataQuery += ` LIMIT ${offset}, ${itemsPerPage}`;

  try {
    const agendamentos = await getAgendamentos(dataQuery);

    // Se tiver expire, filtrar os agendamentos que estão para expirar com base em atendido_date
    let agendamentosFiltrados = [];

    if (expire) {
      for (let agendamento of agendamentos) {
        let periodoGarantia = agendamento.age_garantia;

        // Se tiver incluído "meses" no período, calcular a data de expiração
        if (periodoGarantia.includes("meses")) {
          let meses = parseInt(periodoGarantia.split(" ")[0]);
          let dataGarantia = new Date(agendamento.atendido_date);
          dataGarantia.setMonth(dataGarantia.getMonth() + meses);

          let dataAtual = new Date();
          let diff = dataGarantia - dataAtual;
          let diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));

          if (expire === "1 semana" && diffDays <= 7) {
            agendamentosFiltrados.push(agendamento);
          } else if (expire === "2 semanas" && diffDays > 7 && diffDays <= 14) {
            agendamentosFiltrados.push(agendamento);
          } else if (expire === "1 mês ou mais" && diffDays > 30) {
            agendamentosFiltrados.push(agendamento);
          }
        }
        // Se tiver incluído "dias" no período, calcular a data de expiração
        else if (periodoGarantia.includes("dias")) {
          let dias = parseInt(periodoGarantia.split(" ")[0]);
          let dataGarantia = new Date(agendamento.atendido_date);
          dataGarantia.setDate(dataGarantia.getDate() + dias);

          let dataAtual = new Date();
          let diff = dataGarantia - dataAtual;
          let diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));

          if (expire === "1 semana" && diffDays <= 7) {
            agendamentosFiltrados.push(agendamento);
          } else if (expire === "2 semanas" && diffDays > 7 && diffDays <= 14) {
            agendamentosFiltrados.push(agendamento);
          } else if (expire === "1 mês ou mais" && diffDays > 30) {
            agendamentosFiltrados.push(agendamento);
          }
        }
        // Se tiver incluído "anos" no período, calcular a data de expiração
        else if (periodoGarantia.includes("anos")) {
          let anos = parseInt(periodoGarantia.split(" ")[0]);
          let dataGarantia = new Date(agendamento.atendido_date);
          dataGarantia.setFullYear(dataGarantia.getFullYear() + anos);

          let dataAtual = new Date();
          let diff = dataGarantia - dataAtual;
          let diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));

          if (expire === "1 semana" && diffDays <= 7) {
            agendamentosFiltrados.push(agendamento);
          } else if (expire === "2 semanas" && diffDays > 7 && diffDays <= 14) {
            agendamentosFiltrados.push(agendamento);
          } else if (expire === "1 mês ou mais" && diffDays > 30) {
            agendamentosFiltrados.push(agendamento);
          }
        }
        // Se tiver incluído "semanas" no período, calcular a data de expiração
        else if (periodoGarantia.includes("semanas")) {
          let semanas = parseInt(periodoGarantia.split(" ")[0]);
          let dataGarantia = new Date(agendamento.atendido_date);
          dataGarantia.setDate(dataGarantia.getDate() + semanas * 7);

          let dataAtual = new Date();
          let diff = dataGarantia - dataAtual;
          let diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));

          if (expire === "1 semana" && diffDays <= 7) {
            agendamentosFiltrados.push(agendamento);
          } else if (expire === "2 semanas" && diffDays > 7 && diffDays <= 14) {
            agendamentosFiltrados.push(agendamento);
          } else if (expire === "1 mês ou mais" && diffDays > 30) {
            agendamentosFiltrados.push(agendamento);
          }
        }
      }
    }

    let data = {
      agendamentos: expire ? agendamentosFiltrados : agendamentos,
      totalAgendamentos:
        agendamentos.length > 0 ? agendamentos[0].totalAgendamentos : 0,
    };

    res.status(200).json(data);
  } catch (error) {
    console.error("Erro ao buscar agendamentos", error);
    res.status(500).json({ message: error.message });
  }
});

router.get("/getAgendamentosByCliente", async (req, res) => {
  let {
    q = "",
    d = null,
    dataDe = null,
    dataAte = null,
    cliente = null,
    status = null,
    sortBy = "",
    itemsPerPage = 10,
    page = 1,
    orderBy = "asc",
  } = req.query;
  const empresa_id = req.user.empresa_id;

  //console.log('Query: ', req.query);

  let offset = (page - 1) * itemsPerPage;

  if (itemsPerPage == "-1") {
    offset = 0;
    itemsPerPage = 1000000;
  }

  let baseQuery = `FROM AGENDAMENTO WHERE empresa_id = ${Number(empresa_id)}`;
  // let queryParams = [];

  if (q) {
    baseQuery += ` AND (
            age_data LIKE %${q}% OR 
            age_valor LIKE %${q}%
        )`;
  }

  if (status) {
    baseQuery += ` AND ast_id = ${status}`;
  }

  if (d) {
    baseQuery += ` AND age_data = '${d}'`;
  }

  if (dataDe) {
    baseQuery += ` AND age_data >= '${dataDe}'`;
  }

  if (dataAte) {
    baseQuery += ` AND age_data <= '${dataAte}'`;
  }

  if (cliente) {
    baseQuery += ` AND cli_id = ${cliente}`;
  }

  let dataQuery = `SELECT *, (SELECT COUNT(*) ${baseQuery}) as totalAgendamentos ${baseQuery}`;

  if (sortBy) {
    dataQuery += ` ORDER BY ${sortBy} ${orderBy}`;
  } else {
    dataQuery += " ORDER BY age_data DESC";
  }

  dataQuery += ` LIMIT ${offset}, ${itemsPerPage}`;

  try {
    const agendamentos = await getAgendamentos(dataQuery);

    let data = {
      agendamentos,
      totalAgendamentos:
        agendamentos.length > 0 ? agendamentos[0].totalAgendamentos : 0,
    };

    res.status(200).json(data);
  } catch (error) {
    console.error("Erro ao buscar agendamentos", error);
    res.status(500).json({ message: error.message });
  }
});

router.post("/salvarOrdemServico", async (req, res) => {
  const { age_id, ordemData } = req.body;

  if (!age_id || !ordemData) {
    return res.status(400).json({ message: "Dados inválidos" });
  }

  try {
    const userData = req.user;
    const empresa_id = req.user.empresa_id;
    const agendamento = await dbQuery(
      "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
      [age_id, empresa_id]
    );

    if (agendamento.length === 0) {
      return res.status(400).json({ message: "Agendamento não encontrado" });
    }

    await dbQuery(
      "UPDATE AGENDAMENTO SET age_ordemservico = ? WHERE age_id = ? AND empresa_id = ?",
      [JSON.stringify(ordemData), age_id, empresa_id]
    );

    if (userData && userData.fullName) {
      setHistoricoAgendamento(age_id, {
        title: "Ordem de serviço salva",
        description: `Dados da ordem de serviço foram salvos`,
        feitoPor: userData.fullName,
        color: "info",
        icon: "tabler-file-text",
      });
    }

    return res
      .status(200)
      .json({ message: "Ordem de serviço salva com sucesso" });
  } catch (error) {
    console.error("Erro ao salvar ordem de serviço", error);
    return res.status(500).json({ message: "Erro ao salvar ordem de serviço" });
  }
});

router.post("/gerarOrdemServico", async (req, res) => {
  const { age_id } = req.body;

  if (!age_id) {
    return res.status(400).json({ message: "Dados inválidos" });
  }

  try {
    const empresa_id = req.user.empresa_id;
    const agendamento = await dbQuery(
      "SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?",
      [age_id, empresa_id]
    );

    if (agendamento.length === 0) {
      return res.status(400).json({ message: "Agendamento não encontrado" });
    }

    let ordemData = agendamento[0].age_ordemServico;

    if (!ordemData) {
      return res
        .status(400)
        .json({ message: "Ordem de serviço não encontrada" });
    }

    if (typeof ordemData === "string") {
      ordemData = JSON.parse(ordemData);
    }

    const ordemServico = await createOrdemServico({
      ...ordemData,
      age_id: agendamento[0].age_id,
    });

    let url = `/download/docs/ordens-servico/${agendamento[0].age_id}/${ordemServico.fileName}`;

    ordemData = {
      ...ordemData,
      assinaturaData: {
        filePdf: {
          ...ordemServico,
          url: url,
        },
      },
    };

    await dbQuery(
      "UPDATE AGENDAMENTO SET age_ordemServico = ? WHERE age_id = ? AND empresa_id = ?",
      [JSON.stringify(ordemData), agendamento[0].age_id, empresa_id]
    );

    const userData = req.user;
    if (userData && userData.fullName) {
      setHistoricoAgendamento(age_id, {
        title: "Ordem de serviço gerada",
        description: `Ordem de serviço PDF foi gerada`,
        feitoPor: userData.fullName,
        color: "success",
        icon: "tabler-file-check",
      });
    }

    return res
      .status(200)
      .json({ message: "Ordem de serviço gerada com sucesso", url, ordemData });
  } catch (error) {
    console.error("Erro ao gerar ordem de serviço", error);
    return res.status(500).json({ message: "Erro ao gerar ordem de serviço" });
  }
});

router.get("/getHistoricoAgendamento/:age_id", async (req, res) => {
  const { age_id } = req.params;

  if (!age_id) {
    return res.status(400).json({ message: "Dados inválidos" });
  }

  try {
    const historico = await getHistoricoAgendamento(age_id);

    return res.status(200).json(historico);
  } catch (error) {
    console.error("Erro ao buscar histórico de agendamento", error);
    return res.status(500).json({ message: error.message });
  }
});

async function numeroParaExtenso(valor) {
  const unidades = [
    "",
    "um",
    "dois",
    "três",
    "quatro",
    "cinco",
    "seis",
    "sete",
    "oito",
    "nove",
  ];
  const dezenas = [
    "",
    "dez",
    "vinte",
    "trinta",
    "quarenta",
    "cinquenta",
    "sessenta",
    "setenta",
    "oitenta",
    "noventa",
  ];
  const dezenas10 = [
    "dez",
    "onze",
    "doze",
    "treze",
    "quatorze",
    "quinze",
    "dezesseis",
    "dezessete",
    "dezoito",
    "dezenove",
  ];
  const centenas = [
    "",
    "cem",
    "duzentos",
    "trezentos",
    "quatrocentos",
    "quinhentos",
    "seiscentos",
    "setecentos",
    "oitocentos",
    "novecentos",
  ];

  function converterNumeroMenorQue1000(valor) {
    let extenso = "";
    if (valor > 0 && valor < 10) {
      extenso = unidades[valor];
    } else if (valor >= 10 && valor < 20) {
      extenso = dezenas10[valor - 10];
    } else if (valor >= 20 && valor < 100) {
      extenso =
        dezenas[Math.floor(valor / 10)] +
        (valor % 10 > 0 ? " e " + unidades[valor % 10] : "");
    } else if (valor >= 100 && valor < 1000) {
      extenso =
        centenas[Math.floor(valor / 100)] +
        (valor % 100 > 0
          ? " e " + converterNumeroMenorQue1000(valor % 100)
          : "");
    }
    return extenso;
  }

  if (valor === 0) {
    return "zero";
  } else {
    let milhar = Math.floor(valor / 1000);
    let resto = valor % 1000;
    let extenso = "";

    if (milhar > 0) {
      extenso += converterNumeroMenorQue1000(milhar) + " mil";
      if (resto > 0) {
        extenso += " e ";
      }
    }

    extenso += converterNumeroMenorQue1000(resto);
    return extenso;
  }
}

module.exports = router;
