<script setup>
  import { temaAtual } from "@core/stores/config";
  import { socket } from "@/composables/useSocket";
  import moment from "moment";

  import DadosCliente from "@/views/apps/crm/dadosCliente.vue";

  const { setAlert } = useAlert();

  const userData = useCookie("userData").value;

  const router = useRouter();
  const loading = ref(false);
  const loadingMessages = ref(false);

  const searchQuery = ref("");

  const allChats = ref([]);
  const selectedChat = ref(null);
  const loadingMoreChats = ref(false);

  const getMoreChats = async () => {
    loadingMoreChats.value = true;

    try {
      const res = await $api("/zap/allChats", {
        method: "GET",
        query: {
          itemsPerPage: allChats.value.length + 12,
          type: 'atendimento'
        },
      });

      if (!res) return;

      console.log("res more chats", res);

      if (res == "Desconectado") {
        setAlert(
          "Não foi possível obter as conversas, verifique se o WhatsApp está conectado.",
          "error"
        );
        return;
      }

      if (res.length > 0) {
        allChats.value = res;
      }
    } catch (error) {
      console.error("Error fetching chats:", error, error.response);

      allChats.value = [];
    } finally {
      loadingMoreChats.value = false;
    }
  };

  const handleScrollChats = (event) => {
    if (!event || !event.target || loadingMoreChats.value) return;

    const scrollTop = event.target.scrollTop;
    const scrollHeight = event.target.scrollHeight;
    const clientHeight = event.target.clientHeight;

    if (scrollTop + clientHeight >= scrollHeight - 5) {
      console.log("rolou fim");
      getMoreChats();
    } else if (scrollTop <= 0) {
      console.log("rolou inicio");
    }
  };

  const getAllChats = async () => {
    loading.value = true;

    try {
      const res = await $api("/zap/allChats", {
        method: "GET",
        query: {
          q: searchQuery.value,
          type: 'atendimento'
        },
      });

      if (!res) return;

      console.log("res chats", res);

      if (res == "Desconectado") {
        setAlert(
          "Não foi possível obter as conversas, verifique se o WhatsApp está conectado.",
          "error"
        );

        setTimeout(() => {
          router.push('/crm/config');
        }, 2000);
        return;
      }

      allChats.value = res;
    } catch (error) {
      console.error("Error fetching chats:", error, error.response);

      allChats.value = [];
    } finally {
      loading.value = false;
    }
  };

  getAllChats();

  const formatShortMsg = (msg, midia = true) => {
    if (!msg) return "";

    let msgText = msg.texto;

    if (!msgText) {
      msgText = midia ? "--" : "";
    }

    msgText = msgText.replace(/<br>/g, " ");

    if (msg.hasMedia && msg.midia) {
      let media = msg.media;

      //console.log("media", media);

      const handleDuration = (seconds) => {
        if (!seconds) return "Audio";

        const minutes = Math.floor(seconds / 60);

        const remainingSeconds = seconds % 60;
        return `${minutes}:${
          remainingSeconds < 10 ? "0" : ""
        }${remainingSeconds}`;
      };

      if (media.mime?.includes("image")) {
        msgText = '<i class="tabler-photo"></i> ' + msgText;
      } else if (media.mime?.includes("video")) {
        msgText = '<i class="tabler-video"></i> ' + msgText;
      } else if (media.mime?.includes("audio")) {
        msgText =
          '<i class="tabler-microphone"></i> ' + handleDuration(media.duration);
      } else if (media.mime?.includes("document")) {
        msgText = '<i class="tabler-file-text"></i> ' + msgText;
      } else {
        msgText = '<i class="tabler-paperclip"></i> ' + msgText;
      }
    }

    return msgText.substring(0, 60);
  };

  const getChat = async (id, index = -1, up = false) => {
    try {
      const res = await $api("/zap/getChat/" + id, {
        method: "GET",
        query: {
          type: 'atendimento'
        },
      });

      if (!res) return;

      console.log("res chat", res);

      if (res == "Desconectado") {
        setAlert(
          "Não foi possível obter as mensagens, verifique se o WhatsApp está conectado.",
          "error"
        );

        setTimeout(() => {
          router.push('/crm/config');
        }, 2000);
        return;
      }

      if (!up && selectedChat.value && index >= 0) {
        res.naoLida = 0;
        selectedChat.value = res;
        allChats.value[index] = res;

        rolarFimChat();
      } else {
        let nchat = {
          ...res,
          ultimaMensagem: res.messagens?.length
            ? res.messagens[res.messagens.length - 1]
            : null,
        }
        allChats.value.unshift(nchat);
      }
    } catch (error) {
      console.error("Error fetching chat:", error, error.response);
    }
  };

  const rolarFimChat = () => {
    setTimeout(() => {
      const chatBox = document.querySelector(".mensagem-box");
      if (chatBox) {
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    }, 500);
  };

  const selecionarChat = async (chat) => {
    let index = allChats.value.findIndex((c) => c.id == chat.id);

    if (index < 0) return;

    allChats.value[index].loadingChat = true;
    selectedChat.value = allChats.value[index];

    getChat(chat.id, index);
  };

  const handleNewMessage = (msg) => {
    if (!msg) return;

    let chatIndex = allChats.value.findIndex((c) => c.id == msg.idChat);

    console.log("chatIndex", chatIndex);

    if (chatIndex < 0 && (!searchQuery.value || searchQuery.value == "")) {
      return getChat(msg.idChat, -1, true);
    }

    allChats.value[chatIndex].ultimaMensagem = msg;
    if (!msg.fromMe) allChats.value[chatIndex].naoLida += 1;

    if (selectedChat?.value?.id == msg.idChat) {
      selectedChat.value.messagens = [
        ...selectedChat.value.messagens,
        msg,
      ].sort((a, b) => {
        return (
          moment(a.data, "DD/MM/YYYY HH:mm:ss") -
          moment(b.data, "DD/MM/YYYY HH:mm:ss")
        );
      });
      allChats.value[chatIndex].naoLida = 0;
      rolarFimChat();
    }
  };

  const goToImg = (url) => {
    if (!url) return;

    window.open(url, "_blank");
  };

  socket.on("nova-mensagem", (msg) => {
    console.log("nova-mensagem", msg);

    handleNewMessage(msg);
  });

  socket.on("update-mensagem", (msg) => {
    console.log("update-mensagem", msg);

    if (!msg || !selectedChat.value || !selectedChat.value?.messagens?.length)
      return;

    let chatIndex = selectedChat.value?.messagens?.findIndex(
      (c) => c.id == msg.id
    );

    if (chatIndex < 0) return;

    selectedChat.value.messagens[chatIndex].ack = msg.ack;
  });

  const handleData = (dataChat, short = true) => {
    const data = moment(dataChat, "DD/MM/YYYY HH:mm:ss");
    const now = moment();

    if (data.isSame(now, "day")) {
      return short ? data.format("HH:mm") : "Hoje";
    } else if (data.isSame(now.subtract(1, "day"), "day")) {
      return short ? data.format("HH:mm") : "Ontem";
    } else if (data.isSame(now.subtract(2, "day"), "day")) {
      return short ? data.format("HH:mm") : "Anteontem";
    } else {
      return short ? data.format("DD/MM/YYYY") : data.format("DD/MM/YYYY");
    }
  };

  /* Status possíveis:
   * 0: A mensagem foi enviada, mas ainda não chegou ao servidor (pendente).
   * 1: A mensagem foi recebida pelo servidor do WhatsApp.
   * 2: A mensagem foi entregue ao destinatário.
   * 3: A mensagem foi lida pelo destinatário (status de "lida").
   */

  const activeAudio = ref(null);

  const handlePlay = (id) => {
    activeAudio.value = id;
  };

  const gravando = ref(false);
  const audioUrl = ref(null);
  const mediaRecorder = ref(null);
  const chunks = [];
  const timeGravando = ref(0);
  const audioBlob = ref(null);
  let intervalGravando = null;

  const initTimer = () => {
    timeGravando.value = 0;

    if (intervalGravando) {
      clearInterval(intervalGravando);
    }

    intervalGravando = setInterval(() => {
      timeGravando.value += 1;
    }, 1000);
  };

  const stopTimer = () => {
    timeGravando.value = 0;
    clearInterval(intervalGravando);
  };

  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // escolhe OGG/Opus se for suportado, senão WEBM
      let mimeType;
      /*if (MediaRecorder.isTypeSupported("audio/mpeg")) {
        mimeType = "audio/mpeg";
      }  else if (MediaRecorder.isTypeSupported("audio/ogg; codecs=opus")) {
        mimeType = "audio/ogg; codecs=opus";
      }  else*/ if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      } else {
        throw new Error("Nenhum formato de gravação suportado");
      }

      mediaRecorder.value = new MediaRecorder(stream, { mimeType });

      mediaRecorder.value.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.value.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        audioBlob.value = blob; // armazena o blob
        audioUrl.value = URL.createObjectURL(blob); // URL para player
        chunks.length = 0;
      };

      mediaRecorder.value.start();
      gravando.value = true;
      initTimer();
    } catch (err) {
      console.error("Erro ao gravar:", err);
      alert("Não foi possível iniciar gravação: " + err.message);
    }
  };

  const pararGravacao = () => {
    if (mediaRecorder.value && gravando.value) {
      mediaRecorder.value.stop();
      gravando.value = false;
      stopTimer();
      console.log("Gravação parada.");
    }
  };

  const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const sec = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");
    return `${min}:${sec}`;
  };

  const message = ref("");
  const loadingSendMessage = ref(false);
  const filesToSend = ref([]);
  const inputFiles = ref(null);

  const sendMessage = async (type = "default") => {
    if (
      type == "default" &&
      (!message.value || message.value == "") &&
      (!filesToSend.value || filesToSend.value.length == 0)
    ) {
      setAlert("Digite uma mensagem ou anexo para enviar.", "error");
      return;
    }

    loadingSendMessage.value = true;

    let filePath;

    if (type == "audio") {
      pararGravacao();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const send = await sendAnexo("audio");

      if (send) {
        filePath = send;
      }
    } else if (inputFiles.value?.files?.length > 0) {
      const files = Array.from(inputFiles.value.files);

      if (files.length > 0) {
        filePath = [];

        for (const file of files) {
          const send = await sendAnexo(file);

          if (send) {
            filePath.push(send);
          }
        }
      }
    }

    try {
      const res = await $api("/zap/send-message-chat", {
        method: "POST",
        body: {
          chatId: selectedChat.value.id,
          message: message.value,
          midiaPath: filePath,
          replyId: viewReply.value && msgReply.value ? msgReply.value.id : null,
          type: 'atendimento'
        },
      });

      if (!res) return;

      console.log("res sendMessage", res);

      if (res == "Desconectado") {
        setAlert(
          "Não foi possível enviar a mensagem, verifique se o WhatsApp está conectado.",
          "error"
        );

        setTimeout(() => {
          router.push('/crm/config');
        }, 2000);
        return;
      }

      message.value = "";
      filesToSend.value = [];
      inputFiles.value.value = null;
      inputFiles.value.files = null;
      audioUrl.value = null;
      audioBlob.value = null;
      viewReply.value = false;
      msgReply.value = null;
    } catch (error) {
      console.error("Error sending message:", error, error.response);

      setAlert(
        error?.response?._data?.message ||
          error?.response?._data?.error ||
          "Erro ao enviar mensagem. Tente novamente.",
        "error",
        "tabler-alert-triangle",
        5000
      );
    } finally {
      loadingSendMessage.value = false;
    }
  };

  const sendAnexo = async (anexo) => {
    if (!anexo) return;

    try {
      const formData = new FormData();

      if (anexo == "audio") {
        formData.append(
          "file",
          new File([audioBlob.value], "voz.webm", {
            type: audioBlob.value.type,
          })
        );
      } else {
        formData.append("file", anexo);
      }

      const res = await $api("/zap/save-anexo", {
        method: "POST",
        query: {
          chatId: selectedChat.value.id,
          type: 'atendimento'
        },
        body: formData,
      });

      console.log("res sendAnexo", res);

      if (!res) return;

      return res;
    } catch (error) {
      console.error("Error sending anexo:", error, error.response);

      setAlert(
        error?.response?._data?.message ||
          error?.response?._data?.error ||
          "Erro ao enviar anexo. Tente novamente.",
        "error",
        "tabler-alert-triangle",
        5000
      );
    }
  };

  const resolveIconFile = (type) => {
    if (!type) return "tabler-file";

    type = type.toLowerCase();

    if (type.includes("pdf")) return "tabler-file-type-pdf";
    if (type.includes("doc")) return "tabler-file-word";
    if (type.includes("xls")) return "tabler-file-excel";
    if (type.includes("ppt")) return "tabler-file-type-ppt";
    if (type.includes("zip") || type.includes("rar")) return "tabler-file-zip";
    if (type.includes("jpg") || type.includes("jpeg"))
      return "tabler-file-type-jpg";
    if (type.includes("png")) return "tabler-file-type-png";
    if (type.includes("svg")) return "tabler-file-type-svg";
    if (type.includes("audio")) return "tabler-file-music";
    if (type.includes("video")) return "tabler-photo-video";

    return "tabler-file";
  };

  const actionsChat = (chat) => [
    {
      title: "Deletar",
      icon: "tabler-trash",
      action: "delete",
    },
    {
      title: chat.pinned ? "Desfixar" : "Fixar",
      icon: chat.pinned ? "tabler-pinned-off" : "tabler-pin",
      action: chat.pinned ? "unpin" : "pin",
    },
    {
      title:
        chat.naoLida < 0 || chat.naoLida > 0
          ? "Marcar como lido"
          : "Marcar como não lido",
      icon:
        chat.naoLida < 0 || chat.naoLida > 0
          ? "tabler-circle-x"
          : "tabler-circle-check",
      action:
        chat.naoLida < 0 || chat.naoLida > 0 ? "markAsRead" : "markAsUnread",
    },
  ];

  const handleActionChat = async (action, chat) => {
    if (!action || !chat) return;

    const indexChat = allChats.value.findIndex((c) => c.id == chat.id);

    if (indexChat < 0) return;

    try {
      const res = await $api("/zap/actions-chat/" + chat.id, {
        method: "GET",
        query: {
          action,
          type: 'atendimento'
        },
      });

      if (!res) return;

      console.log("res actionChat", res);

      if (res == "Desconectado") {
        setAlert(
          "Não foi possível realizar a ação, verifique se o WhatsApp está conectado.",
          "error"
        );

        setTimeout(() => {
          router.push('/crm/config');
        }, 2000);
        return;
      }

      if (action == "delete") {
        if (selectedChat.value?.id == chat.id) {
          selectedChat.value = null;
        }

        allChats.value.splice(indexChat, 1);
      } else if (action == "pin") {
        allChats.value[indexChat].pinned = true;
      } else if (action == "unpin") {
        allChats.value[indexChat].pinned = false;
      } else if (action == "markAsUnread") {
        allChats.value[indexChat].naoLida = -1;
      } else if (action == "markAsRead") {
        allChats.value[indexChat].naoLida = 0;
      }

      setAlert("Ação realizada com sucesso.", "success", "tabler-checks", 5000);
    } catch (error) {
      console.error("Error actionChat:", error, error.response);

      setAlert(
        error?.response?._data?.message ||
          error?.response?._data?.error ||
          "Erro ao realizar ação. Tente novamente.",
        "error",
        "tabler-alert-triangle",
        5000
      );
    } finally {
      allChats.value[indexChat].viewMenu = false;
    }
  };

  const viewMenuChat = ref(false);
  const chatMenu = ref(null);

  const handleMenuChat = (event, chat) => {
    if (!chat) return;

    chatMenu.value = chat;
    viewMenuChat.value = true;

    //Posiciona o menu na posição do clique
    const menu = document.querySelector(".menu-chat");
    if (menu) {
      console.log("menu", menu, event.clientX, event.clientY);
      menu.style.left = event.clientX + "px";
      menu.style.top = event.clientY + "px";
    }
  };

  const viewMenuMsg = ref(false);
  const msgMenu = ref(null);

  const handleMenuMsg = (event, msg) => {
    if (!msg) return;

    msgMenu.value = msg;
    viewMenuMsg.value = true;

    //Posiciona o menu na posição do clique
    const menu = document.querySelector(".menu-msg");
    if (menu) {
      console.log("menu", menu, event.clientX, event.clientY);
      menu.style.left = event.clientX + "px";
      menu.style.top = event.clientY + "px";
    }
  };

  const actionsMsg = (msg) => {
    let arr = [
      {
        title: "Responder",
        icon: "tabler-corner-up-left",
        action: "reply",
      },
    ];
    if (!msg.hasMedia) {
      arr.push({
        title: "Editar",
        icon: "tabler-edit",
        action: "edit",
      });
    }

    if (msg.fromMe) {
      arr.push(
        {
          title: "Deletar (todos)",
          icon: "tabler-trash",
          action: "deleteTodos",
        },
        {
          title: "Deletar (eu)",
          icon: "tabler-trash",
          action: "deleteMe",
        }
      );
    } else {
      arr.push({
        title: "Deletar",
        icon: "tabler-trash",
        action: "deleteMe",
      });
    }

    console.log("actionsMsg", arr);

    return arr;
  };

  const handleActionMsg = async (action, msg) => {
    if (!action || !msg) return;

    const indexMsg = selectedChat.value.messagens.findIndex(
      (c) => c.id == msg.id
    );

    if (indexMsg < 0) return;

    try {
      const res = await $api("/zap/actions-msg/" + msg.id, {
        method: "GET",
        query: {
          action,
          type: 'atendimento'
        },
      });

      if (!res) return;

      console.log("res actionMsg", res);

      if (res == "Desconectado") {
        setAlert(
          "Não foi possível realizar a ação, verifique se o WhatsApp está conectado.",
          "error"
        );

        setTimeout(() => {
          router.push('/crm/config');
        }, 2000);
        return;
      }

      if (action.includes("delete")) {
        selectedChat.value.messagens.splice(indexMsg, 1);
      } else if (action == "edit") {
        //TODO
      } else if (action == "reply") {
        //TODO
      }

      setAlert("Ação realizada com sucesso.", "success", "tabler-checks", 5000);
    } catch (error) {
      console.error("Error actionMsg:", error, error.response);

      setAlert(
        error?.response?._data?.message ||
          error?.response?._data?.error ||
          "Erro ao realizar ação. Tente novamente.",
        "error",
        "tabler-alert-triangle",
        5000
      );
    }
  };

  function formatHtmlMensagem(mensagem) {
    if (!mensagem) return "";

    return mensagem
      .replace(/<strong>(.*?)<\/strong>/g, "*$1*") // <strong>negrito</strong>
      .replace(/<em>(.*?)<\/em>/g, "_$1_") // <em>itálico</em>
      .replace(/<s>(.*?)<\/s>/g, "~$1~") // <s>riscado</s>
      .replace(/<br>/g, "\n"); // <br> quebras de linha
  }

  const openEdit = (msg) => {
    if (!msg) return;

    const index = selectedChat.value.messagens.findIndex((c) => c.id == msg.id);

    if (index < 0) return;

    selectedChat.value.messagens[index].viewEdit = true;
    selectedChat.value.messagens[index].textoEdit = formatHtmlMensagem(
      selectedChat.value.messagens[index].texto
    );
  };
  
  const loadingEditMsg = ref(false);
  const editMsg = async (msg) => {
    if (!msg) return;

    const index = selectedChat.value.messagens.findIndex((c) => c.id == msg.id);

    if (index < 0) return;

    loadingEditMsg.value = true;

    const body = {
      msgId: msg.id,
      texto: msg.textoEdit,
      type: 'atendimento'
    };

    console.log("body editMsg", body);
    try {
      const res = await $api("/zap/editar-msg", {
        method: "POST",
        body,
      });

      if (!res) return;

      console.log("res editMsg", res);

      if (res == "Desconectado") {
        setAlert(
          "Não foi possível editar a mensagem, verifique se o WhatsApp está conectado.",
          "error"
        );

        setTimeout(() => {
          router.push('/crm/config');
        }, 2000);
        return;
      }

      selectedChat.value.messagens[index].texto = msg.textoEdit;
      selectedChat.value.messagens[index].viewEdit = false;
    } catch (error) {
      console.error("Error editMsg:", error, error.response);

      setAlert(
        error?.response?._data?.message ||
          error?.response?._data?.error ||
          "Erro ao editar mensagem. Tente novamente.",
        "error",
        "tabler-alert-triangle",
        5000
      );
    } finally {
      loadingEditMsg.value = false;
    }
  };

  const viewReply = ref(false);
  const msgReply = ref(null);

  const openReply = (msg) => {
    if (!msg) return;

    const index = selectedChat.value.messagens.findIndex((c) => c.id == msg.id);

    if (index < 0) return;

    msgReply.value = msg;
    viewReply.value = true;
  };

  const goToResposta = (id) => {
    if (!id) return;

    const index = selectedChat.value.messagens.findIndex((c) => c.id == id);

    if (index < 0) return;

    const msg = selectedChat.value.messagens[index];

    setTimeout(() => {
      const el = document.querySelector(`[data-id-msg="${msg.id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 500);
  };

  const loadingMoreMsgs = ref(false);

  const getMoreMsgs = async () => {
    if (!selectedChat.value || !selectedChat.value.id) return;

    loadingMoreMsgs.value = true;

    try {
      const res = await $api("/zap/getChat/" + selectedChat.value.id, {
        method: "GET",
        query: {
          limit: selectedChat.value.messagens.length + 50,
          type: 'atendimento'
        },
      });

      if (!res) return;

      console.log("res more msgs", res);

      if (res == "Desconectado") {
        setAlert(
          "Não foi possível obter as mensagens, verifique se o WhatsApp está conectado.",
          "error"
        );
        return;
      }

      if (res.messagens.length > 0) {
        selectedChat.value.messagens = res.messagens.sort((a, b) => {
          return (
            moment(a.data, "DD/MM/YYYY HH:mm:ss") -
            moment(b.data, "DD/MM/YYYY HH:mm:ss")
          );
        });
      }
    } catch (error) {
      console.error("Error fetching chat:", error, error.response);
    }

    loadingMoreMsgs.value = false;
  };

  const handleScrollMsgs = (event) => {
    if (!event || !event.target || loadingMoreMsgs.value) return;

    const scrollTop = event.target.scrollTop;
    const scrollHeight = event.target.scrollHeight;
    const clientHeight = event.target.clientHeight;

    if (scrollTop + clientHeight >= scrollHeight - 5) {
      console.log("rolou fim");
    } else if (scrollTop <= 0) {
      console.log("rolou inicio");
      getMoreMsgs();
    }
  };

  const viewDadosCliente = ref(false);
  const loadingFinalizarAtendimento = ref(false);
  const loadingToggleFlows = ref(false);

  const finalizarAtendimento = async () => {
    if (!selectedChat.value?.waitingForAgent?.runId) {
      setAlert("Erro ao finalizar atendimento", "error");
      return;
    }

    loadingFinalizarAtendimento.value = true;

    try {
      const res = await $api(`/flows/run/${selectedChat.value.waitingForAgent.runId}/release-agent-block`, {
        method: "POST",
      });

      if (res && res.ok) {
        setAlert("Atendimento finalizado com sucesso!", "success", "tabler-check", 3000);
        
        // Atualizar o chat para remover o badge
        selectedChat.value.waitingForAgent = null;
        
        // Atualizar na lista de chats também
        const chatIndex = allChats.value.findIndex(c => c.id === selectedChat.value.id);
        if (chatIndex >= 0) {
          allChats.value[chatIndex].waitingForAgent = null;
        }
      }
    } catch (error) {
      console.error("Error finalizando atendimento:", error);
      setAlert(
        error?.response?._data?.message || "Erro ao finalizar atendimento",
        "error",
        "tabler-alert-triangle",
        5000
      );
    } finally {
      loadingFinalizarAtendimento.value = false;
    }
  };

  const toggleFlowsBlock = async () => {
    if (!selectedChat.value?.cliente?.id) {
      setAlert("Cliente não encontrado", "error");
      return;
    }

    const cliente = selectedChat.value.cliente;
    const action = cliente.flows_blocked ? 'desbloquear' : 'bloquear';
    const newStatus = !cliente.flows_blocked;

    if (!confirm(`Tem certeza que deseja ${action} os fluxos para este cliente?`)) {
      return;
    }

    loadingToggleFlows.value = true;

    try {
      const res = await $api(`/clientes/block-flows/${cliente.cli_Id}`, {
        method: 'PUT',
        body: {
          blocked: newStatus
        }
      });

      if (res) {
        setAlert(
          `Fluxos ${newStatus ? 'bloqueados' : 'desbloqueados'} com sucesso!`,
          'success',
          'tabler-check',
          3000
        );
        
        // Atualizar o status localmente
        selectedChat.value.cliente.flows_blocked = newStatus ? 1 : 0;
        
        // Atualizar na lista de chats também se possível
        const chatIndex = allChats.value.findIndex(c => c.id === selectedChat.value.id);
        if (chatIndex >= 0 && allChats.value[chatIndex].cliente) {
          allChats.value[chatIndex].cliente.flows_blocked = newStatus ? 1 : 0;
        }
      }
    } catch (error) {
      console.error("Error toggling flows block:", error);
      setAlert(
        error?.response?._data?.message || "Erro ao atualizar bloqueio de fluxos",
        "error",
        "tabler-alert-triangle",
        5000
      );
    } finally {
      loadingToggleFlows.value = false;
    }
  };

  // Cleanup dos listeners de socket ao desmontar o componente
  onBeforeUnmount(() => {
    socket.off("nova-mensagem");
    socket.off("update-mensagem");
  });
</script>

<template>
  <div class="menu-chat position-absolute">
    <VMenu v-model="viewMenuChat" location="top" contained>
      <VList>
        <VListItem
          class="item-action"
          v-for="action in actionsChat(chatMenu)"
          :key="action.title"
          @click="handleActionChat(action.action, chatMenu)"
        >
          <p class="mb-0">
            <VIcon :icon="action.icon" class="mr-2" />
            {{ action.title }}
          </p>
        </VListItem>
      </VList>
    </VMenu>
  </div>

  <div class="menu-msg position-absolute">
    <VMenu v-model="viewMenuMsg" location="top" contained>
      <VList>
        <VListItem
          class="item-action"
          v-for="action in actionsMsg(msgMenu)"
          :key="action.title"
          @click="
            action.action == 'edit'
              ? openEdit(msgMenu)
              : action.action == 'reply'
              ? openReply(msgMenu)
              : handleActionMsg(action.action, msgMenu)
          "
        >
          <p class="mb-0">
            <VIcon :icon="action.icon" class="mr-2" />
            {{ action.title }}
          </p>
        </VListItem>
      </VList>
    </VMenu>
  </div>
  <VRow style="max-height: 94vh; overflow: hidden">
    <VCol cols="4" class="pa-0">
      <VCard
        rounded="0"
        v-if="viewDadosCliente && selectedChat?.cliente"
        class="h-100"
      >
        <DadosCliente
          :dados="selectedChat"
          v-if="selectedChat?.cliente"
          @close="viewDadosCliente = false"
        />
      </VCard>
      <VCard rounded="0" v-else>
        <div class="header-messages pa-3">
          <h2 class="text-h5">Chat</h2>

          <VTextField
            v-model="searchQuery"
            label="Pesquisar"
            placeholder="Pesquise uma conversa pelo nome ou número do contato"
            class="mt-4"
            prepend-inner-icon="tabler-search"
            clearable
            :loading="loading"
            @update:modelValue="getAllChats"
          />
        </div>

        <div class="text-center py-3 px-2" v-if="loading">
          <v-progress-linear indeterminate color="primary" :height="5" />
        </div>

        <div class="chats" v-else @scroll="handleScrollChats">
          <template v-for="(chat, index) in allChats" :key="index">
            <div
              class="chat-item"
              :class="{
                'chat-selected': selectedChat?.id == chat.id,
                'chat-naoLido': chat.naoLida > 0 || chat.naoLida < 0,
              }"
              @click="selecionarChat(chat)"
              @contextmenu.prevent="handleMenuChat($event, chat)"
            >
              <VAvatar
                :color="chat.contato?.avatar ? undefined : 'primary'"
                :variant="chat.contato?.avatar ? undefined : 'tonal'"
                :size="45"
              >
                <VImg :src="chat.contato?.avatar" v-if="chat.contato?.avatar" />
                <VIcon icon="tabler-user-filled" v-else />
              </VAvatar>
              <div class="w-100">
                <div class="d-flex">
                  <p class="chat-name">
                    {{ chat.nome }}
                  </p>
                  <p class="ml-auto mb-0 text-disabled text-caption">
                    <VIcon icon="tabler-pin-filled" v-if="chat.pinned" />
                    {{ chat.ultimaAcao ? handleData(chat.ultimaAcao) : "" }}
                  </p>
                </div>
                <div
                  class="chat-last-message"
                  v-html="formatShortMsg(chat.ultimaMensagem ?? '--')"
                />
              </div>
              <div
                v-if="chat.naoLida > 0 || chat.naoLida < 0"
                class="bg-error rounded-circle circle-naoLida"
              >
                {{ chat.naoLida < 0 ? " " : chat.naoLida }}
              </div>
            </div>

            <v-progress-linear
              v-if="chat.loadingChat"
              indeterminate
              color="primary"
              :height="2"
              style="flex-basis: 100%"
            />
          </template>

          <div
            class="w-100 d-flex justify-center align-center"
            style="position: absolute; bottom: 10px; background-color: white"
            v-if="loadingMoreChats"
          >
            <v-progress-circular
              indeterminate
              color="secondary"
              :size="20"
              :width="2"
            ></v-progress-circular>
          </div>
        </div>
      </VCard>
    </VCol>

    <VCol cols="8" class="pa-0" v-if="selectedChat">
      <div
        class="mensagem-box overflow-y-auto"
        style="max-height: calc(95vh - 16px); min-height: calc(95vh - 16px)"
        @scroll="handleScrollMsgs"
      >
        <div class="carregando" v-if="selectedChat?.loadingChat">
          <v-progress-circular
            indeterminate
            :size="44"
            :width="5"
          ></v-progress-circular>
        </div>
        <div
          class="contact-header"
          style="
            border-width: 0 0 1px 0;
            position: sticky;
            top: 0px;
            z-index: 5;
          "
        >
          <VIcon
            icon="tabler-chevron-left"
            color="primary"
            @click="
              selectedChat = null;
              viewDadosCliente = false;
            "
          />

          <div
            class="contact-box"
            :class="{ 'cursor-pointer': selectedChat?.cliente }"
            @click="
              selectedChat && selectedChat?.cliente
                ? (viewDadosCliente = !viewDadosCliente)
                : ''
            "
          >
            <VAvatar
              :color="selectedChat?.contato?.avatar ? undefined : 'secondary'"
              size="40"
            >
              <VImg
                :src="selectedChat?.contato?.avatar"
                v-if="selectedChat?.contato?.avatar"
              />
              <VIcon icon="tabler-user-filled" v-else />
            </VAvatar>
            <div class="contact-info">
              <p class="mb-0 contact-name">
                {{
                  selectedChat?.contato?.nome || selectedChat?.nome || "Cliente"
                }}
              </p>
              <p class="mb-0 online-msg">
                {{
                  selectedChat && !selectedChat?.loadingChat
                    ? selectedChat?.cliente
                      ? "Clique para ver os dados do cliente"
                      : "Nenhum dado de cliente encontrado"
                    : ""
                }}
              </p>
            </div>
          </div>

          <div class="ml-auto d-flex gap-2">
            <VBtn
              v-if="selectedChat?.waitingForAgent"
              color="success"
              size="small"
              variant="tonal"
              @click="finalizarAtendimento"
              :loading="loadingFinalizarAtendimento"
              rounded="lg"
              style="height: 30px;"
            >
              <VIcon icon="tabler-check" class="mr-1" />
              Finalizar Atendimento
            </VBtn>

            <VBtn
              v-if="selectedChat?.cliente"
              :color="selectedChat?.cliente?.flows_blocked ? 'error' : 'default'"
              size="small"
              variant="tonal"
              @click="toggleFlowsBlock"
              :loading="loadingToggleFlows"
              rounded="lg"
              style="height: 30px;"
            >
              <VIcon 
                :icon="selectedChat?.cliente?.flows_blocked ? 'tabler-lock' : 'tabler-lock-open'" 
                class="mr-1" 
              />
              {{ selectedChat?.cliente?.flows_blocked ? 'Fluxos Bloqueados' : 'Bloquear Fluxos' }}
            </VBtn>
          </div>
        </div>

        <div class="messages-list mt-3" style="min-height: calc(-150px + 95vh)">
          <div
            class="w-100 d-flex justify-center align-center"
            v-if="loadingMoreMsgs"
          >
            <v-progress-circular
              indeterminate
              color="secondary"
              :size="20"
              :width="2"
            ></v-progress-circular>
          </div>

          <template
            v-for="(msg, index) in selectedChat?.messagens"
            :key="index"
          >
            <VDialog max-width="600" v-model="msg.viewEdit" persistent>
              <VCard>
                <VCardText>
                  <div
                    class="d-flex flex-row align-center justify-space-between"
                  >
                    <p class="mb-0">Editar mensagem</p>
                    <VIcon
                      icon="tabler-x"
                      class="cursor-pointer"
                      @click="msg.viewEdit = false"
                    />
                  </div>

                  <VTextarea
                    v-model="msg.textoEdit"
                    bg-color="white"
                    active
                    placeholder="Digite uma mensagem"
                    class="w-100 mt-3"
                    rows="3"
                  />

                  <div class="d-flex flex-row justify-end mt-3">
                    <VBtn
                      variant="outlined"
                      color="secondary"
                      class="mr-2"
                      @click="msg.viewEdit = false"
                    >
                      Cancelar
                    </VBtn>
                    <VBtn
                      color="primary"
                      @click="editMsg(msg)"
                      :loading="loadingEditMsg"
                    >
                      Salvar
                    </VBtn>
                  </div>
                </VCardText>
              </VCard>
            </VDialog>

            <div
              @contextmenu.prevent="handleMenuMsg($event, msg)"
              v-if="
                msg.tipo != 'data' &&
                (msg.texto ||
                  msg.media?.url ||
                  msg.resposta ||
                  msg.tipo == 'call' ||
                  msg.tipo == 'call_log' ||
                  msg.tipo == 'ciphertext')
              "
              class="message-item position-relative d-flex flex-column gap-2 align-start mb-4"
              :data-id-msg="msg.id"
              :style="
                !msg.media?.mime?.includes('image') ? '' : 'padding-bottom: 20px'
              "
              :class="{
                'message-cliente': !msg.fromMe,
                'message-sistema': msg.fromMe,
              }"
            >
              <div
                v-if="msg.hasResposta"
                class="div-resposta cursor-pointer"
                @click="goToResposta(msg.resposta.id)"
                :style="
                  msg.fromMe
                    ? 'background-color: #c6ddb4; border-color: green;'
                    : 'background-color: #dfdfdf; border-color: #b3b3b3;'
                "
              >
                <div
                  v-if="
                    msg.resposta.tipo == 'call_log' ||
                    msg.resposta.tipo == 'call'
                  "
                  class="w-100 d-flex flex-row gap-2 align-center"
                >
                  <VAvatar size="40" color="primary" variant="tonal">
                    <VIcon icon="tabler-phone" />
                  </VAvatar>

                  <p class="text-h6 mb-0">Ligação de voz</p>
                </div>

                <div
                  v-if="msg.resposta.tipo == 'ciphertext'"
                  class="w-100 d-flex flex-row gap-2 align-center"
                >
                  <VIcon icon="tabler-info-circle" color="primary" size="20" />
                  <p class="mb-0 text-disabled">
                    Essa mensagem não é suportada<br />
                    pelo WhatsApp Web. Abra no celular!
                  </p>
                </div>

                <div class="div-resposta-content">
                  <VImg
                    :src="msg.resposta.media.url"
                    v-if="msg.resposta.media?.mime?.includes('image')"
                    width="50"
                    height="50"
                    max-width="50"
                    max-height="50"
                    cover
                    class="rounded"
                  />
                  <!--video-->
                  <video
                    v-if="msg.resposta.media?.mime?.includes('video')"
                    width="50"
                    height="50"
                    max-width="50"
                    max-height="50"
                    controls
                    class="rounded"
                  >
                    <source :src="msg.resposta.media.url" type="video/mp4" />
                    Seu navegador não suporta o elemento de vídeo.
                  </video>
                  <!--documento e outros-->
                  <div
                    v-if="
                      msg.resposta.media?.url &&
                      !msg.resposta.media?.mime?.includes('image') &&
                      !msg.resposta.media?.mime?.includes('video') &&
                      !msg.resposta.media?.mime?.includes('audio')
                    "
                  >
                    <div class="d-flex flex-row gap-2 align-center">
                      <VAvatar
                        color="primary"
                        variant="tonal"
                        size="30"
                        class="rounded"
                      >
                        <VIcon
                          :icon="resolveIconFile(msg.resposta.media.mime)"
                          size="18"
                        />
                      </VAvatar>
                      <p class="mb-0 text-h6">
                        {{
                          msg.resposta.media.filename ||
                          msg.resposta.media.url.split("/").pop()
                        }}
                      </p>
                    </div>
                  </div>
                  <!--audio-->
                  <AudioPlayer
                    v-if="msg.resposta.media?.mime?.includes('audio')"
                    :src="msg.resposta.media.url"
                    :audioId="msg.resposta.id"
                    :activeAudioId="activeAudio"
                    :avatar="
                      msg.resposta.fromMe
                        ? userData?.avatar
                        : selectedChat?.contato?.avatar
                    "
                    @play="handlePlay"
                  />
                  <p
                    class="mb-0 html-content"
                    v-html="formatShortMsg(msg.resposta, false)"
                    style="line-height: 18px"
                  />
                </div>
              </div>

              <div
                v-if="msg.tipo == 'call_log' || msg.tipo == 'call'"
                class="w-100 d-flex flex-row gap-2 align-center"
              >
                <VAvatar size="40" color="primary" variant="tonal">
                  <VIcon icon="tabler-phone" />
                </VAvatar>

                <p class="text-h6 mb-0">Ligação de voz</p>
              </div>

              <div
                v-if="msg.tipo == 'ciphertext'"
                class="w-100 d-flex flex-row gap-2 align-center"
              >
                <VIcon icon="tabler-info-circle" color="primary" size="20" />
                <p class="mb-0 text-disabled">
                  Essa mensagem não é suportada<br />
                  pelo WhatsApp Web. Abra no celular!
                </p>
              </div>

              <!--imagens e gifs-->
              <VImg
                :src="msg.media.url"
                v-if="msg.media?.mime?.includes('image')"
                width="250"
                height="250"
                cover
                class="rounded"
                @click="goToImg(msg.media.url)"
              />

              <!--video-->
              <video
                v-if="msg.media?.mime?.includes('video')"
                width="250"
                height="250"
                controls
                class="rounded"
              >
                <source :src="msg.media.url" type="video/mp4" />
                Seu navegador não suporta o elemento de vídeo.
              </video>

              <!--documento e outros-->

              <VCard
                @click="goToImg(msg.media.url)"
                class="w-100"
                v-if="
                  msg.media?.url &&
                  !msg.media?.mime?.includes('image') &&
                  !msg.media?.mime?.includes('video') &&
                  !msg.media?.mime?.includes('audio')
                "
              >
                <VCardText class="pa-3 d-flex flex-row gap-2 align-center">
                  <VAvatar
                    color="primary"
                    variant="tonal"
                    size="30"
                    class="rounded"
                  >
                    <VIcon :icon="resolveIconFile(msg.media.mime)" size="18" />
                  </VAvatar>

                  <p class="mb-0 text-h6">
                    {{ msg.media.filename || msg.media.url.split("/").pop() }}
                  </p>
                </VCardText>
              </VCard>

              <!--audio-->
              <AudioPlayer
                v-if="msg.media?.mime?.includes('audio')"
                :src="msg.media.url"
                :audioId="msg.id"
                :activeAudioId="activeAudio"
                :avatar="
                  msg.fromMe ? userData?.avatar : selectedChat?.contato?.avatar
                "
                @play="handlePlay"
              />

              <p
                class="mb-0 html-content"
                v-html="msg.texto ?? '...'"
                style="
                  line-height: 18px;
                  word-break: break-word;
                  overflow-wrap: anywhere;
                  white-space: normal;
                "
              />
              <span
                class="text-disabled text-caption position-absolute"
                :style="
                  msg.media?.mime?.includes('image') &&
                  (!msg.texto || msg.texto == '')
                    ? 'color: #d9d9d9 !important; right: 15px; bottom: 8px'
                    : 'right: 10px; bottom: 5px'
                "
              >
                {{ moment(msg.data, "DD/MM/AAA HH:mm:ss").format("HH:mm") }}

                <VIcon
                  v-if="msg.fromMe"
                  :color="msg.ack == 3 ? 'primary' : 'grey'"
                  :icon="
                    msg.ack == 0
                      ? 'tabler-clock'
                      : msg.ack == 1
                      ? 'tabler-check'
                      : 'tabler-checks'
                  "
                />
              </span>
            </div>

            <div
              v-else-if="msg.tipo == 'data'"
              class="w-100 d-flex align-center justify-center"
            >
              <div class="message-data">{{ msg.data }}</div>
            </div>
          </template>
        </div>

        <div class="message-send">
          <div
            class="send-files"
            :style="viewReply ? 'top: -135px !important;' : ''"
          >
            <div class="file" v-for="(file, index) in filesToSend" :key="index">
              <VAvatar color="primary" variant="tonal" size="30">
                <VIcon :icon="resolveIconFile(file.type)" size="18" />
              </VAvatar>
              {{ file.name }}
              <VIcon
                v-if="!loadingSendMessage"
                icon="tabler-x"
                class="cursor-pointer"
                @click="filesToSend.splice(index, 1)"
              />
            </div>
          </div>

          <div class="msg-reply" v-if="viewReply && msgReply">
            <div class="msg-reply-content">
              <div
                v-if="msgReply.tipo == 'call_log' || msgReply.tipo == 'call'"
                class="w-100 d-flex flex-row gap-2 align-center"
              >
                <VAvatar size="40" color="primary" variant="tonal">
                  <VIcon icon="tabler-phone" />
                </VAvatar>

                <p class="text-h6 mb-0">Ligação de voz</p>
              </div>

              <div
                v-if="msgReply.tipo == 'ciphertext'"
                class="w-100 d-flex flex-row gap-2 align-center"
              >
                <VIcon icon="tabler-info-circle" color="primary" size="20" />
                <p class="mb-0 text-disabled">
                  Essa mensagem não é suportada<br />
                  pelo WhatsApp Web. Abra no celular!
                </p>
              </div>

              <VImg
                :src="msgReply.media.url"
                v-if="msgReply.media?.mime?.includes('image')"
                width="50"
                height="50"
                max-width="50"
                max-height="50"
                cover
                class="rounded"
              />
              <!--video-->
              <video
                v-if="msgReply.media?.mime?.includes('video')"
                width="50"
                height="50"
                max-width="50"
                max-height="50"
                controls
                class="rounded"
              >
                <source :src="msgReply.media.url" type="video/mp4" />
                Seu navegador não suporta o elemento de vídeo.
              </video>
              <!--documento e outros-->
              <VCard
                v-if="
                  msgReply.media?.url &&
                  !msgReply.media?.mime?.includes('image') &&
                  !msgReply.media?.mime?.includes('video') &&
                  !msgReply.media?.mime?.includes('audio')
                "
              >
                <VCardText class="pa-3 d-flex flex-row gap-2 align-center">
                  <VAvatar
                    color="primary"
                    variant="tonal"
                    size="30"
                    class="rounded"
                  >
                    <VIcon
                      :icon="resolveIconFile(msgReply.media.mime)"
                      size="18"
                    />
                  </VAvatar>
                  <p class="mb-0 text-h6">
                    {{
                      msgReply.media.filename ||
                      msgReply.media.url.split("/").pop()
                    }}
                  </p>
                </VCardText>
              </VCard>
              <!--audio-->
              <AudioPlayer
                v-if="msgReply.media?.mime?.includes('audio')"
                :src="msgReply.media.url"
                :audioId="msgReply.id"
                :activeAudioId="activeAudio"
                :avatar="
                  msgReply.fromMe
                    ? userData?.avatar
                    : selectedChat?.contato?.avatar
                "
                @play="handlePlay"
              />
              <p
                class="mb-0 html-content"
                v-html="msgReply.texto ?? '...'"
                style="
                  line-height: 18px;
                  max-width: 700px;
                  overflow: hidden;
                  text-overflow: ellipsis;
                "
              />
            </div>

            <VIcon
              icon="tabler-x"
              class="cursor-pointer"
              @click="
                viewReply = false;
                msgReply = null;
              "
            />
          </div>

          <input
            class="d-none"
            type="file"
            ref="inputFiles"
            multiple
            @change="
              (e) => {
                console.log('files', e.target.files);
                const files = Array.from(e.target.files);
                filesToSend = files;
              }
            "
          />

          <IconBtn
            @click="inputFiles.click()"
            :loading="loadingSendMessage"
            v-if="!gravando"
          >
            <VIcon icon="tabler-paperclip" />
          </IconBtn>

          <VTextarea
            v-model="message"
            bg-color="white"
            active
            placeholder="Digite uma mensagem"
            class="w-100"
            rows="1"
            clearable
            :loading="loadingMessages || loadingSendMessage"
          />

          <IconBtn
            v-if="!gravando"
            @click="
              (!message || message == '') &&
              (!filesToSend || filesToSend.length == 0)
                ? iniciarGravacao()
                : sendMessage()
            "
            :loading="loadingSendMessage"
          >
            <VIcon
              :icon="
                (!message || message == '') &&
                (!filesToSend || filesToSend.length == 0)
                  ? 'tabler-microphone'
                  : 'tabler-send'
              "
            />
          </IconBtn>

          <div v-else class="d-flex flex-row gap-3 align-center">
            <IconBtn
              @click="pararGravacao()"
              :loading="loadingSendMessage"
              color="error"
            >
              <VIcon icon="tabler-player-stop" />
            </IconBtn>

            <p class="mb-0 text-caption">
              {{ formatTime(timeGravando) }}
            </p>

            <IconBtn
              @click="sendMessage('audio')"
              :loading="loadingSendMessage"
              color="success"
            >
              <VIcon icon="tabler-send" />
            </IconBtn>
          </div>
        </div>
      </div>
    </VCol>
  </VRow>
</template>

<style scoped>
  .div-resposta {
    min-height: 50px;
    max-height: 50px;
    width: 100%;
    border-radius: 5px;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    overflow: hidden;
    padding: 0px 10px;
    border-left: solid 4px;
  }

  .msg-reply {
    position: absolute;
    top: -75px;
    display: flex;
    flex-direction: row;
    overflow-x: auto;
    left: 10px;
    gap: 10px;
    width: 95%;
    background-color: #f0f2f5;
    min-height: 80px;
    max-height: 80px;
    border-radius: 10px 10px 0px 0px;
    align-items: center;
    padding: 0px 15px;
    box-shadow: 0px -2px 4px #00000021;
  }

  .msg-reply-content {
    background-color: white;
    width: 100%;
    height: 100%;
    border-left: 5px #0085005c solid;
    padding-left: 7px;
    display: flex;
    min-height: 50px;
    border-radius: 5px;
    align-items: center;
  }

  .menu-chat,
  .menu-msg {
    z-index: 9999;
    width: 230px;
  }
  .file {
    background-color: #ffffffd4;
    padding: 10px 15px;
    display: flex;
    gap: 10px;
    border-radius: 5px;
    align-items: center;
    flex-direction: row;
  }

  .send-files {
    position: absolute;
    top: -100%;
    display: flex;
    flex-direction: row;
    overflow-x: auto;
    left: 10px;
    gap: 10px;
  }

  .message-data {
    background-color: #fffffff2;
    padding: 2px 8px;
    font-size: 12px;
    box-shadow: 0 1px 0.5px #0b141a21;
    border-radius: 4px;
    text-shadow: 0 1px 0 #ffffff66;
    margin: 10px 0px;
  }

  .v-theme--dark .message-data {
    background-color: #1f2c32;
  }

  .message-send {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    position: sticky;
    padding: 10px;
    justify-content: center;
    background-color: #f0f2f5;
    bottom: 0px;
  }

  .v-theme--dark .message-send {
    background-color: rgba(var(--v-theme-surface));
  }

  .chats {
    max-height: calc(95vh - 120px);
    overflow-y: auto;
  }

  .chat-item {
    display: flex;
    align-items: center;
    padding: 15px 12px;
    cursor: pointer;
    border-bottom: 1px solid rgba(var(--v-theme-secondary), .1);
    gap: 13px;
    position: relative;
    flex-direction: row;
    flex-wrap: nowrap;
  }

  .chat-item.chat-naoLido {
    font-weight: bold;
  }

  .chat-item:hover {
    background-color: rgba(var(--v-theme-primary), .2);
  }

  .chat-name {
    font-weight: medium;
    margin: 0;
  }
  
  .chat-item.chat-naoLido .chat-name {
    font-weight: bold;
  }

  .chat-last-message {
    color: #a7a6a6;
    margin: 0;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 260px;
    overflow: hidden;
  }

  .circle-naoLida {
    width: 20px;
    height: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 12px;
    position: absolute;
    right: 20px;
    top: 40px;
  }
</style>
