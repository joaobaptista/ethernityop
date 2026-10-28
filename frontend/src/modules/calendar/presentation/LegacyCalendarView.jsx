import React, { useEffect, useState } from 'react';
import { useI18n } from '../../../core/i18n/presentation/useI18n.js';
import capsulesService from '../../capsules/application/capsulesService.js';
import messagesRepository from '../../messages/infrastructure/messagesRepository.js';
import { getStoredAuthToken } from '../../../core/api/apiUrl.js';
import { buildCalendarEvents } from '../domain/calendarModel.js';
import './LegacyCalendarView.css';

export const CALENDAR_EVENTS = [];

export const SAMPLE_FIXTURE_CALENDAR_EVENTS = [
  {
    id: 'cal-1',
    date: '12 de Outubro, 2032',
    title: 'Entrega da Cápsula: 18º Aniversário do Lucas',
    recipient: 'Lucas Silva',
    type: 'capsule',
    tag: 'Cápsula Programada',
  },
  {
    id: 'cal-2',
    date: '20 de Julho, 2030',
    title: 'Bodas de Prata (25 Anos de Casamento)',
    recipient: 'Marcos Ribeiro',
    type: 'anniversary',
    tag: 'Marco de Família',
  },
  {
    id: 'cal-3',
    date: '15 de Novembro, 2026',
    title: 'Carta Anual de Gratidão aos Guardiões',
    recipient: 'Dra. Helena & Carlos Eduardo',
    type: 'guardian',
    tag: 'Revisão Periódica',
  },
];

export default function LegacyCalendarView() {
  const { t } = useI18n();
  const [events, setEvents] = useState(CALENDAR_EVENTS);

  useEffect(() => {
    let active = true;
    let messages = [];
    const refresh = () => {
      if (active) setEvents(buildCalendarEvents(capsulesService.getCapsules(), messages));
    };

    refresh();
    capsulesService.fetchCapsulesFromApi().then(refresh).catch(() => {});
    const token = getStoredAuthToken();
    if (token) {
      messagesRepository
        .getMessages(token)
        .then((list) => {
          messages = Array.isArray(list) ? list : list?.items || [];
          refresh();
        })
        .catch(() => {});
    }
    const unsubscribe = capsulesService.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="legacy-calendar-container fade-in">
      {/* Header */}
      <div className="calendar-header">
        <div className="calendar-title-wrap">
          <span className="calendar-badge">
            <i className="fa-regular fa-calendar-check"></i> {t('calendarView.badge')}
          </span>
          <h1>{t('calendarView.title')}</h1>
          <p>
            {t('calendarView.subtitle')}
          </p>
        </div>
      </div>

      {/* Timeline de Eventos ou Empty State */}
      <div className="calendar-timeline">
        {events.length === 0 ? (
          <div className="calendar-empty-state-card">
            <div className="calendar-empty-icon-wrapper">
              <i className="fa-regular fa-calendar-check"></i>
            </div>
            <h3 className="calendar-empty-title">Nenhum evento agendado</h3>
            <p className="calendar-empty-desc">
              Suas cápsulas e mensagens com datas futuras de entrega aparecerão automaticamente organizadas nesta linha do tempo.
            </p>
          </div>
        ) : (
          events.map((evt) => (
            <div key={evt.id} className="timeline-item">
              <div className="timeline-date-bubble">
                <i className="fa-solid fa-calendar-day"></i>
                <span>{evt.date}</span>
              </div>

              <div className="timeline-card">
                <span className={`timeline-tag ${evt.type}`}>{evt.tag}</span>
                <h3>{evt.title}</h3>
                <p><i className="fa-regular fa-user"></i> {t('calendarView.destinedTo')} {evt.recipient}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
