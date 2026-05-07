import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import timeGridPlugin from '@fullcalendar/timegrid'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import { useConfigStore } from '@core/stores/config'
import { useCalendarStore } from '@/views/apps/calendar/useCalendarStore'
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { socket } from "@/composables/useSocket";
import { can } from '@layouts/plugins/casl'
import moment from 'moment'
import { useFunctions } from "@/composables/useFunctions";
const { typesAgendamento } = useFunctions();

export const blankEvent = {
  title: '',
  start: '',
  end: '',
  allDay: false,
  url: '',
  extendedProps: {
    calendar: undefined,
    guests: [],
    location: '',
    description: '',
  },
}

const userData = useCookie('userData').value

export const useCalendar = (event, isEventHandlerSidebarActive, isLeftSidebarOpen, selectedFuncionario, selectedType, selectedStatus) => {
  const configStore = useConfigStore()

  // 👉 Store
  const store = useCalendarStore()

  // 👉 Calendar template ref
  const refCalendar = ref()

  // 👉 Loading state
  const isLoading = ref(false)

  const minHorario = ref('00:00:00')
  const maxHorario = ref('23:00:00')

  const toHH = h => `${String(h).padStart(2, '0')}:00:00`
  const toMaxExclusive = h => (h >= 23 ? '24:00:00' : toHH(h + 1))


  // ℹ️ Extract event data from event API
  const extractEventDataFromEventApi = async (eventApi, clicked) => {
    let id = clicked ? eventApi._def.extendedProps.age_id : eventApi;

    console.log('Extracting event data from event API:', eventApi, id)

    if (!id) {
      console.log('Event ID not found in event API:', eventApi)
      return;
    }

    try {
      const res = await $api(`/agenda/agendamento/${id}`, {
        method: 'GET',
      })

      console.log('Agendamento obtido:', res)

      // Extrai a data e hora, assegurando que o timezone é mantido corretamente.
      const startDate = new Date(res.age_data);
      const startTime = res.age_horaInicio.split(':');
      startDate.setHours(parseInt(startTime[0]), parseInt(startTime[1]), parseInt(startTime[2]));

      const endDate = new Date(res.age_data);
      const endTime = res.age_horaFim.split(':');
      endDate.setHours(parseInt(endTime[0]), parseInt(endTime[1]), parseInt(endTime[2]));

      return {
        ...res,
        id: res.age_id,
        title: res.age_type != 'bloqueio' ? res.cliente[0] ? res.cliente[0].cli_nome : res.age_observacao : 'Bloqueio de Horário',
        start: startDate,
        end: endDate,
        eventDisplay: 'block',
        backgroundColor: res.bkColor,
        textColor: 'black',
        display: 'block'
      };

    } catch (error) {
      console.error('Error occurred while fetching calendar event', error, error.response)
    }

  }

  const extractEventDataFromEventApi2 = async (age_id) => {
    let id = age_id;

    console.log('Extracting event data from event API:', id)

    if (!id) {
      console.log('Event ID not found in event API:', age_id)
      return;
    }

    try {
      const res = await $api(`/agenda/agendamento/${id}`, {
        method: 'GET',
      })

      console.log('Agendamento obtido:', res)

      // Extrai a data e hora, assegurando que o timezone é mantido corretamente.
      const startDate = new Date(res.age_data);
      const startTime = res.age_horaInicio.split(':');
      startDate.setHours(parseInt(startTime[0]), parseInt(startTime[1]), parseInt(startTime[2]));

      const endDate = new Date(res.age_data);
      const endTime = res.age_horaFim.split(':');
      endDate.setHours(parseInt(endTime[0]), parseInt(endTime[1]), parseInt(endTime[2]));

      return {
        ...res,
        id: res.age_id,
        title: res.age_type != 'bloqueio' ? res.cliente[0] ? res.cliente[0].cli_nome : res.age_observacao : 'Bloqueio de Horário',
        start: startDate,
        end: endDate,
        eventDisplay: 'block',
        backgroundColor: res.bkColor,
        textColor: 'black',
        display: 'block'
      };

    } catch (error) {
      console.error('Error occurred while fetching calendar event', error, error.response)
    }

  }

  const fetchResources = async () => {

    const canFilter = can('view-all', 'agendamento');

    let link = canFilter ? '/agenda/funcionarios' : '/agenda/funcionariosCalendar'

    try {
      const res = await $api(link, {
        method: 'GET',
        query: {
          ativo: 1,
          fun_id: selectedFuncionario.value,
          data: userData.id
        }
      })

      let mapeado = res.map(funcionario => ({
        id: funcionario.id,
        title: funcionario.fullName,
        ordemCalendar: funcionario.ordemCalendar,
      }));

      if (mapeado.some(f => f.id == userData.id)) {
        let indexUsuario = mapeado.findIndex(f => f.id == userData.id);

        if (indexUsuario != -1) {
          mapeado[indexUsuario].title = mapeado[indexUsuario].title + ' (Você)';
        }
      }
      
      return mapeado;
    } catch (error) {
      console.error('Error fetching resources', error)
    }
  }

  // 👉 Fetch events
  const fetchEvents = async (info, successCallback, failureCallback) => {
    isLoading.value = true
    try {
      const res = await $api('/agenda/agendamentos', {
        method: 'GET',
        query: {
          dup: true,
          start: info.startStr,
          end: info.endStr,
          role: userData.role,
          type: selectedType.value || null,
          fun_id: selectedFuncionario.value !== null && selectedFuncionario.value !== 0 ? selectedFuncionario.value
            : can('view-all', 'agendamento') ? null : userData.id,
          status: can('view-all', 'agendamento') ? selectedStatus.value || null : null,
        },
      })


      //console.log('Agendamentos obtidos:', res)

      let results = res.map(e => {
        // Extrai a data e hora, assegurando que o timezone é mantido corretamente.
        const startDate = new Date(e.age_data);
        const startTime = e.age_horaInicio ? e.age_horaInicio.split(':') : ['08', '00', '00'];
        startDate.setHours(parseInt(startTime[0]), parseInt(startTime[1]), parseInt(startTime[2]));

        const endDate =/*  !e.age_dataFim ? */ new Date(e.age_data)/*  : new Date(e.age_dataFim) */;

        const endTime =/*  e.age_horaFimFim ? e.age_horaFimFim.split(':') :  */
        e.age_horaFim ? e.age_horaFim.split(':') : ['18', '00', '00'];
        endDate.setHours(parseInt(endTime[0]), parseInt(endTime[1]), parseInt(endTime[2]));

        let tituloInit = e.age_type != 'bloqueio' ? e.cliente[0] ? e.cliente[0].cli_nome : e.age_observacao : '';
        let bairro = e.age_type != 'bloqueio' ? e.endereco[0] ? ' - ' + (e.endereco[0]?.end_bairro || '') : '' : '';
        let titulo = e.age_type != 'bloqueio' ? tituloInit + bairro : 'Bloqueio de Horário'

        let typeAgendamento = e.age_retrabalho ? 'retrabalho' : e.age_type != 'servico' ? e.age_type : '';
        //let emoji = e.ast_id == 2 ? '✅' : typesAgendamento.value.find(t => t.value == typeAgendamento)?.emoji || null;

        let emoji = `${e.ast_id == 2 ? '✅' : ''}${typesAgendamento.value.find(t => t.value == typeAgendamento)?.emoji || ''}`;
        return {
          ...e,
          id: e.age_id,
          title: `${emoji ? emoji + ' ' : ''}${titulo}${e.periodo ? ' - ' + e.periodo : ''}`,
          start: startDate,
          end: endDate,
          eventDisplay: 'block',
          resourceId: e.funcionario?.[0]?.id || null,
          backgroundColor: e.bkColor,
          textColor: e.age_type == 'bloqueio' ? 'white' : e.funcionario?.[0] ? 'white' : 'black',
          display: 'block'
        };
      });

      //Obter os horários mínimos e máximos dos eventos para ajustar a visualização do calendário
      if (results.length > 0) {
        const minStart = results.map(r =>
          moment(r.start).format('H') == '0' ? '24' : moment(r.start).format('H')
        ).reduce((a, b) => parseInt(a) < parseInt(b) ? a : b)
        let maxEnd = results.map(r => moment(r.end).format('H') == '0' ? '24' : moment(r.end).format('H'))

        maxEnd = maxEnd.reduce((a, b) => parseInt(a) > parseInt(b) ? a : b)

        let minH = parseInt(minStart)
        let maxH = parseInt(maxEnd)

        minHorario.value = toHH(minH)
        maxHorario.value = toMaxExclusive(maxH)

        if (calendarApi.value) {
          calendarApi.value.setOption('slotMinTime', minHorario.value)
          calendarApi.value.setOption('slotMaxTime', maxHorario.value)
        }
      }

      console.log('Agendamentos mapeados:', results)

      successCallback(results);
    } catch (error) {
      console.error('Error fetching events', error, error.response)
      failureCallback(error)
    } finally {
      isLoading.value = false
    }
  }

  watch(selectedFuncionario, (val) => {
    console.log('Funcionário selecionado:', val)
    refetchEvents()
  })

  watch(selectedType, (val) => {
    console.log('Tipo selecionado:', val)
    refetchEvents()
  })

  const searchEventsByFuncionario = async (funcionarioId, type) => {
    console.log('Buscando eventos por funcionário:', funcionarioId)
    selectedFuncionario.value = funcionarioId
    selectedType.value = type
    refetchEvents()
  }

  const calendarApi = ref(null)

  // 👉 Update event in calendar [UI]
  const updateEventInCalendar = async (updatedEventData) => {
    const existingEvent = calendarApi.value?.getEventById(updatedEventData)
    if (!existingEvent) {
      console.warn('Evento não existe no calendário', updatedEventData)
      return
    }

    const res = await $api(`/agenda/agendamento/single/${updatedEventData}`, {
      method: 'GET'
    })

    console.log('Agendamento obtido:', res)

    if (!res) {
      console.error('Agendamento não encontrado:', updatedEventData)
      return
    }

    let resEvent = res[0]

    // Extrai a data e hora, assegurando que o timezone é mantido corretamente.
    const startDate = new Date(resEvent.age_data);
    const startTime = resEvent.age_horaInicio.split(':');
    startDate.setHours(parseInt(startTime[0]), parseInt(startTime[1]), parseInt(startTime[2]));

    const endDate = new Date(resEvent.age_data);
    const endTime = resEvent.age_horaFim.split(':');
    endDate.setHours(parseInt(endTime[0]), parseInt(endTime[1]), parseInt(endTime[2]));

    let updateData = {
      ...resEvent,
      id: resEvent.age_id,
      title: resEvent.cliente[0] ? resEvent.cliente[0].cli_nome : resEvent.age_observacao,
      start: startDate,
      end: endDate,
      eventDisplay: 'block',
      resourceId: resEvent.funcionario[0]?.id,
      backgroundColor: resEvent.bkColor,
      textColor: resEvent.funcionario[0] ? 'white' : 'black',
      display: 'block'
    }

    console.log('Evento atualizado:', updateData)

    // Atualiza o evento no calendário
    existingEvent.setProp('title', updateData.title)
    //existingEvent.setProp('start', updateData.start)
    //existingEvent.setProp('end', updateData.end)
    existingEvent.setExtendedProp('resourceId', updateData.funcionario[0]?.id)
    existingEvent.setProp('backgroundColor', updateData.funcionario[0] ? updateData.funcionario[0].color : '#BDBDBD')
    existingEvent.setProp('textColor', updateData.funcionario[0] ? 'white' : 'black')
    existingEvent.setProp('display', 'block')

    existingEvent.setDates(updateData.start, updateData.end, { allDay: false })
  }


  // 👉 Remove event in calendar [UI]
  const removeEventInCalendar = eventId => {
    const _event = calendarApi.value?.getEventById(eventId)
    if (_event)
      _event.remove()
  }


  // 👉 refetch events
  const refetchEvents = () => {
    calendarApi.value?.refetchEvents()
  }

  // 👉 Add event
  const addEvent = async (_event, openSidebar = true) => {
    refetchEvents()
    if (openSidebar) {
      event.value = await extractEventDataFromEventApi2(_event)
      isEventHandlerSidebarActive.value = true
    }
  }


  // 👉 Update event - sempre força refetch para garantir dados frescos
  const updateEvent = async eventId => {
    try {
      await updateEventInCalendar(eventId)
    } catch (e) {
      // Evento pode não existir no cache do FullCalendar, não é erro
    }
    refetchEvents()
  }


  // 👉 Remove event
  const removeEvent = eventId => {
    store.removeEvent(eventId).then(() => {
      removeEventInCalendar(eventId)
    })
  }

  const openEvent = async (eventId) => {
    event.value = await extractEventDataFromEventApi(eventId, false)
    isEventHandlerSidebarActive.value = true
  }

  const isMobile = window.innerWidth <= 768;


  // 👉 Calendar options
  const calendarOptions = {
    plugins: [dayGridPlugin, interactionPlugin, timeGridPlugin, listPlugin, resourceTimeGridPlugin],
    initialView: isMobile ? 'resourceTimeGridDay' : 'timeGridWeek',
    nowIndicator: true,
    stickyHeaderDates: true,
    headerToolbar: {
      start: 'prev,next title',
      end: 'dayGridMonth,timeGridWeek,resourceTimeGridDay,listWeek',
    },
    events: fetchEvents,
    resources: fetchResources,
    resourceOrder: 'ordemCalendar, -ordemCalendar',
    resourceLabelContent(arg) {
      // Substitui o texto padrão do recurso
      const r = arg.resource
      return {
        html: `
          <div class="label-funcionarios">
            <span class="res-name${r.title.includes('(Você)') ? ' font-weight-bold text-primary' : ''}">
              ${r.title}
            </span>
          </div>
        `
      }
    },
    eventTimeFormat: {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    },
    height: 'auto',
    expandRows: true,
    locales: [ptBrLocale],
    locale: "pt-br",
    views: {
      resourceTimeGridDay: {
        titleFormat: { year: 'numeric', month: 'long', day: '2-digit', weekday: 'long' },
      },
    },
    forceEventDuration: true,
    editable: false,
    eventResizableFromStart: false,
    dragScroll: true,
    dayMaxEvents: 6,
    navLinks: true,
    slotEventOverlap: false,
    allDaySlot: false,
    slotMinTime: minHorario.value,
    slotMaxTime: maxHorario.value,
    eventClassNames() {
      return [
        // Background Color
        `event-card`,
      ]
    },
    async eventClick({ event: clickedEvent }) {
      console.log('Evento clicado:', clickedEvent)
      if (!clickedEvent._def.extendedProps.age_id) return;
      event.value = await extractEventDataFromEventApi(clickedEvent, true)
      isEventHandlerSidebarActive.value = true
    },

    // customButtons
    dateClick(info) {
      return
      console.log('Data clicada:', info)
      event.value = { ...event.value, start: info.date }
      isEventHandlerSidebarActive.value = true
    },


    eventDrop({ event: droppedEvent }) {
      updateEvent(extractEventDataFromEventApi(droppedEvent))
    },

    /*
          Handle event resize
          Docs: https://fullcalendar.io/docs/eventResize
        */
    eventResize({ event: resizedEvent }) {
      if (resizedEvent.start && resizedEvent.end)
        updateEvent(extractEventDataFromEventApi(resizedEvent))
    },
    viewDidMount(arg) {
      console.log('View montada:', arg.view.type)
      handleViewChange(arg.view)
    },

    datesSet(arg) {
      console.log('View mudou para:', arg.view.type)
      handleViewChange(arg.view)
    },
  }


  // 👉 onMounted
  onMounted(() => {
    calendarApi.value = refCalendar.value.getApi()

    socket.on("updateEvent", (data) => {
      console.log('Evento atualizado:', data)
      updateEvent(data)
    })

    socket.on("addEvent", (data) => {
      console.log('Evento adicionado:', data)
      addEvent(data, false)
    })

    socket.on("removeEvent", (data) => {
      console.log('Evento removido:', data)
      removeEvent(data)
    })
  })

  // 👉 onUnmounted
  onUnmounted(() => {
    socket.off("updateEvent")
    socket.off("addEvent")
    socket.off("removeEvent")
  })


  // 👉 Jump to date on sidebar(inline) calendar change
  const jumpToDate = currentDate => {
    calendarApi.value?.gotoDate(new Date(currentDate))
  }

  watch(() => configStore.isAppRTL, val => {
    calendarApi.value?.setOption('direction', val ? 'rtl' : 'ltr')
  }, { immediate: true })

  const typeViewActive = ref(null)
  function handleViewChange(view) {
    const type = view.type
    if (type === 'dayGridMonth') {
      console.log('Modo Mês ativo')
      typeViewActive.value = 'dayGridMonth'
    } else if (type === 'timeGridWeek') {
      console.log('Modo Semana ativo')
      typeViewActive.value = 'timeGridWeek'
    } else if (type === 'resourceTimeGridDay') {
      console.log('Modo Recurso Dia ativo')
      typeViewActive.value = 'resourceTimeGridDay'
    }
  }

  return {
    refCalendar,
    calendarOptions,
    refetchEvents,
    fetchEvents,
    addEvent,
    updateEvent,
    removeEvent,
    jumpToDate,
    searchEventsByFuncionario,
    openEvent,
    fetchResources,
    isLoading,
    typeViewActive
  }
}
